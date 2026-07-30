/**
 * The one channel Aria can genuinely complete on its own.
 *
 * Sending happens server-side via Resend, so a scheduled email goes out without
 * the user opening anything. Set RESEND_API_KEY and ARIA_FROM_EMAIL in
 * .env.local to enable it; with no key the route reports `configured: false`
 * and the app falls back to opening the user's mail app instead of pretending
 * the message was sent.
 */

import { protectedRoute } from '@/lib/api-auth';
import { SendEmailSchema } from '@/lib/api-schemas';
import { limitMail } from '@/lib/rate-limit';

export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

/**
 * A task emails one person. A request asking for more than a handful is not this
 * app being used, so it is refused rather than fanned out.
 */
const MAX_RECIPIENTS = 5;

const EMAIL = /^[^\s@,;:<>"]+@[^\s@,;:<>"]+\.[^\s@,;:<>"]+$/;

export interface SendEmailResponse {
  /** True only when the message was actually accepted for delivery. */
  sent: boolean;
  /** False when no provider is set up — the caller should hand off instead. */
  configured: boolean;
  error?: string;
}

const ok = (payload: SendEmailResponse) => Response.json(payload);

// Unauthenticated, this route was an open relay: it signs mail with the app's own
// verified domain, so anyone with the URL could send phishing that passes SPF and
// DKIM as us. The wrapper authenticates and meters before any of that — and the
// mail quota is the tighter one, because this is the costliest thing to abuse.
export const POST = protectedRoute(SendEmailSchema, limitMail, async (body) => {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ARIA_FROM_EMAIL;
  if (!key || !from) return ok({ sent: false, configured: false });

  // Each address is validated, not just non-empty: the characters excluded by
  // EMAIL are the ones used to smuggle extra headers or recipients through a
  // single field.
  const to = body.to
    .split(',')
    .map((t) => t.trim())
    .filter((t) => EMAIL.test(t));
  if (!to.length) return ok({ sent: false, configured: true, error: 'No valid recipient' });
  if (to.length > MAX_RECIPIENTS) {
    return ok({ sent: false, configured: true, error: 'Too many recipients' });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: body.subject || '(no subject)',
        text: body.body,
        ...(body.replyTo ? { reply_to: body.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      // The provider's own words name the sending domain, quota state and
      // account restrictions. That belongs in the server log, not in a response
      // any caller can read.
      const detail = await res.text().catch(() => '');
      console.error('[aria] send-email: provider rejected the message:', res.status, detail);
      return ok({
        sent: false,
        configured: true,
        error:
          res.status === 429
            ? 'Too many emails just now, try again shortly'
            : 'The mail provider rejected it',
      });
    }
    return ok({ sent: true, configured: true });
  } catch {
    return ok({ sent: false, configured: true, error: 'Could not reach the mail provider' });
  }
});
