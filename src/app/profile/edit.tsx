import { router } from 'expo-router';
import { Camera, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';

import { HeaderButton } from '@/components/header-button';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { pickAvatar, type AvatarSource } from '@/lib/avatar';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { useAriaStore } from '@/store/aria-store';

export default function EditProfileScreen() {
  const c = useColors();
  const profile = useAriaStore((s) => s.profile);
  const updateProfile = useAriaStore((s) => s.updateProfile);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [context, setContext] = useState(profile.context);
  const [avatarUri, setAvatarUri] = useState<string | undefined>(profile.avatarUri);
  const [studying, setStudying] = useState(profile.studying ?? '');
  const [level, setLevel] = useState(profile.level ?? '');
  // Edited as text rather than chips: this screen is for correcting an answer,
  // and someone whose interest wasn't on the onboarding list needs to be able
  // to type it without hunting for an "other" field.
  const [interests, setInterests] = useState((profile.interests ?? []).join(', '));

  const canSave = name.trim().length > 0;

  async function choose(source: AvatarSource) {
    const uri = await pickAvatar(source);
    if (uri) {
      setAvatarUri(uri);
      hapticSelect();
    }
  }

  function chooseAvatar() {
    // Web has no camera roll to choose between — go straight to the file picker.
    if (Platform.OS === 'web') {
      void choose('library');
      return;
    }
    Alert.alert('Profile picture', 'Pick a photo to use as your avatar.', [
      { text: 'Choose from library', onPress: () => void choose('library') },
      { text: 'Take a photo', onPress: () => void choose('camera') },
      ...(avatarUri
        ? [
            {
              text: 'Remove photo',
              style: 'destructive' as const,
              onPress: () => setAvatarUri(undefined),
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function save() {
    if (!canSave) return;
    updateProfile({
      name: name.trim(),
      email: email.trim(),
      context: context.trim(),
      avatarUri,
      studying: studying.trim(),
      level: level.trim(),
      interests: interests
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean),
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

      <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 18, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}>
          {/* Profile picture */}
          <View className="items-center gap-2 pb-1">
            <Pressable
              onPress={chooseAvatar}
              accessibilityLabel="Change profile picture"
              className="active:opacity-70">
              <UserAvatar uri={avatarUri} name={name || 'You'} size={96} />
              <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-bg bg-accent">
                <Camera size={15} color={c.accentInk} />
              </View>
            </Pressable>
            <Pressable onPress={chooseAvatar} hitSlop={6} className="active:opacity-60">
              <Text variant="small" tone="accent" className="font-strong">
                {avatarUri ? 'Change photo' : 'Add a photo'}
              </Text>
            </Pressable>
          </View>

          <Input label="Name" placeholder="Your name" value={name} onChangeText={setName} />
          <Input
            label="Email"
            placeholder="you@school.edu"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View className="gap-1">
            <Input
              label="What you're up to (optional)"
              placeholder="e.g. Sophomore at State University"
              value={context}
              onChangeText={setContext}
            />
            <Text variant="caption" tone="faint" className="leading-5">
              A line about you: studying, working, whatever fits. Aria uses it to pitch what it
              writes for you.
            </Text>
          </View>

          {/* The onboarding answers, editable. Someone's course changes, they
              pick up a new sport, or they skipped the questions entirely — none
              of which should mean living with a profile that's wrong. */}
          <Input
            label="Studying (optional)"
            placeholder="e.g. Law"
            value={studying}
            onChangeText={setStudying}
          />
          <Input
            label="Year (optional)"
            placeholder="e.g. 2nd year"
            value={level}
            onChangeText={setLevel}
          />
          <View className="gap-1">
            <Input
              label="Interests (optional)"
              placeholder="e.g. basketball, music, cooking"
              value={interests}
              onChangeText={setInterests}
            />
            <Text variant="caption" tone="faint" className="leading-5">
              Separate with commas. When something abstract won&apos;t land, Aria explains it
              through these.
            </Text>
          </View>
      </ScrollView>

        <View className="border-t border-border px-5 pb-6 pt-3">
          <Button title="Save" block size="lg" disabled={!canSave} onPress={save} />
        </View>
    </Screen>
  );
}
