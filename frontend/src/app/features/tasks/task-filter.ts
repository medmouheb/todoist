import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDays, dayHeading, todayIso } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Project, Task } from '../../core/models';
import { Store } from '../../core/store';

export type GroupBy = 'none' | 'category' | 'priority' | 'label' | 'project' | 'assignee' | 'due';
export type DueFilter = 'any' | 'overdue' | 'today' | 'week' | 'none' | 'deadline';

export interface TaskFilter {
  query: string;
  priority: number | null;
  label: string | null;
  categoryId: number | null; // 0 = no category
  assignee: 'any' | 'me' | 'none' | number;
  due: DueFilter;
}

export const NO_FILTER: TaskFilter = { query: '', priority: null, label: null, categoryId: null, assignee: 'any', due: 'any' };

export function isFiltering(f: TaskFilter): boolean {
  return !!f.query.trim() || f.priority !== null || f.label !== null || f.categoryId !== null || f.assignee !== 'any' || f.due !== 'any';
}

/** Search matches the title, description, labels, category and assignee; every filter must match. */
export function applyFilter(tasks: Task[], f: TaskFilter, myId: number | undefined): Task[] {
  const q = f.query.trim().toLowerCase();
  const today = todayIso();
  const weekEnd = addDays(today, 7);
  return tasks.filter((t) => {
    if (q) {
      const hay = [t.title, t.description ?? '', ...t.labels.map((l) => l.name), t.category?.name ?? '', t.assignee?.name ?? '']
        .join(' ').toLowerCase();
      if (!q.split(/\s+/).every((word) => hay.includes(word))) return false;
    }
    if (f.priority !== null && t.priority !== f.priority) return false;
    if (f.label !== null && !t.labels.some((l) => l.name === f.label)) return false;
    if (f.categoryId !== null && (t.category?.id ?? 0) !== f.categoryId) return false;
    if (f.assignee === 'me' && t.assignee?.id !== myId) return false;
    if (f.assignee === 'none' && t.assignee) return false;
    if (typeof f.assignee === 'number' && t.assignee?.id !== f.assignee) return false;
    switch (f.due) {
      case 'overdue': if (!t.dueDate || t.dueDate >= today) return false; break;
      case 'today': if (t.dueDate !== today) return false; break;
      case 'week': if (!t.dueDate || t.dueDate < today || t.dueDate > weekEnd) return false; break;
      case 'none': if (t.dueDate) return false; break;
      case 'deadline': if (!t.deadline) return false; break;
    }
    return true;
  });
}

export interface TaskGroup {
  key: string;
  name: string;
  /** A design-system color name for the group's marker, if it has one. */
  color: string | null;
  tasks: Task[];
}

/** Splits tasks into groups, in a sensible order for each attribute; "none" groups go last. */
export function groupTasks(tasks: Task[], by: GroupBy, project: (id: number) => Project | undefined): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  const add = (key: string, name: string, color: string | null, t: Task) => {
    if (!groups.has(key)) groups.set(key, { key, name, color, tasks: [] });
    groups.get(key)!.tasks.push(t);
  };
  for (const t of tasks) {
    switch (by) {
      case 'category': t.category ? add('c' + t.category.id, t.category.name, t.category.color, t) : add('~', 'No category', null, t); break;
      case 'priority': add('p' + t.priority, t.priority === 4 ? 'No priority' : 'Priority ' + t.priority, null, t); break;
      case 'project': {
        const p = project(t.projectId);
        add('p' + t.projectId, p ? (p.inbox ? 'Inbox' : p.name) : 'Project', p?.color ?? null, t);
        break;
      }
      case 'assignee': t.assignee ? add('a' + t.assignee.id, t.assignee.name, null, t) : add('~', 'Unassigned', null, t); break;
      case 'due': t.dueDate ? add(t.dueDate, dayHeading(t.dueDate), null, t) : add('~', 'No date', null, t); break;
      case 'label':
        if (!t.labels.length) add('~', 'No label', null, t);
        for (const l of t.labels) add('l' + l.name, '@' + l.name, l.color, t); // a task shows under each of its labels
        break;
      default: add('all', '', null, t);
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === '~') return 1;
    if (b.key === '~') return -1;
    return by === 'priority' || by === 'due' ? a.key.localeCompare(b.key) : 0;
  });
}

