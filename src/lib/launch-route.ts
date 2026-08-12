import { Platform } from 'react-native';

import { routeForNotification, type NotificationData } from '@/lib/notification-routes';

/**
 * The notification that launched the app, if one did.
 *
 * The response listeners elsewhere only fire while the app is already running,
 * so a tap that starts the app from cold is delivered here instead. It used to
 * be dropped entirely, which meant the case where somebody is *most* likely to
 * be tapping a reminder, the phone in a pocket, the app long since closed, was
 * the one case that did nothing.
 *
 * Separate from `notification-routes.ts` because this half needs
 * `expo-notifications` and React Native, and that module has to stay importable
 * without either so the check suites can hold the routing rule.
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

/**
 * Consumed once, then forgotten.
 *
 * iOS keeps handing back the same launch response for the life of the process,
 * so without this every return to the app would replay the last tap and drag
 * somebody back to a task they finished days ago.
 */
let consumed = false;

export async function launchRoute(): Promise<string | null> {
  if (consumed) return null;
  consumed = true;
  const N = getNotifs();
  if (!N) return null;
  try {
    const response = await N.getLastNotificationResponseAsync();
    return routeForNotification(response?.notification.request.content.data as NotificationData);
  } catch {
    return null;
  }
}
