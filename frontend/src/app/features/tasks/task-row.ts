import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, signal, viewChild } from '@angular/core';
import { Auth } from '../../core/auth';
import { addDays, dueChip, formatDuration, todayIso } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Priority, Task } from '../../core/models';
import { Store } from '../../core/store';
import { TaskActions, dueOf } from '../../core/task-actions';
import { DatePicker } from '../../shared/date-picker';
import { avatarColor } from '../../shared/dropdown';
import { TaskEditor } from './task-editor';

@Component({
  selector: 'app-task-row',
  imports: [Icon, TaskEditor, DatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.selected]': 'selected()' },
  template: `
    @if (editing()) {
      <div class="editing"><app-task-editor [task]="task()" (saved)="editing.set(false)" (cancelled)="editing.set(false)" /></div>
    } @else {
      <div class="row" [class.done]="task().completed" [class.sel]="selected()" [attr.draggable]="canEdit()"
           (dragstart)="onDragStart($event)" (dragend)="dragging.set(false)" [class.dragging]="dragging()"
           (contextmenu)="openMenu($event)">
        <span class="handle" aria-hidden="true"><svg class="ic sm" viewBox="0 0 24 24"><circle cx="9" cy="6" r=".8"/><circle cx="15" cy="6" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="18" r=".8"/><circle cx="15" cy="18" r=".8"/></svg></span>
        <button type="button" class="check" [class]="'check p' + task().priority" role="checkbox" [disabled]="!canComplete()"
                [attr.aria-checked]="task().completed" [attr.aria-label]="(task().completed ? 'Reopen ' : 'Complete ') + task().title"
                (click)="actions.toggleComplete(task())">
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </button>
        <div class="body" (click)="store.openTaskId.set(task().id)">
          <div class="title">{{ task().title }}</div>
          @if (task().description) { <div class="desc">{{ task().description }}</div> }
          @if (hasMeta()) {
            <div class="meta">
              @if (chip(); as c) {
                <button #dateChip type="button" class="date" [class]="'date ' + c.tone" (click)="$event.stopPropagation(); canEdit() && picking.set(true)">
                  <app-icon [name]="task().recurrence ? 'repeat' : 'calendar'" [small]="true" />{{ c.label }}
                </button>
              }
              @if (task().durationMinutes) { <span class="m"><app-icon name="hourglass" [small]="true" />{{ duration() }}</span> }
              @if (task().subtaskCount) { <span class="m"><app-icon name="subtask" [small]="true" />{{ task().subtaskDone }}/{{ task().subtaskCount }}</span> }
              @if (task().commentCount) { <span class="m"><app-icon name="comment" [small]="true" />{{ task().commentCount }}</span> }
              @for (l of task().labels; track l.id) {
                <span class="label-chip" [style.--lc]="'var(--proj-' + l.color + ')'"><app-icon name="tag" [small]="true" />{{ l.name }}</span>
              }
              @if (task().assignee; as a) {
                <span class="av sm" [style.--ac]="color(a.id)" [title]="'Assigned to ' + a.name">{{ a.initials }}</span>
              }
              @if (showProject() && project(); as p) {
                <span class="where">{{ p.inbox ? 'Inbox' : p.name }}<span class="hash" [style.--pc]="'var(--proj-' + p.color + ')'">#</span></span>
              }
            </div>
          }
        </div>
        <div class="tools">
          @if (canEdit()) {
            <button class="ibtn" type="button" title="Edit (E)" (click)="editing.set(true)"><app-icon name="edit" /></button>
            <button #dateTool class="ibtn" type="button" title="Date (T)" (click)="picking.set(true)"><app-icon name="calendar" /></button>
          }
          <button class="ibtn" type="button" title="Comments" (click)="store.openTaskId.set(task().id)"><app-icon name="comment" /></button>
          @if (canEdit()) {
            <button class="ibtn" type="button" title="More actions" [attr.aria-expanded]="menuOpen()" (click)="openMenu($event)"><app-icon name="more" /></button>
          }
        </div>
        @if (menuOpen()) {
          <div class="backdrop" (click)="menuOpen.set(false)" (contextmenu)="$event.preventDefault(); menuOpen.set(false)"></div>
          <div class="menu ctx" role="menu" [style.top.px]="menuPos().y" [style.left.px]="menuPos().x">
            <button type="button" (click)="menuOpen.set(false); editing.set(true)"><app-icon name="edit" [small]="true" />Edit<span class="kbd k">E</span></button>
            <button type="button" (click)="menuOpen.set(false); store.openTaskId.set(task().id)"><app-icon name="comment" [small]="true" />Open details<span class="kbd k">Enter</span></button>
            <hr />
            <div class="menu-cap">Date</div>
            <div class="quick">
              <button type="button" title="Today" (click)="quickDate(0)"><app-icon name="today" /></button>
              <button type="button" title="Tomorrow" (click)="quickDate(1)"><app-icon name="sun" /></button>
              <button type="button" title="Next week" (click)="quickDate(7)"><app-icon name="right" /></button>
              <button type="button" title="More dates" (click)="menuOpen.set(false); picking.set(true)"><app-icon name="more" /></button>
            </div>
            <div class="menu-cap">Priority</div>
            <div class="quick">
              @for (p of [1, 2, 3, 4]; track p) {
                <button type="button" [title]="'Priority ' + p" [class]="'pf p' + p" [attr.aria-pressed]="task().priority === p" (click)="setPriority($any(p))"><app-icon name="flag" /></button>
              }
            </div>
            <hr />
            <div class="menu-cap">Move to</div>
            <div class="moves">
              @for (p of store.writableProjects(); track p.id) {
                @if (p.id !== task().projectId) {
                  <button type="button" (click)="menuOpen.set(false); actions.move(task(), p.id)">
                    <span class="hash" [style.--pc]="'var(--proj-' + p.color + ')'">#</span>{{ p.inbox ? 'Inbox' : p.name }}
                  </button>
                }
              }
            </div>
            <hr />
            <button type="button" class="danger" (click)="menuOpen.set(false); actions.remove(task())"><app-icon name="trash" [small]="true" />Delete<span class="kbd k">Del</span></button>
          </div>
        }
      </div>
    }
    @if (picking()) {
      <app-date-picker [anchor]="pickerAnchor()" [value]="due()" (picked)="picking.set(false); actions.reschedule([task()], $event)"
                       (closed)="picking.set(false)" />
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    .row { display: flex; align-items: flex-start; gap: 10px; min-height: var(--row-min-height); padding: 10px 4px 10px 0; border-bottom: 1px solid var(--border); position: relative; }
    .row.sel { background: var(--surface-selected); border-radius: var(--radius-md); }
    .row.dragging { opacity: .4; }
    .handle { position: absolute; left: -22px; top: 12px; color: var(--ink-subtle); opacity: 0; cursor: grab; }
    .row[draggable="true"]:hover .handle { opacity: 1; }
    .check {
      --ring: var(--priority-4); --fill: transparent;
      width: var(--checkbox-size); height: var(--checkbox-size); margin: 2px 0 0 4px; flex: none; padding: 0;
      border-radius: 99px; border: 1.5px solid var(--ring); background: var(--fill); display: grid; place-items: center; cursor: pointer;
    }
    .check:disabled { cursor: default; opacity: .6; }
    .check.p1 { --ring: var(--priority-1); --fill: var(--priority-1-tint); border-width: 2px; }
    .check.p2 { --ring: var(--priority-2); --fill: var(--priority-2-tint); border-width: 2px; }
    .check.p3 { --ring: var(--priority-3); --fill: var(--priority-3-tint); border-width: 2px; }
    .check svg { width: 12px; height: 12px; fill: none; stroke: var(--ring); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; opacity: 0; }
    .check:not(:disabled):hover svg { opacity: 1; }
    .done .check { background: var(--ring); }
    .done .check svg { opacity: 1; stroke: var(--surface); }
    .done .title { text-decoration: line-through; color: var(--ink-subtle); }
    .body { flex: 1; min-width: 0; cursor: pointer; }
    .title { overflow-wrap: anywhere; }
    .desc { font-size: 13px; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin-top: 2px; font-size: 12px; color: var(--ink-muted); }
    .m { display: inline-flex; align-items: center; gap: 3px; }
    .date { display: inline-flex; align-items: center; gap: 3px; border: 0; background: transparent; padding: 0; font-size: 12px; cursor: pointer; color: inherit; }
    .date:hover { text-decoration: underline; }
    .date.today { color: var(--date-today); } .date.tomorrow { color: var(--date-tomorrow); }
    .date.week { color: var(--date-week); } .date.overdue { color: var(--date-overdue); } .date.later { color: var(--date-later); }
    .where { margin-left: auto; display: inline-flex; gap: 4px; }
    .tools { display: flex; gap: 2px; opacity: 0; }
    .row:hover .tools, .row:focus-within .tools, .row.sel .tools { opacity: 1; }
    @media (hover: none) { .tools { opacity: 1; } .tools .ibtn:not(:last-child) { display: none; } }
    .editing { padding: 8px 0; }
    .backdrop { position: fixed; inset: 0; z-index: 140; }
    .ctx { position: fixed; z-index: 150; width: 240px; max-height: calc(100vh - 16px); overflow-y: auto; }
    .k { margin-left: auto; }
    .quick { display: flex; gap: 2px; padding: 0 6px 4px; }
    .quick button { width: 36px; justify-content: center; padding: 6px 0; }
    .pf.p1 { color: var(--priority-1); } .pf.p2 { color: var(--priority-2); } .pf.p3 { color: var(--priority-3); } .pf.p4 { color: var(--priority-4); }
    .pf[aria-pressed="true"] { background: var(--surface-selected); }
    .moves { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; }
  `,
})
export class TaskRow {
  private auth = inject(Auth);
  protected store = inject(Store);
  protected actions = inject(TaskActions);

