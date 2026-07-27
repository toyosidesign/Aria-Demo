import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { HeaderButton } from '@/components/header-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { hapticSelect } from '@/lib/haptics';
import { useAriaStore } from '@/store/aria-store';

export default function EditProfileScreen() {
  const profile = useAriaStore((s) => s.profile);
  const updateProfile = useAriaStore((s) => s.updateProfile);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [school, setSchool] = useState(profile.school);
  const [year, setYear] = useState(profile.year);

  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    updateProfile({
      name: name.trim(),
      email: email.trim(),
      school: school.trim(),
      year: year.trim(),
    });
    hapticSelect();
    router.back();
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <Text variant="subtitle">Edit profile</Text>
        <View className="w-10" />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 18, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Input label="Name" placeholder="Your name" value={name} onChangeText={setName} autoFocus />
          <Input
            label="Email"
            placeholder="you@school.edu"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input label="School" placeholder="Your school" value={school} onChangeText={setSchool} />
          <Input label="Year" placeholder="e.g. Sophomore" value={year} onChangeText={setYear} />
        </ScrollView>

        <View className="border-t border-border px-5 pb-6 pt-3">
          <Button title="Save" block size="lg" disabled={!canSave} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
