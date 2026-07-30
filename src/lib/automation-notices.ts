import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseISO } from 'date-fns';
import { Platform } from 'react-native';

import { notificationsEnabled } from '@/lib/alarms';
import { CHANNEL_META, type Automation } from '@/lib/automations';

/**
 * The nudge that makes scheduling work at all.
 *
 * A phone won't wake an app to run code at an arbitrary future moment, so Aria
 * books a local notification for each scheduled item instead. That fires whether
 * or not the app is running; opening it brings Maya straight to the run screen,
 * where the draft is already written and addressed.
 */

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

// automationId -> scheduled notification id
const MAP_KEY = 'aria-automation-notices-v1';
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

/**
 * Tapping one of these notifications should land on the run screen. Returns an
 * unsubscribe function; a no-op where notifications aren't available.
 */
export function addAutomationTapListener(onTap: (automationId: string) => void): () => void {
  const N = getNotifs();
  if (!N) return () => {};
  try {
    const sub = N.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { kind?: string; automationId?: string }
        | undefined;
      if (data?.kind === 'automation' && data.automationId) onTap(data.automationId);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

/**
 * Re-apply the notifications preference to everything already booked.
 * Turning the setting off has to clear pending notices, not just stop new ones.
 */
export async function reconcileAutomationNotices(automations: Automation[]) {
  if (!getNotifs()) return;
  for (const a of automations) {
    if (a.status !== 'scheduled' && a.status !== 'ready') continue;
    if (notificationsEnabled()) await scheduleAutomationNotice(a);
    else await cancelAutomationNotice(a.id);
  }
}

export async function cancelAutomationNotice(automationId: string) {
  const N = getNotifs();
  if (!N) return;
  await load();
  const id = map[automationId];
  if (!id) return;
  try {
    await N.cancelScheduledNotificationAsync(id);
  } catch {
    /* ignore */
  }
  delete map[automationId];
  await save();
}

export async function scheduleAutomationNotice(automation: Automation) {
  const N = getNotifs();
  if (!N) return;
  await cancelAutomationNotice(automation.id);
  if (!notificationsEnabled()) return;

  const when = parseISO(automation.runAt);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return;

  try {
    const { granted, status } = await N.getPermissionsAsync();
    if (!granted && status !== 'granted') {
      const req = await N.requestPermissionsAsync();
      if (!req.granted && req.status !== 'granted') return;
    }
  } catch {
    return;
  }

  const meta = CHANNEL_META[automation.channel];
  const who = automation.toName ?? 'them';

  try {
    const id = await N.scheduleNotificationAsync({
      content: {
        title: meta.autonomous ? `Aria is sending your ${meta.label.toLowerCase()}` : 'Aria has it ready',
        body: meta.autonomous
          ? `Emailing ${who} about “${automation.taskTitle}”.`
          : `Your ${meta.label.toLowerCase()} to ${who} is written and addressed. Tap to send it.`,
        sound: 'default',
        data: { automationId: automation.id, kind: 'automation' },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when },
    });
    await load();
    map[automation.id] = id;
    await save();
  } catch {
    /* scheduling unsupported here — the run screen still catches it on open */
  }
}
