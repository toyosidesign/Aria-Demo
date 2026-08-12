import { protectedRoute } from '@/lib/api-auth';
import { HealthSchema } from '@/lib/api-schemas';
import { limitAi } from '@/lib/rate-limit';
import { modelKeyStatus, verifyModelKey } from '@/lib/server-config';

/**
 * Whether Aria can actually think, asked from the phone.
 *
 * ── The failure this exists for ─────────────────────────────────────────────
 *
 * Every AI route in this app falls back to scripted text when the model cannot
 * be reached, and the fallbacks are written well enough to pass for real
 * replies. That is deliberate: the demo keeps working on a plane. It is also
 * how a dead API key survived weeks of testing, and how an unauthenticated
 * session later read as "Aria is repeating itself" rather than as an outage.
 *
 * Twice now the symptom has been indistinguishable from Aria simply being bad
 * at its job. So the verdict the server already reaches at startup is made
 * askable, and the settings screen states it in one line.
 *
 * ── Why it is authenticated like everything else ────────────────────────────
 *
 * It reports on this deployment's configuration, which is nobody's business but
 * the person signed into it. The 401 is informative rather than a nuisance: a
 * signed-out client is *itself* one of the two ways the app ends up on scripted
 * text, so the screen can say so instead of guessing.
 */
export const POST = protectedRoute(HealthSchema, limitAi, async () => {
  /*
   * Re-check when the answer is still unknown.
   *
   * `startKeyVerification` fires at import and is usually finished long before
   * anyone opens settings. The exception is a server that started without a key
   * and had one added since, which is exactly what somebody staring at this
   * screen is in the middle of doing, and telling them "unchecked" forever
   * while they wait would be the same silence in a new place.
   */
  const model = modelKeyStatus() === 'unchecked' ? await verifyModelKey() : modelKeyStatus();

  return Response.json({
    model,
    // Presence only. Whether Resend accepts the key is answered by a send, and
    // a health check that spends a real email to find out is a bad trade.
    email: Boolean(process.env.RESEND_API_KEY && process.env.ARIA_FROM_EMAIL),
  });
});