/** Search box, filters and "group by", shared by the task lists and the tree. */
@Component({
  selector: 'app-task-toolbar',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <label class="search">
        <app-icon name="search" [small]="true" />
        <span class="sr-only">Search tasks</span>
        <input type="search" placeholder="Search tasks" [ngModel]="filter().query" (ngModelChange)="set({ query: $event })" />
      </label>
      <button type="button" class="btn ghost sm" [class.on]="open()" [attr.aria-expanded]="open()" (click)="open.set(!open())">
        <app-icon name="filter" [small]="true" />Filter @if (activeCount()) { <span class="badge">{{ activeCount() }}</span> }
      </button>
      <label class="group">
        <span>Group</span>
        <select [ngModel]="groupBy()" (ngModelChange)="groupBy.set($event)" aria-label="Group by">
          <option value="none">{{ noneLabel() }}</option>
          <option value="category">Category</option>
          <option value="priority">Priority</option>
          <option value="label">Label</option>
          @if (showProjectGroup()) { <option value="project">Project</option> }
          <option value="assignee">Assignee</option>
          <option value="due">Date</option>
        </select>
      </label>
    </div>
    <div class="panel" [class.shown]="open()">
      <div class="inner">
        <div class="filters">
          <label>Priority
            <select [ngModel]="filter().priority" (ngModelChange)="set({ priority: $event })">
              <option [ngValue]="null">Any</option>
              @for (p of [1, 2, 3, 4]; track p) { <option [ngValue]="p">{{ p === 4 ? 'No priority' : 'P' + p }}</option> }
            </select>
          </label>
          <label>Date
            <select [ngModel]="filter().due" (ngModelChange)="set({ due: $event })">
              <option value="any">Any</option><option value="overdue">Overdue</option><option value="today">Today</option>
              <option value="week">Next 7 days</option><option value="none">No date</option><option value="deadline">Has a deadline</option>
            </select>
          </label>
          <label>Category
            <select [ngModel]="filter().categoryId" (ngModelChange)="set({ categoryId: $event })">
              <option [ngValue]="null">Any</option><option [ngValue]="0">No category</option>
              @for (c of store.categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
            </select>
          </label>
          <label>Label
            <select [ngModel]="filter().label" (ngModelChange)="set({ label: $event })">
              <option [ngValue]="null">Any</option>
              @for (l of store.labels(); track l.id) { <option [ngValue]="l.name">{{ l.name }}</option> }
            </select>
          </label>
          <label>Assignee
            <select [ngModel]="filter().assignee" (ngModelChange)="set({ assignee: $event })">
              <option value="any">Anyone</option><option value="me">Me</option><option value="none">Unassigned</option>
            </select>
          </label>
          @if (activeCount()) { <button type="button" class="btn sm" (click)="filter.set(none)">Clear filters</button> }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; margin-bottom: 8px; }
    .bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .search { flex: 1; min-width: 160px; display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px;
      border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); color: var(--ink-subtle); }
    .search:focus-within { outline: 2px solid var(--focus-ring); outline-offset: -1px; border-color: transparent; }
    .search input { flex: 1; border: 0; background: transparent; font-size: 13px; color: var(--ink); min-width: 0; }
    .search input:focus { outline: none; }
    .btn.on { background: var(--surface-selected); color: var(--brand-ink); }
    .badge { min-width: 16px; height: 16px; border-radius: 99px; background: var(--brand); color: var(--on-brand); font-size: 10px; line-height: 16px; text-align: center; padding: 0 4px; }
    .group { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-muted); }
    .group select, .filters select { height: 32px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); font-size: 13px; padding: 0 6px; }
    /* Animated open/close: the grid row grows from 0 to its content's height. */
    .panel { display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden;
      transition: grid-template-rows .25s ease, opacity .25s ease, visibility .25s; }
    /* visibility keeps the hidden filters out of keyboard focus and screen readers */
    .panel.shown { grid-template-rows: 1fr; opacity: 1; visibility: visible; }
    .inner { overflow: hidden; }
    .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; padding: 10px 0 2px; }
    .filters label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--ink-muted); }
    @media (prefers-reduced-motion: reduce) { .panel { transition: none; } }
  `,
})
export class TaskToolbar {
  protected store = inject(Store);
  readonly filter = model<TaskFilter>(NO_FILTER);
  readonly groupBy = model<GroupBy>('none');
  readonly showProjectGroup = input(true);
  /** What "no grouping" is called here ("Sections", "Projects"…). */
  readonly noneLabel = input('None');
  readonly open = model(false);
  protected readonly none = NO_FILTER;

  protected readonly activeCount = computed(() => {
    const f = this.filter();
    return [f.priority !== null, f.label !== null, f.categoryId !== null, f.assignee !== 'any', f.due !== 'any'].filter(Boolean).length;
  });

  protected set(patch: Partial<TaskFilter>): void {
    this.filter.update((f) => ({ ...f, ...patch }));
  }
}

export const PAGE_SIZE = 10;

/** Prev / next with page numbers, shown only when there's more than one page. */
@Component({
  selector: 'app-pager',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pages() > 1) {
      <nav class="pager" aria-label="Pages">
        <button type="button" class="ibtn" aria-label="Previous page" [disabled]="page() === 0" (click)="page.set(page() - 1)"><app-icon name="left" /></button>
        @for (p of numbers(); track p) {
          <button type="button" class="num" [attr.aria-current]="p === page() ? 'page' : null" (click)="page.set(p)">{{ p + 1 }}</button>
        }
        <button type="button" class="ibtn" aria-label="Next page" [disabled]="page() >= pages() - 1" (click)="page.set(page() + 1)"><app-icon name="right" /></button>
        <span class="muted info">{{ from() }}–{{ to() }} of {{ total() }}</span>
      </nav>
    }
  `,
  styles: `
    .pager { display: flex; align-items: center; gap: 4px; padding: 12px 0; flex-wrap: wrap; }
    .num { min-width: 30px; height: 30px; border: 0; border-radius: var(--radius-md); background: transparent; cursor: pointer; font-size: 13px; }
    .num:hover { background: var(--surface-hover); }
    .num[aria-current="page"] { background: var(--brand); color: var(--on-brand); font-weight: 700; }
    .ibtn:disabled { opacity: .35; cursor: default; }
    .info { font-size: 12px; margin-left: 8px; }
  `,
})
export class Pager {
  readonly total = input.required<number>();
  readonly page = model(0);
  protected readonly pages = computed(() => Math.ceil(this.total() / PAGE_SIZE));
  protected readonly numbers = computed(() => Array.from({ length: this.pages() }, (_, i) => i));
  protected readonly from = computed(() => this.page() * PAGE_SIZE + 1);
  protected readonly to = computed(() => Math.min(this.total(), (this.page() + 1) * PAGE_SIZE));
}
