import { Platform } from 'react-native';
import type { View } from 'react-native';

import { showToast } from '@/lib/toast';

/**
 * Turning a rendered card into a picture and handing it to the share sheet.
 *
 * Both modules are native-only and lazy-required, matching how notifications
 * and contacts are handled — importing them during the web/Node server render
 * would crash it.
 */

const native = Platform.OS === 'ios' || Platform.OS === 'android';

function getViewShot(): typeof import('react-native-view-shot') | null {
  if (!native) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-view-shot') as typeof import('react-native-view-shot');
  } catch {
    return null;
  }
}

function getSharing(): typeof import('expo-sharing') | null {
  if (!native) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-sharing') as typeof import('expo-sharing');
  } catch {
    return null;
  }
}

export type ShareCardResult = 'shared' | 'unsupported' | 'failed';

/** True when this build can produce and share a card image at all. */
export function cardSharingAvailable(): boolean {
  return !!getViewShot() && !!getSharing();
}

/**
 * Snapshot the given card view and open the share sheet with it.
 *
 * The recipient is chosen in the share sheet rather than by Aria — that's the
 * cost of sending a real image instead of text, since no `mailto:` or `sms:`
 * link can carry an attachment.
 */
export async function shareCardImage(
  ref: React.RefObject<View | null>,
  { dialogTitle }: { dialogTitle?: string } = {},
): Promise<ShareCardResult> {
  const ViewShot = getViewShot();
  const Sharing = getSharing();
  if (!ViewShot || !Sharing || !ref.current) {
    showToast('Sharing a card image needs a device');
    return 'unsupported';
  }

  try {
    if (!(await Sharing.isAvailableAsync())) {
      showToast('Sharing isn’t available on this device');
      return 'unsupported';
    }

    const uri = await ViewShot.captureRef(ref, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });

    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: dialogTitle ?? 'Send your card',
    });
    return 'shared';
  } catch {
    showToast('Couldn’t create the card image');
    return 'failed';
  }
}
