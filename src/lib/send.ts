import * as Clipboard from 'expo-clipboard';
import { Linking, Platform } from 'react-native';

import { showToast } from '@/lib/toast';

/**
 * Handing off to the phone's own apps.
 *
 * Aria never sends anything itself, it writes the draft, then opens Mail /
 * Gmail / Messages with everything pre-filled so Maya taps send herself.
 */

export interface HandoffResult {
  /** The app actually opened, for the confirmation line ("Opened Gmail"). */
  app: string;
  /** True when nothing could be opened and the draft was copied instead. */
  copied?: boolean;
}

/** Strip formatting so a number works inside a `sms:` / `tel:` URL. */
function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

/**
 * A number WhatsApp will accept, or nothing.
 *
 * WhatsApp only takes full international numbers, digits only, no leading zero.
 * Anything else doesn't degrade, it invalidates the whole link, and WhatsApp
 * opens purely to say "this link couldn't be opened". A number saved in
 * national format ("0802 338 3108") is the common case: the country code
 * simply isn't in the contact, and guessing one would message a stranger. Far
 * better to hand over the message with no recipient and let WhatsApp ask.
 */
function whatsappNumber(phone?: string): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    // Already international.
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2); // 00 is the international prefix
  } else if (digits.startsWith('0')) {
    return ''; // national format, country unknown, so don't guess
  }

  return digits.length >= 8 ? digits : '';
}

/** First address of a comma-separated list, cleaned up. */
function addressList(emails: string): string {
  return emails
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .join(',');
}

async function open(url: string): Promise<boolean> {
  try {
    // canOpenURL is unreliable on web and for schemes that aren't declared,
    // so treat a throw from openURL as the real signal.
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Copy the draft as a fallback when no app can be opened (e.g. web). */
async function copyFallback(text: string, app: string): Promise<HandoffResult> {
  try {
    await Clipboard.setStringAsync(text);
  } catch {
    /* best effort */
  }
  showToast(`Couldn't open ${app}, draft copied`, 'check');
  return { app, copied: true };
}

/**
 * Open an email composer with the draft in it. Prefers Gmail when it's
 * installed, otherwise the system mail app.
 */
export async function openEmailDraft({
  to,
  subject,
  body,
}: {
  to?: string;
  subject: string;
  body: string;
}): Promise<HandoffResult> {
  const addr = to ? addressList(to) : '';
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  if (Platform.OS !== 'web') {
    const gmail = `googlegmail://co?to=${encodeURIComponent(addr)}&${q}`;
    try {
      if (await Linking.canOpenURL(gmail)) {
        if (await open(gmail)) return { app: 'Gmail' };
      }
    } catch {
      /* fall through to mailto */
    }
  }

  if (await open(`mailto:${addr}?${q}`)) return { app: 'Mail' };
  return copyFallback(body, 'Mail');
}

/** Open the Messages app with the text pre-filled. */
export async function openSmsDraft({
  phone,
  body,
}: {
  phone?: string;
  body: string;
}): Promise<HandoffResult> {
  const number = phone ? dialable(phone) : '';
  // iOS wants `sms:number&body=…`; Android (and everyone else) wants `?body=`.
  const sep = Platform.OS === 'ios' ? '&' : '?';
  if (await open(`sms:${number}${sep}body=${encodeURIComponent(body)}`))
    return { app: 'Messages' };
  return copyFallback(body, 'Messages');
}

/** Open WhatsApp with the message pre-filled for a number. */
export async function openWhatsAppDraft({
  phone,
  body,
}: {
  phone?: string;
  body: string;
}): Promise<HandoffResult> {
  const recipient = whatsappNumber(phone);
  const text = encodeURIComponent(body);

  // wa.me first. It's a universal link, so iOS still hands it straight to the
  // installed app, and WhatsApp parses it reliably, unlike the whatsapp://
  // scheme, which rejects multi-line text with "this link couldn't be opened".
  const webUrl = recipient
    ? `https://wa.me/${recipient}?text=${text}`
    : `https://wa.me/?text=${text}`;
  if (await open(webUrl)) return { app: 'WhatsApp' };

  // Only reached where the universal link isn't handled at all.
  const appUrl = recipient
    ? `whatsapp://send?phone=${recipient}&text=${text}`
    : `whatsapp://send?text=${text}`;
  if (await open(appUrl)) return { app: 'WhatsApp' };

  return copyFallback(body, 'WhatsApp');
}

/** Start a phone call. */
export async function openCall({
  phone,
  notes,
}: {
  phone?: string;
  notes: string;
}): Promise<HandoffResult> {
  if (phone && (await open(`tel:${dialable(phone)}`))) return { app: 'Phone' };
  return copyFallback(notes, 'Phone');
}

// Subject building lives in lib/email-subject.ts, pure, so it can be tested
// without a native runtime. Re-exported here because callers already import it
// from this module.
export { emailSubject, normaliseSubject } from '@/lib/email-subject';
