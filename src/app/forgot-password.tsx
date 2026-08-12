import { router } from 'expo-router';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { PasswordCriteria, isStrongPassword } from '@/components/password-criteria';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Step = 'request' | 'verify';

export default function ForgotPasswordScreen() {
  const c = useColors();

  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSend = !busy && email.trim().length > 2;
  // Same bar as signing up. A weaker rule here would be a way around the
  // checklist rather than a convenience.
  const canReset = !busy && code.trim().length >= 6 && isStrongPassword(password);

  async function sendCode() {
    if (!canSend) return;
    hapticSelect();
    setError(null);
    setNotice(null);
    if (!isSupabaseConfigured) {
      setError('Password reset needs the Supabase backend configured.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());

      // Deliberately the same outcome whether or not that address has an
      // account. Branching here would turn this screen into an existence
      // oracle: anyone could type an email and learn whether that person uses
      // Aria. Supabase already answers uniformly, and echoing `err.message`
      // verbatim was undoing it.
      if (err) {
        console.warn('[aria] password reset request failed:', err.message);
        // Rate limiting is the one failure worth naming, because waiting is
        // the fix and staying silent reads as a code that never arrives.
        const tooSoon = err.status === 429 || /only request this after/i.test(err.message);
        if (tooSoon) {
          setError('Too many attempts just now. Wait a minute, then try again.');
          return;
        }
      }

      setNotice(`If ${email.trim()} has an Aria account, a 6-digit code is on its way. Enter it below with a new password.`);
      setStep('verify');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!canReset) return;
    hapticSelect();
    setError(null);
    setBusy(true);
    try {
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'recovery',
      });
      if (vErr) {
        // One message for a wrong code, an expired code, and a code for an
        // address that has no account, the three are indistinguishable to the
        // person typing, and telling them apart is what leaks.
        console.warn('[aria] password reset verify failed:', vErr.message);
        setError('That code is not valid or has expired. Request a new one.');
        return;
      }
      const { error: uErr } = await supabase.auth.updateUser({ password });
      if (uErr) {
        setError(uErr.message);
        return;
      }
      // Verifying the code signs the user in, the auth gate hydrates and routes into the app.
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded edges={['top', 'bottom']}>
      <Pressable
        onPress={() => router.replace('/login')}
        hitSlop={8}
        className="h-10 w-10 items-center justify-center rounded-full active:bg-border/60">
        <ArrowLeft size={22} color={c.ink} />
      </Pressable>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 24, paddingVertical: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View className="items-center gap-4">
            <AriaAvatar size={72} />
            <View className="items-center gap-1.5">
              <Text variant="title">Reset password</Text>
              <Text tone="muted" className="text-center">
                {step === 'request'
                  ? 'Enter your email and we’ll send you a reset code.'
                  : 'Enter the code from your email and pick a new password.'}
              </Text>
            </View>
          </View>

          <View className="gap-4">
            {step === 'request' ? (
              <Input
                label="Email"
                placeholder="you@school.edu"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
              />
            ) : (
              <>
                {notice ? (
                  <View className="rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3">
                    <Text variant="small">{notice}</Text>
                  </View>
                ) : null}
                <Input
                  label="Reset code"
                  placeholder="6-digit code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
                <View className="gap-1">
                  <Input
                    label="New password"
                    placeholder="Create a password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    rightSlot={
                      <Pressable
                        onPress={() => setShowPassword((v) => !v)}
                        hitSlop={8}
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                        className="h-9 w-9 items-center justify-center active:opacity-60">
                        {showPassword ? (
                          <EyeOff size={18} color={c.muted} />
                        ) : (
                          <Eye size={18} color={c.muted} />
                        )}
                      </Pressable>
                    }
                  />
                  <PasswordCriteria password={password} />
                  <Pressable
                    onPress={() => {
                      setStep('request');
                      setCode('');
                      setError(null);
                    }}
                    hitSlop={6}
                    className="self-start active:opacity-60">
                    <Text variant="caption" tone="accent" className="font-strong">
                      Use a different email
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {error ? (
              <Text variant="small" tone="danger" className="text-center">
                {error}
              </Text>
            ) : null}

            <Button
              title={
                busy
                  ? 'Please wait…'
                  : step === 'request'
                    ? 'Send reset code'
                    : 'Reset password'
              }
              block
              size="lg"
              disabled={step === 'request' ? !canSend : !canReset}
              loading={busy}
              onPress={step === 'request' ? sendCode : resetPassword}
            />

            <Pressable onPress={() => router.replace('/login')} hitSlop={8} className="active:opacity-60">
              <Text variant="caption" tone="muted" className="text-center">
                Remembered it? <Text variant="caption" tone="accent" className="font-strong">Back to sign in</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
