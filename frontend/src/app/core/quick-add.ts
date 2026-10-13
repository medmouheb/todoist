import { addDays, nextWeek, todayIso, toIso } from './dates';
import { LabelRef, Priority, Project } from './models';
import { RECURRENCE_IN_TEXT, firstOccurrence, normalizeRule } from './recurrence';

export interface ParsedTask {
  title: string;
  priority?: Priority;
  dueDate?: string;
  dueTime?: string; // HH:mm
  recurrence?: string;
  projectId?: number;
  labels: string[];
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Reads the shortcuts people type into Add task, e.g.
 * "Call landlord tomorrow 3pm p1 #Home @phone" → due tomorrow 15:00, P1, project Home, label phone.
 * Supported: p1–p4 · #Project (longest name wins) · @label (new names become new labels) ·
 * today/tod, tomorrow/tom, next week, weekday names · times like 3pm, 9:30am, 15:00, "at 18" ·
 * repeats like every day, every weekday, every monday, every 2 weeks.
 */
export function parseQuickAdd(text: string, projects: Project[], weekStart = 1): ParsedTask {
  let rest = ` ${text} `;
  const out: ParsedTask = { title: '', labels: [] };
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = rest.match(re);
    if (!m) return;
    fn(m);
    rest = rest.replace(re, ' ');
  };

  take(/\s[pP]([1-4])(?=\s)/, (m) => (out.priority = Number(m[1]) as Priority));

  const byLength = [...projects].sort((a, b) => b.name.length - a.name.length);
  for (const p of byLength) {
    const re = new RegExp(`\\s#${escape(p.name)}(?=\\s)`, 'i');
    if (re.test(rest)) {
      out.projectId = p.id;
      rest = rest.replace(re, ' ');
      break;
    }
  }

  let m: RegExpMatchArray | null;
  while ((m = rest.match(/\s@([^\s@#]+)(?=\s)/))) {
    if (!out.labels.some((l) => l.toLowerCase() === m![1].toLowerCase())) out.labels.push(m[1]);
    rest = rest.replace(m[0], ' ');
  }

  const rec = rest.match(RECURRENCE_IN_TEXT);
  if (rec) {
    out.recurrence = normalizeRule(rec[0]);
    rest = rest.replace(rec[0], ' ');
  }

  // Times: "at 3pm", "3pm", "9:30 am", "15:00", "at 18"
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (t) => {
    let h = Number(t[1]) % 12;
    if (t[3].toLowerCase() === 'pm') h += 12;
    out.dueTime = hhmm(h, Number(t[2] ?? 0));
  });
  if (!out.dueTime) take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (t) => (out.dueTime = hhmm(Number(t[1]), Number(t[2]))));
  if (!out.dueTime) take(/\sat\s+([01]?\d|2[0-3])(?=\s)/, (t) => (out.dueTime = hhmm(Number(t[1]), 0)));

  const today = todayIso();
  const dateRules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/\s(today|tod)(?=\s)/i, () => today],
    [/\s(tomorrow|tom)(?=\s)/i, () => addDays(today, 1)],
    [/\snext week(?=\s)/i, () => nextWeek(weekStart)],
    [new RegExp(`\\s(?:on\\s+)?(${WEEKDAYS.join('|')}|${WEEKDAYS.map((w) => w.slice(0, 3)).join('|')})(?=\\s)`, 'i'),
      (d) => nextWeekday(WEEKDAYS.findIndex((w) => w.startsWith(d[1].toLowerCase().slice(0, 3))))],
  ];
  for (const [re, value] of dateRules) {
    const dm = rest.match(re);
    if (!dm) continue;
    out.dueDate = value(dm);
    rest = rest.replace(re, ' ');
    break;
  }
  if (!out.dueDate && out.recurrence) out.dueDate = firstOccurrence(out.recurrence, today) ?? undefined;
  if (!out.dueDate && out.dueTime) out.dueDate = today;

  out.title = rest.replace(/\s+/g, ' ').trim();
  return out;
}

/** Same parser, for the date picker's "Type a date" box. */
export function parseDateText(text: string, weekStart = 1): { date?: string; time?: string; recurrence?: string } | null {
  const p = parseQuickAdd(text, [], weekStart);
  if (!p.dueDate && !p.recurrence) return null;
  return { date: p.dueDate, time: p.dueTime, recurrence: p.recurrence };
}

/** Labels that a quick-add text would create, for previewing. */
export function unknownLabels(names: string[], known: LabelRef[]): string[] {
  return names.filter((n) => !known.some((k) => k.name.toLowerCase() === n.toLowerCase()));
}

/** The next given weekday after today (0 = Sunday). */
function nextWeekday(day: number): string {
  const d = new Date();
  const diff = (day - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return toIso(d);
}

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
