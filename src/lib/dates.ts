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

export interface CalendarCell {
  date: Date;
  iso: string;
  inMonth: boolean;
}

/** Six-week matrix (Mon-start) covering the month that contains `cursor`. */
export function monthMatrix(cursor: Date): CalendarCell[] {
  const first = startOfMonth(cursor);
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const monthEndISO = toISODate(endOfMonth(cursor));
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    const iso = toISODate(date);
    cells.push({ date, iso, inMonth: iso >= toISODate(first) && iso <= monthEndISO });
  }
  return cells;
}

export const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