  readonly task = input.required<Task>();
  /** Show the project name, for views that mix projects (Today, Upcoming). */
  readonly showProject = input(false);
  readonly selected = input(false);

  protected readonly editing = signal(false);
  protected readonly picking = signal(false);
  protected readonly dragging = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly menuPos = signal({ x: 0, y: 0 });
  private dateChip = viewChild<ElementRef<HTMLElement>>('dateChip');
  private dateTool = viewChild<ElementRef<HTMLElement>>('dateTool');

  protected readonly project = computed(() => this.store.project(this.task().projectId));
  protected readonly role = computed(() => this.project()?.role ?? 'MEMBER');
  protected readonly canEdit = computed(() => this.role() !== 'GUEST' && !this.task().completed);
  protected readonly canComplete = computed(() =>
    this.role() !== 'GUEST' || this.task().assignee?.id === this.auth.user()?.id);
  protected readonly chip = computed(() => {
    const t = this.task();
    return t.dueDate ? dueChip(t.dueDate, t.dueTime, this.auth.user()?.timeFormat) : null;
  });
  protected readonly duration = computed(() => formatDuration(this.task().durationMinutes ?? 0));
  protected readonly due = computed(() => dueOf(this.task()));
  protected readonly hasMeta = computed(() => {
    const t = this.task();
    return !!(t.dueDate || t.durationMinutes || t.subtaskCount || t.commentCount || t.labels.length || t.assignee
      || (this.showProject() && this.project()));
  });
  protected color = avatarColor;

