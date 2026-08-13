import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowLeft, CircleAlert, FileText, Mail, Share2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { HeaderButton } from '@/components/header-button';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { assemble, factsFromSections } from '@/lib/assemble';
import { goBack } from '@/lib/nav';
import { useColors } from '@/lib/colors';
import { formatFull } from '@/lib/dates';
import { exportDocument } from '@/lib/export';
import { hapticSelect } from '@/lib/haptics';
import { writtenSections } from '@/lib/sections';
import { useAriaStore } from '@/store/aria-store';

/**
 * The document, the night before, with the things worth checking on top.
 *
 * The human checkpoint. Aria has arranged everything the work produced into one
 * file, named the way a marker expects, and this is where somebody reads it
 * before it goes anywhere.
 *
 * ── Why the warnings come first ─────────────────────────────────────────────
 *
 * The document is long and the problems with it are short. Somebody opening
 * this at 11pm needs "you are 400 words short and referencing is still open"
 * before they need paragraph one, and putting the text first would hide exactly
 * the two lines that change what they do next.
 *
 * ── Why it is assembled again here rather than read back ────────────────────
 *
 * The runner keeps a copy on the task, but the work may have moved on since:
 * a step ticked off, a section rewritten, a draft that arrived this morning.
 * Assembly is arrangement rather than authorship, so redoing it costs nothing
 * and guarantees this screen shows the document as the work stands now, not as
 * it stood whenever the last pass ran.
 */
export default function AssembledScreen() {
  const c = useColors();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const task = useAriaStore((s) => s.tasks.find((t) => t.id === taskId));
  const profile = useAriaStore((s) => s.profile);

  const document = useMemo(() => {
    if (!task) return null;
    // The constant, not the string. Two spellings of the same section title is
    // how a document ends up containing its own previous copy.
    const sections = writtenSections(task.draftSections);
    return assemble({
      title: task.title,
      author: profile.name,
      context: profile.context,
      deadline: task.date,
      facts: factsFromSections(sections),
      sections,
      steps: task.subtasks,
    });
  }, [task, profile.name, profile.context]);

  if (!task || !document) {
    return (
      <Screen padded edges={['top']}>
        <Text tone="muted">That task no longer exists.</Text>
        <Button title="Go back" variant="secondary" onPress={() => goBack('/(tabs)/tasks')} className="mt-4" />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-2">
        <HeaderButton icon={ArrowLeft} onPress={() => goBack('/(tabs)/tasks')} />
        <Text variant="label" tone="muted">
          Due {formatFull(task.date)}
        </Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}>
        <View className="gap-1">
          <Text variant="title">{task.title}</Text>
          <View className="flex-row items-center gap-2">
            <FileText size={14} color={c.muted} />
            <Text variant="small" tone="muted">
              {document.filename} · {document.words}
              {document.targetWords ? ` of ${document.targetWords}` : ''} words
            </Text>
          </View>
        </View>

        {/* What to look at, before what to read. */}
        {document.warnings.length ? (
          <View className="gap-2 rounded-2xl border border-danger/40 bg-surface p-4">
            <View className="flex-row items-center gap-2">
              <CircleAlert size={15} color={c.danger} />
              <Text variant="label" tone="danger">
                Worth checking
              </Text>
            </View>
            {document.warnings.map((w) => (
              <Text key={w} variant="small" tone="muted" className="leading-5">
                {w}
              </Text>
            ))}
          </View>
        ) : (
          <View className="rounded-2xl border border-border bg-surface p-4">
            <Text variant="small" tone="muted">
              Nothing looks missing. Read it through, then take it wherever it needs to go.
            </Text>
          </View>
        )}

        {/*
          The document itself, in a monospaced-ish block rather than styled to
          look finished. It is a draft somebody is about to check, and making it
          look like a published page invites it to be sent unread.
        */}
        <View className="rounded-2xl border border-border bg-bg p-4">
          <Text variant="small" className="leading-6">
            {document.body}
          </Text>
        </View>
      </ScrollView>

      {/*
        Two endings, because a finished document goes one of two places.

        It is saved, which is the share sheet and covers Files, Drive, Notes and
        anything else the phone can open it with. Or it is emailed to somebody,
        which is a scheduled send: a tutor, a supervisor, a submission address.
        Those are genuinely different acts, and offering one button called
        "Save or share" made the second one look impossible.
      */}
      <View className="gap-2 border-t border-border px-5 pb-6 pt-3">
        <Button
          title="Email it, at a time I pick"
          block
          size="lg"
          leftIcon={<Mail size={18} color={c.accentInk} />}
          onPress={() => {
            hapticSelect();
            /*
             * The document is not passed in the URL.
             *
             * It runs to thousands of words, and a query string is the wrong
             * place for an essay. The send screen reads the assembled section
             * off the task itself.
             */
            router.push(`/email-it/${task.id}` as Href);
          }}
        />
        <Button
          title="Save as a document"
          variant="secondary"
          block
          size="lg"
          leftIcon={<Share2 size={18} color={c.accent} />}
          onPress={() => {
            hapticSelect();
            /*
             * Out of the app, rather than into a submission.
             *
             * Handing it to the share sheet is the honest end of this feature
             * today: the student decides where it goes. Submitting to an LMS is
             * the next thing to build and the riskiest, because a submission
             * that fires early or sends the wrong draft costs a grade nobody
             * can recover.
             */
            void exportDocument({
              name: document.filename.replace(/\.txt$/, ''),
              title: task.title,
              author: profile.name,
              sections: writtenSections(task.draftSections),
            });
          }}
        />
        <Button title="Not yet" variant="ghost" size="sm" block onPress={() => goBack('/(tabs)/tasks')} />
      </View>
    </Screen>
  );
}
