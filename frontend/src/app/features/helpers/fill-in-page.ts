import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { addDays, dueChip, formatDuration, nextWeek, thisWeekend, todayIso } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Priority, Task, TaskChanges } from '../../core/models';
import { Store } from '../../core/store';
import { Auth } from '../../core/auth';

type Field = 'category' | 'priority' | 'duration' | 'date';

const FIELDS: { key: Field; label: string }[] = [
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
  { key: 'duration', label: 'Duration' },
  { key: 'date', label: 'Date' },
];

/**
 * Goes through tasks that were added quickly and are missing details (category, priority,
 * duration, date), one card at a time, with one-tap answers.
 */
@Component({
  selector: 'app-fill-in-page',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="vh">
        <div class="tile"><app-icon name="wand" /></div>
        <div class="grow">
          <h1>Fill in details</h1>
          <p class="muted sub">Tasks added in a hurry, one at a time. Tap an answer, then Save and next.</p>
        </div>
      </header>

      <div class="fields" role="group" aria-label="Ask about">
        <span class="muted">Ask about</span>
        @for (f of fields; track f.key) {
          <button type="button" class="chip" [class.on]="asking().includes(f.key)" (click)="toggleField(f.key)">{{ f.label }}</button>
        }
      </div>

      @if (!loaded()) {
        <div class="skeleton"></div>
      } @else if (current(); as t) {
        <div class="progress"><span [style.width.%]="(done() / (done() + queue().length)) * 100"></span></div>
        <p class="muted count">{{ queue().length }} left · {{ done() }} done</p>

        <section class="card" [attr.data-id]="t.id">
          <input class="title-input" [(ngModel)]="title" aria-label="Title" />
          <p class="muted where">{{ projectName(t) }}@if (t.description) { · {{ t.description }} }</p>

          @if (asks('category', t)) {
            <div class="q"><span class="ql">Category</span>
              <div class="opts">
                @for (o of store.categoryTree(); track o.category.id) {
                  <button type="button" class="opt" [class.sel]="patch().categoryId === o.category.id" (click)="set({ categoryId: o.category.id })">
                    <span class="cdot" [style.background]="'var(--proj-' + o.category.color + ')'"></span>{{ store.categoryPath(o.category.id) }}
                  </button>
                } @empty { <span class="muted small">No categories yet.</span> }
              </div>
            </div>
          }
          @if (asks('priority', t)) {
            <div class="q"><span class="ql">Priority</span>
              <div class="opts">
                @for (p of [1, 2, 3, 4]; track p) {
                  <button type="button" class="opt prio" [class]="'opt prio p' + p" [class.sel]="patch().priority === p" (click)="set({ priority: $any(p) })">
                    {{ p === 4 ? 'Not important' : 'P' + p }}</button>
                }
              </div>
            </div>
          }
          @if (asks('duration', t)) {
            <div class="q"><span class="ql">How long?</span>
              <div class="opts">
                @for (m of durations; track m) {
                  <button type="button" class="opt" [class.sel]="patch().durationMinutes === m" (click)="set({ durationMinutes: m })">{{ dur(m) }}</button>
                }
              </div>
            </div>
          }
          @if (asks('date', t)) {
            <div class="q"><span class="ql">When?</span>
              <div class="opts">
                @for (d of dates(); track d.label) {
                  <button type="button" class="opt" [class.sel]="patch().dueDate === d.date" (click)="set({ dueDate: d.date })">{{ d.label }}</button>
                }
                <input class="input date" type="date" [ngModel]="patch().dueDate ?? ''" (ngModelChange)="$event && set({ dueDate: $event })" aria-label="Pick a date" />
              </div>
            </div>
          }
          @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
          <div class="foot">
            <button type="button" class="btn ghost" (click)="store.openTaskId.set(t.id)">Open task</button>
            <span class="grow"></span>
            <button type="button" class="btn" (click)="skip()">Skip</button>
            <button type="button" class="btn primary" [disabled]="saving()" (click)="saveAndNext()">Save and next</button>
          </div>
        </section>
      } @else {
        <section class="card done">
          <div class="badge"><app-icon name="check" /></div>
          <p class="big">All caught up</p>
          <p class="muted">Every open task has the details you asked about.</p>
        </section>
      }
    </div>
  `,
  styles: `
    .page { max-width: 760px; margin: 0 auto; padding: 24px 32px 80px; }
    @media (max-width: 760px) { .page { padding: 8px 16px 80px; } }
    .vh { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
    .tile { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: var(--grad-brand); flex: none;
      box-shadow: 0 6px 14px color-mix(in srgb, var(--brand) 30%, transparent); }
    .grow { flex: 1; }
    h1 { font-size: 30px; line-height: 38px; margin: 0; font-weight: 800; letter-spacing: -.02em; }
    .sub { margin: 2px 0 0; font-size: 13px; }
    .fields { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; margin-bottom: 12px; }
    .chip { height: 30px; padding: 0 12px; border-radius: 99px; border: 0; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600;
      background: var(--surface); box-shadow: inset 0 0 0 1px var(--border); color: var(--ink-muted); }
    .chip.on { background: var(--brand-tint); color: var(--brand-ink); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand) 35%, transparent); }
    .progress { height: 6px; border-radius: 99px; background: var(--surface-sunken); overflow: hidden; }
    .progress span { display: block; height: 100%; background: var(--grad-brand); transition: width .3s ease; }
    .count { font-size: 12px; margin: 6px 0 10px; }
    .card { background: var(--surface); border-radius: 20px; padding: 20px; box-shadow: var(--shadow-md), inset 0 0 0 1px var(--border);
      animation: pop-in .28s cubic-bezier(.2, .9, .3, 1.15) both; }
    .title-input { width: 100%; border: 0; background: transparent; font: inherit; font-size: 22px; font-weight: 800; color: var(--ink); padding: 2px 0; }
    .title-input:focus { outline: none; border-bottom: 2px solid var(--brand); }
    .where { font-size: 13px; margin: 2px 0 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .q { padding: 10px 0; border-top: 1px solid var(--border); }
    .ql { display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-subtle); margin-bottom: 8px; }
    .opts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .opt { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 10px; border: 0; cursor: pointer;
      font: inherit; font-size: 13px; background: var(--surface-sunken); color: var(--ink); transition: transform .12s, background .12s; }
    .opt:hover { transform: translateY(-1px); }
    .opt.sel { background: var(--grad-brand); color: #fff; }
    .opt.prio.p1:not(.sel) { color: var(--priority-1); } .opt.prio.p2:not(.sel) { color: var(--priority-2); } .opt.prio.p3:not(.sel) { color: var(--priority-3); }
    .cdot { width: 9px; height: 9px; border-radius: 3px; }
    .opt.sel .cdot { box-shadow: 0 0 0 2px #fff; }
    .date { width: auto; height: 34px; }
    .small { font-size: 12px; }
    .foot { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    .err { margin: 8px 0 0; }
    .done { text-align: center; padding: 40px 20px; }
    .badge { width: 56px; height: 56px; margin: 0 auto 10px; border-radius: 18px; display: grid; place-items: center; color: #fff; background: var(--grad-brand);
      animation: bob 2.4s ease-in-out infinite; }
    .big { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
    .skeleton { height: 240px; border-radius: 20px; background: var(--surface-sunken); }
  `,
})
export class FillInPage {
  private api = inject(Api);
  private auth = inject(Auth);
  protected store = inject(Store);
  protected readonly fields = FIELDS;
  protected readonly durations = [5, 15, 30, 60, 90, 120, 240];

  protected readonly asking = signal<Field[]>(['category', 'priority', 'duration', 'date']);
  private readonly openTasks = signal<Task[]>([]);
  protected readonly loaded = signal(false);
  /** Skipped or saved in this session. */
  private readonly handled = signal(new Set<number>());
  protected readonly done = signal(0);
  protected readonly patch = signal<TaskChanges>({});
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected title = '';

  /** Tasks missing at least one asked-about detail, newest first (quick adds are usually recent). */
  protected readonly queue = computed(() => this.openTasks()
    .filter((t) => !t.parentId && !this.handled().has(t.id) && this.store.project(t.projectId)?.role !== 'GUEST')
    .filter((t) => this.asking().some((f) => this.missing(f, t)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

  protected readonly current = computed(() => this.queue()[0] ?? null);

  protected readonly dates = computed(() => {
    const t = todayIso();
    return [
      { label: 'Today', date: t },
      { label: 'Tomorrow', date: addDays(t, 1) },
      { label: 'This weekend', date: thisWeekend() },
      { label: 'Next week', date: nextWeek(this.auth.user()?.weekStart ?? 1) },
    ];
  });

  constructor() {
    this.api.treeTasks().subscribe((ts) => {
      this.openTasks.set(ts);
      this.loaded.set(true);
      this.reset();
    });
  }

  protected missing(f: Field, t: Task): boolean {
    switch (f) {
      case 'category': return !t.category;
      case 'priority': return t.priority === 4 && t.importance === null;
      case 'duration': return !t.durationMinutes;
      case 'date': return !t.dueDate && !t.recurrence;
    }
  }

  protected asks(f: Field, t: Task): boolean {
    return this.asking().includes(f) && this.missing(f, t);
  }

  protected toggleField(f: Field): void {
    this.asking.update((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]));
    this.reset();
  }

  protected set(p: TaskChanges): void {
    this.patch.update((x) => ({ ...x, ...p }));
  }

  protected skip(): void {
    const t = this.current();
    if (t) this.handled.update((s) => new Set(s).add(t.id));
    this.reset();
  }

  protected saveAndNext(): void {
    const t = this.current();
    if (!t) return;
    const changes: TaskChanges = { ...this.patch() };
    if (this.title.trim() && this.title.trim() !== t.title) changes.title = this.title.trim();
    if (!Object.keys(changes).length) return this.skip();
    this.saving.set(true);
    this.error.set('');
    this.api.updateTask(t.id, changes).subscribe({
      next: () => {
        this.saving.set(false);
        this.done.update((n) => n + 1);
        this.handled.update((s) => new Set(s).add(t.id));
        this.store.tasksChanged();
        this.reset();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  private reset(): void {
    this.patch.set({});
    this.error.set('');
    this.title = this.current()?.title ?? '';
  }

  protected projectName(t: Task): string {
    const p = this.store.project(t.projectId);
    return p ? (p.inbox ? 'Inbox' : p.name) : '';
  }

  protected dur(m: number): string {
    return formatDuration(m);
  }

  protected chip(t: Task) {
    return t.dueDate ? dueChip(t.dueDate, t.dueTime) : null;
  }

  protected priorityName(p: Priority): string {
    return p === 4 ? 'No priority' : 'P' + p;
  }
}
