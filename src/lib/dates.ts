import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

/** Format a Date to ISO yyyy-MM-dd (calendar day, timezone-agnostic). */
export function toISODate(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

/**
 * The real calendar date, read fresh every call.
 *
 * Deliberately not a module-level constant: those are evaluated once at import
 * and go stale in a session left open across midnight, which is exactly how a
 * date display drifts without anyone noticing.
 */
export function realToday(): string {
  return toISODate(new Date());
}

export function formatFull(iso: string) {
  return format(parseISO(iso), 'EEE, MMM d');
}

export function formatLong(iso: string) {
  return format(parseISO(iso), 'EEEE, MMMM d, yyyy');
}

export function formatMonthYear(date: Date) {
  return format(date, 'MMMM yyyy');
}

/** "Today", "Tomorrow", "In 3 days", "Yesterday", "3 days ago". */
export function formatRelative(iso: string, fromISO: string) {
  const diff = differenceInCalendarDays(parseISO(iso), parseISO(fromISO));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/**
 * Has this calendar date (plus optional "HH:mm") already gone by?
 *
 * Compared against the real clock rather than the simulated demo date, because
 * this is what decides whether an alarm can actually ring or a scheduled send
 * can actually happen.
 */
export function isPastMoment(date: string, time?: string | null): boolean {
  const d = parseISO(date);
  if (Number.isNaN(d.getTime())) return false;
  if (time) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
  } else {
    // With no time set, a day only counts as past once it's fully over.
    d.setHours(23, 59, 59, 999);
  }
  return d.getTime() < Date.now();
}

/**
 * The day the app is currently behaving as, for "is this in the past?".
 *
 * `isPastMoment` and `realToday` answer against the real clock, which is right
 * for anything physical — an alarm can only ring in real time. But validation
 * has to answer against the day the *user* is looking at, and in demo mode that
 * is the simulated date.
 *
 * Without this, simulating forward to the 10th let you save a task dated the
 * 5th: the calendar drew it as overdue, every list treated it as late, and the
 * form raised nothing, because the 5th is still ahead of the real clock. The
 * demo bar only ever moves forward, so this resolves to the real date the rest
 * of the time.
 */
export function effectiveToday(demoDate: string): string {
  const real = realToday();
  return demoDate > real ? demoDate : real;
}

/**
 * Milliseconds until `date` (plus optional "HH:mm") arrives. Negative once it
 * has gone by, so `msUntilMoment(...) <= 0` is exactly `isPastMoment(...)`.
 *
 * Exists so a form holding a future time can wake up at the moment it stops
 * being valid, instead of waiting for whatever unrelated render happens next.
 */
export function msUntilMoment(date: string, time?: string | null): number {
  const d = parseISO(date);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  if (time) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
  } else {
    d.setHours(23, 59, 59, 999);
  }
  return d.getTime() - Date.now();
}

/**
 * How often a task comes back. `undefined` means it doesn't.
 *
 * A deliberately short list of the intervals people actually name out loud —
 * "every Monday", "the 1st of the month", "her birthday". A full RRULE grammar
 * buys flexibility nobody asked for at the cost of a UI nobody can use.
 */
export type Repeat = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly';

export const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
];

export const REPEAT_LABEL: Record<Repeat, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  fortnightly: 'Every 2 weeks',
  monthly: 'Every month',
  yearly: 'Every year',
};

/**
 * The date this task next falls on after `date`.
 *
 * Month and year steps lean on date-fns rather than arithmetic on the day
 * number, because the naive version silently corrupts the end of the month:
 * the 31st plus one month is not the 31st, and the 29th of February plus a year
 * does not exist. date-fns clamps to the last valid day, which is what someone
 * who picked "the 31st" actually meant.
 */
export function nextOccurrence(date: string, repeat: Repeat): string {
  const d = parseISO(date);
  if (Number.isNaN(d.getTime())) return date;
  switch (repeat) {
    case 'daily':
      return toISODate(addDays(d, 1));
    case 'weekly':
      return toISODate(addWeeks(d, 1));
    case 'fortnightly':
      return toISODate(addWeeks(d, 2));
    case 'monthly':
      return toISODate(addMonths(d, 1));
    case 'yearly':
      return toISODate(addYears(d, 1));
  }
}

/**
 * The next occurrence that hasn't already gone by.
 *
 * Completing a daily task you last ticked off a fortnight ago should schedule
 * tomorrow, not two weeks ago — stepping once would leave it instantly overdue,
 * and it would stay that way for every completion after it. The bound stops a
 * corrupt date turning this into an infinite loop.
 */
export function nextFutureOccurrence(date: string, repeat: Repeat, from = realToday()): string {
  let next = nextOccurrence(date, repeat);
  for (let guard = 0; next <= from && guard < 500; guard += 1) {
    const stepped = nextOccurrence(next, repeat);
    if (stepped === next) break;
    next = stepped;
  }
  return next;
}

export interface CalendarCell {
  date: Date;
  iso: string;
  inMonth: boolean;
}

/** Six-week matrix (Sun-start) covering the month that contains `cursor`. */
export function monthMatrix(cursor: Date): CalendarCell[] {
  const first = startOfMonth(cursor);
  const gridStart = startOfWeek(first, { weekStartsOn: 0 });
  const monthEndISO = toISODate(endOfMonth(cursor));
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    const iso = toISODate(date);
    cells.push({ date, iso, inMonth: iso >= toISODate(first) && iso <= monthEndISO });
  }
  return cells;
}

/**
 * The same six-week grid split into rows of 7. Always render a calendar this
 * way — laying 42 cells out with `flex-wrap` and a `100/7`% width lets rounding
 * push the seventh cell onto the next line, which silently shifts every date
 * out from under its weekday heading.
 */
export function monthWeeks(cursor: Date): CalendarCell[][] {
  const cells = monthMatrix(cursor);
  return Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ---- Time helpers ("HH:mm" 24-hour) ----

/** "HH:mm" (24h) → a Date today at that time (for the native picker). */
export function timeToDate(t: string): Date {
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** Date → "HH:mm" (24h). */
export function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "14:30" → "2:30 PM" for display. */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}
