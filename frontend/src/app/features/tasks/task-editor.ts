import {
  ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { concatMap, from } from 'rxjs';
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
 * fills in the fields. Pasting or dropping text with several lines adds one task per line.
 */
@Component({
  selector: 'app-task-editor',
  imports: [FormsModule, Icon, DatePicker, Dropdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="editor" [class.over]="dragOver()" (ngSubmit)="save()" (dragover)="onDragOver($event)" (dragleave)="dragOver.set(false)" (drop)="onDrop($event)" (keydown.escape)="$event.stopPropagation(); cancelled.emit()" (keydown.control.enter)="save()" (keydown.meta.enter)="save()">
      @if (bulk() !== null) {
        <div class="bulk">
          <div class="bulk-head">
            <b>{{ bulkLines().length }} {{ parentId() ? 'sub-task' : 'task' }}{{ bulkLines().length === 1 ? '' : 's' }}</b>
            <span class="muted">one per line</span>
            <span class="grow"></span>
            <button type="button" class="btn ghost sm" (click)="leaveBulk()">Back to one task</button>
          </div>
          <textarea #bulkInput class="bulk-text" name="bulk" rows="6" aria-label="Tasks, one per line"
                    [ngModel]="bulk()" (ngModelChange)="bulk.set($event)"></textarea>
          <p class="tip muted">Each line can use <code>tomorrow</code> <code>p1</code> <code>#Project</code> <code>&#64;label</code>. The fields below apply to every task.</p>
        </div>
      } @else {
        <input #titleInput class="title" name="title" [placeholder]="parentId() ? 'Sub-task name' : 'Task name'" autocomplete="off"
               [ngModel]="title()" (ngModelChange)="title.set($event)" (paste)="onPaste($event)" aria-label="Task name" />
        <textarea class="desc" name="desc" rows="1" placeholder="Description" aria-label="Description"
                  [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea>

        @if (!task() && !title()) {
          <p class="tip muted">Try <code>tomorrow 3pm</code> <code>p1</code> <code>#Project</code> <code>&#64;label</code> <code>every monday</code> · paste or drop a list to add many</p>
        }
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
          <button trigger type="button" class="chip" [class.set]="!!categoryId()">
            @if (category(); as c) { <span class="cdot" [style.background]="'var(--proj-' + c.color + ')'"></span>{{ c.name }} }
            @else { <app-icon name="category" [small]="true" />Category }
          </button>
          <button type="button" (click)="categoryId.set(null)"><app-icon name="close" [small]="true" />No category</button>
          @for (o of store.categoryTree(); track o.category.id) {
            @let c = o.category;
            <button type="button" role="menuitemradio" [attr.aria-checked]="categoryId() === c.id" (click)="categoryId.set(c.id)" [style.padding-left.px]="10 + o.depth * 14">
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

      <!-- Hashtag manager: pick one or several, or create a new one -->
      <div class="tags" (click)="tagInput.focus()">
        <app-icon name="tag" [small]="true" class="tags-icon" />
        @for (l of effectiveLabels(); track l) {
          <span class="tag">#{{ l }}<button type="button" class="tag-x" [attr.aria-label]="'Remove #' + l" (click)="$event.stopPropagation(); toggleLabel(l)">×</button></span>
        }
        <span class="tag-field">
          <input #tagInput class="tag-input" name="lq" autocomplete="off" role="combobox" aria-label="Add hashtags"
                 [attr.aria-expanded]="tagsOpen()" aria-controls="tag-suggest"
                 [placeholder]="effectiveLabels().length ? 'Add another' : 'Add hashtags'"
                 [ngModel]="labelQueryValue()" (ngModelChange)="labelQueryValue.set($event); tagsOpen.set(true); tagActive.set(0)"
                 (focus)="tagsOpen.set(true)" (blur)="tagsOpen.set(false)"
                 (keydown.enter)="pickActiveTag($event)" (keydown.arrowdown)="moveTag($event, 1)" (keydown.arrowup)="moveTag($event, -1)"
                 (keydown.backspace)="removeLastTag()" (keydown.escape)="closeTags($event)" />
          @if (tagsOpen() && tagOptions().length) {
            <div class="suggest" id="tag-suggest" role="listbox" aria-label="Hashtags" aria-multiselectable="true">
              @for (o of tagOptions(); track o.name; let i = $index) {
                <button type="button" role="option" class="opt" [class.active]="i === tagActive()" [attr.aria-selected]="o.selected"
                        (mousedown)="$event.preventDefault()" (click)="pickTag(o)">
                  @if (o.create) { <app-icon name="plus" [small]="true" />Create <b>#{{ o.name }}</b> }
                  @else {
                    <span class="box" [class.on]="o.selected">@if (o.selected) { <app-icon name="check" [small]="true" /> }</span>#{{ o.name }}
                  }
                </button>
              }
            </div>
          }
        </span>
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
        <button class="btn primary" type="submit" [disabled]="!canSubmit()">{{ submitLabel() }}</button>
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
    .editor.over { outline: 2px dashed var(--brand); outline-offset: 2px; }
    .bulk { padding: 8px 12px 0; }
    .bulk-head { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 6px; }
    .bulk-text { display: block; width: 100%; resize: vertical; min-height: 96px; max-height: 320px; border: 1px solid var(--border);
      border-radius: var(--radius-md); background: var(--surface); padding: 8px; font: inherit; font-size: 13px; line-height: 1.6; }
    .bulk-text:focus { outline: 2px solid var(--focus-ring); outline-offset: 0; }
    .bulk .tip { margin: 6px 0 0; }
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
    .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 12px 10px; padding: 4px 8px; min-height: 34px;
      border: 1px solid var(--border); border-radius: var(--radius-md); cursor: text; }
    .tags:focus-within { border-color: var(--border-strong); }
    .tags-icon { color: var(--ink-subtle); }
    .tag { display: inline-flex; align-items: center; gap: 2px; height: 24px; padding: 0 4px 0 8px; border-radius: 99px;
      background: var(--brand-tint); color: var(--brand-ink); font-size: 12px; font-weight: 600; }
    .tag-x { border: 0; background: transparent; color: inherit; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 1; }
    .tag-x:hover { background: color-mix(in srgb, var(--brand) 20%, transparent); }
    .tag-field { position: relative; flex: 1; min-width: 120px; }
    .tag-input { width: 100%; height: 24px; border: 0; background: transparent; font-size: 13px; }
    .tag-input:focus { outline: none; }
    .suggest { position: absolute; left: -8px; top: calc(100% + 6px); z-index: 20; min-width: 220px; max-height: 240px; overflow-y: auto;
      display: flex; flex-direction: column; padding: 4px; background: var(--surface); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, .14)); }
    .opt { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px; border: 0; border-radius: var(--radius-sm);
      background: transparent; color: var(--ink); font-size: 13px; text-align: left; cursor: pointer; }
    .opt:hover, .opt.active { background: var(--surface-hover); }
    .box { width: 16px; height: 16px; border: 1.5px solid var(--border-strong); border-radius: 4px; display: grid; place-items: center; flex: none; }
    .box.on { background: var(--brand); border-color: var(--brand); color: var(--on-brand); }
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
  readonly defaultCategoryId = input<number | null>(null);
  /** Set to add a sub-task. */
  readonly parentId = input<number | null>(null);
  /** Text dropped next to the editor: one line fills the name, several lines become one task each. */
  readonly initialText = input<{ text: string } | null>(null);
  readonly saved = output<Task>();
  readonly cancelled = output<void>();

  private titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private bulkInput = viewChild<ElementRef<HTMLTextAreaElement>>('bulkInput');

  /** Several tasks at once, one per line; null when adding a single task. */
  protected readonly bulk = signal<string | null>(null);
  protected readonly bulkLines = computed(() => splitLines(this.bulk() ?? ''));
  protected readonly dragOver = signal(false);

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
  protected readonly labelChoices = computed(() => {
    const q = this.labelQueryValue().toLowerCase();
    const names = new Set([...this.store.labels().map((l) => l.name), ...this.effectiveLabels()]);
    return [...names].filter((n) => n.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b));
  });
  protected readonly labelQueryValue = signal('');

  protected readonly canSubmit = computed(() =>
    !this.busy() && (this.bulk() !== null ? this.bulkLines().length > 0 : !!this.parsed().title));
  protected readonly submitLabel = computed(() => {
    if (this.task()) return 'Save';
    const kind = this.parentId() ? 'sub-task' : 'task';
    if (this.bulk() === null) return `Add ${kind}`;
    const n = this.bulkLines().length;
    return `Add ${n} ${kind}${n === 1 ? '' : 's'}`;
  });

  constructor() {
    effect(() => {
      const dropped = this.initialText();
      if (dropped) untracked(() => this.takeText(dropped.text));
    });
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
      this.categoryId.set(this.defaultCategoryId());
    }
    if (!this.store.labels().length) this.store.loadLabels();
    queueMicrotask(() => this.focus());
  }

  private focus(): void {
    (this.bulkInput() ?? this.titleInput())?.nativeElement.focus();
  }

  // ---- several tasks at once ----

  /** Takes pasted or dropped text: several lines switch to adding one task per line. */
  private takeText(text: string): boolean {
    if (this.task()) return false;
    const lines = splitLines(text);
    if (!lines.length) return false;
    if (lines.length === 1 && this.bulk() === null) {
      if (this.title().trim()) return false;
      this.title.set(lines[0]);
    } else {
      const current = this.bulk() ?? this.title().trim();
      this.bulk.set([current, ...lines].filter(Boolean).join('\n'));
      this.title.set('');
    }
    setTimeout(() => this.focus());
    return true;
  }

  protected onPaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (splitLines(text).length > 1 && this.takeText(text)) e.preventDefault();
  }

  private isTextDrag(e: DragEvent): boolean {
    const types = e.dataTransfer?.types ?? [];
    return !this.task() && types.includes('text/plain') && !types.includes('application/x-doable-task');
  }

  protected onDragOver(e: DragEvent): void {
    if (!this.isTextDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    this.dragOver.set(true);
  }

  protected onDrop(e: DragEvent): void {
    this.dragOver.set(false);
    if (!this.isTextDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    this.takeText(e.dataTransfer?.getData('text/plain') ?? '');
  }

  protected leaveBulk(): void {
    this.title.set(this.bulkLines()[0] ?? '');
    this.bulk.set(null);
    setTimeout(() => this.focus());
  }

  /** Adds every line, in order. A line's own shortcuts (p1, tomorrow, #Project, @label) win over the shared fields. */
  private saveBulk(): void {
    const lines = this.bulkLines();
    if (!lines.length || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const projects = this.store.writableProjects().filter((p) => !p.inbox);
    const weekStart = this.auth.user()?.weekStart;
    const shared = this.due();
    const assignee = this.assigneeId();
    const deadline = this.deadline() ? new Date(this.deadline()).toISOString() : null;
    let added = 0;
    let last: Task | null = null;
    from(lines).pipe(concatMap((line) => {
      const p = parseQuickAdd(line, projects, weekStart);
      const ownDate = !!(p.dueDate || p.recurrence);
      const labels = [...this.labels()];
      for (const l of p.labels) if (!labels.some((x) => x.toLowerCase() === l.toLowerCase())) labels.push(l);
      return this.api.createTask({
        title: p.title || line,
        priority: p.priority ?? this.priority() ?? 4,
        dueDate: ownDate ? p.dueDate ?? null : shared.date,
        dueTime: ownDate ? p.dueTime ?? null : shared.time,
        durationMinutes: ownDate ? null : shared.duration,
        recurrence: ownDate ? p.recurrence ?? null : shared.recurrence,
        projectId: this.parentId() ? null : p.projectId ?? this.projectId() ?? this.store.inbox()?.id ?? null,
        parentId: this.parentId(),
        labels,
        assigneeId: assignee || null,
        categoryId: this.categoryId(),
        deadline,
      });
    })).subscribe({
      next: (t) => {
        added++;
        last = t;
      },
      complete: () => {
        this.busy.set(false);
        this.store.tasksChanged();
        const kind = this.parentId() ? 'sub-task' : 'task';
        this.store.toast(`${added} ${kind}${added === 1 ? '' : 's'} added`);
        this.bulk.set(null);
        this.labels.set([]);
        this.deadline.set('');
        this.dueTouched.set(false);
        this.due.set({ ...NO_DUE, date: this.defaultDueDate() });
        setTimeout(() => this.focus());
        if (last) this.saved.emit(last);
      },
      error: (err) => {
        this.busy.set(false);
        this.store.tasksChanged();
        // Keep the lines that weren't added, so nothing is lost.
        this.bulk.set(lines.slice(added).join('\n'));
        this.error.set(`${added ? `Added ${added}, then stopped: ` : ''}${errorMessage(err)}`);
      },
    });
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
    return s.trim().replace(/^[@#]+/, '').replace(/[\s@#]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // ---- hashtag manager ----

  protected readonly tagsOpen = signal(false);
  protected readonly tagActive = signal(0);
  /** Matching hashtags (picked ones are ticked), plus "Create #…" when the typed one is new. */
  protected readonly tagOptions = computed(() => {
    const picked = this.effectiveLabels().map((l) => l.toLowerCase());
    const out: { name: string; selected: boolean; create: boolean }[] = this.labelChoices()
      .map((name) => ({ name, selected: picked.includes(name.toLowerCase()), create: false }));
    const typed = this.cleanLabel(this.labelQueryValue());
    if (typed && !out.some((o) => o.name.toLowerCase() === typed.toLowerCase())) out.push({ name: typed, selected: false, create: true });
    return out.slice(0, 50);
  });

  protected pickTag(o: { name: string; create: boolean }): void {
    if (o.create) this.labels.update((ls) => [...ls, o.name]);
    else this.toggleLabel(o.name);
    this.labelQueryValue.set('');
    this.tagActive.set(0);
  }

  protected pickActiveTag(e: Event): void {
    const typed = this.cleanLabel(this.labelQueryValue());
    if (!typed) return; // Enter with nothing typed submits the form as usual.
    e.preventDefault();
    // Enter takes the exact match (or creates it); arrows can point at another one.
    const opts = this.tagOptions();
    const exact = opts.find((o) => o.name.toLowerCase() === typed.toLowerCase());
    const o = this.tagActive() > 0 ? opts[this.tagActive()] : exact ?? opts[0];
    if (!o) return;
    if (!o.create && o.selected && o === exact) return this.labelQueryValue.set('');
    this.pickTag(o);
  }

  protected moveTag(e: Event, by: number): void {
    e.preventDefault();
    this.tagsOpen.set(true);
    const n = this.tagOptions().length;
    if (n) this.tagActive.set((this.tagActive() + by + n) % n);
  }

  protected removeLastTag(): void {
    if (this.labelQueryValue()) return;
    const last = this.effectiveLabels().at(-1);
    if (last) this.toggleLabel(last);
  }

  protected closeTags(e: Event): void {
    if (!this.tagsOpen()) return;
    e.stopPropagation();
    this.tagsOpen.set(false);
  }

  protected save(): void {
    if (this.bulk() !== null) return this.saveBulk();
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
          this.focus();
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

/** One task per non-empty line, without list markers such as "- ", "* ", "1. " or "- [ ] ". At most 200. */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*+•]\s+)?(?:\[[ xX]?\]\s+)?(?:\d+[.)]\s+)?/, '').trim())
    .filter(Boolean)
    .slice(0, 200);
}

/** An ISO instant as the value a datetime-local input expects, in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
