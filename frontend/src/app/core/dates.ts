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

function daysFromToday(iso: string): number {
  const ms = fromIso(iso).getTime() - fromIso(todayIso()).getTime();
  return Math.round(ms / 86_400_000);
}

export type DateTone = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

/** Label and colour for a due-date chip, following the design system's date tokens. */
export function dueChip(iso: string): { label: string; tone: DateTone } {
  const diff = daysFromToday(iso);
  const d = fromIso(iso);
  if (diff === 0) return { label: 'Today', tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'tomorrow' };
  if (diff === -1) return { label: 'Yesterday', tone: 'overdue' };
  if (diff < 0) return { label: shortDate(d), tone: 'overdue' };
  if (diff < 7) return { label: d.toLocaleDateString(undefined, { weekday: 'long' }), tone: 'week' };
  return { label: shortDate(d), tone: 'later' };
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

function shortDate(d: Date): string {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}
