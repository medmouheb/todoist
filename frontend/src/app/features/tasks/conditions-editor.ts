import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { Icon, IconName } from '../../core/icon';
import { Condition, ConditionType, Task } from '../../core/models';
import { Store } from '../../core/store';

export const CONDITION_TYPES: { type: ConditionType; label: string; icon: IconName; hint: string }[] = [
  { type: 'AFTER', label: 'After another task', icon: 'subtask', hint: 'Waits until that task is done' },
  { type: 'TIME', label: 'Time window', icon: 'clock', hint: 'Only between these hours' },
  { type: 'PLACE', label: 'Place', icon: 'building', hint: 'Office, home, the gym…' },
  { type: 'PERSON', label: 'With someone', icon: 'person', hint: 'When you’re around this person' },
  { type: 'STATE', label: 'Other condition', icon: 'sparkle', hint: 'Healthy, rested, good weather…' },
];

export function conditionIcon(type: ConditionType): IconName {
  return CONDITION_TYPES.find((c) => c.type === type)?.icon ?? 'sparkle';
}

/** Lists a task's conditions of doing and adds or removes them. */
@Component({
  selector: 'app-conditions-editor',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="list">
      @for (c of task().conditions; track c.id) {
        <span class="cond" [class.waiting]="!c.met" [title]="c.met ? c.label : 'Waiting: ' + c.label">
          <app-icon [name]="icon(c.type)" [small]="true" />{{ c.label }}
          @if (canEdit()) {
            <button type="button" class="x" [attr.aria-label]="'Remove condition ' + c.label" (click)="remove(c)"><app-icon name="close" [small]="true" /></button>
          }
        </span>
      } @empty {
        @if (!adding()) { <span class="hint">Doable any time</span> }
      }
    </div>

    @if (adding()) {
      <form class="add" (ngSubmit)="save()" (keydown.escape)="$event.stopPropagation(); adding.set(false)">
        <select class="input" name="type" [(ngModel)]="type" aria-label="Kind of condition">
          @for (k of kinds; track k.type) { <option [ngValue]="k.type">{{ k.label }}</option> }
        </select>
        @switch (type) {
          @case ('AFTER') {
            <select class="input" name="after" [(ngModel)]="afterTaskId" aria-label="Task that must be done first">
              <option [ngValue]="null">Pick a task…</option>
              @for (t of candidates(); track t.id) { <option [ngValue]="t.id">{{ t.title }}</option> }
            </select>
          }
          @case ('TIME') {
            <div class="times">
              <input class="input" type="time" name="from" [(ngModel)]="startTime" aria-label="From" />
              <span>to</span>
              <input class="input" type="time" name="to" [(ngModel)]="endTime" aria-label="To" />
            </div>
          }
          @default {
            <input class="input" name="value" [(ngModel)]="value" maxlength="120" [attr.list]="'cond-' + type"
                   [placeholder]="hint()" aria-label="Condition" autofocus />
            <datalist [id]="'cond-' + type">
              @for (s of suggestions(); track s) { <option [value]="s"></option> }
            </datalist>
          }
        }
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        <div class="acts">
          <button type="button" class="btn sm" (click)="adding.set(false)">Cancel</button>
          <button type="submit" class="btn primary sm">Add</button>
        </div>
      </form>
    } @else if (canEdit()) {
      <button type="button" class="btn ghost sm" (click)="open()"><app-icon name="plus" [small]="true" />Add condition</button>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .list { display: flex; flex-wrap: wrap; gap: 6px; }
    .cond { display: inline-flex; align-items: center; gap: 5px; padding: 3px 4px 3px 9px; border-radius: 99px; font-size: 12px;
      background: var(--surface-sunken); color: var(--ink-muted); max-width: 100%; }
    .cond.waiting { background: color-mix(in srgb, var(--date-overdue) 12%, var(--surface)); color: var(--date-overdue); }
    .x { border: 0; background: transparent; padding: 1px; border-radius: 99px; cursor: pointer; color: inherit; display: flex; }
    .x:hover { background: rgba(127, 127, 127, .2); }
    .add { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 10px; border-radius: 12px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--border); }
    .times { display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .acts { display: flex; gap: 6px; justify-content: flex-end; }
    .err { margin: 0; font-size: 12px; }
    .hint { font-size: 12px; color: var(--ink-subtle); }
  `,
})
export class ConditionsEditor {
  private api = inject(Api);
  private store = inject(Store);

  readonly task = input.required<Task>();
  readonly canEdit = input(true);
  readonly changed = output<Task>();

  protected readonly kinds = CONDITION_TYPES;
  protected readonly adding = signal(false);
  protected readonly error = signal('');
  private readonly openTasks = signal<Task[]>([]);
  protected type: ConditionType = 'AFTER';
  protected value = '';
  protected afterTaskId: number | null = null;
  protected startTime = '';
  protected endTime = '';

  /** Open tasks it could wait for (not itself). */
  protected readonly candidates = computed(() =>
    this.openTasks().filter((t) => t.id !== this.task().id).sort((a, b) => a.title.localeCompare(b.title)));

  protected icon = conditionIcon;

  protected hint(): string {
    return this.kinds.find((k) => k.type === this.type)?.hint ?? '';
  }

  /** Values already used for this kind, so the same place or state isn't typed two ways. */
  protected suggestions(): string[] {
    const seen = new Map<string, string>();
    for (const t of this.openTasks()) {
      for (const c of t.conditions) if (c.type === this.type && c.value) seen.set(c.value.toLowerCase(), c.value);
    }
    return [...seen.values()].sort();
  }

  protected open(): void {
    this.adding.set(true);
    this.error.set('');
    this.value = '';
    this.afterTaskId = null;
    this.api.treeTasks().subscribe((ts) => this.openTasks.set(ts));
  }

  protected save(): void {
    this.error.set('');
    this.api.addCondition(this.task().id, {
      type: this.type,
      value: this.value.trim() || null,
      afterTaskId: this.type === 'AFTER' ? this.afterTaskId : null,
      startTime: this.type === 'TIME' && this.startTime ? this.startTime : null,
      endTime: this.type === 'TIME' && this.endTime ? this.endTime : null,
    }).subscribe({
      next: (t) => {
        this.adding.set(false);
        this.changed.emit(t);
        this.store.tasksChanged();
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected remove(c: Condition): void {
    this.api.removeCondition(this.task().id, c.id).subscribe({
      next: (t) => {
        this.changed.emit(t);
        this.store.tasksChanged();
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }
}
