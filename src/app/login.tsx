import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { AriaAvatar } from '@/components/aria-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { hapticSelect } from '@/lib/haptics';
import { useAriaStore } from '@/store/aria-store';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const signIn = useAriaStore((s) => s.signIn);

  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit =
    email.trim().length > 2 &&
    password.trim().length > 0 &&
    (mode === 'signin' || name.trim().length > 0);

  function submit() {
    if (!canSubmit) return;
    hapticSelect();
    const isNew = mode === 'signup';
    signIn({ name: isNew ? name.trim() : undefined, email: email.trim(), isNew });
    router.replace(isNew ? '/welcome' : '/');
  }

  return (
    <Screen padded edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 24, paddingVertical: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Brand */}
          <View className="items-center gap-4">
            <AriaAvatar size={72} />
            <View className="items-center gap-1.5">
              <Text variant="title">Aria</Text>
              <Text tone="muted" className="text-center">
                {mode === 'signup'
                  ? 'Let’s set up your assistant.'
                  : 'Your proactive study assistant.'}
              </Text>
            </View>
          </View>

          {/* Auth form */}
          <View className="gap-4">
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'signin', label: 'Sign in' },
                { value: 'signup', label: 'Create account' },
              ]}
            />

            {mode === 'signup' ? (
              <View className="gap-1">
                <Input
                  label="What should Aria call you?"
                  placeholder="Your first name"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoFocus
                />
                <Text variant="caption" tone="faint" className="px-1">
                  Aria will greet you by this name.
                </Text>
              </View>
            ) : null}
            <Input
              label="Email"
              placeholder="you@school.edu"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Input
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Button
              title={mode === 'signin' ? 'Sign in' : 'Create account'}
              block
              size="lg"
              disabled={!canSubmit}
              onPress={submit}
            />

            <Text variant="caption" tone="faint" className="text-center">
              Demo build · any email and password will work.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
