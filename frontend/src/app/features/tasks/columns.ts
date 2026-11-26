import { dueChip, formatDuration, shortDate } from '../../core/dates';
import { Project, Task, TimeFormat } from '../../core/models';

/** A column of data shown for each task in the tree viewer. The title column always shows and fills the rest. */
export type ColumnKey =
  | 'priority' | 'due' | 'duration' | 'deadline' | 'category' | 'conditions' | 'labels' | 'assignee' | 'project' | 'created' | 'updated';

export interface Column {
  key: ColumnKey;
  label: string;
  /** Fixed width in px, the same for every row. */
  width: number;
}

export const COLUMNS: Column[] = [
  { key: 'priority', label: 'Priority', width: 64 },
  { key: 'due', label: 'Date', width: 96 },
  { key: 'duration', label: 'Duration', width: 76 },
  { key: 'deadline', label: 'Deadline', width: 96 },
  { key: 'category', label: 'Category', width: 112 },
  { key: 'conditions', label: 'Conditions', width: 132 },
  { key: 'labels', label: 'Hashtags', width: 120 },
  { key: 'assignee', label: 'Assignee', width: 100 },
  { key: 'project', label: 'Project', width: 120 },
  { key: 'created', label: 'Created', width: 90 },
  { key: 'updated', label: 'Modified', width: 90 },
];

export const DEFAULT_COLUMNS: ColumnKey[] = ['priority', 'due', 'duration', 'category', 'conditions', 'assignee'];

export interface Cell {
  text: string;
  /** A tone class: today, overdue, waiting, p1… */
  tone?: string;
  /** A design-system color name for a small marker. */
  color?: string;
}

export interface CellContext {
  timeFormat: TimeFormat;
  project: (id: number) => Project | undefined;
  categoryPath: (id: number) => string;
}

const EMPTY: Cell = { text: '' };

/** The text (and tone) a task shows in a column. Empty text means nothing to show. */
export function cellOf(t: Task, key: ColumnKey, ctx: CellContext): Cell {
  switch (key) {
    case 'priority':
      return t.priority === 4 ? EMPTY : { text: 'P' + t.priority, tone: 'p' + t.priority };
    case 'due': {
      if (!t.dueDate) return EMPTY;
      const c = dueChip(t.dueDate, t.dueTime, ctx.timeFormat);
      return { text: c.label, tone: c.tone };
    }
    case 'duration':
      return t.durationMinutes ? { text: formatDuration(t.durationMinutes) } : EMPTY;
    case 'deadline': {
      if (!t.deadline) return EMPTY;
      const d = new Date(t.deadline);
      return { text: shortDate(d), tone: d.getTime() < Date.now() ? 'overdue' : undefined };
    }
    case 'category':
      return t.category ? { text: ctx.categoryPath(t.category.id) || t.category.name, color: t.category.color } : EMPTY;
    case 'conditions':
      return t.conditions.length
        ? { text: t.conditions.map((c) => (c.met ? '' : '⏳ ') + c.label).join(', '), tone: t.conditions.some((c) => !c.met) ? 'waiting' : undefined }
        : EMPTY;
    case 'labels':
      return t.labels.length ? { text: t.labels.map((l) => '#' + l.name).join(' ') } : EMPTY;
    case 'assignee':
      return t.assignee ? { text: t.assignee.name } : EMPTY;
    case 'project': {
      const p = ctx.project(t.projectId);
      return p ? { text: p.inbox ? 'Inbox' : p.name, color: p.color } : EMPTY;
    }
    case 'created':
      return { text: shortDate(new Date(t.createdAt)) };
    case 'updated':
      return t.updatedAt ? { text: shortDate(new Date(t.updatedAt)) } : EMPTY;
  }
}
