import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { dayHeading, timeAgo, toIso } from '../../core/dates';
import { Icon } from '../../core/icon';
import { HistoryEntry } from '../../core/models';
import { Store } from '../../core/store';
import { avatarColor } from '../../shared/dropdown';
import { HISTORY_VERBS, formatValue } from './task-detail';

/**
 * Every change in your projects (or one project), newest first, a page at a time.
 * Deleted tasks can be brought back from here for a week.
 */
@Component({
  selector: 'app-history-page',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="vh">
        <h1>History</h1>
        <select class="input filter" [ngModel]="projectId()" (ngModelChange)="pick($event)" aria-label="Project">
          <option [ngValue]="null">All projects</option>
          @for (p of store.projects(); track p.id) { <option [ngValue]="p.id">{{ p.inbox ? 'Inbox' : p.name }}</option> }
        </select>
      </header>
      <p class="muted intro">Every change, by anyone, in your projects. Quick edits in a row are combined into one entry.</p>

      @if (!loaded()) {
        @for (i of [1, 2, 3]; track i) { <div class="skeleton"></div> }
      } @else {
        @for (g of days(); track g.day) {
          <section>
            <h2 class="sec">{{ g.heading }}</h2>
            @for (h of g.items; track h.id) {
              <div class="entry">
                <span class="av" [style.--ac]="color(h.actorId)">{{ h.actorInitials }}</span>
                <div class="body">
                  <div class="line">
                    <b>{{ h.actorName }}</b> {{ verb(h) }}
                    @if (h.taskTitle && h.taskId) {
                      <button type="button" class="link" (click)="openTask(h)">{{ h.taskTitle }}</button>
                    } @else if (h.taskTitle) { <b>{{ h.taskTitle }}</b> }
                    @if (!projectId() && h.projectName) {
                      <span class="where">in <span class="hash" [style.--pc]="'var(--proj-' + (h.projectColor ?? 'charcoal') + ')'">#</span>{{ h.projectName }}</span>
                    }
                  </div>
                  @for (c of changes(h); track c.field) {
                    <div class="change"><span class="cfield">{{ c.field }}</span>
                      @if (c.before !== null) { <s>{{ c.before }}</s> <span class="arrow">→</span> }
                      <span>{{ c.after ?? '(removed)' }}</span>
                    </div>
                  }
                  <span class="muted when">{{ ago(h.createdAt) }}</span>
                </div>
                @if (h.action === 'DELETED' && h.taskId) {
                  <button type="button" class="btn sm" (click)="restore(h)">Restore</button>
                }
              </div>
            }
          </section>
        } @empty {
          <div class="empty"><app-icon name="history" /><p class="big">No history yet</p>
            <p class="muted">Changes to tasks and projects show up here.</p></div>
        }
        @if (next()) {
          <button type="button" class="btn more" [disabled]="busy()" (click)="load(true)">{{ busy() ? 'Loading…' : 'Show older' }}</button>
        }
      }
    </div>
  `,
  styles: `
    .page { max-width: var(--content-width); margin: 0 auto; padding: 24px 32px 80px; }
    @media (max-width: 760px) { .page { padding: 8px 16px 80px; } }
    .vh { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    h1 { font-size: 30px; line-height: 38px; margin: 0; font-weight: 800; letter-spacing: -.02em; }
    .filter { width: auto; max-width: 220px; height: 32px; font-size: 13px; }
    .intro { margin: 4px 0 16px; font-size: 13px; }
    section { margin-bottom: 18px; }
    .sec { font-size: 14px; font-weight: 700; margin: 0; padding: 8px 0 6px; border-bottom: 1px solid var(--border); }
    .entry { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); align-items: flex-start; animation: in .25s ease both; }
    @keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
    .line { overflow-wrap: anywhere; }
    .link { border: 0; background: transparent; padding: 0; color: var(--brand-ink); font: inherit; font-weight: 600; cursor: pointer; }
    .link:hover { text-decoration: underline; }
    .where { color: var(--ink-muted); font-size: 13px; margin-left: 4px; }
    .change { font-size: 13px; color: var(--ink-muted); overflow-wrap: anywhere; }
    .change s { color: var(--ink-subtle); }
    .cfield { font-weight: 600; text-transform: capitalize; margin-right: 6px; color: var(--ink); }
    .arrow { margin: 0 2px; }
    .when { font-size: 12px; }
    .more { margin-top: 12px; }
    .empty { text-align: center; padding: 48px 16px; color: var(--ink-muted); }
    .empty .big { font-size: 16px; font-weight: 600; margin: 8px 0 4px; color: var(--ink); }
    .empty p { margin: 0; }
    .skeleton { height: 56px; border-bottom: 1px solid var(--border); background: linear-gradient(90deg, var(--surface-sunken) 0 50%, transparent 50%) no-repeat 36px 50% / 70% 12px; }
    @media (prefers-reduced-motion: reduce) { .entry { animation: none; } }
  `,
})
export class HistoryPage {
  private api = inject(Api);
  private router = inject(Router);
  protected store = inject(Store);

  /** From ?project= in the address. */
  readonly project = input<string | undefined>(undefined);
  protected readonly projectId = computed(() => (this.project() ? Number(this.project()) : null));
  protected readonly items = signal<HistoryEntry[]>([]);
  protected readonly next = signal<number | null>(null);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);

  protected readonly days = computed(() => {
    const byDay = new Map<string, HistoryEntry[]>();
    for (const h of this.items()) {
      const day = toIso(new Date(h.createdAt));
      byDay.set(day, [...(byDay.get(day) ?? []), h]);
    }
    return [...byDay.entries()].map(([day, items]) => ({ day, heading: dayHeading(day), items }));
  });

  constructor() {
    effect(() => {
      this.projectId();
      this.store.tasksVersion();
      untracked(() => this.load(false));
    });
  }

  protected color = avatarColor;
  protected ago = timeAgo;

  protected pick(id: number | null): void {
    this.router.navigate(['/history'], { queryParams: id ? { project: id } : {} });
  }

  protected load(more: boolean): void {
    this.busy.set(true);
    this.api.history({ projectId: this.projectId() ?? undefined, before: more ? this.next() : null, limit: 30 }).subscribe({
      next: (page) => {
        this.items.set(more ? [...this.items(), ...page.items] : page.items);
        this.next.set(page.nextBefore);
        this.loaded.set(true);
        this.busy.set(false);
      },
      error: (err) => {
        this.loaded.set(true);
        this.busy.set(false);
        this.store.toast(errorMessage(err));
      },
    });
  }

  protected verb(h: HistoryEntry): string {
    // Here the task's name follows the verb, so "completed it" becomes "completed “Write post”".
    if (h.action === 'COMMENTED') return 'commented on';
    if (h.action === 'REORDERED') return h.taskTitle ? 'reordered the sub-tasks of' : 'reordered tasks';
    const v = HISTORY_VERBS[h.action] ?? h.action.toLowerCase();
    return v.replace(/ (it|this task)$/, '');
  }

  protected changes(h: HistoryEntry) {
    return Object.entries(h.changes ?? {}).map(([field, [before, after]]) => ({
      field, before: formatValue(field, before), after: formatValue(field, after),
    }));
  }

  protected openTask(h: HistoryEntry): void {
    if (h.action === 'DELETED') return this.store.toast('This task was deleted. Use Restore to bring it back.');
    this.store.openTaskId.set(h.taskId);
  }

  protected restore(h: HistoryEntry): void {
    this.api.restoreTask(h.taskId!).subscribe({
      next: () => {
        this.store.tasksChanged();
        this.store.toast(`“${h.taskTitle}” restored`, undefined, () => this.store.openTaskId.set(h.taskId));
      },
      error: () => this.store.toast('This task can’t be restored: it’s already back, or it was deleted more than a week ago.'),
    });
  }
}
