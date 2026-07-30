import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View, type View as RNView } from 'react-native';

import { WhatsAppIcon } from '@/components/brand-icons';
import { PhotoCanvas } from '@/components/photo-canvas';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ARIA_SENDER } from '@/lib/aria-actions';
import { cardSharingAvailable, shareCardImage } from '@/lib/card-image';
import { useColors } from '@/lib/colors';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { selectNextDue, useAriaStore, type Task } from '@/store/aria-store';

type Stage = 'choose' | 'sending' | 'confirm';

/**
 * Sending a picture that's already chosen and captioned.
 *
 * Mirrors the card sheet: no chat, just the decision left.
 *
 * WhatsApp only for now. Instagram and Facebook need their own integrations to
 * be aimed at properly (a Meta App ID for Stories, the SDK for Facebook), and
 * listing them before that exists would promise a route Aria can't take.
 *
 * The picture still leaves through the share sheet, because no URL scheme can
 * carry an attachment — which is also why the message is composed into the
 * image rather than passed alongside it.
 */
export function SendPhotoSheet({
  task,
  visible,
  onClose,
}: {
  task: Task;
  visible: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const tasks = useAriaStore((s) => s.tasks);
  const demoDate = useAriaStore((s) => s.demoDate);
  const completeTask = useAriaStore((s) => s.completeTask);
  const addDraftSection = useAriaStore((s) => s.addDraftSection);
  const fromName = useAriaStore((s) => s.profile.name) || ARIA_SENDER;

  const photoRef = useRef<RNView>(null);
  const [stage, setStage] = useState<Stage>('choose');

  const who = task.contactName ?? 'them';
  const message = task.description?.trim() ?? '';

  function reset() {
    setStage('choose');
    onClose();
  }

  async function share() {
    hapticTap();
    setStage('sending');
    addDraftSection(task.id, { title: 'Message', content: message });

    const result = await shareCardImage(photoRef, { dialogTitle: `Send ${who} the picture` });
    if (result !== 'shared') {
      setStage('choose');
      return;
    }
    setStage('confirm');
  }

  /** Aria can't see whether it went out, so it asks — then carries you on. */
  function confirmShared() {
    hapticSuccess();
    const next = selectNextDue(tasks, demoDate, task.id);
    completeTask(task.id, { byAria: true });
    reset();
    // Always move on, as above: nothing due or overdue means the list, not the
    // task that was just finished.
    if (next) {
      router.push({ pathname: '/task/[id]', params: { id: next.id, advanced: '1' } });
    } else {
      router.replace('/(tabs)/tasks');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={reset}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="max-h-[88%] rounded-t-3xl border-t border-border bg-bg">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
            <Text variant="subtitle">Share your picture</Text>
            <Pressable
              onPress={reset}
              hitSlop={8}
              accessibilityLabel="Close"
              className="h-9 w-9 items-center justify-center rounded-full active:bg-border/60">
              <X size={20} color={c.ink} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}>
            {stage === 'confirm' ? (
              <>
                <Text className="leading-6">
                  Your picture and message are ready to post. Did it go out?
                </Text>
                <View className="gap-2">
                  <Button title="Shared it" block onPress={confirmShared} />
                  {/* Back to the options, not out of the sheet — nothing has
                      been posted, so the task is untouched and trying another
                      place is one tap away. */}
                  <Button
                    title="Not yet"
                    variant="secondary"
                    block
                    onPress={() => setStage('choose')}
                  />
                </View>
                <Text variant="caption" tone="faint" className="text-center leading-5">
                  I&apos;ll leave this on your list until you tell me it&apos;s gone.
                </Text>
              </>
            ) : (
              <>
                {task.photoUri ? (
                  <View className="overflow-hidden rounded-2xl border border-border">
                    <Image
                      source={{ uri: task.photoUri }}
                      accessibilityIgnoresInvertColors
                      style={{ width: '100%', aspectRatio: 1 }}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}

                {message ? (
                  <Text tone="muted" className="leading-6">
                    “{message}”
                  </Text>
                ) : null}

                <View className="gap-3">
                  <Button
                    title="Share on WhatsApp"
                    leftIcon={<WhatsAppIcon size={19} color={c.accentInk} />}
                    block
                    size="lg"
                    disabled={stage === 'sending' || !task.photoUri || !cardSharingAvailable()}
                    onPress={() => void share()}
                  />
                  <Text variant="caption" tone="faint" className="text-center leading-5">
                    Pick WhatsApp when the share sheet opens. Your message is part of the picture,
                    so it stays with it.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Mounted off-screen so the capture has a live view to snapshot. */}
      <View style={{ position: 'absolute', left: -9999, top: 0 }} pointerEvents="none">
        <PhotoCanvas
          ref={photoRef}
          photoUri={task.photoUri}
          message={message}
          fromName={fromName}
        />
      </View>
    </Modal>
  );
}
