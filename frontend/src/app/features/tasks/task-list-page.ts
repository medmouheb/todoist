import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, input, signal, untracked,
  viewChild, viewChildren,
} from '@angular/core';
import { Observable } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { addDays, dayHeading, fromIso, startOfWeek, todayIso } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Priority, Task } from '../../core/models';
import { ProjectActions } from '../../core/project-actions';
import { Store } from '../../core/store';
import { TaskActions } from '../../core/task-actions';
import { DatePicker } from '../../shared/date-picker';
import { avatarColor } from '../../shared/dropdown';
import { ProjectMenu } from '../shell/project-menu';
import {
  GroupBy, NO_FILTER, PAGE_SIZE, Pager, TaskFilter, TaskToolbar, applyFilter, groupTasks, isFiltering,
} from './task-filter';
import { TaskEditor } from './task-editor';
import { TaskRow } from './task-row';

type View = 'inbox' | 'today' | 'upcoming' | 'category';

interface Section {
  key: string;
  name: string;
  tone?: 'overdue';
  color?: string | null;
  tasks: Task[];
  /** Due date for tasks added here, and where dropped tasks go. Undefined: no date target. */
  date?: string | null;
  /** Groups (from "Group by") can be folded. */
  collapsible?: boolean;
}

/**
 * Inbox, Today, Upcoming, category and project views: the same list with a different query.
 * Search, filters and grouping apply to all of them; once more than 10 tasks match, they're paged.
 * Inbox and projects keep a manual order that people change by dragging.
 */
