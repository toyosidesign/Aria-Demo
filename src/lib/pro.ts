import { Alert, Platform } from 'react-native';

import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * Aria Pro — open, and the tier where Aria acts on its own.
 *
 * Free covers everything you do yourself: Aria drafts it, addresses it, has it
 * ready, and you press send. Pro is where it goes out without you at the moment
 * you agreed — which is the part that costs money to run, because it happens on
 * a server with nobody watching.
 *
 * ── What turning it on actually does ────────────────────────────────────────
 *
 * `setPro` writes `profiles.pro`, and that column is what the Edge Function
 * reads before sending on somebody's behalf. So this is an entitlement, not a
 * label: the runner holds every automation for an account it says false for.
 *
 * It does *not* start sending on its own. Sending without asking is a second,
 * separate switch (`settings.autoSend`), and `autoSendEnabled` requires both —
 * Pro is permission to have the feature, and the switch is the decision to use
 * it. Anyone reading only the flag would ship an app that mails people the
 * moment somebody upgrades.
 *
 * There is no payment step in this build. When billing arrives it belongs
 * inside `turnOnPro`, before `setPro` — everything downstream already treats
 * that one call as the moment entitlement begins.
 */

export const PRO_FEATURES = [
  'Schedule Aria to send messages for you',
  'Emails that go out on their own, with a report back',
  'Every app connection: Teams, Outlook, Slack, Maps and the rest',
];

export const PRO_PITCH =
  'Scheduling work for Aria to handle at a set time is part of Aria Pro, along with every app connection.';

export const PRO_CONFIRMATION =
  'Aria Pro is on. Schedule something and Aria will send it at the time you pick, then tell you it has gone. It still asks before anything leaves unless you turn that off in Settings.';

/**
 * Turn Pro on, and say what changed.
 *
 * The confirmation names the one thing that has *not* changed — Aria still asks
 * before anything leaves — because "Pro is on" would otherwise read as consent
 * to autonomous sending, which is a separate switch and a separate decision.
 */
export function turnOnPro(onDone?: () => void) {
  useAriaStore.getState().setPro(true);
  onDone?.();
  if (Platform.OS === 'web') {
    showToast('Aria Pro is on', 'check');
    return;
  }
  Alert.alert('Aria Pro is on', PRO_CONFIRMATION, [{ text: 'Great' }]);
}

/**
 * Offer the upgrade from wherever they hit the gate.
 *
 * `context` is what they were trying to do, so the sheet answers the question
 * they actually asked rather than opening a price list.
 */
export function promptProUpgrade(context: string, onJoined?: () => void) {
  const { pro } = useAriaStore.getState();

  // Already on. Reassure rather than asking again.
  if (pro) {
    if (Platform.OS === 'web') {
      showToast('Aria Pro is already on', 'check');
      return;
    }
    Alert.alert('Aria Pro is on', PRO_CONFIRMATION, [{ text: 'Got it' }]);
    return;
  }

  // Alert isn't available on react-native-web — the rest of the app takes the
  // same shortcut there.
  if (Platform.OS === 'web') {
    turnOnPro(onJoined);
    return;
  }

  Alert.alert('Aria Pro', `${context}\n\nWant to turn it on?`, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Turn on Pro', onPress: () => turnOnPro(onJoined) },
  ]);
}
