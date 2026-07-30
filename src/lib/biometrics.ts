import { Platform } from 'react-native';

import { showToast } from '@/lib/toast';

/**
 * Unlocking Aria with Face ID.
 *
 * This is a lock on an existing session, not a credential — the OS confirms
 * it's the device owner and returns a yes/no. Aria never sees, stores or
 * compares a face, which keeps biometric data out of the app entirely.
 *
 * Lazy-required like the other native modules so the web/Node server render
 * doesn't try to load it.
 */

type LocalAuth = typeof import('expo-local-authentication');

const native = Platform.OS === 'ios' || Platform.OS === 'android';
let mod: LocalAuth | null = null;

function auth(): LocalAuth | null {
  if (!native) return null;
  if (!mod) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      mod = require('expo-local-authentication') as LocalAuth;
    } catch {
      return null;
    }
  }
  return mod;
}

export interface BiometricSupport {
  available: boolean;
  /** "Face ID", "Touch ID", or "biometrics" — for labelling the setting. */
  label: string;
}

/** What this device can actually do, and what to call it. */
export async function biometricSupport(): Promise<BiometricSupport> {
  const A = auth();
  if (!A) return { available: false, label: 'biometrics' };
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      A.hasHardwareAsync(),
      A.isEnrolledAsync(),
      A.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(A.AuthenticationType.FACIAL_RECOGNITION);
    const finger = types.includes(A.AuthenticationType.FINGERPRINT);
    return {
      // Enrolment matters as much as hardware: a phone with Face ID that
      // nobody has set up can't authenticate anyone.
      available: hasHardware && enrolled,
      label: face
        ? Platform.OS === 'ios'
          ? 'Face ID'
          : 'face unlock'
        : finger
          ? Platform.OS === 'ios'
            ? 'Touch ID'
            : 'fingerprint'
          : 'biometrics',
    };
  } catch {
    return { available: false, label: 'biometrics' };
  }
}

export type UnlockResult = 'unlocked' | 'failed' | 'unavailable';

/**
 * Prompt for the device owner.
 *
 * Passcode fallback stays enabled on purpose. Face ID fails in the dark, with
 * a mask, with wet hands — without a second route, a bad scan would lock
 * someone out of their own tasks.
 */
export async function unlockWithBiometrics(label = 'Face ID'): Promise<UnlockResult> {
  const A = auth();
  if (!A) return 'unavailable';
  try {
    const result = await A.authenticateAsync({
      promptMessage: `Unlock Aria with ${label}`,
      fallbackLabel: 'Use passcode',
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });
    return result.success ? 'unlocked' : 'failed';
  } catch {
    showToast("Couldn't check that just now");
    return 'unavailable';
  }
}
