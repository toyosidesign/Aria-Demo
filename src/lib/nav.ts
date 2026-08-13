import { router, type Href } from 'expo-router';

/**
 * Going back, from a screen that may have nothing behind it.
 *
 * ── The error this fixes ────────────────────────────────────────────────────
 *
 * "The action 'GO_BACK' was not handled by any navigator." Every close button
 * in this app called `router.back()` directly, which assumes the screen was
 * pushed onto something. Often it was not:
 *
 *   · a notification opens a task screen cold, and the stack is one deep
 *   · the create form ends in `router.replace('/aria/[id]')`, replacing itself,
 *     so the walkthrough's own back has nowhere to return to
 *   · saving elsewhere calls `dismissAll()` first, by design
 *
 * In each case the tap did nothing and threw a red box. Worse than a dead
 * button: a dead button that looks like a crash.
 *
 * ── Why a fallback rather than hiding the control ───────────────────────────
 *
 * Somebody who arrived by notification still needs a way out of the screen, and
 * an X that is sometimes missing is harder to learn than one that always works.
 * So the exit stays put and lands somewhere sensible when there is no history:
 * home by default, or wherever the caller says is the right place to be.
 */
export function goBack(fallback: Href = '/(tabs)') {
  // `canGoBack` is the navigator's own answer, so it stays right as the stack
  // changes underneath. Asking it is the whole fix.
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
