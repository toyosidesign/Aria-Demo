import nodemailer from 'nodemailer';

/**
 * Getting an email out, by whichever route this deployment actually has.
 *
 * ── Why there are three ─────────────────────────────────────────────────────
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
 * And Gmail is not available to everyone: Workspace admins turn app passwords
 * off and Advanced Protection removes them, with Google saying only that "the
 * setting you are looking for is not available for your account". So there is
 * plain SMTP too, which every free provider speaks and most will use with a
 * single verified sender address rather than a whole verified domain.
 *
 * And then SMTP itself turns out to be blocked in a lot of places: ports 25,
 * 465 and 587 are closed on many networks and on most serverless hosts, and the
 * failure is a timeout rather than a refusal, so it looks like nothing at all.
 * Brevo's transactional API carries the same message over 443, which is why it
 * is tried first.
 *
 * ── Which one wins ──────────────────────────────────────────────────────────
 *
 * The most deliberately configured. SMTP credentials, then a Gmail app
 * password, then Resend. Nobody sets either of the first two by accident, and
 * the alternative rule, "use Resend if it is configured", would leave this
 * project exactly where it started: a working key that silently refuses every
 * recipient but one.
 */

export type MailProvider = 'brevo' | 'smtp' | 'gmail' | 'resend' | 'none';

export interface MailResult {
  sent: boolean;
  /** Which route was taken, or that there was none. Never shown to a caller. */
  provider: MailProvider;
  /** Safe for a log. The provider's own words, which name the account. */
  error?: string;
}

const gmailUser = () => process.env.GMAIL_USER?.trim();
const gmailPass = () => process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');

/*
 * Any SMTP server, not just Google's.
 *
 * Gmail app passwords are not available on every account: Workspace admins turn
 * them off, Advanced Protection removes them, and Google shows "the setting you
 * are looking for is not available for your account" without saying which of
 * those it is. That is not a problem anyone can fix from inside this app.
 *
 * Every other free provider, Brevo, SendGrid, Mailjet, will verify a single
 * sender address instead of a whole domain, which means an ordinary Gmail
 * address can be the sender with no DNS at all. They all speak plain SMTP, so
 * one set of variables covers them and this app never needs to know which was
 * chosen.
 */
/*
 * The same provider, over HTTPS instead of SMTP.
 *
 * Ports 25, 465 and 587 are blocked on a great many networks and on most
 * serverless hosts, and the failure is a connection timeout: no error from the
 * provider, no bounce, nothing in a log except a wait. Measured here, where
 * 443 reaches Brevo and all three SMTP ports time out.
 *
 * Their transactional API takes the same message over 443, which goes wherever
 * ordinary web traffic goes. Preferred over SMTP for exactly that reason: it is
 * the same email by a route that is much harder to block.
 */
const brevoKey = () => process.env.BREVO_API_KEY?.trim();

const smtpHost = () => process.env.SMTP_HOST?.trim();
const smtpUser = () => process.env.SMTP_USER?.trim();
const smtpPass = () => process.env.SMTP_PASS?.trim();
/** Who the mail is from. Must be an address the provider has verified. */
const smtpFrom = () => process.env.SMTP_FROM?.trim() || smtpUser();

/** What this deployment can do, asked without sending anything. */
export function mailProvider(): MailProvider {
  if (brevoKey() && smtpFrom()) return 'brevo';
  if (smtpHost() && smtpUser() && smtpPass()) return 'smtp';
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
  const provider = mailProvider();
  if (provider === 'brevo' || provider === 'smtp' || provider === 'gmail') return true;
  if (provider === 'none') return false;
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
function mailTransport(provider: 'smtp' | 'gmail') {
  if (transport) return transport;
  transport =
    provider === 'gmail'
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: { user: gmailUser(), pass: gmailPass() },
        })
      : nodemailer.createTransport({
          host: smtpHost(),
          // 587 with STARTTLS is what every one of these providers documents
          // first; 465 is implicit TLS and `secure` has to agree with the port
          // or the connection hangs rather than failing, which is worse.
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: Number(process.env.SMTP_PORT ?? 587) === 465,
          auth: { user: smtpUser(), pass: smtpPass() },
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

  if (provider === 'brevo') {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey()!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // The sender has to be an address Brevo has verified, which is the
          // same rule the SMTP route follows. Named, so it arrives as Aria.
          sender: { name: 'Aria', email: smtpFrom() },
          to: msg.to.map((email) => ({ email })),
          subject: msg.subject,
          textContent: msg.text,
          ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
        }),
      });
      if (res.ok) return { sent: true, provider };
      const detail = await res.text().catch(() => '');
      return { sent: false, provider, error: `HTTP ${res.status} ${detail}`.trim() };
    } catch (err) {
      return { sent: false, provider, error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (provider === 'gmail' || provider === 'smtp') {
    try {
      await mailTransport(provider).sendMail({
        // Named, so it arrives as a person rather than as an address. The
        // address itself is whatever the provider has agreed to: Gmail will not
        // let an app password pretend to be anyone else, and the others send
        // only from an address they have verified.
        from: `Aria <${provider === 'gmail' ? gmailUser() : smtpFrom()}>`,
        to: msg.to.join(', '),
        subject: msg.subject,
        text: msg.text,
        ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      });
      return { sent: true, provider };
    } catch (err) {
      /*
       * The server's own words, kept for the log.
       *
       * They are specific in a way nothing this app could reconstruct is:
       * "Username and Password not accepted" is an ordinary password used where
       * an app password belongs, and "sender address not verified" is a single
       * sender that was never confirmed. Both are one click to fix and
       * impossible to guess from a generic failure.
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
