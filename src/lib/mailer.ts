import nodemailer from 'nodemailer';

/**
 * Getting an email out, by whichever route this deployment actually has.
 *
 * ── Why there are two ───────────────────────────────────────────────────────
 *
 * Resend will not send to anybody except the account owner until a domain has
 * been verified, which needs a domain, DNS records and a wait. That is the
 * right setup for something real, and a wall in front of a demo: until it is
 * done, "Aria emailed my tutor" cannot be shown at all, because the tutor is
 * not the person who owns the Resend account.
 *
 * Gmail over SMTP has no such rule. It costs nothing, it reaches anyone, it
 * caps out around 500 a day, and the mail genuinely comes from the person
 * demonstrating it rather than from a no-reply address on a domain nobody
 * recognises.
 *
 * ── Which one wins ──────────────────────────────────────────────────────────
 *
 * Gmail, when it is configured, because configuring it is a deliberate act.
 * Nobody sets an app password by accident, and the alternative rule, "use
 * Resend if it is configured", would leave this project exactly where it
 * started: a working Resend key that silently refuses every recipient but one.
 */

export type MailProvider = 'gmail' | 'resend' | 'none';

export interface MailResult {
  sent: boolean;
  /** Which route was taken, or that there was none. Never shown to a caller. */
  provider: MailProvider;
  /** Safe for a log. The provider's own words, which name the account. */
  error?: string;
}

const gmailUser = () => process.env.GMAIL_USER?.trim();
const gmailPass = () => process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');

/** What this deployment can do, asked without sending anything. */
export function mailProvider(): MailProvider {
  if (gmailUser() && gmailPass()) return 'gmail';
  if (process.env.RESEND_API_KEY && process.env.ARIA_FROM_EMAIL) return 'resend';
  return 'none';
}

/**
 * Whether the sender can reach anyone, or only the person who owns the account.
 *
 * The distinction the app needs to state out loud. A configured Resend key with
 * no verified domain looks identical to a working one right up until a student
 * watches an email to their tutor not arrive.
 */
export function canEmailAnyone(): boolean {
  if (mailProvider() !== 'resend') return mailProvider() === 'gmail';
  const from = process.env.ARIA_FROM_EMAIL ?? '';
  // resend.dev is their shared sandbox sender, and it is the giveaway: mail
  // from it only ever reaches the account holder.
  return !/@resend\.dev>?\s*$/i.test(from.trim());
}

/**
 * A transport per process, not per email.
 *
 * Nodemailer pools the TCP connection, and building a new transport for every
 * send means a fresh TLS handshake with Google each time, which is slow and
 * looks like hammering to them.
 */
let transport: nodemailer.Transporter | null = null;
function gmailTransport() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser(), pass: gmailPass() },
  });
  return transport;
}

export async function sendMail(msg: {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<MailResult> {
  const provider = mailProvider();

  if (provider === 'gmail') {
    try {
      await gmailTransport().sendMail({
        // Named, so it arrives as a person rather than as an address. The
        // account itself is still the sender: Gmail will not let it pretend
        // otherwise, and that honesty is the point of this route.
        from: `Aria <${gmailUser()}>`,
        to: msg.to.join(', '),
        subject: msg.subject,
        text: msg.text,
        ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      });
      return { sent: true, provider };
    } catch (err) {
      /*
       * Google's rejections are specific and worth keeping.
       *
       * "Username and Password not accepted" means an ordinary account password
       * was used where an app password is required, which is the mistake
       * everyone makes once, and it is unrecoverable from a generic failure
       * message.
       */
      return { sent: false, provider, error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (provider === 'resend') {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.ARIA_FROM_EMAIL,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
          ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
        }),
      });
      if (res.ok) return { sent: true, provider };
      const detail = await res.text().catch(() => '');
      return { sent: false, provider, error: `HTTP ${res.status} ${detail}`.trim() };
    } catch (err) {
      return { sent: false, provider, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { sent: false, provider: 'none', error: 'No mail provider configured' };
}
