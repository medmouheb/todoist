import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, concatMap, from, last } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { dayHeading } from '../../core/dates';
import { Icon, IconName } from '../../core/icon';
import { Category, Condition, NewCondition, Priority, Task } from '../../core/models';
import { Store } from '../../core/store';
import { TaskActions } from '../../core/task-actions';
import { Dropdown } from '../../shared/dropdown';
import { COLUMNS, Cell, ColumnKey, DEFAULT_COLUMNS, cellOf } from './columns';
import { SortKey, compareBy, readSort, writeSort } from './sort';
import { CONDITION_TYPES, conditionIcon } from './conditions-editor';
import { NO_FILTER, TaskFilter, TaskToolbar, applyFilter, isFiltering } from './task-filter';

/** How the tree viewer groups tasks. Dragging a task to another group changes that value. */
export type ViewerType = 'project' | 'category' | 'priority' | 'condition' | 'duration' | 'due' | 'label' | 'assignee';

export const VIEWER_TYPES: { type: ViewerType; label: string; icon: IconName }[] = [
  { type: 'category', label: 'Category', icon: 'category' },
  { type: 'project', label: 'Project', icon: 'tree' },
  { type: 'priority', label: 'Priority', icon: 'flag' },
  { type: 'condition', label: 'Condition', icon: 'sparkle' },
  { type: 'duration', label: 'Duration', icon: 'hourglass' },
  { type: 'due', label: 'Date', icon: 'calendar' },
  { type: 'label', label: 'Hashtag', icon: 'tag' },
  { type: 'assignee', label: 'Assignee', icon: 'person' },
];

interface Node {
  task: Task;
  children: Node[];
  /** Open sub-tasks anywhere below. */
  descendants: number;
}

/** What a group stands for; dropping a task into it gives the task this value. */
type Target =
  | { kind: 'project'; projectId: number }
  | { kind: 'category'; categoryId: number | null }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'condition'; condition: NewCondition | null; match: string | null }
  | { kind: 'duration'; minutes: number | null }
  | { kind: 'due'; date: string | null }
  | { kind: 'label'; name: string | null }
  | { kind: 'assignee'; userId: number | null };

/** One drop list of top-level tasks. */
interface Bucket {
  key: string;
  target: Target;
  nodes: Node[];
}

/** A flat group (project, priority, condition…). */
interface Section {
  key: string;
  name: string;
  color: string | null;
  icon: IconName | null;
  bucket: Bucket;
  count: number;
}

/** A category with block A (its tasks) and block B (its sub-categories). */
interface CatNode {
  key: string;
  category: Category | null;
  name: string;
  color: string | null;
  bucket: Bucket;
  children: CatNode[];
  /** Tasks here and in every sub-category. */
  count: number;
}

const DURATION_BUCKETS: { key: string; name: string; max: number; set: number }[] = [
  { key: 'd1', name: 'Quick (15 min or less)', max: 15, set: 15 },
  { key: 'd2', name: 'Up to an hour', max: 60, set: 60 },
  { key: 'd3', name: 'Up to 3 hours', max: 180, set: 180 },
  { key: 'd4', name: 'Longer', max: Infinity, set: 240 },
];

const COLUMNS_KEY = 'doable.tree.columns';
const TYPE_KEY = 'doable.tree.type';

/**
 * The tree viewer: tasks → sub-tasks grouped by category (as the category tree, with each category's
 * tasks in block A and its sub-categories in block B), project, priority, condition of doing, duration,
 * date, hashtag or assignee. Every task is a row of fixed-width columns. Dragging a task into another
 * group changes that value; dragging inside a group reorders it where that has a meaning.
 */
