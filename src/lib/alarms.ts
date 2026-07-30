import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

import { showToast } from '@/lib/toast';
import type { Task } from '@/store/aria-store';

// Local notifications only run on a real device. We also lazy-require the
// native module so it never loads during web/Node server render (where its
// import touches browser globals and would crash, like the supabase client did).
const native = Platform.OS === 'ios' || Platform.OS === 'android';

type NotificationsModule = typeof import('expo-notifications');
let notifs: NotificationsModule | null = null;
function getNotifs(): NotificationsModule | null {
  if (!native) return null;
  if (!notifs) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      notifs = require('expo-notifications') as NotificationsModule;
    } catch {
      return null;
    }
  }
  return notifs;
}

/**
 * Expo Go loads expo-notifications but doesn't reliably deliver scheduled
 * alarms, so the module being importable is not proof a chime can ring — the
 * `!N` guard below never catches this case. Without the check, syncTaskAlarm
 * reports 'scheduled' and Aria promises a nudge that never arrives, which is
 * worse than saying up front that it can't.
 */
let expoGo: boolean | null = null;
export function inExpoGo(): boolean {
  if (expoGo !== null) return expoGo;
  expoGo = false;
  if (!native) return expoGo;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const C = require('expo-constants') as typeof import('expo-constants');
    expoGo = C.default.executionEnvironment === C.ExecutionEnvironment.StoreClient;
  } catch {
    expoGo = false;
  }
  return expoGo;
}

// Said once per session, not once per alarm — the limitation is about the
// build, so repeating it on every task would just be noise.
let warnedExpoGo = false;
function warnExpoGoOnce(silent?: boolean) {
  if (silent || warnedExpoGo) return;
  warnedExpoGo = true;
  showToast('Alarms only ring in a development build', 'alarm');
}

/**
 * The user's notifications preference, pushed in by the store.
 *
 * Held here rather than read from the store because the store imports this
 * module — reaching back the other way would make the two circular. Nothing
 * consulted this setting before, so turning notifications off in Settings
 * changed nothing and alarms kept firing.
 */
let notificationsOn = true;
export function setNotificationsEnabled(on: boolean) {
  notificationsOn = on;
}
export function notificationsEnabled() {
  return notificationsOn;
}

