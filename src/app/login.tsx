import { router } from 'expo-router';
import { Check, Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { AriaLoading } from '@/components/aria-loading';
import { PasswordCriteria, isStrongPassword } from '@/components/password-criteria';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { initProfile } from '@/lib/sync';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { showToast } from '@/lib/toast';
import { useAriaStore } from '@/store/aria-store';

type Mode = 'signin' | 'signup';

/** Square checkbox, sized to sit on a row beside its label. */
function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="flex-row items-center gap-2.5 active:opacity-60">
      <View
        className={`h-5 w-5 items-center justify-center rounded-md border ${
          checked ? 'border-accent bg-accent' : 'border-border bg-surface'
        }`}>
        {checked ? <Check size={13} color={c.accentInk} strokeWidth={3} /> : null}
      </View>
      <Text variant="small" tone="muted">
        {label}
      </Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const c = useColors();
  const signIn = useAriaStore((s) => s.signIn);
  const lastUser = useAriaStore((s) => s.lastUser);
  const forgetUser = useAriaStore((s) => s.forgetUser);
  const rememberUser = useAriaStore((s) => s.rememberUser);

  // Someone who has signed in here before lands on Sign in, not Create account.
  const returning = !!lastUser?.name || !!lastUser?.email;
  const firstName = lastUser?.name?.trim().split(/\s+/)[0] ?? '';

  const [mode, setMode] = useState<Mode>(returning ? 'signin' : 'signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(lastUser?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNew = mode === 'signup';
  const canSubmit =
    !busy &&
    email.trim().length > 2 &&
    password.trim().length > 0 &&
    (!isNew || (name.trim().length > 0 && isStrongPassword(password)));

  function switchMode(next: Mode) {
    hapticSelect();
    setMode(next);
    setError(null);
  }

  async function submit() {
    if (!canSubmit) return;
    hapticSelect();
    setError(null);
    // Unticking "remember me" is the only thing that clears the saved name and
    // email — signing out deliberately keeps them so the greeting survives.
    if (!remember) forgetUser();

    setBusy(true);

    // No Supabase configured → development-only mock. A release build can't
    // reach here (lib/supabase.ts throws at startup), but the guard is repeated
    // rather than assumed: this branch signs anyone in with any password.
    if (!isSupabaseConfigured) {
      if (!__DEV__) {
        setError('Sign-in is unavailable: this build is missing its configuration.');
        setBusy(false);
        return;
      }
      showToast('Demo mode: no real account is being created');
      signIn({ name: isNew ? name.trim() : undefined, email: email.trim(), isNew });
      // Instant locally, so hold the loader long enough to be read rather than
      // flashing the screen between two views.
      setTimeout(() => router.replace(isNew ? '/welcome' : '/'), 1800);
      return;
    }

    try {
      if (isNew) {
        // Hold the name locally first. The profiles row is created by a database
        // trigger that only records id and email, and writing the name needs a
        // session that doesn't exist yet when email confirmation is on — so
        // without this the name is simply lost between signing up and signing in.
        rememberUser({ name: name.trim(), email: email.trim() });
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) {
          setError(err.message);
          setBusy(false);
          return;
        }
        if (data.user) await initProfile(data.user.id, name.trim(), email.trim());
        if (!data.session) {
          setError('Check your email to confirm your account, then sign in.');
          setMode('signin');
          setBusy(false);
          return;
        }
        // Session established → the auth gate in _layout hydrates and routes to /welcome.
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) {
          setError(err.message);
          setBusy(false);
          return;
        }
        // The auth gate hydrates and routes into the app — busy stays true so
        // the loading screen covers that hand-off.
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  // Cover the whole account set-up, not just the button.
  if (busy) {
    return (
      <AriaLoading
        durationMs={2400}
        message={isNew ? 'Setting up your account' : 'Signing you in'}
      />
    );
  }

  return (
    <Screen padded edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          gap: 28,
          paddingVertical: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        {/* Mark + heading */}
        <View className="items-center gap-5">
          <View className="h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface">
            <AriaAvatar size={38} />
          </View>
          <View className="items-center gap-2">
            <Text variant="title" className="text-center">
              {isNew
                ? 'Create an account'
                : returning && firstName
                  ? `Welcome back, ${firstName}`
                  : 'Welcome back'}
            </Text>
            <Text tone="muted" className="text-center">
              {isNew
                ? 'A few details and Aria’s ready to help.'
                : 'Welcome back! Please enter your details.'}
            </Text>
            {!isNew && returning && firstName ? (
              <Pressable
                onPress={() => {
                  forgetUser();
                  setEmail('');
                }}
                hitSlop={8}
                className="active:opacity-60">
                <Text variant="caption" tone="accent" className="font-semibold">
                  Not {firstName}?
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Form */}
        <View className="gap-4">
          {isNew ? (
            <Input
              label="Name*"
              placeholder="Enter your name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
            />
          ) : null}

          <Input
            label={isNew ? 'Email*' : 'Email'}
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Input
            label={isNew ? 'Password*' : 'Password'}
            placeholder={isNew ? 'Create a password' : 'Enter your password'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete={isNew ? 'new-password' : 'current-password'}
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

          {/* The full checklist, not a single "8 characters" line */}
          {isNew ? <PasswordCriteria password={password} /> : null}

          {!isNew ? (
            <View className="flex-row items-center justify-between">
              <Checkbox checked={remember} onChange={setRemember} label="Remember me" />
              <Pressable
                onPress={() => router.push('/forgot-password')}
                hitSlop={8}
                className="active:opacity-60">
                <Text variant="small" tone="accent" className="font-semibold">
                  Forgot password
                </Text>
              </Pressable>
            </View>
          ) : null}

          {error ? (
            <Text variant="small" tone="danger" className="text-center">
              {error}
            </Text>
          ) : null}

          <Button
            title={busy ? 'Please wait…' : isNew ? 'Get started' : 'Sign in'}
            block
            size="lg"
            disabled={!canSubmit}
            loading={busy}
            onPress={submit}
          />
        </View>

        {/* Switch modes — replaces the segmented control */}
        <View className="flex-row items-center justify-center gap-1.5">
          <Text variant="small" tone="muted">
            {isNew ? 'Already have an account?' : 'Don’t have an account?'}
          </Text>
          <Pressable
            onPress={() => switchMode(isNew ? 'signin' : 'signup')}
            hitSlop={8}
            className="active:opacity-60">
            <Text variant="small" tone="accent" className="font-semibold">
              {isNew ? 'Log in' : 'Sign up'}
            </Text>
          </Pressable>
        </View>

        <Text variant="caption" tone="faint" className="text-center">
          {isSupabaseConfigured
            ? 'Your data is saved securely to your account.'
            : 'Demo build · any email and password will work.'}
        </Text>
      </ScrollView>
    </Screen>
  );
}
