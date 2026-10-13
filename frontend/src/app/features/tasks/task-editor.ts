import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { dueChip } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Priority, Task } from '../../core/models';
import { parseQuickAdd } from '../../core/quick-add';
import { Store } from '../../core/store';

/** Add-task and edit-task form. Typing "tomorrow p1 #Home" in the title fills the fields. */
@Component({
  selector: 'app-task-editor',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="editor" (ngSubmit)="save()" (keydown.escape)="cancelled.emit()">
      <input #titleInput class="title" name="title" placeholder="Task name" autocomplete="off"
             [ngModel]="title()" (ngModelChange)="title.set($event)" aria-label="Task name" />
      <textarea class="desc" name="desc" rows="1" placeholder="Description" aria-label="Description"
                [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea>

      @if (!task()) {
        <p class="hint muted">Tip: type <code>tomorrow</code>, <code>p1</code> or <code>#Project</code> in the name.</p>
      }

      <div class="fields">
        <label class="chip" [class]="'chip ' + (dueTone() ?? '')">
          <app-icon name="calendar" [small]="true" />
          <span class="sr-only">Due date</span>
          <input type="date" name="due" [ngModel]="effectiveDue() ?? ''" (ngModelChange)="due.set($event || null)" />
        </label>
        <label class="chip">
          <app-icon name="flag" [small]="true" />
          <span class="sr-only">Priority</span>
          <select name="prio" [ngModel]="effectivePriority()" (ngModelChange)="priority.set($event)">
            @for (p of [1, 2, 3, 4]; track p) { <option [ngValue]="p">Priority {{ p }}</option> }
          </select>
        </label>
      </div>

      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

      <div class="bar">
        <select class="proj" name="project" aria-label="Project"
                [ngModel]="effectiveProject()" (ngModelChange)="projectId.set($event)">
          @for (p of store.projects(); track p.id) { <option [ngValue]="p.id">{{ p.inbox ? 'Inbox' : '# ' + p.name }}</option> }
        </select>
        <span class="grow"></span>
        <button class="btn" type="button" (click)="cancelled.emit()">Cancel</button>
        <button class="btn primary" type="submit" [disabled]="!parsed().title || busy()">{{ task() ? 'Save' : 'Add task' }}</button>
      </div>
    </form>
  `,
  styles: `
    .editor { border: 1px solid var(--border-strong); border-radius: var(--radius-lg); background: var(--surface); }
    :host-context(.modal) .editor { border: 0; }
    .title, .desc { display: block; width: 100%; border: 0; background: transparent; padding: 10px 12px 0; resize: none; }
    .title { font-weight: 600; font-size: 15px; }
    .desc { font-size: 13px; padding-top: 4px; color: var(--ink-muted); }
    .title:focus, .desc:focus { outline: none; }
    .hint { margin: 4px 12px 0; font-size: 12px; }
    .hint code { font-size: 11px; background: var(--surface-sunken); padding: 0 4px; border-radius: var(--radius-sm); }
    .fields { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 6px 0 8px;
      border: 1px solid var(--border); border-radius: var(--radius-md); font-size: 13px; color: var(--ink-muted);
    }
    .chip input, .chip select { border: 0; background: transparent; font-size: 13px; color: inherit; height: 26px; }
    .chip input:focus, .chip select:focus { outline: none; }
    .chip:focus-within { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
    .chip.today { color: var(--date-today); } .chip.tomorrow { color: var(--date-tomorrow); }
    .chip.week { color: var(--date-week); } .chip.overdue { color: var(--date-overdue); }
    .err { margin: 0 12px 8px; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--border); flex-wrap: wrap; }
    .proj { height: 32px; border: 0; background: var(--surface-sunken); border-radius: var(--radius-md); padding: 0 8px; font-size: 13px; max-width: 200px; }
    .grow { flex: 1; }
  `,
})
export class TaskEditor implements OnInit {
  private api = inject(Api);
  protected store = inject(Store);

  /** The task being edited; empty for a new one. */
  readonly task = input<Task | null>(null);
  readonly defaultProjectId = input<number | null>(null);
  readonly defaultDueDate = input<string | null>(null);
  readonly saved = output<Task>();
  readonly cancelled = output<void>();

  private titleInput = viewChild.required<ElementRef<HTMLInputElement>>('titleInput');

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly due = signal<string | null>(null);
  protected readonly priority = signal<Priority | null>(null);
  protected readonly projectId = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** Shortcuts typed in the title only apply to new tasks. */
  protected readonly parsed = computed(() =>
    this.task() ? { title: this.title().trim() } as ReturnType<typeof parseQuickAdd>
      : parseQuickAdd(this.title(), this.store.userProjects()));

  protected readonly effectiveDue = computed(() => this.parsed().dueDate ?? this.due());
  protected readonly effectivePriority = computed<Priority>(() => this.parsed().priority ?? this.priority() ?? 4);
  protected readonly effectiveProject = computed(
    () => this.parsed().projectId ?? this.projectId() ?? this.store.inbox()?.id ?? null);
  protected readonly dueTone = computed(() => {
    const d = this.effectiveDue();
    return d ? dueChip(d).tone : null;
  });

  ngOnInit(): void {
    const t = this.task();
    if (t) {
      this.title.set(t.title);
      this.description.set(t.description ?? '');
      this.due.set(t.dueDate);
      this.priority.set(t.priority);
      this.projectId.set(t.projectId);
    } else {
      this.due.set(this.defaultDueDate());
      this.projectId.set(this.defaultProjectId());
    }
    queueMicrotask(() => this.titleInput().nativeElement.focus());
  }

  protected save(): void {
    const p = this.parsed();
    if (!p.title || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const t = this.task();
    const due = this.effectiveDue();
    const req = t
      ? this.api.updateTask(t.id, {
          title: p.title,
          description: this.description(),
          priority: this.effectivePriority(),
          ...(due ? { dueDate: due } : { clearDueDate: true }),
          projectId: this.effectiveProject() ?? undefined,
        })
      : this.api.createTask({
          title: p.title,
          description: this.description() || null,
          priority: this.effectivePriority(),
          dueDate: due,
          projectId: this.effectiveProject(),
        });
    req.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.store.tasksChanged();
        if (!t) this.store.toast('Task added');
        this.saved.emit(saved);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
