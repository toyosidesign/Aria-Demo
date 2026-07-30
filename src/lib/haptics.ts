import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useAriaStore } from '@/store/aria-store';

function enabled() {
  return Platform.OS !== 'web' && useAriaStore.getState().settings.haptics;
}

export function hapticTap() {
  if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticSelect() {
  if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function hapticSuccess() {
  if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * A press that didn't do what was asked — a form that won't submit yet.
 *
 * Distinct from `hapticTap` on purpose: tapping Save and feeling the same thing
 * as any other button reads as "it worked", which is the opposite of what
 * happened.
 */
export function hapticWarning() {
  if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
