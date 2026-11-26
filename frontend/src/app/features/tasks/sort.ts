import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../core/icon';
import { Task } from '../../core/models';
import { Dropdown } from '../../shared/dropdown';

export type SortField = 'priority' | 'importance' | 'due' | 'deadline' | 'duration' | 'title' | 'category' | 'created' | 'updated';

/** One level of a multi-level sort. */
export interface SortKey {
  field: SortField;
  desc: boolean;
}

export const SORT_FIELDS: { field: SortField; label: string; up: string; down: string }[] = [
  { field: 'priority', label: 'Priority', up: 'P1 first', down: 'P4 first' },
  { field: 'importance', label: 'Importance', up: 'Least first', down: 'Most first' },
  { field: 'due', label: 'Date', up: 'Soonest first', down: 'Latest first' },
  { field: 'deadline', label: 'Deadline', up: 'Soonest first', down: 'Latest first' },
  { field: 'duration', label: 'Duration', up: 'Shortest first', down: 'Longest first' },
  { field: 'title', label: 'Title', up: 'A to Z', down: 'Z to A' },
  { field: 'category', label: 'Category', up: 'A to Z', down: 'Z to A' },
  { field: 'created', label: 'Created', up: 'Oldest first', down: 'Newest first' },
  { field: 'updated', label: 'Modified', up: 'Oldest first', down: 'Newest first' },
];

/** Missing values (no date, no duration…) always go last, whatever the direction. */
function value(t: Task, f: SortField): string | number | null {
  switch (f) {
    case 'priority': return t.priority;
    case 'importance': return t.importance;
    case 'due': return t.dueDate ? t.dueDate + (t.dueTime ?? '99') : null;
    case 'deadline': return t.deadline;
    case 'duration': return t.durationMinutes;
    case 'title': return t.title.toLowerCase();
    case 'category': return t.category?.name.toLowerCase() ?? null;
    case 'created': return t.createdAt;
    case 'updated': return t.updatedAt ?? t.createdAt;
  }
}

export function compareBy(keys: SortKey[]): (a: Task, b: Task) => number {
  return (a, b) => {
    for (const k of keys) {
      const x = value(a, k.field);
      const y = value(b, k.field);
      if (x === y) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      const c = x < y ? -1 : 1;
      return k.desc ? -c : c;
    }
    return 0;
  };
}

/** A stable sort by every level in turn (keeps the current order among equals). */
export function sortTasks<T extends Task>(tasks: T[], keys: SortKey[]): T[] {
  return keys.length ? [...tasks].sort(compareBy(keys)) : tasks;
}

export function readSort(storageKey: string): SortKey[] {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(v) ? v.filter((k) => SORT_FIELDS.some((f) => f.field === k?.field)) : [];
  } catch {
    return [];
  }
}

export function writeSort(storageKey: string, keys: SortKey[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch { /* not remembered in private mode */ }
}

/** "Sort" menu: a list of levels (field + direction), applied in order. */
@Component({
  selector: 'app-sort-menu',
  imports: [Dropdown, Icon, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dropdown align="right">
      <button trigger type="button" class="btn ghost sm" [class.on]="keys().length">
        <app-icon name="sort" [small]="true" />Sort@if (keys().length) { <span class="badge">{{ keys().length }}</span> }
      </button>
      <div class="sortbox" data-keep-open (click)="$event.stopPropagation()">
        <span class="menu-cap">Sort by, in this order</span>
        @for (k of keys(); track $index; let i = $index) {
          <div class="lvl">
            <span class="n">{{ i === 0 ? 'Sort by' : 'then by' }}</span>
            <select class="input" [ngModel]="k.field" (ngModelChange)="setField(i, $event)" [attr.aria-label]="'Level ' + (i + 1)">
              @for (f of fields; track f.field) {
                <option [ngValue]="f.field" [disabled]="f.field !== k.field && used().has(f.field)">{{ f.label }}</option>
              }
            </select>
            <button type="button" class="dir" (click)="flip(i)" [title]="'Change direction'">{{ dirLabel(k) }}</button>
            <button type="button" class="ibtn" [attr.aria-label]="'Remove level ' + (i + 1)" (click)="remove(i)"><app-icon name="close" [small]="true" /></button>
          </div>
        } @empty { <p class="muted empty">Manual order. Add a level to sort.</p> }
        <div class="acts">
          <button type="button" class="btn sm" [disabled]="keys().length >= fields.length" (click)="add()"><app-icon name="plus" [small]="true" />Add level</button>
          @if (keys().length) { <button type="button" class="btn sm ghost" (click)="keys.set([])">Clear</button> }
        </div>
      </div>
    </app-dropdown>
  `,
  styles: `
    .btn.on { background: var(--surface-selected); color: var(--brand-ink); }
    .badge { min-width: 16px; height: 16px; border-radius: 99px; background: var(--brand); color: var(--on-brand); font-size: 10px; line-height: 16px; text-align: center; padding: 0 4px; }
    .sortbox { min-width: 330px; padding: 4px; display: flex; flex-direction: column; gap: 6px; }
    .lvl { display: grid; grid-template-columns: 56px 1fr auto auto; gap: 6px; align-items: center; }
    .n { font-size: 12px; color: var(--ink-muted); }
    .lvl .input { height: 32px; font-size: 13px; }
    .dir { height: 32px; padding: 0 10px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface); cursor: pointer; font: inherit; font-size: 12px; white-space: nowrap; }
    .dir:hover { background: var(--surface-hover); }
    .empty { font-size: 13px; margin: 2px 6px; }
    .acts { display: flex; gap: 6px; padding-top: 4px; }
  `,
})
export class SortMenu {
  readonly keys = model<SortKey[]>([]);
  protected readonly fields = SORT_FIELDS;
  protected readonly used = computed(() => new Set(this.keys().map((k) => k.field)));

  protected dirLabel(k: SortKey): string {
    const f = SORT_FIELDS.find((x) => x.field === k.field)!;
    return k.desc ? f.down : f.up;
  }

  protected add(): void {
    const next = SORT_FIELDS.find((f) => !this.used().has(f.field));
    if (next) this.keys.update((ks) => [...ks, { field: next.field, desc: next.field === 'importance' }]);
  }

  protected remove(i: number): void {
    this.keys.update((ks) => ks.filter((_, j) => j !== i));
  }

  protected flip(i: number): void {
    this.keys.update((ks) => ks.map((k, j) => (j === i ? { ...k, desc: !k.desc } : k)));
  }

  protected setField(i: number, field: SortField): void {
    this.keys.update((ks) => ks.map((k, j) => (j === i ? { field, desc: field === 'importance' } : k)));
  }
}
