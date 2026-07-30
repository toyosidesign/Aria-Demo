import { Alert, Platform } from 'react-native';

import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * Aria Pro — the paid tier, not shipped yet.
 *
 * Free covers everything Maya does herself: Aria drafts, she sends. Pro is
 * where Aria takes the work off her hands entirely and acts at a scheduled
 * moment, which is the part that costs money to run (server-side sending,
 * every integration).
 *
 * Until it launches, every upgrade path joins a waiting list rather than
 * pretending to take payment or silently unlocking.
 */

export const PRO_FEATURES = [
  'Schedule Aria to send messages for you',
  'Emails that go out on their own, with a report back',
  'Every app connection: Teams, Outlook, Slack, Maps and the rest',
];

export const PRO_PITCH =
  'Scheduling work for Aria to handle at a set time is part of Aria Pro, along with every app connection.';

export const WAITLIST_CONFIRMATION =
  'You’re on the list. I’ll let you know the moment Aria Pro opens up, and you’ll be among the first in.';

/**
 * Offer a place on the Pro waiting list. Joining twice is a no-op beyond the
 * reassurance — the state is remembered so the CTAs can say so afterwards.
 */
export function promptProUpgrade(context: string, onJoined?: () => void) {
  const { proWaitlisted, joinProWaitlist } = useAriaStore.getState();

  const join = () => {
    joinProWaitlist();
    onJoined?.();
    if (Platform.OS === 'web') {
      showToast('Added to the Aria Pro waiting list', 'check');
      return;
    }
    Alert.alert('You’re on the waiting list', WAITLIST_CONFIRMATION, [{ text: 'Great' }]);
  };

  // Already signed up — just reassure, don't ask again.
  if (proWaitlisted) {
    if (Platform.OS === 'web') {
      showToast('You’re already on the waiting list', 'check');
      return;
    }
    Alert.alert('Already on the list', WAITLIST_CONFIRMATION, [{ text: 'Got it' }]);
    return;
  }

  // Alert isn't available on react-native-web — the rest of the app takes the
  // same shortcut there.
  if (Platform.OS === 'web') {
    join();
    return;
  }

  Alert.alert('Aria Pro', `${context}\n\nIt isn’t open to everyone yet. Want a place in the queue?`, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Join the waiting list', onPress: join },
  ]);
}