@Component({
  selector: 'app-tree-page',
  imports: [Icon, TaskToolbar, NgTemplateOutlet, CdkDropList, CdkDrag, CdkDragHandle, Dropdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tree-page.html',
  styleUrl: './tree-page.css',
})
export class TreePage {
  private api = inject(Api);
  private auth = inject(Auth);
  protected store = inject(Store);
  protected actions = inject(TaskActions);

  protected readonly types = VIEWER_TYPES;
  protected readonly allColumns = COLUMNS;
  protected readonly tasks = signal<Task[]>([]);
  protected readonly loaded = signal(false);
  protected readonly filter = signal<TaskFilter>(NO_FILTER);
  protected readonly filtersOpen = signal(false);
  protected readonly type = signal<ViewerType>(readStored(TYPE_KEY, 'category') as ViewerType);
  protected readonly columnKeys = signal<ColumnKey[]>(readColumns());
  protected readonly sort = signal<SortKey[]>(readSort('doable.sort.tree'));
  /** Keys of folded rows ("c3" category, "s…" section, "t7" task). Everything starts open. */
  protected readonly closed = signal<Set<string>>(new Set());
  /** The cell showing its full text ("taskId:column"). */
  protected readonly openCell = signal<string | null>(null);
  protected readonly filtering = computed(() => isFiltering(this.filter()));

  protected readonly columns = computed(() => COLUMNS.filter((c) => this.columnKeys().includes(c.key)));
  /** Width of the fixed columns plus the action buttons, so the tree scrolls sideways on small screens. */
  protected readonly cellsWidth = computed(() => this.columns().reduce((w, c) => w + c.width + 8, 0) + 64);

  private readonly matches = computed(() => new Set(applyFilter(this.tasks(), this.filter(), this.auth.user()?.id).map((t) => t.id)));

  /** Top-level nodes (with sub-tasks below them), after search: a match keeps its path visible. */
  private readonly tops = computed<Node[]>(() => {
    const all = this.tasks();
    const byId = new Map(all.map((t) => [t.id, t]));
    const keep = new Set<number>();
    if (this.filtering()) {
      for (const id of this.matches()) {
        for (let t = byId.get(id); t; t = t.parentId ? byId.get(t.parentId) : undefined) keep.add(t.id);
      }
    }
    const visible = this.filtering() ? all.filter((t) => keep.has(t.id)) : all;
    const kids = new Map<number, Task[]>();
    for (const t of visible) if (t.parentId && byId.has(t.parentId)) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
    const cmp = this.sort().length ? compareBy(this.sort()) : null;
    const build = (t: Task): Node => {
      const list = kids.get(t.id) ?? [];
      const children = (cmp ? [...list].sort(cmp) : list).map(build);
      return { task: t, children, descendants: children.reduce((n, c) => n + 1 + c.descendants, 0) };
    };
    return visible.filter((t) => !t.parentId || !byId.has(t.parentId)).map(build);
  });

  /** The category tree: "Todos" with its uncategorized tasks, then each category recursively. */
  protected readonly categoryRoot = computed<CatNode>(() => {
    const byCat = new Map<number | null, Node[]>();
    for (const n of this.tops()) {
      const id = n.task.category && this.store.category(n.task.category.id) ? n.task.category.id : null;
      byCat.set(id, [...(byCat.get(id) ?? []), n]);
    }
    const cmp = this.sort().length ? compareBy(this.sort()) : null;
    for (const list of byCat.values()) {
      list.sort((a, b) => (cmp ? cmp(a.task, b.task) : 0) || a.task.categoryPosition - b.task.categoryPosition || a.task.id - b.task.id);
    }
    const size = (nodes: Node[]) => nodes.reduce((n, x) => n + 1 + x.descendants, 0);
    const build = (c: Category | null): CatNode => {
      const id = c?.id ?? null;
      const nodes = byCat.get(id) ?? [];
      const children = (this.store.categoryChildren().get(id) ?? []).map(build)
        .filter((x) => !this.filtering() || x.count > 0);
      return {
        key: id === null ? 'root' : 'c' + id, category: c, name: c?.name ?? 'Todos', color: c?.color ?? null,
        bucket: { key: 'b' + (id ?? 'root'), target: { kind: 'category', categoryId: id }, nodes },
        children, count: size(nodes) + children.reduce((n, x) => n + x.count, 0),
      };
    };
    return build(null);
  });

  /** Flat groups for every other viewer type. */
  protected readonly sections = computed<Section[]>(() => {
    const type = this.type();
    const groups = new Map<string, Section>();
    const add = (key: string, name: string, color: string | null, icon: IconName | null, target: Target, n: Node) => {
      if (!groups.has(key)) groups.set(key, { key, name, color, icon, bucket: { key: 'b' + key, target, nodes: [] }, count: 0 });
      const g = groups.get(key)!;
      g.bucket.nodes.push(n);
      g.count += 1 + n.descendants;
    };
    const ensure = (key: string, name: string, color: string | null, icon: IconName | null, target: Target) => {
      if (!groups.has(key)) groups.set(key, { key, name, color, icon, bucket: { key: 'b' + key, target, nodes: [] }, count: 0 });
    };

    if (type === 'project') {
      // Every project shows, even empty ones, so tasks can be dropped into them.
      for (const p of [this.store.inbox(), ...this.store.activeProjects()]) {
        if (p) ensure('p' + p.id, p.inbox ? 'Inbox' : p.name, p.color, null, { kind: 'project', projectId: p.id });
      }
    }
    if (type === 'priority') {
      for (const p of [1, 2, 3, 4] as Priority[]) ensure('p' + p, p === 4 ? 'No priority' : 'Priority ' + p, null, 'flag', { kind: 'priority', priority: p });
    }
    if (type === 'duration') {
      for (const b of DURATION_BUCKETS) ensure(b.key, b.name, null, 'hourglass', { kind: 'duration', minutes: b.set });
    }

    for (const n of this.tops()) {
      const t = n.task;
      switch (type) {
        case 'project': {
          const p = this.store.project(t.projectId);
          add('p' + t.projectId, p ? (p.inbox ? 'Inbox' : p.name) : 'Project', p?.color ?? null, null, { kind: 'project', projectId: t.projectId }, n);
          break;
        }
        case 'priority':
          add('p' + t.priority, t.priority === 4 ? 'No priority' : 'Priority ' + t.priority, null, 'flag', { kind: 'priority', priority: t.priority }, n);
          break;
        case 'condition':
          if (!t.conditions.length) add('~', 'No conditions: doable any time', null, 'check', { kind: 'condition', condition: null, match: null }, n);
          for (const c of t.conditions) {
            const k = conditionKey(c);
            add(k, groupName(c), null, conditionIcon(c.type), { kind: 'condition', condition: template(c), match: k }, n);
          }
          break;
        case 'duration': {
          const m = t.durationMinutes;
          const b = m ? DURATION_BUCKETS.find((x) => m <= x.max)! : null;
          if (b) add(b.key, b.name, null, 'hourglass', { kind: 'duration', minutes: b.set }, n);
          else add('~', 'Not estimated', null, 'hourglass', { kind: 'duration', minutes: null }, n);
          break;
        }
        case 'due':
          if (t.dueDate) add(t.dueDate, dayHeading(t.dueDate), null, 'calendar', { kind: 'due', date: t.dueDate }, n);
          else add('~', 'No date', null, 'calendar', { kind: 'due', date: null }, n);
          break;
        case 'label':
          if (!t.labels.length) add('~', 'No hashtag', null, 'tag', { kind: 'label', name: null }, n);
          for (const l of t.labels) add('l' + l.name.toLowerCase(), '#' + l.name, l.color, null, { kind: 'label', name: l.name }, n);
          break;
        case 'assignee':
          if (t.assignee) add('a' + t.assignee.id, t.assignee.name, null, 'person', { kind: 'assignee', userId: t.assignee.id }, n);
          else add('~', 'Unassigned', null, 'person', { kind: 'assignee', userId: null }, n);
          break;
      }
    }
    // In the order that makes sense for each type; "none" groups go last.
    const order = (s: Section): string => {
      if (s.key === '~') return '￿';
      if (type === 'condition') return CONDITION_TYPES.findIndex((c) => s.key.startsWith(c.type)) + s.name.toLowerCase();
      if (type === 'project') return '';
      return s.key;
    };
    const list = [...groups.values()];
    if (type !== 'project') list.sort((a, b) => order(a).localeCompare(order(b)));
    if (this.sort().length) {
      const cmp = compareBy(this.sort());
      for (const s of list) s.bucket.nodes.sort((a, b) => cmp(a.task, b.task));
    }
    return this.filtering() ? list.filter((s) => s.count > 0) : list;
  });

  /** Every drop list on screen, so a task can be dragged from any group to any other. */
  protected readonly listIds = computed(() => {
    const ids: string[] = [];
    if (this.type() === 'category') {
      const walk = (c: CatNode) => {
        ids.push('tv-' + c.bucket.key);
        c.children.forEach(walk);
      };
      walk(this.categoryRoot());
    } else {
      for (const s of this.sections()) ids.push('tv-' + s.bucket.key);
    }
    return ids;
  });

  constructor() {
    effect(() => {
      this.store.tasksVersion();
      untracked(() => this.api.treeTasks().subscribe((ts) => {
        this.tasks.set(ts);
        this.loaded.set(true);
      }));
    });
    // Searching opens everything, so every match is in view.
    effect(() => {
      if (this.filtering()) untracked(() => this.closed.set(new Set()));
    });
    effect(() => store(TYPE_KEY, this.type()));
    effect(() => store(COLUMNS_KEY, JSON.stringify(this.columnKeys())));
    effect(() => writeSort('doable.sort.tree', this.sort()));
  }

  // ---- display ----

  protected toggleColumn(key: ColumnKey): void {
    this.columnKeys.update((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key]));
  }

  protected resetColumns(): void {
    this.columnKeys.set([...DEFAULT_COLUMNS]);
  }

  protected cell(t: Task, key: ColumnKey): Cell {
    return cellOf(t, key, {
      timeFormat: this.auth.user()?.timeFormat ?? '24h',
      project: (id) => this.store.project(id),
      categoryPath: (id) => this.store.categoryPath(id),
    });
  }

  protected toggleCell(key: string): void {
    this.openCell.update((k) => (k === key ? null : key));
  }

  protected closeCell(key: string): void {
    if (this.openCell() === key) this.openCell.set(null);
  }

  protected isOpen(key: string): boolean {
    return !this.closed().has(key);
  }

  protected isHit(t: Task): boolean {
    return this.filtering() && this.matches().has(t.id);
  }

  protected toggle(key: string): void {
    this.closed.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected expandAll(): void {
    this.closed.set(new Set());
  }

  protected collapseAll(): void {
    const keys = new Set<string>();
    const walkNode = (n: Node) => {
      if (n.children.length) keys.add('t' + n.task.id);
      n.children.forEach(walkNode);
    };
    if (this.type() === 'category') {
      const walkCat = (c: CatNode) => {
        if (c.key !== 'root') keys.add(c.key);
        c.bucket.nodes.forEach(walkNode);
        c.children.forEach(walkCat);
      };
      walkCat(this.categoryRoot());
    } else {
      for (const s of this.sections()) {
        keys.add('s' + s.key);
        s.bucket.nodes.forEach(walkNode);
      }
    }
    this.closed.set(keys);
  }

  // ---- drag and drop ----

  protected drop(e: CdkDragDrop<Bucket, Bucket, Node>): void {
    const src = e.previousContainer.data;
    const to = e.container.data;
    const task = e.item.data.task;
    if (src === to) {
      if (e.previousIndex !== e.currentIndex) this.reorder(to, e.previousIndex, e.currentIndex);
      return;
    }
    // Show it in the new place right away; the reload confirms it.
    src.nodes.splice(e.previousIndex, 1);
    to.nodes.splice(e.currentIndex, 0, e.item.data);
    const done = { next: () => this.store.tasksChanged(), error: (err: unknown) => this.failed(err) };
    const t = to.target;
    const f = src.target;
    switch (t.kind) {
      case 'project':
        this.actions.move(task, t.projectId);
        break;
      case 'category': {
        const ids = to.nodes.map((n) => n.task.id);
        this.api.updateTask(task.id, t.categoryId ? { categoryId: t.categoryId } : { clearCategory: true })
          .pipe(concatMap(() => this.api.reorderCategoryTasks(t.categoryId, ids))).subscribe(done);
        break;
      }
      case 'priority':
        this.api.updateTask(task.id, { priority: t.priority }).subscribe(done);
        break;
      case 'duration':
        this.api.updateTask(task.id, t.minutes ? { durationMinutes: t.minutes } : { clearDuration: true }).subscribe(done);
        break;
      case 'due':
        this.api.updateTask(task.id, t.date ? { dueDate: t.date } : { clearDueDate: true }).subscribe(done);
        break;
      case 'assignee':
        this.api.updateTask(task.id, t.userId ? { assigneeId: t.userId } : { clearAssignee: true }).subscribe(done);
        break;
      case 'label': {
        const old = f.kind === 'label' ? f.name : null;
        const names = task.labels.map((l) => l.name).filter((n) => n !== old);
        if (t.name && !names.includes(t.name)) names.push(t.name);
        this.api.updateTask(task.id, { labels: names }).subscribe(done);
        break;
      }
      case 'condition': {
        // Swap the condition it was dragged out of for the one it was dropped into.
        const steps: Observable<unknown>[] = [];
        const old = f.kind === 'condition' && f.match ? task.conditions.find((c) => conditionKey(c) === f.match) : undefined;
        if (old) steps.push(this.api.removeCondition(task.id, old.id));
        if (t.condition && !task.conditions.some((c) => conditionKey(c) === t.match)) steps.push(this.api.addCondition(task.id, t.condition));
        if (!steps.length) return this.store.tasksChanged();
        from(steps).pipe(concatMap((s) => s), last()).subscribe(done);
        break;
      }
    }
  }

  /** Same group: saves the new order where order means something (projects and categories). */
  private reorder(b: Bucket, fromIndex: number, toIndex: number): void {
    if (this.sort().length) {
      this.store.toast('The tree is sorted. Clear the sort to put tasks in your own order.');
      return;
    }
    const t = b.target;
    if (t.kind !== 'project' && t.kind !== 'category') {
      this.store.toast('Tasks here follow the order of their project. Drag them in the Project or Category view to reorder.');
      return;
    }
    const [moved] = b.nodes.splice(fromIndex, 1);
    b.nodes.splice(toIndex, 0, moved);
    const ids = b.nodes.map((n) => n.task.id);
    const req = t.kind === 'project' ? this.api.reorderTasks(ids) : this.api.reorderCategoryTasks(t.categoryId, ids);
    req.subscribe({ next: () => this.store.tasksChanged(), error: (err) => this.failed(err) });
  }

  private failed(err: unknown): void {
    this.store.toast(errorMessage(err));
    this.store.tasksChanged();
  }

  protected bucketLabel(b: Bucket): string {
    return b.target.kind === 'category' ? 'Tasks in ' + (b.target.categoryId ? this.store.categoryPath(b.target.categoryId) : 'Todos') : 'Tasks';
  }
}

/** Tasks with "the same" condition share a group: same task to wait for, same hours, same place/person/state. */
function conditionKey(c: Condition): string {
  switch (c.type) {
    case 'AFTER': return 'AFTER' + c.afterTaskId;
    case 'TIME': return 'TIME' + (c.startTime ?? '') + '-' + (c.endTime ?? '');
    default: return c.type + (c.value ?? '').trim().toLowerCase();
  }
}

function groupName(c: Condition): string {
  switch (c.type) {
    case 'AFTER': return 'Waiting for “' + (c.afterTaskTitle ?? 'a task') + '”';
    case 'TIME': return 'Between ' + c.label.replace('–', ' and ');
    case 'PLACE': return 'At ' + c.value;
    case 'PERSON': return 'With ' + c.value;
    default: return 'When ' + c.value;
  }
}

/** What to add to a task dropped into this condition's group. */
function template(c: Condition): NewCondition {
  return { type: c.type, value: c.value, afterTaskId: c.afterTaskId, startTime: c.startTime, endTime: c.endTime };
}

function readStored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* private mode: not remembered */ }
}

function readColumns(): ColumnKey[] {
  try {
    const v = JSON.parse(readStored(COLUMNS_KEY, 'null'));
    if (Array.isArray(v)) return v.filter((k) => COLUMNS.some((c) => c.key === k));
  } catch { /* fall through */ }
  return [...DEFAULT_COLUMNS];
}
