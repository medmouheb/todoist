import {
  ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { dueChip, formatDuration } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Due, Member, Priority, Task } from '../../core/models';
import { parseQuickAdd } from '../../core/quick-add';
import { Store } from '../../core/store';
import { dueChanges, dueOf } from '../../core/task-actions';
import { DatePicker } from '../../shared/date-picker';
import { Dropdown, avatarColor } from '../../shared/dropdown';

const NO_DUE: Due = { date: null, time: null, duration: null, recurrence: null };

/**
 * Add-task and edit-task form. In a new task's name, "tomorrow 3pm p1 #Home @phone every monday"
 * fills in the fields.
 */
@Component({
  selector: 'app-task-editor',
  imports: [FormsModule, Icon, DatePicker, Dropdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="editor" (ngSubmit)="save()" (keydown.escape)="$event.stopPropagation(); cancelled.emit()" (keydown.control.enter)="save()" (keydown.meta.enter)="save()">
      <input #titleInput class="title" name="title" [placeholder]="parentId() ? 'Sub-task name' : 'Task name'" autocomplete="off"
             [ngModel]="title()" (ngModelChange)="title.set($event)" aria-label="Task name" />
      <textarea class="desc" name="desc" rows="1" placeholder="Description" aria-label="Description"
                [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea>

      @if (!task() && !title()) {
        <p class="tip muted">Try <code>tomorrow 3pm</code> <code>p1</code> <code>#Project</code> <code>&#64;label</code> <code>every monday</code></p>
      }

      <div class="fields">
        <button #dateBtn type="button" class="chip" [class]="'chip ' + (dueTone() ?? '')" (click)="pickingDate.set(true)">
          <app-icon [name]="effectiveDue().recurrence ? 'repeat' : 'calendar'" [small]="true" />{{ dueLabel() }}
        </button>

        <app-dropdown>
          <button trigger type="button" class="chip" [class]="'chip p' + effectivePriority()">
            <app-icon name="flag" [small]="true" />{{ effectivePriority() === 4 ? 'Priority' : 'P' + effectivePriority() }}
          </button>
          @for (p of [1, 2, 3, 4]; track p) {
            <button type="button" role="menuitemradio" [attr.aria-checked]="effectivePriority() === p" (click)="priority.set($any(p))">
              <span class="flag" [class]="'flag p' + p"><app-icon name="flag" [small]="true" /></span>Priority {{ p }}
            </button>
          }
        </app-dropdown>

        <app-dropdown>
          <button trigger type="button" class="chip"><app-icon name="tag" [small]="true" />{{ labelSummary() }}</button>
          <div class="labels" data-keep-open>
            <input class="lfind" placeholder="Type a label" [ngModel]="labelQueryValue()" (ngModelChange)="labelQueryValue.set($event)" name="lq" (keydown.enter)="addTypedLabel($event)"
                   (click)="$event.stopPropagation()" aria-label="Find or create a label" />
            @for (l of labelChoices(); track l) {
              <button type="button" role="menuitemcheckbox" [attr.aria-checked]="effectiveLabels().includes(l)" (click)="toggleLabel(l)">
                <app-icon name="tag" [small]="true" />{{ l }}
              </button>
            }
            @if (labelQueryValue().trim() && !labelExists()) {
              <button type="button" (click)="addTypedLabel()"><app-icon name="plus" [small]="true" />Create “{{ cleanLabel(labelQueryValue()) }}”</button>
            }
          </div>
        </app-dropdown>

        <app-dropdown>
          <button trigger type="button" class="chip" [class.set]="!!categoryId()">
            @if (category(); as c) { <span class="cdot" [style.background]="'var(--proj-' + c.color + ')'"></span>{{ c.name }} }
            @else { <app-icon name="category" [small]="true" />Category }
          </button>
          <button type="button" (click)="categoryId.set(null)"><app-icon name="close" [small]="true" />No category</button>
          @for (c of store.categories(); track c.id) {
            <button type="button" role="menuitemradio" [attr.aria-checked]="categoryId() === c.id" (click)="categoryId.set(c.id)">
              <span class="cdot" [style.background]="'var(--proj-' + c.color + ')'"></span>{{ c.name }}
            </button>
          } @empty { <span class="hint pad-s">No categories yet. Add one from the sidebar.</span> }
        </app-dropdown>

        <label class="chip dl" [class.set]="!!deadline()" title="Deadline">
          <app-icon name="alarm" [small]="true" /><span class="sr-only">Deadline</span>
          <input type="datetime-local" name="deadline" [ngModel]="deadline()" (ngModelChange)="deadline.set($event || '')" />
        </label>

        @if (members().length) {
          <app-dropdown>
            <button trigger type="button" class="chip">
              @if (assignee(); as a) { <span class="av sm" [style.--ac]="color(a.userId)">{{ a.initials }}</span>{{ a.name }} }
              @else { <app-icon name="person" [small]="true" />Assignee }
            </button>
            <button type="button" (click)="assigneeId.set(0)"><app-icon name="close" [small]="true" />Unassigned</button>
            @for (m of members(); track m.userId) {
              <button type="button" role="menuitemradio" [attr.aria-checked]="assigneeId() === m.userId" (click)="assigneeId.set(m.userId)">
                <span class="av sm" [style.--ac]="color(m.userId)">{{ m.initials }}</span>{{ m.name }}
              </button>
            }
          </app-dropdown>
        }
      </div>

      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

      <div class="bar">
        @if (!parentId()) {
          <select class="proj" name="project" aria-label="Project" [ngModel]="effectiveProject()" (ngModelChange)="setProject($event)">
            @for (p of store.writableProjects(); track p.id) { <option [ngValue]="p.id">{{ p.inbox ? 'Inbox' : '# ' + p.name }}</option> }
          </select>
        }
        <span class="grow"></span>
        <button class="btn" type="button" (click)="cancelled.emit()">Cancel</button>
        <button class="btn primary" type="submit" [disabled]="!parsed().title || busy()">{{ task() ? 'Save' : parentId() ? 'Add sub-task' : 'Add task' }}</button>
      </div>
    </form>

    @if (pickingDate()) {
      <app-date-picker [anchor]="dateBtn" [value]="effectiveDue()" (picked)="due.set($event); dueTouched.set(true); pickingDate.set(false)"
                       (closed)="pickingDate.set(false)" />
    }
  `,
  styles: `
    .editor { border: 1px solid var(--border-strong); border-radius: var(--radius-lg); background: var(--surface); }
    :host-context(.modal) .editor { border: 0; }
    .title, .desc { display: block; width: 100%; border: 0; background: transparent; padding: 10px 12px 0; resize: none; }
    .title { font-weight: 600; font-size: 15px; }
    .desc { font-size: 13px; padding-top: 4px; color: var(--ink-muted); }
    .title:focus, .desc:focus { outline: none; }
    .tip { margin: 4px 12px 0; font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .tip code { font-size: 11px; background: var(--surface-sunken); padding: 0 4px; border-radius: var(--radius-sm); }
    .fields { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }
    .chip {
      display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 8px;
      border: 1px solid var(--border); border-radius: var(--radius-md); font-size: 13px; color: var(--ink-muted);
      background: transparent; cursor: pointer; max-width: 220px; white-space: nowrap; overflow: hidden;
    }
    .chip:hover { background: var(--surface-hover); }
    .chip.today { color: var(--date-today); } .chip.tomorrow { color: var(--date-tomorrow); }
    .chip.week { color: var(--date-week); } .chip.overdue { color: var(--date-overdue); }
    .chip.p1, .flag.p1 { color: var(--priority-1); } .chip.p2, .flag.p2 { color: var(--priority-2); }
    .chip.p3, .flag.p3 { color: var(--priority-3); }
    .flag { display: inline-flex; color: var(--priority-4); }
    .labels { display: flex; flex-direction: column; max-height: 260px; overflow-y: auto; }
    .lfind { margin: 2px 2px 4px; height: 30px; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0 8px; background: var(--surface); font-size: 13px; }
    .err { margin: 0 12px 8px; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--border); flex-wrap: wrap; }
    .proj { height: 32px; border: 0; background: var(--surface-sunken); border-radius: var(--radius-md); padding: 0 8px; font-size: 13px; max-width: 200px; }
    .grow { flex: 1; }
    .cdot { width: 9px; height: 9px; border-radius: 2px; flex: none; }
    .chip.set { color: var(--ink); }
    .chip.dl input { border: 0; background: transparent; font-size: 12px; color: inherit; width: 170px; }
    .chip.dl input:focus { outline: none; }
    .chip.dl:focus-within { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
    .pad-s { padding: 6px 10px; display: block; }
  `,
})
export class TaskEditor implements OnInit {
  private api = inject(Api);
  private auth = inject(Auth);
  protected store = inject(Store);

  /** The task being edited; empty for a new one. */
  readonly task = input<Task | null>(null);
  readonly defaultProjectId = input<number | null>(null);
  readonly defaultDueDate = input<string | null>(null);
  /** Set to add a sub-task. */
  readonly parentId = input<number | null>(null);
  readonly saved = output<Task>();
  readonly cancelled = output<void>();

  private titleInput = viewChild.required<ElementRef<HTMLInputElement>>('titleInput');

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly due = signal<Due>(NO_DUE);
  /** Once the date picker is used, its value wins over dates typed in the name. */
  protected readonly dueTouched = signal(false);
  protected readonly priority = signal<Priority | null>(null);
  protected readonly projectId = signal<number | null>(null);
  protected readonly labels = signal<string[]>([]);
  /** 0 means "unassigned". */
  protected readonly assigneeId = signal<number | null>(null);
  protected readonly categoryId = signal<number | null>(null);
  /** Local date-time from the input, e.g. "2026-10-21T17:00"; empty for none. */
  protected readonly deadline = signal('');
  protected readonly category = computed(() => (this.categoryId() ? this.store.category(this.categoryId()!) ?? null : null));
  protected readonly members = signal<Member[]>([]);
  protected readonly pickingDate = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** Shortcuts typed in the name only apply to new tasks. */
  protected readonly parsed = computed(() =>
    this.task() ? { title: this.title().trim(), labels: [] as string[] } as ReturnType<typeof parseQuickAdd>
      : parseQuickAdd(this.title(), this.store.writableProjects().filter((p) => !p.inbox), this.auth.user()?.weekStart));

  protected readonly effectiveDue = computed<Due>(() => {
    const p = this.parsed();
    if (this.dueTouched() || (!p.dueDate && !p.recurrence)) return this.due();
    return { date: p.dueDate ?? null, time: p.dueTime ?? null, duration: null, recurrence: p.recurrence ?? null };
  });
  protected readonly effectivePriority = computed<Priority>(() => this.parsed().priority ?? this.priority() ?? 4);
  protected readonly effectiveProject = computed(
    () => this.parsed().projectId ?? this.projectId() ?? this.store.inbox()?.id ?? null);
  protected readonly effectiveLabels = computed(() => {
    const out = [...this.labels()];
    for (const l of this.parsed().labels) if (!out.some((x) => x.toLowerCase() === l.toLowerCase())) out.push(l);
    return out;
  });
  protected readonly assignee = computed(() => this.members().find((m) => m.userId === this.assigneeId()) ?? null);

  protected readonly dueTone = computed(() => {
    const d = this.effectiveDue();
    return d.date ? dueChip(d.date, d.time).tone : null;
  });
  protected readonly dueLabel = computed(() => {
    const d = this.effectiveDue();
    if (!d.date) return 'Date';
    let s = dueChip(d.date, d.time, this.auth.user()?.timeFormat).label;
    if (d.duration) s += ` · ${formatDuration(d.duration)}`;
    return s;
  });
  protected readonly labelSummary = computed(() => {
    const ls = this.effectiveLabels();
    return ls.length === 0 ? 'Labels' : ls.length === 1 ? ls[0] : `${ls[0]} +${ls.length - 1}`;
  });
  protected readonly labelChoices = computed(() => {
    const q = this.labelQueryValue().toLowerCase();
    const names = new Set([...this.store.labels().map((l) => l.name), ...this.effectiveLabels()]);
    return [...names].filter((n) => n.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b));
  });
  protected readonly labelQueryValue = signal('');

  constructor() {
    // Members of the chosen project, for the assignee picker.
    effect(() => {
      const pid = this.parentId() ? this.task()?.projectId ?? this.defaultProjectId() : this.effectiveProject();
      if (!pid) return this.members.set([]);
      this.store.members(pid).subscribe((ms) => {
        this.members.set(ms);
        if (this.assigneeId() && !ms.some((m) => m.userId === this.assigneeId())) this.assigneeId.set(null);
      });
    });
  }

  ngOnInit(): void {
    const t = this.task();
    if (t) {
      this.title.set(t.title);
      this.description.set(t.description ?? '');
      this.due.set(dueOf(t));
      this.dueTouched.set(true);
      this.priority.set(t.priority);
      this.projectId.set(t.projectId);
      this.labels.set(t.labels.map((l) => l.name));
      this.assigneeId.set(t.assignee?.id ?? null);
      this.categoryId.set(t.category?.id ?? null);
      this.deadline.set(t.deadline ? toLocalInput(t.deadline) : '');
    } else {
      this.due.set({ ...NO_DUE, date: this.defaultDueDate() });
      this.projectId.set(this.defaultProjectId());
    }
    if (!this.store.labels().length) this.store.loadLabels();
    queueMicrotask(() => this.titleInput().nativeElement.focus());
  }

  protected color = avatarColor;

  protected setProject(id: number): void {
    this.projectId.set(id);
    // A project picked by hand beats a #project typed in the name: drop the typed one.
    const p = this.parsed();
    if (p.projectId && p.projectId !== id) {
      const name = this.store.project(p.projectId)?.name ?? '';
      this.title.update((t) => t.replace(new RegExp(`\\s?#${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), ''));
    }
  }

  protected toggleLabel(name: string): void {
    const has = this.effectiveLabels().some((l) => l.toLowerCase() === name.toLowerCase());
    if (has) {
      this.labels.update((ls) => ls.filter((l) => l.toLowerCase() !== name.toLowerCase()));
      this.title.update((t) => t.replace(new RegExp(`\\s?@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i'), ''));
    } else {
      this.labels.update((ls) => [...ls, name]);
    }
  }

  protected cleanLabel(s: string): string {
    return s.trim().replace(/^@/, '').replace(/[\s@#]+/g, '-');
  }

  protected labelExists(): boolean {
    const q = this.cleanLabel(this.labelQueryValue()).toLowerCase();
    return this.labelChoices().some((l) => l.toLowerCase() === q);
  }

  protected addTypedLabel(e?: Event): void {
    e?.preventDefault();
    const name = this.cleanLabel(this.labelQueryValue());
    if (!name) return;
    if (!this.effectiveLabels().some((l) => l.toLowerCase() === name.toLowerCase())) this.labels.update((ls) => [...ls, name]);
    this.labelQueryValue.set('');
  }

  protected save(): void {
    const p = this.parsed();
    if (!p.title || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const t = this.task();
    const due = this.effectiveDue();
    const assignee = this.assigneeId();
    const req = t
      ? this.api.updateTask(t.id, {
          title: p.title,
          description: this.description(),
          priority: this.effectivePriority(),
          ...dueChanges(due),
          ...(this.effectiveProject() && this.effectiveProject() !== t.projectId ? { projectId: this.effectiveProject()! } : {}),
          labels: this.effectiveLabels(),
          ...(assignee ? { assigneeId: assignee } : { clearAssignee: true }),
          // Only when changed: the task may carry a collaborator's category, which you can't set yourself.
          ...(this.categoryId() === (t.category?.id ?? null) ? {}
            : this.categoryId() ? { categoryId: this.categoryId()! } : { clearCategory: true }),
          ...(this.deadline() ? { deadline: new Date(this.deadline()).toISOString() } : t.deadline ? { clearDeadline: true } : {}),
        })
      : this.api.createTask({
          title: p.title,
          description: this.description() || null,
          priority: this.effectivePriority(),
          dueDate: due.date,
          dueTime: due.time,
          durationMinutes: due.duration,
          recurrence: due.recurrence,
          projectId: this.parentId() ? null : this.effectiveProject(),
          parentId: this.parentId(),
          labels: this.effectiveLabels(),
          assigneeId: assignee || null,
          categoryId: this.categoryId(),
          deadline: this.deadline() ? new Date(this.deadline()).toISOString() : null,
        });
    req.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.store.tasksChanged();
        if (!t) {
          this.store.toast(this.parentId() ? 'Sub-task added' : 'Task added');
          // Stay open for the next one, like Todoist.
          this.title.set('');
          this.description.set('');
          this.labels.set([]);
          this.deadline.set('');
          this.dueTouched.set(false);
          this.due.set({ ...NO_DUE, date: this.defaultDueDate() });
          this.titleInput().nativeElement.focus();
        }
        this.saved.emit(saved);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}

/** An ISO instant as the value a datetime-local input expects, in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
