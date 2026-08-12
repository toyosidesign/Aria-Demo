import { Text } from '@/components/ui/text';

/**
 * "This one was not written by the model."
 *
 * Every AI surface in this app has a scripted stand-in behind it, and the
 * stand-ins are good: they are shaped like real output so a demo survives a
 * plane, a dead key, or a signed-out session. The cost is that an outage looks
 * exactly like Aria having a bad day, which has now been misdiagnosed twice.
 *
 * The chat has said this for a while. Research notes, drafts, plans and guides
 * did not, which is precisely where a stand-in does the most damage: notes read
 * as findings and a plan reads as a plan.
 *
 * ── Development only ────────────────────────────────────────────────────────
 *
 * A release build should not explain its own internals to a student, and the
 * honest version of this for them is the line in Settings, which says what is
 * happening to every reply and what to do about it. This one is for whoever is
 * looking at the screen wondering why Aria got worse.
 */
export function ScriptedNote({ show, className = '' }: { show?: boolean; className?: string }) {
  if (!__DEV__ || !show) return null;
  return (
    <Text variant="caption" tone="faint" className={className}>
      scripted fallback, the model was not called
    </Text>
  );
}
