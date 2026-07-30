import {
  CHANNEL_META,
  type Automation,
  type AutoStatus,
} from '@/lib/automations';
import { postJson } from '@/lib/api-client';
import { emailSubject, normaliseSubject } from '@/lib/send';
import { openEmailDraft, openSmsDraft, openWhatsAppDraft } from '@/lib/send';
import type { SendEmailRequest, SendEmailResponse } from '@/app/api/send-email+api';

export interface RunOutcome {
  status: AutoStatus;
  /** What to tell the user happened, in Aria's voice. */
  note: string;
  error?: string;
  /** True when the user still has to tap send in the app Aria opened. */
  handedOff?: boolean;
}

/** Ask the server to send an email outright. */
async function sendEmailServerSide(req: SendEmailRequest): Promise<SendEmailResponse> {
  try {
    const res = await postJson('/api/send-email', req);
    if (!res.ok) return { sent: false, configured: true, error: `Server returned ${res.status}` };
    return (await res.json()) as SendEmailResponse;
  } catch {
    return { sent: false, configured: false };
  }
}

/**
 * Carry out one scheduled item.
 *
 * Email is completed outright when a provider is configured. Text and WhatsApp
 * can only ever be handed off — no mobile OS lets an app send a message as the
 * user — so those come back as `handedOff` and the caller confirms with the
 * user rather than claiming they were sent.
 */
export async function runAutomation(a: Automation): Promise<RunOutcome> {
  const meta = CHANNEL_META[a.channel];
  const who = a.toName ?? 'them';

  if (a.channel === 'email') {
    // normaliseSubject, not trim: a scheduled subject can carry an internal
    // newline, which SendEmailSchema refuses outright — the send would fail with
    // a 400 the user reads as an unexplained failure.
    const subject = normaliseSubject(a.subject ?? '') || emailSubject(a.taskTitle, 'general');

    if (a.toEmail?.trim()) {
      const result = await sendEmailServerSide({ to: a.toEmail, subject, body: a.body });
      if (result.sent) {
        return { status: 'sent', note: `Emailed ${who}: “${subject}”.` };
      }
      if (result.configured) {
        // A provider exists and still refused: a real failure worth surfacing.
        return {
          status: 'failed',
          note: `I couldn’t send the email to ${who}.`,
          error: result.error ?? 'The mail provider rejected it',
        };
      }
    }

    // No provider set up (or no address) — open Mail with it ready instead.
    const handoff = await openEmailDraft({ to: a.toEmail, subject, body: a.body });
    return {
      status: 'ready',
      handedOff: true,
      note: handoff.copied
        ? `I couldn’t open ${handoff.app}, so the email is on your clipboard.`
        : `I’ve opened ${handoff.app} with the email to ${who} ready to send.`,
    };
  }

  const handoff =
    a.channel === 'whatsapp'
      ? await openWhatsAppDraft({ phone: a.toPhone, body: a.body })
      : await openSmsDraft({ phone: a.toPhone, body: a.body });

  return {
    status: 'ready',
    handedOff: true,
    note: handoff.copied
      ? `I couldn’t open ${meta.app}, so the message is on your clipboard.`
      : `I’ve opened ${handoff.app} with your message to ${who} ready. Tap send when you’re happy.`,
  };
}
