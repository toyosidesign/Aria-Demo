import { router } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { HeaderButton } from '@/components/header-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useColors } from '@/lib/colors';
import { hapticSelect } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { postJson } from '@/lib/api-client';
import { useAriaStore } from '@/store/aria-store';
import type { SendEmailRequest, SendEmailResponse } from '@/app/api/send-email+api';
import { X } from 'lucide-react-native';

// Feedback lands directly in the maker's inbox.
const SUPPORT_EMAIL = 'toyosi.design@gmail.com';

type Topic = 'idea' | 'issue' | 'other';
const TOPIC_LABEL: Record<Topic, string> = { idea: 'Idea', issue: 'Issue', other: 'Other' };

export default function SupportScreen() {
  const c = useColors();
  const profileEmail = useAriaStore((s) => s.profile.email);

  const [topic, setTopic] = useState<Topic>('idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(profileEmail ?? '');
  const [busy, setBusy] = useState(false);

  const canSend = message.trim().length > 0 && !busy;

  /**
   * Send it from the server so feedback actually arrives.
   *
   * A `mailto:` hand-off only opened the user's mail app and left the sending
   * to them, anything they didn't finish was silently lost, and it failed
   * outright on a device with no mail account. Opening the composer is kept
   * only as the fallback for when no provider is configured.
   */
  async function submit() {
    if (!canSend) return;
    hapticSelect();
    const subject = `Aria feedback: ${TOPIC_LABEL[topic]}`;
    const body = `${message.trim()}\n\nCategory: ${TOPIC_LABEL[topic]}\nFrom: ${email.trim() || 'not provided'}`;

    setBusy(true);
    try {
      const res = await postJson('/api/send-email', {
        to: SUPPORT_EMAIL,
        subject,
        body,
        // So a reply goes back to them, not to the sending domain.
        replyTo: email.trim() || undefined,
      } satisfies SendEmailRequest);
      const result = (await res.json()) as SendEmailResponse;

      if (result.sent) {
        showToast('Thanks, your feedback is on its way', 'check');
        router.back();
        return;
      }
      if (result.configured) {
        showToast(result.error ?? "Couldn't send that just now", 'trash');
        return;
      }
      // No mail provider set up, fall back to the user's own mail app.
      await openMailApp(subject, body);
    } catch {
      await openMailApp(subject, body);
    } finally {
      setBusy(false);
    }
  }

  async function openMailApp(subject: string, body: string) {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      showToast('Opening your mail app', 'check');
      router.back();
    } catch {
      showToast('No mail app is set up', 'trash');
    }
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-2">
        <HeaderButton icon={X} onPress={() => router.back()} />
        <Text variant="subtitle" className="flex-1">
          Support &amp; feedback
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text tone="muted" className="leading-6">
            Have an idea, a suggestion, or ran into a problem? Send it straight to the team. It goes
            right to our inbox.
          </Text>

          <View className="gap-2">
            <Text variant="label" tone="muted">
              Topic
            </Text>
            <Segmented<Topic>
              value={topic}
              onChange={setTopic}
              options={[
                { value: 'idea', label: 'Idea' },
                { value: 'issue', label: 'Issue' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </View>

          <View className="gap-2">
            <Text variant="label" tone="muted">
              Your message
            </Text>
            <View className="rounded-2xl border border-border bg-surface px-4">
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Share your idea, suggestion, or the issue you ran into…"
                placeholderTextColor={c.faint}
                multiline
                textAlignVertical="top"
                className="min-h-[130px] py-3 text-base text-ink"
              />
            </View>
          </View>

          <Input
            label="Your email (optional)"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Text variant="caption" tone="faint">
            Add your email if you’d like a reply.
          </Text>

          <Button
            title={busy ? 'Sending…' : 'Send feedback'}
            block
            size="lg"
            disabled={!canSend}
            loading={busy}
            leftIcon={!busy ? <Send size={18} color={c.accentInk} /> : undefined}
            onPress={submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
