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
