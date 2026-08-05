import { Alert, Platform } from 'react-native';

import { TIERS } from '@/lib/entitlements';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

/**
 * Aria Pro, open, and the tier where Aria does the work rather than waiting to
 * be asked for it.
 *
 * Free plans your work: it captures what you say, reads the brief, breaks the
 * job down when you ask and reminds you at the right moment. Pro does the work
 * itself, drafts and breakdowns ready before you open the task, plans that
 * re-date themselves when you fall behind, a day you approve in one go, and
 * emails sent at the moment you agreed.
 *
 * The line falls around *work* rather than around *sending*, and `lib/entitlements.ts`
 * explains why at length: sending is the one thing that cannot be delivered for
 * most channels, because no mobile OS lets an app send a text or a WhatsApp as
 * the user.
 *
 * ── What turning it on actually does ────────────────────────────────────────
 *
 * `setPro` writes `profiles.pro`, and that column is what the Edge Function
 * reads before sending on somebody's behalf. So this is an entitlement, not a
 * label: the runner holds every automation for an account it says false for.
 *
 * It does *not* start sending on its own. Sending without asking is a second,
 * separate switch (`settings.autoSend`), and `autoSendEnabled` requires both , 
 * Pro is permission to have the feature, and the switch is the decision to use
 * it. Anyone reading only the flag would ship an app that mails people the
 * moment somebody upgrades.
 *
 * There is no payment step in this build. When billing arrives it belongs
 * inside `turnOnPro`, before `setPro`, everything downstream already treats
 * that one call as the moment entitlement begins.
 */

/*
 * One source for the pitch, and it is the tier model itself.
 *
 * These were three hand-written lines that opened with "Schedule Aria to send
 * messages for you", which is true of email and impossible for a text or a
 * WhatsApp. Copy kept apart from the capabilities drifts from them, and this
 * kind of drift is discovered by the person whose message never arrived.
 */
export const PRO_FEATURES = TIERS.pro.points;

export const PRO_PITCH = `${TIERS.pro.line} ${TIERS.pro.points[0]}, plans that keep themselves true, and a day you approve once in the morning.`;

export const PRO_CONFIRMATION = `Aria Pro is on. ${TIERS.pro.points[0]}, and I will ask you to review the day each morning before I act on any of it. ${TIERS.pro.limit}`;

/**
 * Turn Pro on, and say what changed.
 *
 * The confirmation names the one thing that has *not* changed, Aria still asks
 * before anything leaves, because "Pro is on" would otherwise read as consent
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

  // Alert isn't available on react-native-web, the rest of the app takes the
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
