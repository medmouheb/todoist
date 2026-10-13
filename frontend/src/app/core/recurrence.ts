import { addDays, fromIso, toIso } from './dates';

/**
 * Repeat rules, the same ones the backend understands (Recurrence.java):
 * "every day", "every weekday", "every week|month|year", "every 3 days", "every 2 weeks", "every monday".
 */
const INTERVAL = /^every (?:(\d{1,3}) )?(day|week|month|year)s?$/;
const WEEKDAY = /^every (mon|tue|wed|thu|fri|sat|sun)[a-z]*$/;
const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Finds a repeat rule inside free text, e.g. "Water plants every monday p2". */
export const RECURRENCE_IN_TEXT =
  /\bevery (?:weekday|(?:\d{1,3} )?(?:day|week|month|year)s?|(?:mon|tues|wednes|thurs|fri|satur|sun)day|mon|tue|wed|thu|fri|sat|sun)\b/i;

export function normalizeRule(rule: string): string {
  return rule.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isValidRule(rule: string): boolean {
  return nextOccurrence(rule, '2000-01-01') !== null;
}

/** The first date after `from` that matches the rule. */
export function nextOccurrence(rule: string, from: string): string | null {
  const r = normalizeRule(rule);
  if (r === 'every weekday') {
    let d = addDays(from, 1);
    while ([0, 6].includes(fromIso(d).getDay())) d = addDays(d, 1);
    return d;
  }
  let m = r.match(INTERVAL);
  if (m) {
    const n = m[1] ? Number(m[1]) : 1;
    if (n < 1) return null;
    const d = fromIso(from);
    if (m[2] === 'day') d.setDate(d.getDate() + n);
    if (m[2] === 'week') d.setDate(d.getDate() + 7 * n);
    if (m[2] === 'month') d.setMonth(d.getMonth() + n);
    if (m[2] === 'year') d.setFullYear(d.getFullYear() + n);
    return toIso(d);
  }
  m = r.match(WEEKDAY);
  if (m) {
    let d = addDays(from, 1);
    while (fromIso(d).getDay() !== DAY_INDEX[m[1]]) d = addDays(d, 1);
    return d;
  }
  return null;
}

/** The first occurrence on or after `today`. */
export function firstOccurrence(rule: string, today: string): string | null {
  if (INTERVAL.test(normalizeRule(rule))) return today; // "every week" starts today
  return nextOccurrence(rule, addDays(today, -1));
}

export const REPEAT_PRESETS = ['every day', 'every weekday', 'every week', 'every month', 'every year'];