// taskId -> scheduled notification id, so we can cancel/reschedule.
const MAP_KEY = 'aria-alarms-v1';
let map: Record<string, string> = {};
let loaded = false;

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY);
    map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    map = {};
  }
}
async function save() {
  try {
    await AsyncStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

let handlerSet = false;
/** Call once on the client so a chime shows even while the app is open. */
export function setupNotificationHandler() {
  const N = getNotifs();
  if (!N || handlerSet) return;
  handlerSet = true;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    /* ignore */
  }
}

async function ensurePermission(): Promise<boolean> {
  const N = getNotifs();
  if (!N) return false;
  try {
    const current = await N.getPermissionsAsync();
    if (current.granted || current.status === 'granted') return true;
    const req = await N.requestPermissionsAsync();
    return req.granted || req.status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Ask for notification permission up front — call this when the user first turns
 * an alarm on, so that previewing (and the real chime) works instantly afterward
 * instead of triggering the OS prompt later, mid-flow. Resolves false when the
 * alarm can't ring, so the caller can say so rather than leave a dead switch on.
 */
export async function ensureAlarmPermission(): Promise<boolean> {
  return ensurePermission();
}

/** Android needs an explicit high-importance channel or the chime stays silent. */
const CHANNEL_ID = 'aria-alarms';
let channelReady = false;
async function ensureChannel(N: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  channelReady = true;
  try {
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Task alarms',
      importance: N.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    });
  } catch {
    /* ignore */
  }
}

function whenFor(task: Task): Date | null {
  if (!task.time) return null;
  const [h, m] = task.time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const now = new Date();
  // If the task's real date + time is genuinely in the future, fire exactly then.
  const exact = new Date(`${task.date}T${task.time}:00`);
  if (!Number.isNaN(exact.getTime()) && exact.getTime() > now.getTime()) return exact;

  // The demo's "today" is a simulated date that can sit in the real past, which
  // would leave the alarm unscheduled. Fall back to the next real occurrence of
  // the appointed time (today if it hasn't passed, otherwise tomorrow) so the
  // alarm actually rings at the time the user chose.
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

export async function cancelTaskAlarm(taskId: string) {
  const N = getNotifs();
  if (!N) return;
  await load();
  const id = map[taskId];
  if (!id) return;
  try {
    await N.cancelScheduledNotificationAsync(id);
  } catch {
    /* ignore */
  }
  delete map[taskId];
  await save();
}

export type AlarmResult =
  | 'scheduled'
  | 'off' // no alarm wanted, or the task is already done
  | 'no-time' // an alarm was asked for but no time was set
  | 'past' // the chosen moment has already gone
  | 'no-permission'
  | 'unsupported';

/**
 * Reconcile a task's alarm: cancel any existing one, then (re)schedule a chime
 * if the task is still to-do, has an alarm + a time, and that time is future.
 * Returns why nothing was scheduled so callers can tell the user — a silently
 * dropped alarm is indistinguishable from one that works until it doesn't ring.
 */
export async function syncTaskAlarm(
  task: Task | undefined,
  opts: { silent?: boolean } = {},
): Promise<AlarmResult> {
  const N = getNotifs();
  if (!task) return 'off';
  if (!N) return 'unsupported';
  await cancelTaskAlarm(task.id);
  // Cancelled above, so switching the setting off clears what's pending.
  if (!notificationsOn) return 'off';
  if (task.status !== 'todo' || !task.alarm) return 'off';
  if (!task.time) return report('no-time', opts.silent);

  const when = whenFor(task);
  if (!when || when.getTime() <= Date.now()) return report('past', opts.silent);
  if (!(await ensurePermission())) return report('no-permission', opts.silent);

  try {
    await ensureChannel(N);
    const notifId = await N.scheduleNotificationAsync({
      content: {
        title: `⏰ ${task.title}`,
        body: task.contactName ? `Reminder for ${task.contactName}` : 'Aria reminder',
        sound: 'default',
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: when,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
    await load();
    map[task.id] = notifId;
    await save();
    // Scheduling succeeds in Expo Go; delivery is what doesn't. Say so rather
    // than let the quiet success read as a working alarm.
    warnExpoGoOnce(opts.silent);
    return 'scheduled';
  } catch {
    return report('unsupported', opts.silent);
  }
}

/** Tell the user why an alarm they asked for won't ring. */
function report(result: AlarmResult, silent?: boolean): AlarmResult {
  if (silent) return result;
  if (result === 'no-permission') {
    showToast('Alarm off, notifications are blocked', 'alarm');
  } else if (result === 'no-time') {
    showToast('Alarm needs a time', 'alarm');
  } else if (result === 'past') {
    showToast('That time has already passed', 'alarm');
  } else if (result === 'unsupported') {
    showToast("Alarms don't work in Expo Go", 'alarm');
  }
  return result;
}

/** Re-sync alarms for a whole task list (e.g. after hydrating from cache/remote). */
export async function reconcileAlarms(tasks: Task[]) {
  if (!getNotifs()) return;
  for (const t of tasks) {
    // Silent: this runs on every launch, and one toast per task would be noise.
    if (t.status === 'todo' && t.alarm) await syncTaskAlarm(t, { silent: true });
  }
}

export type PreviewResult = 'shown' | 'denied' | 'unsupported';

/** Present a chime right now so the user can preview how the alarm sounds. */
export async function previewAlarm(title: string): Promise<PreviewResult> {
  const N = getNotifs();
  if (!N) return 'unsupported';
  setupNotificationHandler();
  if (!(await ensurePermission())) return 'denied';
  try {
    await N.scheduleNotificationAsync({
      content: { title: `⏰ ${title}`, body: 'This is how your alarm will chime.', sound: 'default' },
      trigger: null, // present immediately
    });
    return 'shown';
  } catch {
    return 'unsupported';
  }
}

/** Preview the chime and surface a helpful message if it can't play. */
export async function runPreview(title: string) {
  const result = await previewAlarm(title);
  if (result === 'shown') {
    showToast('Playing alarm preview', 'alarm');
  } else if (result === 'denied') {
    Alert.alert(
      'Notifications are off',
      'Turn on notifications for Expo Go in your device Settings to hear the alarm chime.',
    );
  } else if (result === 'unsupported') {
    Alert.alert('Preview unavailable', 'Alarm previews only work on a physical device.');
  }
}
