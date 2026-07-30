import {
  addDays,
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
