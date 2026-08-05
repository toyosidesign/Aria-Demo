import { format, parseISO } from 'date-fns';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Mail, MessageSquare } from 'lucide-react-native';

import { WhatsAppIcon } from '@/components/brand-icons';

/**
 * Scheduled work Aria runs on the user's behalf.
 *
 * What Aria can actually do at the appointed moment differs by channel, and the
 * difference is a platform limit rather than a product choice:
 *
 * - `email` can be sent outright, server-side, with nobody watching.
 * - `sms` and `whatsapp` cannot. Neither iOS nor Android exposes any way for an
 *   app to send a message as the user, so the most Aria can do is have the
 *   draft written, addressed and waiting behind one tap at the right moment.
 *
 * The UI must never imply otherwise, a "sent" that didn't send is worse than
 * no automation at all.
 */

export type AutoChannel = 'email' | 'sms' | 'whatsapp';

export type AutoStatus =
  | 'scheduled' // waiting for its moment
  | 'sent' // Aria sent it outright (email only)
  | 'ready' // its moment came and it needs one tap to go
  | 'done' // handed off and confirmed by the user
  | 'failed'
  | 'cancelled';

export interface Automation {
  id: string;
  taskId: string;
  taskTitle: string;
  channel: AutoChannel;
  /** ISO datetime, when Aria should act. */
  runAt: string;
  toName?: string;
  toEmail?: string;
  toPhone?: string;
  subject?: string;
  body: string;
  status: AutoStatus;
  createdAt: string;
  ranAt?: string;
  /** Why it didn't go through, shown verbatim in the report. */
  error?: string;
}

export interface ChannelMeta {
  label: string;
  /** The app Aria hands off to, when it has to. */
  app: string;
  /** Loose enough to hold both a Lucide glyph and a brand mark. */
  icon: ComponentType<{ size?: number; color?: string; style?: StyleProp<ViewStyle> }>;
  /** True when Aria can complete it with nobody watching. */
  autonomous: boolean;
  /** One line explaining what will actually happen at the scheduled time. */
  promise: string;
}

export const CHANNEL_META: Record<AutoChannel, ChannelMeta> = {
  email: {
    label: 'Email',
    app: 'Mail',
    icon: Mail,
    autonomous: true,
    promise: 'I’ll send this myself at the scheduled time, then tell you it went.',
  },
  sms: {
    label: 'Text',
    app: 'Messages',
    icon: MessageSquare,
    autonomous: false,
    promise:
      'I’ll have it written and addressed at the scheduled time, ready to send in one tap. Phones don’t let apps text for you.',
  },
  whatsapp: {
    label: 'WhatsApp',
    app: 'WhatsApp',
    icon: WhatsAppIcon,
    autonomous: false,
    promise:
      'I’ll open WhatsApp with it ready at the scheduled time. WhatsApp has no way for apps to send on your behalf.',
  },
};

export const AUTO_CHANNELS: AutoChannel[] = ['email', 'sms', 'whatsapp'];

/** Has this automation's moment arrived? */
export function isDue(a: Automation, now: Date = new Date()): boolean {
  if (a.status !== 'scheduled' && a.status !== 'ready') return false;
  return parseISO(a.runAt).getTime() <= now.getTime();
}

/** Still waiting for its moment. */
export function isPending(a: Automation): boolean {
  return a.status === 'scheduled' || a.status === 'ready';
}

/** Finished, one way or another, this is what the report is built from. */
export function isFinished(a: Automation): boolean {
  return a.status === 'sent' || a.status === 'done' || a.status === 'failed';
}

/** Combine a yyyy-MM-dd date and an HH:mm time into an ISO datetime. */
export function toRunAt(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = parseISO(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

/** "Fri, Jul 31 at 9:00 AM" */
export function formatRunAt(iso: string): string {
  return format(parseISO(iso), "EEE, MMM d 'at' h:mm a");
}

/** Past-tense line for the report: what Aria actually did. */
export function reportLine(a: Automation): string {
  const who = a.toName ?? 'them';
  switch (a.status) {
    case 'sent':
      return `Emailed ${who}`;
    case 'done':
      return `${CHANNEL_META[a.channel].label} to ${who} sent`;
    case 'failed':
      return `Couldn’t reach ${who}`;
    default:
      return `${CHANNEL_META[a.channel].label} to ${who}`;
  }
}
