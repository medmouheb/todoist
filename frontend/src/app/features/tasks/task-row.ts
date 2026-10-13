import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Api } from '../../core/api';
import { dueChip } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Task } from '../../core/models';
import { Store } from '../../core/store';
import { TaskEditor } from './task-editor';

@Component({
  selector: 'app-task-row',
  imports: [Icon, TaskEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editing()) {
      <div class="editing"><app-task-editor [task]="task()" (saved)="editing.set(false)" (cancelled)="editing.set(false)" /></div>
    } @else {
      <div class="row" [class.done]="task().completed">
        <button type="button" class="check" [class]="'check p' + task().priority" role="checkbox"
                [attr.aria-checked]="task().completed" [attr.aria-label]="(task().completed ? 'Reopen ' : 'Complete ') + task().title"
                (click)="toggle()">
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </button>
        <div class="body" (click)="editing.set(true)">
          <div class="title">{{ task().title }}</div>
          @if (task().description) { <div class="desc">{{ task().description }}</div> }
          @if (chip() || (showProject() && project())) {
            <div class="meta">
              @if (chip(); as c) {
                <span class="date" [class]="'date ' + c.tone"><app-icon name="calendar" [small]="true" />{{ c.label }}</span>
              }
              @if (showProject() && project(); as p) {
                <span class="where">{{ p.inbox ? 'Inbox' : p.name }}<span class="hash" [style.--pc]="'var(--proj-' + p.color + ')'">#</span></span>
              }
            </div>
          }
        </div>
        <div class="tools">
          <button class="ibtn" type="button" title="Edit" (click)="editing.set(true)"><app-icon name="edit" /></button>
          <button class="ibtn" type="button" title="Delete" (click)="remove()"><app-icon name="trash" /></button>
        </div>
      </div>
    }
  `,
  styles: `
    .row { display: flex; align-items: flex-start; gap: 10px; min-height: var(--row-min-height); padding: 10px 0; border-bottom: 1px solid var(--border); position: relative; }
    .check {
      --ring: var(--priority-4); --fill: transparent;
      width: var(--checkbox-size); height: var(--checkbox-size); margin-top: 2px; flex: none; padding: 0;
      border-radius: 99px; border: 1.5px solid var(--ring); background: var(--fill); display: grid; place-items: center; cursor: pointer;
    }
    .check.p1 { --ring: var(--priority-1); --fill: var(--priority-1-tint); border-width: 2px; }
    .check.p2 { --ring: var(--priority-2); --fill: var(--priority-2-tint); border-width: 2px; }
    .check.p3 { --ring: var(--priority-3); --fill: var(--priority-3-tint); border-width: 2px; }
    .check svg { width: 12px; height: 12px; fill: none; stroke: var(--ring); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; opacity: 0; }
    .check:hover svg { opacity: 1; }
    .done .check { background: var(--ring); }
    .done .check svg { opacity: 1; stroke: var(--surface); }
    .done .title { text-decoration: line-through; color: var(--ink-subtle); }
    .body { flex: 1; min-width: 0; cursor: pointer; }
    .title { overflow-wrap: anywhere; }
    .desc { font-size: 13px; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 2px; font-size: 12px; color: var(--ink-muted); }
    .date { display: inline-flex; align-items: center; gap: 3px; }
    .date.today { color: var(--date-today); } .date.tomorrow { color: var(--date-tomorrow); }
    .date.week { color: var(--date-week); } .date.overdue { color: var(--date-overdue); } .date.later { color: var(--date-later); }
    .where { margin-left: auto; display: inline-flex; gap: 4px; }
    .tools { display: flex; gap: 2px; opacity: 0; }
    .row:hover .tools, .row:focus-within .tools { opacity: 1; }
    @media (hover: none) { .tools { opacity: 1; } }
    .editing { padding: 8px 0; }
  `,
})
export class TaskRow {
  private api = inject(Api);
  private store = inject(Store);

  readonly task = input.required<Task>();
  /** Show the project name, for views that mix projects (Today, Upcoming). */
  readonly showProject = input(false);

  protected readonly editing = signal(false);
  protected readonly chip = computed(() => {
    const d = this.task().dueDate;
    return d ? dueChip(d) : null;
  });
  protected readonly project = computed(() => this.store.project(this.task().projectId));

  protected toggle(): void {
    const t = this.task();
    const completed = !t.completed;
    this.api.updateTask(t.id, { completed }).subscribe(() => {
      this.store.tasksChanged();
      if (completed) {
        this.store.toast('1 task completed', () =>
          this.api.updateTask(t.id, { completed: false }).subscribe(() => this.store.tasksChanged()));
      }
    });
  }

  protected remove(): void {
    const t = this.task();
    if (!confirm(`Delete “${t.title}”? This can’t be undone.`)) return;
    this.api.deleteTask(t.id).subscribe(() => {
      this.store.tasksChanged();
      this.store.toast('Task deleted');
    });
  }
}
