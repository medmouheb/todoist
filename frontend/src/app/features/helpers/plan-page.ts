import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { dayHeading, formatDuration } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Task } from '../../core/models';
import { PlanOptions, QUADRANTS, Quadrant, buildPlan, importanceOf, quadrantOf, urgencyOf } from '../../core/planning';
import { Store, indent } from '../../core/store';

/**
 * Planning helper: importance (from the comparison matrix, or the priority) and urgency (from the
 * date and deadline) place every open task in a quadrant, then a plan fills the next days with
 * the most important work, keeping deadlines and skipping tasks that wait for another one.
 */
@Component({
  selector: 'app-plan-page',
  imports: [FormsModule, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="vh">
        <div class="tile"><app-icon name="plan" /></div>
        <div class="grow">
          <h1>Plan</h1>
          <p class="muted sub">Importance comes from <a routerLink="/prioritize">Prioritize</a> (or the priority), urgency from the date and deadline.</p>
        </div>
        <label class="field">Tasks from
          <select class="input" [ngModel]="scope()" (ngModelChange)="scope.set($event)">
            <option value="all">All my open tasks</option>
            <optgroup label="Project">
              @for (p of store.writableProjects(); track p.id) { <option [value]="'p' + p.id">{{ p.inbox ? 'Inbox' : p.name }}</option> }
            </optgroup>
            <optgroup label="Category">
              @for (o of store.categoryTree(); track o.category.id) { <option [value]="'c' + o.category.id">{{ indent(o.depth) }}{{ o.category.name }}</option> }
            </optgroup>
          </select>
        </label>
      </header>

      <h2 class="h2">Where things stand</h2>
      <div class="quads">
        @for (q of quads; track q.key) {
          <section class="quad" [class]="'quad ' + q.key">
            <header><b>{{ q.title }}</b><span class="muted">{{ q.hint }}</span><span class="n">{{ byQuadrant().get(q.key)?.length ?? 0 }}</span></header>
            <ul>
              @for (t of byQuadrant().get(q.key) ?? []; track t.id) {
                <li><button type="button" class="qt" (click)="store.openTaskId.set(t.id)" [title]="'Importance ' + imp(t) + ' · urgency ' + urg(t)">
                  <span class="qtitle">{{ t.title }}</span><span class="dots"><i [style.width.%]="imp(t)"></i></span></button></li>
              } @empty { <li class="muted none">Nothing here</li> }
            </ul>
          </section>
        }
      </div>

      <h2 class="h2">Your plan</h2>
      <section class="card opts">
        <label class="field">Days<select class="input" [(ngModel)]="days" (ngModelChange)="refresh()">
          @for (d of [3, 5, 7, 10, 14]; track d) { <option [ngValue]="d">{{ d }} days</option> }</select></label>
        <label class="field">Time each day<select class="input" [(ngModel)]="hours" (ngModelChange)="refresh()">
          @for (h of [1, 2, 3, 4, 5, 6, 8]; track h) { <option [ngValue]="h">{{ h }} h</option> }</select></label>
        <label class="field">Tasks without a duration<select class="input" [(ngModel)]="defaultMinutes" (ngModelChange)="refresh()">
          @for (m of [15, 30, 45, 60]; track m) { <option [ngValue]="m">count as {{ m }} min</option> }</select></label>
        <label class="check"><input type="checkbox" [(ngModel)]="skipWeekends" (ngModelChange)="refresh()" />Keep weekends free</label>
      </section>

      <div class="days">
        @for (d of plan().days; track d.date; let i = $index) {
          <section class="day" [style.--i]="i">
            <header><b>{{ heading(d.date) }}</b><span class="muted">{{ dur(d.minutes) }} of {{ hours }} h</span></header>
            <div class="load"><span [style.width.%]="(d.minutes / (hours * 60)) * 100"></span></div>
            <ul>
              @for (p of d.items; track p.task.id) {
                <li [class.late]="p.late || p.pastDeadline">
                  <button type="button" class="pt" (click)="store.openTaskId.set(p.task.id)">
                    <span class="score" [title]="'Score ' + p.score">{{ p.score }}</span>
                    <span class="ptitle">{{ p.task.title }}</span>
                    <span class="muted min">{{ dur(p.minutes) }}</span>
                  </button>
                  @if (p.pastDeadline) { <span class="warn">Deadline already passed</span> }
                  @else if (p.late) { <span class="warn">After its deadline: no room before it</span> }
                  @if (timeHint(p.task); as h) { <span class="hint">{{ h }}</span> }
                </li>
              } @empty { <li class="muted none">Free</li> }
            </ul>
          </section>
        }
      </div>

      @if (plan().overflow.length || plan().waiting.length) {
        <div class="side-lists">
          @if (plan().overflow.length) {
            <section class="card"><b>Didn’t fit ({{ plan().overflow.length }})</b>
              <p class="muted small">Add days or time, or drop some of these.</p>
              <ul class="plain">@for (p of plan().overflow; track p.task.id) { <li>{{ p.task.title }} <span class="muted">· {{ dur(p.minutes) }}</span></li> }</ul>
            </section>
          }
          @if (plan().waiting.length) {
            <section class="card"><b>Waiting for another task ({{ plan().waiting.length }})</b>
              <ul class="plain">@for (t of plan().waiting; track t.id) { <li>{{ t.title }} <span class="muted">· {{ waitingFor(t) }}</span></li> }</ul>
            </section>
          }
        </div>
      }

      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
      <div class="foot">
        <span class="muted">{{ changes().length }} tasks would get a new date.</span>
        <button type="button" class="btn primary" [disabled]="!changes().length || saving()" (click)="apply()">Apply the plan</button>
      </div>
    </div>
  `,
  styles: `
    .page { max-width: 1100px; margin: 0 auto; padding: 24px 32px 80px; }
    @media (max-width: 760px) { .page { padding: 8px 16px 80px; } }
    .vh { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; flex-wrap: wrap; }
    .tile { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: var(--grad-brand); flex: none;
      box-shadow: 0 6px 14px color-mix(in srgb, var(--brand) 30%, transparent); }
    .grow { flex: 1; min-width: 220px; }
    h1 { font-size: 30px; line-height: 38px; margin: 0; font-weight: 800; letter-spacing: -.02em; }
    .sub { margin: 2px 0 0; font-size: 13px; }
    .sub a { color: var(--brand-ink); font-weight: 600; }
    .h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-subtle); margin: 18px 0 8px; }
    .field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-muted); }
    .quads { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 700px) { .quads { grid-template-columns: 1fr; } }
    .quad { border-radius: 16px; padding: 12px; background: var(--surface); box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border); min-height: 120px; }
    .quad header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
    .quad header .muted { font-size: 12px; flex: 1; }
    .quad.do { background: color-mix(in srgb, var(--date-overdue) 7%, var(--surface)); }
    .quad.schedule { background: color-mix(in srgb, var(--brand) 8%, var(--surface)); }
    .quad.quick { background: color-mix(in srgb, #e8a33d 10%, var(--surface)); }
    .n { font-size: 12px; font-weight: 800; background: var(--surface); border-radius: 99px; padding: 0 8px; line-height: 20px; }
    ul { list-style: none; margin: 0; padding: 0; }
    .quad ul { max-height: 210px; overflow-y: auto; }
    .qt, .pt { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; padding: 6px 4px; border-radius: 8px; cursor: pointer;
      font: inherit; font-size: 13px; color: var(--ink); text-align: left; }
    .qt:hover, .pt:hover { background: var(--surface-hover); }
    .qtitle, .ptitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dots { width: 48px; height: 5px; border-radius: 99px; background: var(--surface-sunken); overflow: hidden; flex: none; }
    .dots i { display: block; height: 100%; background: var(--grad-brand); }
    .none { font-size: 12px; padding: 4px; }
    .card { background: var(--surface); border-radius: 16px; padding: 14px; box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border); }
    .opts { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
    .check { display: flex; align-items: center; gap: 6px; font-size: 13px; height: 38px; }
    .days { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; }
    .day { background: var(--surface); border-radius: 16px; padding: 12px; box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border);
      animation: pop-in .3s ease backwards; animation-delay: calc(var(--i) * 50ms); }
    .day header { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
    .day header .muted { font-size: 12px; }
    .load { height: 5px; border-radius: 99px; background: var(--surface-sunken); overflow: hidden; margin: 6px 0 8px; }
    .load span { display: block; height: 100%; background: var(--grad-brand); transition: width .3s; }
    .score { font-size: 11px; font-weight: 800; min-width: 26px; text-align: center; border-radius: 6px; background: var(--brand-tint); color: var(--brand-ink); padding: 1px 0; }
    .min { font-size: 12px; }
    li.late .score { background: color-mix(in srgb, var(--date-overdue) 15%, transparent); color: var(--date-overdue); }
    .warn { display: block; font-size: 11px; color: var(--date-overdue); padding: 0 4px 4px 38px; }
    .hint { display: block; font-size: 11px; color: var(--ink-subtle); padding: 0 4px 4px 38px; }
    .side-lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin-top: 10px; }
    .small { font-size: 12px; margin: 2px 0 6px; }
    .plain li { font-size: 13px; padding: 3px 0; }
    .foot { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
    .err { margin: 10px 0 0; }
  `,
})
export class PlanPage {
  private api = inject(Api);
  protected store = inject(Store);
  protected readonly indent = indent;
  protected readonly quads = QUADRANTS;

  protected readonly scope = signal('all');
  private readonly openTasks = signal<Task[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected days = 5;
  protected hours = 4;
  protected defaultMinutes = 30;
  protected skipWeekends = true;
  private readonly options = signal<PlanOptions>(this.opts());

  /** Open top-level tasks in scope. */
  private readonly pool = computed(() => {
    const s = this.scope();
    const tops = this.openTasks().filter((t) => !t.parentId);
    if (s.startsWith('p')) return tops.filter((t) => t.projectId === +s.slice(1));
    if (s.startsWith('c')) {
      const ids = this.store.categoryAndDescendants(+s.slice(1));
      return tops.filter((t) => t.category && ids.has(t.category.id));
    }
    return tops;
  });

  protected readonly byQuadrant = computed(() => {
    const m = new Map<Quadrant, Task[]>();
    for (const t of this.pool()) m.set(quadrantOf(t), [...(m.get(quadrantOf(t)) ?? []), t]);
    for (const list of m.values()) list.sort((a, b) => importanceOf(b) + urgencyOf(b) - importanceOf(a) - urgencyOf(a));
    return m;
  });

  protected readonly plan = computed(() => buildPlan(this.pool(), this.options()));

  /** Planned tasks whose date would change. */
  protected readonly changes = computed(() => this.plan().days.flatMap((d) =>
    d.items.filter((p) => p.task.dueDate !== d.date).map((p) => ({ task: p.task, date: d.date }))));

  constructor() {
    effect(() => {
      this.store.tasksVersion();
      untracked(() => this.api.treeTasks().subscribe((ts) => this.openTasks.set(ts)));
    });
  }

  protected refresh(): void {
    this.options.set(this.opts());
  }

  private opts(): PlanOptions {
    return { days: this.days, minutesPerDay: this.hours * 60, defaultMinutes: this.defaultMinutes, skipWeekends: this.skipWeekends };
  }

  protected imp = importanceOf;
  protected urg = (t: Task) => urgencyOf(t);
  protected heading = dayHeading;
  protected dur = (m: number) => (m ? formatDuration(m) : '0m');

  protected timeHint(t: Task): string | null {
    const c = t.conditions.find((x) => x.type === 'TIME');
    const place = t.conditions.find((x) => x.type === 'PLACE');
    const parts = [c ? c.label : null, place ? place.label : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }

  protected waitingFor(t: Task): string {
    return t.conditions.filter((c) => !c.met).map((c) => c.label).join(', ');
  }

  /** Sets each planned task's date to its day in the plan (time and repeat stay as they are). */
  protected async apply(): Promise<void> {
    const list = this.changes();
    const ok = await this.store.confirm({
      title: 'Apply the plan?',
      message: `${list.length} tasks will move to the day the plan gives them. You can undo each one from its history.`,
      confirmLabel: 'Apply',
    });
    if (!ok) return;
    this.saving.set(true);
    forkJoin(list.map((c) => this.api.updateTask(c.task.id, { dueDate: c.date }))).subscribe({
      next: () => {
        this.saving.set(false);
        this.store.tasksChanged();
        this.store.toast(`Plan applied to ${list.length} tasks`);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
