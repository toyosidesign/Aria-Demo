import { Mail, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, View, type View as RNView } from 'react-native';

import { WhatsAppIcon } from '@/components/brand-icons';
import { CardCanvas } from '@/components/card-canvas';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ARIA_SENDER } from '@/lib/aria-actions';
import { cardSharingAvailable, shareCardImage } from '@/lib/card-image';
import { cardTemplate, renderCard } from '@/lib/cards';
import { useColors } from '@/lib/colors';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { openEmailDraft, openWhatsAppDraft, emailSubject } from '@/lib/send';
import { selectNextDue, useAriaStore, type Task } from '@/store/aria-store';

type Stage = 'choose' | 'sending' | 'confirm';

/**
 * Sending a card that's already written.
 *
 * Deliberately not the chat flow: there's nothing left to draft or discuss, so
 * routing through Aria's conversation just puts two screens between the user
 * and the one decision they still have — which app it goes out in.
 */
export function SendCardSheet({
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

  const cardRef = useRef<RNView>(null);
  const [stage, setStage] = useState<Stage>('choose');
  const [note, setNote] = useState('');

  const template = cardTemplate(task.cardTemplateId);
  const who = task.contactName ?? 'them';
  const message = task.description?.trim() ?? '';
  const body = template
    ? renderCard({ template, toName: task.contactName, body: message, fromName })
    : message;

  function reset() {
    setStage('choose');
    setNote('');
    onClose();
  }

  async function handoff(via: 'email' | 'whatsapp' | 'picture') {
    hapticTap();
    setStage('sending');
    addDraftSection(task.id, { title: 'Card', content: body });

    if (via === 'picture') {
      const result = await shareCardImage(cardRef, { dialogTitle: `Send ${who} a card` });
      if (result !== 'shared') {
        setStage('choose');
        return;
      }
      setNote(`Your card for ${who} is ready. Pick where it goes and tap send.`);
      setStage('confirm');
      return;
    }

    const res =
      via === 'email'
        ? await openEmailDraft({
            to: task.contactEmail,
            subject: emailSubject(task.title, task.kind),
            body,
          })
        : await openWhatsAppDraft({ phone: task.contactPhone, body });

    setNote(
      res.copied
        ? `I couldn’t open ${res.app}, so the card is on your clipboard.`
        : `Opened ${res.app} with your card for ${who}. Read it over and tap send.`,
    );
    setStage('confirm');
  }

  /**
   * Aria can't see whether it actually sent, so it asks rather than assumes.
   * Confirming checks the card off and carries straight on to whatever's next,
   * so finishing one thing hands you the following one.
   */
  function confirmSent() {
    hapticSuccess();
    // Read the queue before completing — this task is excluded either way.
    const next = selectNextDue(tasks, demoDate, task.id);
    completeTask(task.id, { byAria: true });
    reset();
    // Always move on. Landing back on the task just marked done is a dead end,
    // so with nothing due or overdue left, the list is where to be.
    if (next) {
      router.push({ pathname: '/task/[id]', params: { id: next.id, advanced: '1' } });
    } else {
      router.replace('/(tabs)/tasks');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={reset}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="rounded-t-3xl border-t border-border bg-bg">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
            <Text variant="subtitle">Send your card</Text>
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
                <Text className="leading-6">{note}</Text>
                <View className="gap-2">
                  <Button title="Sent it" block onPress={confirmSent} />
                  {/* Backs up to the options rather than closing: nothing has
                      been sent, so the task stays exactly where it was and
                      another route is one tap away. */}
                  <Button
                    title="Not yet"
                    variant="secondary"
                    block
                    onPress={() => {
                      setNote('');
                      setStage('choose');
                    }}
                  />
                </View>
                <Text variant="caption" tone="faint" className="text-center leading-5">
                  I&apos;ll leave this on your list until you tell me it&apos;s gone.
                </Text>
              </>
            ) : (
              <>
                <Text tone="muted" className="leading-6">
                  Your card for {who} is written and ready.
                </Text>

                <View className="gap-2">
                  <Text variant="label" tone="muted">
                    Send it via
                  </Text>
                  <View className="flex-row gap-2">
                    <Button
                      title="Mail"
                      leftIcon={<Mail size={17} color={c.accentInk} />}
                      className="flex-1"
                      disabled={stage === 'sending'}
                      onPress={() => void handoff('email')}
                    />
                    <Button
                      title="WhatsApp"
                      variant="secondary"
                      leftIcon={<WhatsAppIcon size={18} />}
                      className="flex-1"
                      disabled={stage === 'sending'}
                      onPress={() => void handoff('whatsapp')}
                    />
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Mounted off-screen so the image capture has a live view to snapshot. */}
      <View style={{ position: 'absolute', left: -9999, top: 0 }} pointerEvents="none">
        <CardCanvas
          templateId={task.cardTemplateId}
          toName={task.contactName}
          message={message}
          fromName={fromName}
          ref={cardRef}
        />
      </View>
    </Modal>
  );
}