@Component({
  selector: 'app-task-list-page',
  imports: [TaskRow, TaskEditor, Icon, DatePicker, ProjectMenu, TaskToolbar, Pager, CdkDropList, CdkDrag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-list-page.html',
  styleUrl: './task-list-page.css',
})
export class TaskListPage {
  private api = inject(Api);
  private auth = inject(Auth);
  protected store = inject(Store);
  protected actions = inject(TaskActions);
  protected projectActions = inject(ProjectActions);

  /** From the route: a fixed view (data.view) and/or an id (:id, a project or a category). */
  readonly view = input<View | undefined>(undefined);
  readonly id = input<string | undefined>(undefined);

  protected readonly tasks = signal<Task[]>([]);
  protected readonly loaded = signal(false);
  protected readonly adding = signal<string | null>(null);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly rescheduling = signal(false);
  protected readonly dropTarget = signal<string | null>(null);
  protected readonly filter = signal<TaskFilter>(NO_FILTER);
  protected readonly groupBy = signal<GroupBy>('none');
  protected readonly filtersOpen = signal(false);
  protected readonly page = signal(0);
  protected readonly collapsed = signal<Set<string>>(new Set());
  /** First day of the week shown in Upcoming. */
  protected readonly weekStartDay = signal(startOfWeek(todayIso(), this.auth.user()?.weekStart ?? 1));
  private rows = viewChildren(TaskRow);
  private rescheduleBtn = viewChild<ElementRef<HTMLElement>>('rescheduleBtn');

  protected readonly categoryId = computed(() => (this.view() === 'category' && this.id() ? Number(this.id()) : null));
  protected readonly category = computed(() => (this.categoryId() ? this.store.category(this.categoryId()!) : undefined));
  protected readonly projectId = computed(() => {
    if (this.id() && !this.view()) return Number(this.id());
    return this.view() === 'inbox' ? (this.store.inbox()?.id ?? null) : null;
  });
  protected readonly project = computed(() => {
    const id = this.projectId();
    return id ? this.store.project(id) : undefined;
  });
  protected readonly canAdd = computed(() => {
    const p = this.project();
    return !p || (p.role !== 'GUEST' && !p.archived);
  });
  protected readonly mixesProjects = computed(() => !this.project());
  protected readonly isDateView = computed(() => this.view() === 'today' || this.view() === 'upcoming');

  protected readonly filtered = computed(() => applyFilter(this.tasks(), this.filter(), this.auth.user()?.id));
  protected readonly filtering = computed(() => isFiltering(this.filter()));
  /** Drag to reorder: in lists with a manual order, when nothing hides or regroups tasks. */
  protected readonly manualOrder = computed(() =>
    !!this.project() && this.canAdd() && !this.filtering() && this.groupBy() === 'none');
  /** Upcoming is already limited to one week; other views page once more than 10 tasks match. */
  protected readonly paged = computed(() => this.view() !== 'upcoming' && this.filtered().length > PAGE_SIZE);
  protected readonly visible = computed(() => {
    const list = this.filtered();
    if (!this.paged()) return list;
    const start = Math.min(this.page(), Math.ceil(list.length / PAGE_SIZE) - 1) * PAGE_SIZE;
    return list.slice(Math.max(0, start), Math.max(0, start) + PAGE_SIZE);
  });
  protected readonly total = computed(() => this.tasks().length);
  protected readonly overdue = computed(() => this.tasks().filter((t) => t.dueDate && t.dueDate < todayIso()));
  protected readonly members = signal<{ userId: number; initials: string; name: string }[]>([]);

  protected readonly heading = computed(() => {
    switch (this.view()) {
      case 'inbox': return 'Inbox';
      case 'today': return 'Today';
      case 'upcoming': return 'Upcoming';
      case 'category': return this.category()?.name ?? 'Category';
      default: return this.project()?.name ?? '';
    }
  });

  /** The 7 days of the Upcoming strip. */
  protected readonly week = computed(() => {
    const today = todayIso();
    const counts = new Map<string, number>();
    for (const t of this.filtered()) if (t.dueDate) counts.set(t.dueDate, (counts.get(t.dueDate) ?? 0) + 1);
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(this.weekStartDay(), i);
      const d = fromIso(iso);
      return {
        iso, day: d.getDate(), past: iso < today, today: iso === today, count: counts.get(iso) ?? 0,
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      };
    });
  });
  protected readonly weekLabel = computed(() =>
    fromIso(this.weekStartDay()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  protected readonly isCurrentWeek = computed(() =>
    this.weekStartDay() === startOfWeek(todayIso(), this.auth.user()?.weekStart ?? 1));

  protected readonly sections = computed<Section[]>(() => {
    const tasks = this.visible();
    const today = todayIso();
    if (this.groupBy() !== 'none') {
      return groupTasks(tasks, this.groupBy(), (id) => this.store.project(id)).map((g) => ({
        key: 'g-' + g.key, name: g.name || 'Tasks', color: g.color, tasks: g.tasks, collapsible: true,
        date: this.groupBy() === 'due' && g.key !== '~' ? g.key : undefined,
      }));
    }
    if (this.view() === 'today') {
      const overdue = tasks.filter((t) => t.dueDate! < today);
      const due = tasks.filter((t) => t.dueDate === today);
      return [
        ...(overdue.length ? [{ key: 'overdue', name: 'Overdue', tone: 'overdue' as const, tasks: overdue }] : []),
        { key: 'today', name: dayHeading(today), tasks: due, date: today },
      ];
    }
    if (this.view() === 'upcoming') {
      const out: Section[] = [];
      const overdue = tasks.filter((t) => t.dueDate! < today);
      if (this.isCurrentWeek() && overdue.length) out.push({ key: 'overdue', name: 'Overdue', tone: 'overdue', tasks: overdue });
      for (const d of this.week()) {
        if (d.past) continue;
        out.push({ key: d.iso, name: dayHeading(d.iso), tasks: tasks.filter((t) => t.dueDate === d.iso), date: d.iso });
      }
      return out;
    }
    return [{ key: 'all', name: '', tasks }];
  });

  /** Every visible task, in screen order, for keyboard navigation. */
  private readonly flat = computed(() =>
    this.sections().filter((s) => !this.collapsed().has(s.key)).flatMap((s) => s.tasks));

  protected readonly emptyTitle = computed(() => {
    if (this.filtering()) return 'No tasks match';
    if (this.view() === 'today') return 'All clear for today';
    if (this.view() === 'inbox') return 'Your Inbox is empty';
    if (this.view() === 'category') return 'Nothing in this category';
    return 'Nothing here yet';
  });
  protected readonly emptyText = computed(() => {
    if (this.filtering()) return 'Try another search or clear the filters.';
    if (this.view() === 'today') return 'Enjoy the rest of your day.';
    if (this.view() === 'category') return 'Give a task this category from its Category button.';
    return 'Press Q anywhere to add a task.';
  });

  constructor() {
    // Reload when the route changes or any task changes anywhere (including live changes by others).
    effect(() => {
      const view = this.view();
      const id = this.id();
      this.store.tasksVersion();
      untracked(() => this.load(view, id));
    });
    // A new search, filter or grouping starts again at page 1.
    effect(() => {
      this.filter();
      this.groupBy();
      untracked(() => this.page.set(0));
    });
    // People in a shared project, for the header.
    effect(() => {
      const p = this.project();
      if (!p || p.memberCount < 2) return this.members.set([]);
      untracked(() => this.store.members(p.id).subscribe((ms) => this.members.set(ms)));
    });
  }

  private lastKey = '';

  private load(view: View | undefined, id: string | undefined): void {
    const key = `${view}:${id}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.loaded.set(false);
      this.adding.set(null);
      this.selectedId.set(null);
      this.filter.set(NO_FILTER);
      this.groupBy.set('none');
      this.collapsed.set(new Set());
    }
    let req: Observable<Task[]>;
    if (view === 'category') req = this.api.categoryTasks(Number(id));
    else if (id) req = this.api.projectTasks(Number(id));
    else req = this.api.viewTasks(view === 'inbox' || view === 'upcoming' ? view : 'today');
    req.subscribe({
      next: (ts) => {
        if (key !== this.lastKey) return;
        this.tasks.set(ts);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  protected color = avatarColor;

  protected toggleSection(key: string): void {
    this.collapsed.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected shiftWeek(n: number): void {
    if (n === 0) this.weekStartDay.set(startOfWeek(todayIso(), this.auth.user()?.weekStart ?? 1));
    else this.weekStartDay.update((d) => addDays(d, 7 * n));
  }

  protected jumpTo(iso: string): void {
    document.getElementById('day-' + iso)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected rescheduleAnchor(): HTMLElement | null {
    return this.rescheduleBtn()?.nativeElement ?? null;
  }

  protected rescheduleOverdue(date: string | null): void {
    this.rescheduling.set(false);
    this.actions.moveToDate(this.overdue(), date);
  }

  // ---- drag to reorder (manual-order lists) ----

  protected reorder(e: CdkDragDrop<Task[]>): void {
    if (e.previousIndex === e.currentIndex) return;
    const page = [...this.visible()];
    moveItemInArray(page, e.previousIndex, e.currentIndex);
    // Put the reordered page back into the full list, then save the whole order.
    const all = [...this.tasks()];
    const start = all.findIndex((t) => t.id === this.visible()[0].id);
    all.splice(start, page.length, ...page);
    this.tasks.set(all);
    this.api.reorderTasks(all.map((t) => t.id)).subscribe({
      error: (err) => {
        this.store.toast(errorMessage(err));
        this.store.tasksChanged();
      },
    });
  }

  // ---- drag onto a day (date views) ----

  protected onDragOver(e: DragEvent, key: string, date: string | null | undefined): void {
    if (date === undefined || !e.dataTransfer?.types.includes('application/x-doable-task')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.dropTarget.set(key);
  }

  protected onDrop(e: DragEvent, date: string | null | undefined): void {
    this.dropTarget.set(null);
    if (date === undefined) return;
    const id = Number(e.dataTransfer?.getData('application/x-doable-task'));
    const t = this.tasks().find((x) => x.id === id);
    if (!t || t.dueDate === date) return;
    e.preventDefault();
    this.actions.moveToDate([t], date);
  }

  // ---- keyboard ----

  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select, [contenteditable], .menu, [role="dialog"]')) return;
    if (this.store.openTaskId() || this.store.quickAdd() || this.store.confirmRequest() || this.store.shareProjectId()
      || this.store.settingsOpen() || this.store.shortcutsOpen() || this.store.editingProject() || this.store.editingCategory()) return;
    if (e.key === '/') {
      e.preventDefault();
      (document.querySelector('app-task-toolbar input[type="search"]') as HTMLInputElement | null)?.focus();
      return;
    }
    const list = this.flat();
    const i = list.findIndex((t) => t.id === this.selectedId());
    const selected = i >= 0 ? list[i] : null;
    const row = selected ? this.rows().find((r) => r.task().id === selected.id) : null;
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'ArrowDown' || (e.key === 'j' && !mod)) return this.select(list[Math.min(i + 1, list.length - 1)], e);
    if (e.key === 'ArrowUp' || (e.key === 'k' && !mod)) return this.select(list[Math.max(i - 1, 0)], e);
    if (e.key === 'Escape') return this.selectedId.set(null);
    if (!selected) return;
    if (e.key === 'Enter' && mod) return this.run(e, () => this.actions.toggleComplete(selected));
    if (e.key === 'Enter') return this.run(e, () => this.store.openTaskId.set(selected.id));
    if (e.key === 'e' && !mod) return this.run(e, () => row?.edit());
    if (e.key === 't' && !mod) return this.run(e, () => row?.pickDate());
    if (['1', '2', '3', '4'].includes(e.key) && !mod) {
      return this.run(e, () => this.actions.setPriority(selected, Number(e.key) as Priority));
    }
    if (e.key === 'Delete' || e.key === 'Backspace') return this.run(e, () => this.actions.remove(selected));
  }

  private select(t: Task | undefined, e: KeyboardEvent): void {
    if (!t) return;
    e.preventDefault();
    this.selectedId.set(t.id);
    queueMicrotask(() => document.querySelector('app-task-row.selected')?.scrollIntoView({ block: 'nearest' }));
  }

  private run(e: KeyboardEvent, fn: () => void): void {
    e.preventDefault();
    fn();
  }
}
