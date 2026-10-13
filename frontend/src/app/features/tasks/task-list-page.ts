import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Observable } from 'rxjs';
import { Api } from '../../core/api';
import { dayHeading, todayIso } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Task, TaskView } from '../../core/models';
import { Store } from '../../core/store';
import { TaskEditor } from './task-editor';
import { TaskRow } from './task-row';

interface Section {
  key: string;
  name: string;
  tone?: 'overdue';
  tasks: Task[];
  /** Due date given to tasks added in this section. */
  addDate?: string | null;
}

/** Inbox, Today, Upcoming and project views: same list, different query and grouping. */
@Component({
  selector: 'app-task-list-page',
  imports: [TaskRow, TaskEditor, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="vh">
        <h1>
          @if (project(); as p) { @if (!p.inbox) { <span class="hash" [style.--pc]="'var(--proj-' + p.color + ')'">#</span> } }
          {{ heading() }}
        </h1>
        @if (loaded()) {
          <div class="count"><app-icon name="done" [small]="true" />{{ total() }} {{ total() === 1 ? 'task' : 'tasks' }}</div>
        }
      </header>

      @if (!loaded()) {
        @for (i of [1, 2, 3]; track i) { <div class="skeleton"></div> }
      } @else {
        @for (s of sections(); track s.key) {
          <section>
            @if (s.name) { <h2 class="sec" [class.overdue]="s.tone === 'overdue'">{{ s.name }}</h2> }
            @for (t of s.tasks; track t.id) {
              <app-task-row [task]="t" [showProject]="mixesProjects()" />
            }
            @if (adding() === s.key) {
              <div class="adding">
                <app-task-editor [defaultProjectId]="projectId()" [defaultDueDate]="s.addDate ?? null"
                                 (saved)="adding.set(null)" (cancelled)="adding.set(null)" />
              </div>
            } @else if (s.tone !== 'overdue') {
              <button class="add" type="button" (click)="adding.set(s.key)">
                <span class="plus"><app-icon name="plus" [small]="true" /></span>Add task
              </button>
            }
          </section>
        }
        @if (total() === 0 && adding() === null) {
          <div class="empty">
            <p class="big">{{ emptyTitle() }}</p>
            <p class="muted">{{ emptyText() }}</p>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .page { max-width: var(--content-width); margin: 0 auto; padding: 24px 32px 80px; }
    @media (max-width: 760px) { .page { padding: 8px 16px 80px; } }
    .vh { margin-bottom: 12px; }
    h1 { font-size: 26px; line-height: 34px; margin: 0; letter-spacing: -.01em; display: flex; gap: 8px; align-items: baseline; }
    .count { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-muted); margin-top: 2px; }
    section { margin-bottom: 20px; }
    .sec { font-size: 14px; font-weight: 700; margin: 0; padding: 8px 0 6px; border-bottom: 1px solid var(--border); }
    .sec.overdue { color: var(--date-overdue); }
    .add {
      display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 0; border: 0; background: transparent;
      color: var(--ink-muted); cursor: pointer; text-align: left;
    }
    .add .plus { width: 18px; height: 18px; display: grid; place-items: center; color: var(--brand); border-radius: 99px; }
    .add:hover { color: var(--brand-ink); }
    .add:hover .plus { background: var(--brand); color: var(--on-brand); }
    .adding { padding: 8px 0; }
    .empty { text-align: center; padding: 48px 16px; }
    .empty .big { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
    .empty p { margin: 0; }
    .skeleton { height: 44px; border-bottom: 1px solid var(--border); background: linear-gradient(90deg, var(--surface-sunken) 0 40%, transparent 40%) no-repeat 28px 50% / 60% 12px; }
  `,
})
export class TaskListPage {
  private api = inject(Api);
  private store = inject(Store);

  /** From the route: either a fixed view (data.view) or a project id (:id). */
  readonly view = input<TaskView | undefined>(undefined);
  readonly id = input<string | undefined>(undefined);

  protected readonly tasks = signal<Task[]>([]);
  protected readonly loaded = signal(false);
  protected readonly adding = signal<string | null>(null);

  protected readonly projectId = computed(() => {
    if (this.id()) return Number(this.id());
    return this.view() === 'inbox' ? (this.store.inbox()?.id ?? null) : null;
  });
  protected readonly project = computed(() => (this.id() ? this.store.project(Number(this.id())) : undefined));
  protected readonly mixesProjects = computed(() => this.view() === 'today' || this.view() === 'upcoming');
  protected readonly total = computed(() => this.tasks().length);

  protected readonly heading = computed(() => {
    switch (this.view()) {
      case 'inbox': return 'Inbox';
      case 'today': return 'Today';
      case 'upcoming': return 'Upcoming';
      default: return this.project()?.name ?? '';
    }
  });

  protected readonly sections = computed<Section[]>(() => {
    const tasks = this.tasks();
    const today = todayIso();
    if (this.view() === 'today') {
      const overdue = tasks.filter((t) => t.dueDate! < today);
      const due = tasks.filter((t) => t.dueDate === today);
      return [
        ...(overdue.length ? [{ key: 'overdue', name: 'Overdue', tone: 'overdue' as const, tasks: overdue }] : []),
        { key: 'today', name: dayHeading(today), tasks: due, addDate: today },
      ];
    }
    if (this.view() === 'upcoming') {
      const byDay = new Map<string, Task[]>();
      for (const t of tasks) byDay.set(t.dueDate!, [...(byDay.get(t.dueDate!) ?? []), t]);
      if (!byDay.has(today)) byDay.set(today, []);
      return [...byDay.keys()].sort().map((d) => ({ key: d, name: dayHeading(d), tasks: byDay.get(d)!, addDate: d }));
    }
    return [{ key: 'all', name: '', tasks }];
  });

  protected readonly emptyTitle = computed(() =>
    this.view() === 'today' ? 'All clear for today' : this.view() === 'inbox' ? 'Your Inbox is empty' : 'Nothing here yet');
  protected readonly emptyText = computed(() =>
    this.view() === 'today' ? 'Enjoy the rest of your day.' : 'Press Q anywhere to add a task.');

  constructor() {
    // Reload when the route changes or any task changes anywhere in the app.
    effect(() => {
      const view = this.view();
      const id = this.id();
      this.store.tasksVersion();
      untracked(() => this.load(view, id));
    });
  }

  private lastKey = '';

  private load(view: TaskView | undefined, id: string | undefined): void {
    const key = `${view}:${id}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.loaded.set(false);
      this.adding.set(null);
    }
    const req: Observable<Task[]> = id ? this.api.projectTasks(Number(id)) : this.api.viewTasks(view ?? 'today');
    req.subscribe({
      next: (ts) => {
        if (key !== this.lastKey) return;
        this.tasks.set(ts);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }
}