  @HostListener('document:keydown.escape')
  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  /** Keyboard shortcuts from the list page call these. */
  edit(): void {
    if (this.canEdit()) this.editing.set(true);
  }

  pickDate(): void {
    if (this.canEdit()) this.picking.set(true);
  }

  protected pickerAnchor(): HTMLElement | null {
    return this.dateChip()?.nativeElement ?? this.dateTool()?.nativeElement ?? null;
  }

  protected openMenu(e: MouseEvent): void {
    if (!this.canEdit()) return;
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 250);
    const y = Math.min(e.clientY, window.innerHeight - 440);
    this.menuPos.set({ x: Math.max(8, x), y: Math.max(8, y) });
    this.menuOpen.set(true);
  }

  protected quickDate(days: number): void {
    this.menuOpen.set(false);
    this.actions.reschedule([this.task()], { ...this.due(), date: addDays(todayIso(), days) });
  }

  protected setPriority(p: Priority): void {
    this.menuOpen.set(false);
    this.actions.setPriority(this.task(), p);
  }

  protected onDragStart(e: DragEvent): void {
    if (!this.canEdit() || !e.dataTransfer) return;
    e.dataTransfer.setData('application/x-doable-task', String(this.task().id));
    e.dataTransfer.setData('text/plain', this.task().title);
    e.dataTransfer.effectAllowed = 'move';
    this.dragging.set(true);
  }
}
