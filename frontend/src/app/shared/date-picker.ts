import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, OnInit, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../core/auth';
import { addDays, dueChip, fromIso, nextWeek, startOfWeek, thisWeekend, toIso, todayIso } from '../core/dates';
import { Icon } from '../core/icon';
import { Due } from '../core/models';
import { parseDateText } from '../core/quick-add';
import { REPEAT_PRESETS, firstOccurrence, isValidRule } from '../core/recurrence';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

/**
 * Date, time, duration and repeat in one popover, placed next to `anchor`.
 * Picking a shortcut or a day saves at once; time, duration and repeat save with Done.
 */
@Component({
  selector: 'app-date-picker',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="panel" #panel role="dialog" aria-label="Choose a date" [style.top.px]="pos().top" [style.left.px]="pos().left"
         (keydown.escape)="$event.stopPropagation(); closed.emit()">
      <input #text class="type" placeholder="Type a date, e.g. fri 3pm or every monday" [(ngModel)]="typed"
             (keydown.enter)="applyTyped(); $event.preventDefault()" aria-label="Type a date" />
      @if (typedPreview(); as p) { <div class="preview">{{ p }} <span class="kbd">Enter</span></div> }

      <div class="shortcuts">
        @for (s of shortcuts(); track s.label) {
          <button type="button" (click)="pick(s.date)">
            <app-icon [name]="s.icon" [small]="true" /><span>{{ s.label }}</span><span class="muted">{{ s.hint }}</span>
          </button>
        }
        <button type="button" (click)="clear()"><app-icon name="close" [small]="true" /><span>No date</span></button>
      </div>

      <div class="month">
        <div class="mhead">
          <b>{{ monthLabel() }}</b>
          <span>
            <button type="button" class="ibtn" aria-label="Previous month" (click)="shiftMonth(-1)"><app-icon name="left" [small]="true" /></button>
            <button type="button" class="ibtn" aria-label="Next month" (click)="shiftMonth(1)"><app-icon name="right" [small]="true" /></button>
          </span>
        </div>
        <div class="grid">
          @for (w of weekdayLetters(); track $index) { <span class="wd">{{ w }}</span> }
          @for (d of days(); track d.iso) {
            <button type="button" class="day" [class.other]="!d.inMonth" [class.past]="d.past" [class.today]="d.today"
                    [class.sel]="d.iso === draft().date" (click)="pick(d.iso)" [attr.aria-label]="d.iso">{{ d.n }}</button>
          }
        </div>
      </div>

      <div class="row">
        <label class="inline"><app-icon name="clock" [small]="true" /><span class="sr-only">Time</span>
          <input type="time" [ngModel]="draft().time ?? ''" (ngModelChange)="setTime($event)" />
        </label>
        <label class="inline"><app-icon name="hourglass" [small]="true" /><span class="sr-only">Duration</span>
          <select [ngModel]="draft().duration" (ngModelChange)="setDuration($event)" [disabled]="!draft().time">
            <option [ngValue]="null">No duration</option>
            @for (m of durations; track m) { <option [ngValue]="m">{{ durLabel(m) }}</option> }
          </select>
        </label>
      </div>
      <div class="row">
        <label class="inline grow"><app-icon name="repeat" [small]="true" /><span class="sr-only">Repeat</span>
          <select [ngModel]="draft().recurrence" (ngModelChange)="setRepeat($event)">
            <option [ngValue]="null">Doesn’t repeat</option>
            @for (r of repeatOptions(); track r) { <option [ngValue]="r">{{ cap(r) }}</option> }
          </select>
        </label>
      </div>
      <div class="foot">
        <span class="muted sum">{{ summary() }}</span>
        <button type="button" class="btn sm" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn primary sm" (click)="done()">Done</button>
      </div>
    </div>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 240; }
    .panel {
      position: fixed; z-index: 250; width: 300px; max-width: calc(100vw - 16px); background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: 8px;
      display: flex; flex-direction: column; gap: 6px; max-height: calc(100vh - 16px); overflow-y: auto;
    }
    .type { height: 34px; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0 8px; background: var(--surface); font-size: 13px; }
    .type:focus { outline: 2px solid var(--focus-ring); outline-offset: -1px; }
    .preview { font-size: 12px; color: var(--brand-ink); padding: 0 4px; display: flex; justify-content: space-between; }
    .shortcuts { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .shortcuts button { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 6px 8px; border-radius: var(--radius-md); cursor: pointer; font-size: 13px; text-align: left; }
    .shortcuts button:hover { background: var(--surface-hover); }
    .shortcuts button span:nth-child(2) { flex: 1; }
    .shortcuts .muted { font-size: 12px; }
    .mhead { display: flex; justify-content: space-between; align-items: center; padding: 2px 4px; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
    .wd { font-size: 11px; color: var(--ink-subtle); padding: 2px 0; }
    .day { height: 32px; border: 0; background: transparent; border-radius: 99px; cursor: pointer; font-size: 13px; }
    .day:hover { background: var(--surface-hover); }
    .day.other { color: var(--ink-subtle); }
    .day.past { color: var(--ink-subtle); }
    .day.today { color: var(--date-today); font-weight: 700; }
    .day.sel { background: var(--brand); color: var(--on-brand); font-weight: 700; }
    .row { display: flex; gap: 6px; }
    .inline { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 8px; border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink-muted); }
    .inline.grow { flex: 1; }
    .inline input, .inline select { border: 0; background: transparent; font-size: 13px; color: var(--ink); min-width: 0; }
    .inline select { flex: 1; }
    .inline:focus-within { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
    .inline input:focus, .inline select:focus { outline: none; }
    .foot { display: flex; align-items: center; gap: 6px; border-top: 1px solid var(--border); padding-top: 6px; }
    .sum { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class DatePicker implements OnInit {
  private auth = inject(Auth);

  readonly anchor = input<HTMLElement | null>(null);
  readonly value = input<Due>({ date: null, time: null, duration: null, recurrence: null });
  readonly picked = output<Due>();
  readonly closed = output<void>();

  private textInput = viewChild.required<ElementRef<HTMLInputElement>>('text');

  protected readonly durations = DURATIONS;
  protected readonly draft = signal<Due>({ date: null, time: null, duration: null, recurrence: null });
  protected readonly month = signal(todayIso().slice(0, 7) + '-01');
  protected readonly pos = signal({ top: 0, left: 0 });
  protected typed = '';

  private readonly weekStart = computed(() => this.auth.user()?.weekStart ?? 1);
  private readonly timeFormat = computed(() => this.auth.user()?.timeFormat ?? '24h');

  protected readonly shortcuts = computed(() => {
    const t = todayIso();
    const wd = (iso: string) => fromIso(iso).toLocaleDateString(undefined, { weekday: 'short' });
    return [
      { label: 'Today', date: t, hint: wd(t), icon: 'today' as const },
      { label: 'Tomorrow', date: addDays(t, 1), hint: wd(addDays(t, 1)), icon: 'sun' as const },
      { label: 'This weekend', date: thisWeekend(), hint: wd(thisWeekend()), icon: 'calendar' as const },
      { label: 'Next week', date: nextWeek(this.weekStart()), hint: dueChip(nextWeek(this.weekStart())).label, icon: 'right' as const },
    ];
  });

  protected readonly monthLabel = computed(() =>
    fromIso(this.month()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));

  protected readonly weekdayLetters = computed(() => {
    const base = startOfWeek(todayIso(), this.weekStart());
    return Array.from({ length: 7 }, (_, i) => fromIso(addDays(base, i)).toLocaleDateString(undefined, { weekday: 'narrow' }));
  });

  protected readonly days = computed(() => {
    const first = this.month();
    const start = startOfWeek(first, this.weekStart());
    const m = fromIso(first).getMonth();
    const today = todayIso();
    return Array.from({ length: 42 }, (_, i) => {
      const iso = addDays(start, i);
      return { iso, n: fromIso(iso).getDate(), inMonth: fromIso(iso).getMonth() === m, past: iso < today, today: iso === today };
    });
  });

  protected readonly repeatOptions = computed(() => {
    const r = this.draft().recurrence;
    return r && !REPEAT_PRESETS.includes(r) ? [...REPEAT_PRESETS, r] : REPEAT_PRESETS;
  });

  protected readonly summary = computed(() => {
    const d = this.draft();
    if (!d.date) return d.recurrence ? this.cap(d.recurrence) : 'No date';
    let s = dueChip(d.date, d.time, this.timeFormat()).label;
    if (d.duration) s += ` · ${this.durLabel(d.duration)}`;
    if (d.recurrence) s += ` · ${d.recurrence}`;
    return s;
  });

  protected typedPreview(): string | null {
    const p = this.typed.trim() ? parseDateText(this.typed, this.weekStart()) : null;
    if (!p) return null;
    const date = p.date ?? (p.recurrence ? firstOccurrence(p.recurrence, todayIso()) : null);
    return [date ? dueChip(date, p.time, this.timeFormat()).label : null, p.recurrence].filter(Boolean).join(' · ');
  }

  ngOnInit(): void {
    const v = this.value();
    this.draft.set({ ...v, time: v.time?.slice(0, 5) ?? null });
    if (v.date) this.month.set(v.date.slice(0, 7) + '-01');
    this.place();
    queueMicrotask(() => this.textInput().nativeElement.focus());
  }

  @HostListener('window:resize')
  protected place(): void {
    const a = this.anchor()?.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    const h = 560;
    if (!a) {
      this.pos.set({ top: Math.max(8, (window.innerHeight - h) / 2), left: (window.innerWidth - w) / 2 });
      return;
    }
    let top = a.bottom + 4;
    if (top + h > window.innerHeight) top = Math.max(8, Math.min(a.top - h - 4, window.innerHeight - h - 8));
    const left = Math.min(Math.max(8, a.left), window.innerWidth - w - 8);
    this.pos.set({ top: Math.max(8, top), left });
  }

  protected pick(date: string): void {
    this.picked.emit({ ...this.draft(), date });
  }

  protected clear(): void {
    this.picked.emit({ date: null, time: null, duration: null, recurrence: null });
  }

  protected done(): void {
    const d = this.draft();
    if (!d.date && d.recurrence) d.date = firstOccurrence(d.recurrence, todayIso());
    if (!d.date && d.time) d.date = todayIso();
    this.picked.emit(d);
  }

  protected applyTyped(): void {
    const p = parseDateText(this.typed, this.weekStart());
    if (!p) return;
    const recurrence = p.recurrence ?? null;
    const date = p.date ?? (recurrence ? firstOccurrence(recurrence, todayIso()) : null);
    this.picked.emit({ date, time: p.time ?? this.draft().time, duration: this.draft().duration, recurrence: recurrence ?? this.draft().recurrence });
  }

  protected shiftMonth(n: number): void {
    const d = fromIso(this.month());
    d.setMonth(d.getMonth() + n);
    this.month.set(toIso(d));
  }

  protected setTime(t: string): void {
    this.draft.update((d) => ({ ...d, time: t || null, duration: t ? d.duration : null }));
  }

  protected setDuration(m: number | null): void {
    this.draft.update((d) => ({ ...d, duration: m }));
  }

  protected setRepeat(r: string | null): void {
    if (r && !isValidRule(r)) return;
    this.draft.update((d) => ({ ...d, recurrence: r }));
  }

  protected durLabel(m: number): string {
    return m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
  }

  protected cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
