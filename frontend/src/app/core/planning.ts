import { addDays, daysFromToday, todayIso, toIso } from './dates';
import { Priority, Task } from './models';

// ---- comparison matrix ----

/** Saaty's scale: how much more important the row task is than the column task. */
export const SCALE: { value: number; label: string }[] = [
  { value: 9, label: 'Far more' },
  { value: 5, label: 'More' },
  { value: 3, label: 'A bit more' },
  { value: 1, label: 'Equal' },
];

/** Random consistency index for n items (Saaty). */
const RANDOM_INDEX = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59];

export interface MatrixResult {
  /** Weights that add up to 1, in the order of the items. */
  weights: number[];
  /** Importance points 0–100: the most important item gets 100. */
  points: number[];
  /** Consistency ratio: below 0.1 means the comparisons agree with each other. */
  consistency: number;
}

/**
 * Weights from a pairwise comparison matrix (m[i][j] = how much more important i is than j,
 * m[j][i] = 1 / m[i][j]) using the geometric mean of each row, plus Saaty's consistency ratio.
 */
export function weigh(m: number[][]): MatrixResult {
  const n = m.length;
  if (n === 0) return { weights: [], points: [], consistency: 0 };
  const geo = m.map((row) => Math.pow(row.reduce((p, x) => p * x, 1), 1 / n));
  const sum = geo.reduce((s, x) => s + x, 0);
  const weights = geo.map((g) => g / sum);
  const max = Math.max(...weights);
  const points = weights.map((w) => Math.round((w / max) * 100));
  // λmax from (M·w)_i / w_i, averaged.
  const lambda = m.reduce((s, row, i) => s + row.reduce((a, x, j) => a + x * weights[j], 0) / weights[i], 0) / n;
  const ci = n > 2 ? (lambda - n) / (n - 1) : 0;
  const ri = RANDOM_INDEX[Math.min(n, RANDOM_INDEX.length - 1)] || 1;
  return { weights, points, consistency: n > 2 ? Math.max(0, ci / ri) : 0 };
}

/** Answers that go in a circle (A over B, B over C, C over A), as index triples. */
export function contradictions(m: number[][]): [number, number, number][] {
  const n = m.length;
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        // Each circle once: start from its smallest index.
        if (i < j && i < k && j !== k && m[i][j] > 1 && m[j][k] > 1 && m[k][i] > 1) out.push([i, j, k]);
      }
    }
  }
  return out;
}

/** Importance points to a priority: the top of the range is P1, the bottom is P4. */
export function priorityFromPoints(points: number): Priority {
  if (points >= 75) return 1;
  if (points >= 50) return 2;
  if (points >= 25) return 3;
  return 4;
}

// ---- importance and urgency ----

/** 0–100. From the comparison matrix when the task has been compared, otherwise from its priority. */
export function importanceOf(t: Task): number {
  if (t.importance !== null && t.importance !== undefined) return t.importance;
  return { 1: 90, 2: 65, 3: 40, 4: 15 }[t.priority];
}

/** 0–100 from the nearest of its date and its deadline: overdue is 100, nothing planned is 0. */
export function urgencyOf(t: Task, today = todayIso()): number {
  const dates: string[] = [];
  if (t.dueDate) dates.push(t.dueDate);
  if (t.deadline) dates.push(toIso(new Date(t.deadline)));
  if (!dates.length) return 0;
  const days = Math.min(...dates.map((d) => daysBetween(today, d)));
  if (days < 0) return 100;
  if (days === 0) return 90;
  if (days === 1) return 80;
  if (days <= 3) return 65;
  if (days <= 7) return 50;
  if (days <= 14) return 30;
  return 15;
}

export type Quadrant = 'do' | 'schedule' | 'quick' | 'later';

export const QUADRANTS: { key: Quadrant; title: string; hint: string }[] = [
  { key: 'do', title: 'Do first', hint: 'Important and urgent' },
  { key: 'schedule', title: 'Schedule', hint: 'Important, not urgent yet' },
  { key: 'quick', title: 'Fit in or hand off', hint: 'Urgent, less important' },
  { key: 'later', title: 'Later', hint: 'Neither: keep or drop' },
];

export function quadrantOf(t: Task, today = todayIso()): Quadrant {
  const important = importanceOf(t) >= 50;
  const urgent = urgencyOf(t, today) >= 50;
  if (important && urgent) return 'do';
  if (important) return 'schedule';
  if (urgent) return 'quick';
  return 'later';
}

/** Order for planning: mostly importance, then urgency. */
export function scoreOf(t: Task, today = todayIso()): number {
  return Math.round(0.6 * importanceOf(t) + 0.4 * urgencyOf(t, today));
}

/** True while it waits for a task that isn't done. */
export function isWaiting(t: Task): boolean {
  return t.conditions.some((c) => !c.met);
}

// ---- planning ----

export interface PlanOptions {
  /** How many days to plan, starting today. */
  days: number;
  /** Minutes available each day. */
  minutesPerDay: number;
  /** Minutes assumed for tasks without a duration. */
  defaultMinutes: number;
  /** Leave weekends free. */
  skipWeekends: boolean;
}

export interface PlannedTask {
  task: Task;
  minutes: number;
  score: number;
  /** Planned after its deadline. */
  late: boolean;
  /** Its deadline was already before today. */
  pastDeadline: boolean;
}

export interface PlanDay {
  date: string;
  items: PlannedTask[];
  minutes: number;
}

export interface Plan {
  days: PlanDay[];
  /** Didn't fit in the time available. */
  overflow: PlannedTask[];
  /** Waiting for another task, so not planned. */
  waiting: Task[];
}

/**
 * Fills the next days with the highest-scoring tasks. A task with a deadline goes no later than
 * the deadline's day when it fits; a task waiting for an open task isn't planned.
 */
export function buildPlan(tasks: Task[], o: PlanOptions, today = todayIso()): Plan {
  const days: PlanDay[] = [];
  for (let i = 0, d = today; days.length < o.days && i < o.days * 3; i++, d = addDays(d, 1)) {
    const wd = new Date(d + 'T12:00:00').getDay();
    if (o.skipWeekends && (wd === 0 || wd === 6)) continue;
    days.push({ date: d, items: [], minutes: 0 });
  }
  const waiting = tasks.filter(isWaiting);
  const candidates = tasks.filter((t) => !isWaiting(t))
    .map((t) => ({ task: t, minutes: t.durationMinutes ?? o.defaultMinutes, score: scoreOf(t, today), late: false, pastDeadline: deadlineDay(t) < today }))
    .sort((a, b) => b.score - a.score || deadlineDay(a.task).localeCompare(deadlineDay(b.task)));
  const overflow: PlannedTask[] = [];
  for (const c of candidates) {
    const limit = deadlineDay(c.task);
    // Earliest day with room, no later than the deadline if there is one.
    let day = days.find((d) => d.minutes + c.minutes <= o.minutesPerDay && d.date <= limit);
    if (!day) {
      day = days.find((d) => d.minutes + c.minutes <= o.minutesPerDay);
      if (day) c.late = true;
      if (c.pastDeadline) c.late = false;
    }
    if (!day) {
      overflow.push(c);
      continue;
    }
    day.items.push(c);
    day.minutes += c.minutes;
  }
  return { days, overflow, waiting };
}

/** The day of its deadline (or a far date when it has none). */
function deadlineDay(t: Task): string {
  return t.deadline ? toIso(new Date(t.deadline)) : '9999-12-31';
}

function daysBetween(from: string, to: string): number {
  return from === todayIso() ? daysFromToday(to) : Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
