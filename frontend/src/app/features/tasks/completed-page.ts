import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { dayHeading, formatTime, toIso } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Task } from '../../core/models';
import { Store } from '../../core/store';
import { TaskActions } from '../../core/task-actions';

/** History of completed tasks, grouped by the day they were completed, with Uncomplete. */
@Component({
  selector: 'app-completed-page',
  imports: [Icon, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="vh">
        <h1>Completed</h1>
        <select class="input filter" [ngModel]="projectId()" (ngModelChange)="projectId.set($event)" aria-label="Project">
          <option [ngValue]="null">All projects</option>
          @for (p of store.projects(); track p.id) { <option [ngValue]="p.id">{{ p.inbox ? 'Inbox' : p.name }}</option> }
        </select>
      </header>

      @if (!loaded()) {
        @for (i of [1, 2, 3]; track i) { <div class="skeleton"></div> }
      } @else {
        @for (g of groups(); track g.day) {
          <section>
            <h2 class="sec">{{ g.heading }}</h2>
            @for (t of g.tasks; track t.id) {
              <div class="row">
                <button type="button" class="check" [class]="'check p' + t.priority" role="checkbox" aria-checked="true"
                        [attr.aria-label]="'Uncomplete ' + t.title" title="Uncomplete" (click)="actions.toggleComplete(t)">
                  <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </button>
                <div class="body" (click)="store.openTaskId.set(t.id)">
                  <div class="title">{{ t.title }}</div>
                  <div class="meta">
                    <span>{{ time(t) }}</span>
                    @if (t.assignee; as a) { <span>· {{ a.name }}</span> }
                    @if (store.project(t.projectId); as p) {
                      <span class="where">{{ p.inbox ? 'Inbox' : p.name }}<span class="hash" [style.--pc]="'var(--proj-' + p.color + ')'">#</span></span>
                    }
                  </div>
                </div>
              </div>
            }
          </section>
        } @empty {
          <div class="empty">
            <app-icon name="done" />
            <p class="big">Nothing completed yet</p>
            <p class="muted">Tasks you check off show up here, so you can see what you’ve done.</p>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .page { max-width: var(--content-width); margin: 0 auto; padding: 24px 32px 80px; }
    @media (max-width: 760px) { .page { padding: 8px 16px 80px; } }
    .vh { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    h1 { font-size: 30px; line-height: 38px; margin: 0; font-weight: 800; letter-spacing: -.02em; }
    .filter { width: auto; max-width: 220px; height: 32px; font-size: 13px; }
    section { margin-bottom: 20px; }
    .sec { font-size: 14px; font-weight: 700; margin: 0; padding: 8px 0 6px; border-bottom: 1px solid var(--border); }
    .row { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .check { --ring: var(--priority-4); width: 18px; height: 18px; margin-top: 2px; flex: none; padding: 0; border-radius: 99px;
      border: 1.5px solid var(--ring); background: var(--ring); display: grid; place-items: center; cursor: pointer; }
    .check.p1 { --ring: var(--priority-1); } .check.p2 { --ring: var(--priority-2); } .check.p3 { --ring: var(--priority-3); }
    .check svg { width: 12px; height: 12px; fill: none; stroke: var(--surface); stroke-width: 2.6; stroke-linecap: round; }
    .check:hover { background: transparent; }
    .check:hover svg { stroke: var(--ring); }
    .body { flex: 1; min-width: 0; cursor: pointer; }
    .title { text-decoration: line-through; color: var(--ink-muted); overflow-wrap: anywhere; }
    .meta { display: flex; gap: 6px; font-size: 12px; color: var(--ink-subtle); }
    .where { margin-left: auto; display: inline-flex; gap: 4px; }
    .empty { text-align: center; padding: 48px 16px; color: var(--ink-muted); }
    .empty .big { font-size: 16px; font-weight: 600; margin: 8px 0 4px; color: var(--ink); }
    .empty p { margin: 0; }
    .skeleton { height: 44px; border-bottom: 1px solid var(--border); background: linear-gradient(90deg, var(--surface-sunken) 0 40%, transparent 40%) no-repeat 28px 50% / 60% 12px; }
  `,
})
export class CompletedPage {
  private api = inject(Api);
  private auth = inject(Auth);
  protected store = inject(Store);
  protected actions = inject(TaskActions);

  protected readonly projectId = signal<number | null>(null);
  protected readonly tasks = signal<Task[]>([]);
  protected readonly loaded = signal(false);

  protected readonly groups = computed(() => {
    const byDay = new Map<string, Task[]>();
    for (const t of this.tasks()) {
      const day = toIso(new Date(t.completedAt!));
      byDay.set(day, [...(byDay.get(day) ?? []), t]);
    }
    return [...byDay.entries()].map(([day, tasks]) => ({ day, heading: dayHeading(day), tasks }));
  });

  constructor() {
    effect(() => {
      const pid = this.projectId();
      this.store.tasksVersion();
      untracked(() => this.api.completedTasks(pid ?? undefined).subscribe((ts) => {
        this.tasks.set(ts);
        this.loaded.set(true);
      }));
    });
  }

  protected time(t: Task): string {
    const d = new Date(t.completedAt!);
    return formatTime(`${d.getHours()}:${d.getMinutes()}`, this.auth.user()?.timeFormat ?? '24h');
  }
}
