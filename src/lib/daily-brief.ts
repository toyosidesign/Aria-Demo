import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * The prompt that starts the Pro day.
 *
 * One notification, at an hour they chose, saying what today needs and what
 * approving it would do. Everything else about Pro follows from somebody
 * tapping this: the review opens, they approve, and Aria acts while they are
 * doing something else.
 *
 * ── Why it repeats rather than being booked a day at a time ─────────────────
 *
 * A daily trigger survives the app never being opened, which is the entire
 * point: the person Pro is for is the one who did not open the planner. Booking
 * tomorrow's from today's would stop the moment they skipped a day, which is
 * exactly when the prompt matters most.
 *
 * The body is deliberately generic here. The counts belong to the review the
 * moment it opens, and a notification written last night would state a day that
 * has since changed, which is worse than saying less.
 */

type NotificationsModule = typeof import('expo-notifications');

const native = Platform.OS === 'ios' || Platform.OS === 'android';
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

/** Marks the one notification as the daily review, so a tap can be routed. */
export const DAILY_REVIEW_KIND = 'daily-review';

const ID_KEY = 'aria-daily-review-v1';
const CHANNEL_ID = 'aria-daily-review';

/** The hour it arrives, when nobody has picked one. Early, before the day starts. */
export const DEFAULT_REVIEW_TIME = '08:00';

export function parseReviewTime(value: string | undefined): { hour: number; minute: number } {
  const [h, m] = (value ?? DEFAULT_REVIEW_TIME).split(':');
  const hour = Number(h);
  const minute = Number(m);
  // A corrupt setting must not silently mean midnight, which would wake
  // somebody up to approve their day.
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { hour: 8, minute: 0 };
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return { hour, minute: 0 };
  return { hour, minute };
}

async function storedId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Route a tap on the daily prompt.
 *
 * The prompt exists to open the review, so it has to land there rather than on
 * whatever screen the app was last showing. Same shape as the automation
 * listener next door, and it ignores every other notification: an alarm tapped
 * at 9am must not open a review of the day.
 */
export function addDailyReviewTapListener(onTap: () => void): () => void {
  const N = getNotifs();
  if (!N) return () => {};
  try {
    const sub = N.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { kind?: string } | undefined;
      if (data?.kind === DAILY_REVIEW_KIND) onTap();
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

/** Stop the daily prompt. Safe to call when there isn't one. */
export async function cancelDailyReview(): Promise<void> {
  const N = getNotifs();
  const id = await storedId();
  if (!id) return;
  try {
    if (N) await N.cancelScheduledNotificationAsync(id);
  } catch {
    /* already gone */
  }
  try {
    await AsyncStorage.removeItem(ID_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Book the daily prompt, replacing whatever was booked before.
 *
 * Cancels first, always. Rescheduling without cancelling is how somebody ends
 * up with three prompts a day after changing the time twice, and the id is kept
 * in storage rather than in memory because the app restarting is the normal
 * case, not the exception.
 */
export async function scheduleDailyReview(time: string): Promise<boolean> {
  const N = getNotifs();
  await cancelDailyReview();
  if (!N) return false;

  try {
    const permission = await N.getPermissionsAsync();
    if (!permission.granted) {
      const asked = await N.requestPermissionsAsync();
      if (!asked.granted) return false;
    }

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Daily review',
        importance: N.AndroidImportance.DEFAULT,
      });
    }

    const { hour, minute } = parseReviewTime(time);
    const id = await N.scheduleNotificationAsync({
      content: {
        title: 'Your day is ready to review',
        body: 'Open Aria to approve what I can take off your hands.',
        data: { kind: DAILY_REVIEW_KIND },
        sound: 'default',
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
    await AsyncStorage.setItem(ID_KEY, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Put the prompt in whatever state the account should be in.
 *
 * One entry point, called from the store whenever Pro, the setting or the time
 * changes. Free accounts never have one: the daily review is the thing Pro is,
 * and a prompt offering to handle the day for somebody who has to do it
 * themselves would be an advert dressed as a notification.
 */
export async function syncDailyReview(opts: {
  pro: boolean;
  enabled: boolean;
  time: string;
  notifications: boolean;
}): Promise<void> {
  if (!opts.pro || !opts.enabled || !opts.notifications) {
    await cancelDailyReview();
    return;
  }
  await scheduleDailyReview(opts.time);
}
