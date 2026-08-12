/**
 * What Aria says when the model is out of reach.
 *
 * Its own module, with no import that reaches React Native, for the reason
 * written at the top of `lib/work-client.ts`: `lib/assistant.ts` pulls in the
 * store, and anything the check suites need has to be loadable without a
 * renderer. The rule this file carries is exactly the sort worth asserting, so
 * it lives where `check:flow` can reach it.
 */

/**
 * What Aria says to a real question when the model is out of reach.
 *
 * Varied by what was asked, so two questions never get the same words back:
 * repetition is the specific thing that makes a fallback feel like a fault. It
 * says plainly that it cannot answer properly right now, which is true, and
 * never pretends the question was an attempt to add a task.
 */
export function offlineAnswer(message: string): string {
  const m = message.trim().toLowerCase();
  const asksHow = /^(how|what|why|when|where|who|which|can|should|is|are|do|does|explain)\b/.test(m);

  if (!asksHow) {
    return "I can't get to my thinking right now, so I'd rather not guess at that. Say it again in a moment and I'll give you a proper answer, or tell me something to put on your list and I'll take care of that offline.";
  }
  if (/\b(essay|assignment|report|dissertation|thesis|coursework|exam|revision)\b/.test(m)) {
    return "That's a good question and I'd want to answer it properly, which I can't reach right now. Upload the brief when I'm back and I'll answer it against what your marker actually asked for, rather than in general.";
  }
  if (/\b(email|message|text|write|say|draft|reply)\b/.test(m)) {
    return "I can't draft properly at the moment. If you tell me who it's to and roughly what you want said, I'll have it written the moment I'm back.";
  }
  return "I can't answer that properly right now, and I'd rather say so than guess. Ask me again shortly. If it's something to be done, tell me and I'll put it on your list, that part works offline.";
}
