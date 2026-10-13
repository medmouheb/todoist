import { TimeFormat } from './models';

/** Dates travel as local yyyy-mm-dd strings; these helpers never go through UTC. */

export function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function daysFromToday(iso: string): number {
  const ms = fromIso(iso).getTime() - fromIso(todayIso()).getTime();
  return Math.round(ms / 86_400_000);
}

/** The first day of the week containing `iso` (weekStart 1 = Monday, 0 = Sunday). */
export function startOfWeek(iso: string, weekStart: number): string {
  const day = fromIso(iso).getDay();
  return addDays(iso, -((day - weekStart + 7) % 7));
}

/** The coming Saturday (or today if it's the weekend). */
export function thisWeekend(): string {
  const t = todayIso();
  const day = fromIso(t).getDay();
  return day === 6 || day === 0 ? t : addDays(t, 6 - day);
}

/** Next week's first day. */
export function nextWeek(weekStart: number): string {
  return addDays(startOfWeek(todayIso(), weekStart), 7);
}

/** "15:00" or "3:00 PM" from "15:00" / "15:00:00". */
export function formatTime(time: string, format: TimeFormat): string {
  const [h, m] = time.split(':').map(Number);
  if (format === '24h') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return minutes % 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes / 60}h`;
}

export type DateTone = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

/** Label and colour for a due-date chip, following the design system's date tokens. */
export function dueChip(iso: string, time?: string | null, format: TimeFormat = '24h'): { label: string; tone: DateTone } {
  const diff = daysFromToday(iso);
  const d = fromIso(iso);
  let label: string;
  let tone: DateTone;
  if (diff === 0) [label, tone] = ['Today', 'today'];
  else if (diff === 1) [label, tone] = ['Tomorrow', 'tomorrow'];
  else if (diff === -1) [label, tone] = ['Yesterday', 'overdue'];
  else if (diff < 0) [label, tone] = [shortDate(d), 'overdue'];
  else if (diff < 7) [label, tone] = [d.toLocaleDateString(undefined, { weekday: 'long' }), 'week'];
  else [label, tone] = [shortDate(d), 'later'];
  if (time) {
    label += ' ' + formatTime(time, format);
    // A time earlier today is already overdue.
    if (diff === 0) {
      const [h, m] = time.split(':').map(Number);
      const now = new Date();
      if (h * 60 + m < now.getHours() * 60 + now.getMinutes()) tone = 'overdue';
    }
  }
  return { label, tone };
}

/** Section heading, e.g. "13 Oct · Today · Tuesday". */
export function dayHeading(iso: string): string {
  const d = fromIso(iso);
  const diff = daysFromToday(iso);
  const parts = [shortDate(d)];
  if (diff === 0) parts.push('Today');
  if (diff === 1) parts.push('Tomorrow');
  parts.push(d.toLocaleDateString(undefined, { weekday: 'long' }));
  return parts.join(' · ');
}

export function shortDate(d: Date): string {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}

/** "2 min ago", "3 h ago", "12 Oct". */
export function timeAgo(instant: string): string {
  const s = (Date.now() - new Date(instant).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return shortDate(new Date(instant));
}
