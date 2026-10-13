import { addDays, toIso, todayIso } from './dates';
import { Priority, Project } from './models';

export interface ParsedTask {
  title: string;
  priority?: Priority;
  dueDate?: string;
  projectId?: number;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Reads the shortcuts people type into Add task, e.g.
 * "Call landlord tomorrow p1 #Home" → title "Call landlord", due tomorrow, P1, project Home.
 * Supported: p1–p4, #Project (longest matching name wins), today, tomorrow, tod/tom,
 * next week, and weekday names (mon … sunday, always the next one coming).
 */
export function parseQuickAdd(text: string, projects: Project[]): ParsedTask {
  let rest = ` ${text} `;
  const out: ParsedTask = { title: '' };

  rest = rest.replace(/\s[pP]([1-4])(?=\s)/, (_, n) => {
    out.priority = Number(n) as Priority;
    return ' ';
  });

  const byLength = [...projects].sort((a, b) => b.name.length - a.name.length);
  for (const p of byLength) {
    const re = new RegExp(`\\s#${escape(p.name)}(?=\\s)`, 'i');
    if (re.test(rest)) {
      out.projectId = p.id;
      rest = rest.replace(re, ' ');
      break;
    }
  }

  const today = todayIso();
  const dateRules: [RegExp, () => string][] = [
    [/\s(today|tod)(?=\s)/i, () => today],
    [/\s(tomorrow|tom)(?=\s)/i, () => addDays(today, 1)],
    [/\snext week(?=\s)/i, () => nextWeekday(1)],
    [new RegExp(`\\s(${WEEKDAYS.join('|')}|${WEEKDAYS.map((w) => w.slice(0, 3)).join('|')})(?=\\s)`, 'i'),
      () => ''],
  ];
  for (const [re, value] of dateRules) {
    const m = rest.match(re);
    if (!m) continue;
    const v = value();
    out.dueDate = v || nextWeekday(WEEKDAYS.findIndex((w) => w.startsWith(m[1].toLowerCase().slice(0, 3))));
    rest = rest.replace(re, ' ');
    break;
  }

  out.title = rest.replace(/\s+/g, ' ').trim();
  return out;
}

/** The next given weekday after today (0 = Sunday). */
function nextWeekday(day: number): string {
  const d = new Date();
  const diff = (day - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return toIso(d);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
