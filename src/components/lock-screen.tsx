import { ScanFace } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';

import { unlockWithBiometrics } from '@/lib/biometrics';

/**
 * Matches the native splash and app.json's backgroundColor.
 *
 * The button fill — primary-500, the same colour a primary Button is filled with. Fixed rather than theme-aware on purpose:
 * this paints before the app knows the colour scheme, and it has to be
 * pixel-identical to the native splash or the hand-off flashes.
 */
const BRAND = '#333D56';

/**
 * Stands between launch and the app when the biometric lock is on.
 *
 * Prompts once automatically — being asked the moment you open the app is the
 * point — and then waits, because re-prompting on every dismissal traps you in
 * a loop you can't refuse. There is always a visible way to try again.
 */
export function LockScreen({ label, onUnlock }: { label: string; onUnlock: () => void }) {
  const [checking, setChecking] = useState(false);
  const [refused, setRefused] = useState(false);
  const promptedRef = useRef(false);

  const attempt = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    const result = await unlockWithBiometrics(label);
    setChecking(false);
    if (result === 'unlocked') {
      onUnlock();
      return;
    }
    // 'unavailable' also unlocks: biometrics disappearing (removed enrolment,
    // a broken sensor) must not lock someone out of their own tasks.
    if (result === 'unavailable') {
      onUnlock();
      return;
    }
    setRefused(true);
  }, [checking, label, onUnlock]);

  useEffect(() => {
    if (promptedRef.current) return;
    promptedRef.current = true;
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back from the passcode sheet or another app is a natural moment to
  // offer again — but only if they haven't actively dismissed it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !refused && !checking) void attempt();
    });
    return () => sub.remove();
  }, [attempt, refused, checking]);

  return (
    <View style={{ flex: 1, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }}>
      <ScanFace size={72} color="#FFFFFF" strokeWidth={1.6} />

      <Text
        style={{ marginTop: 22, fontSize: 24, fontFamily: 'Inter_700Bold', color: '#FFFFFF' }}>
        Aria is locked
      </Text>
      <Text style={{ marginTop: 6, fontSize: 14, color: '#FFFFFFB3', textAlign: 'center' }}>
        {checking ? 'Waiting for you…' : `Unlock with ${label} to carry on`}
      </Text>

      <Pressable
        onPress={() => {
          setRefused(false);
          void attempt();
        }}
        disabled={checking}
        style={{
          marginTop: 28,
          paddingHorizontal: 24,
          paddingVertical: 13,
          borderRadius: 999,
          backgroundColor: '#FFFFFF',
          opacity: checking ? 0.6 : 1,
        }}>
        <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: BRAND }}>
          {refused ? 'Try again' : `Unlock with ${label}`}
        </Text>
      </Pressable>
    </View>
  );
}
