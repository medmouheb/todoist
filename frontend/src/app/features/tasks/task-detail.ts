import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { dueChip, formatDuration, timeAgo } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Comment, HistoryEntry, Member, Priority, Task } from '../../core/models';
import { Store } from '../../core/store';
import { TaskActions, dueOf } from '../../core/task-actions';
import { DatePicker } from '../../shared/date-picker';
import { Dropdown, avatarColor } from '../../shared/dropdown';
import { TaskEditor, toLocalInput } from './task-editor';
import { TaskRow } from './task-row';

/** The full view of one task: every field, its sub-tasks and its comments. */
@Component({
  selector: 'app-task-detail',
  imports: [FormsModule, Icon, TaskRow, TaskEditor, DatePicker, Dropdown, CdkDropList, CdkDrag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail.html',
  styleUrl: './task-detail.css',
})
export class TaskDetail {
  private api = inject(Api);
  private auth = inject(Auth);
  protected store = inject(Store);
  protected actions = inject(TaskActions);

  protected readonly task = signal<Task | null>(null);
  protected readonly parent = signal<Task | null>(null);
  protected readonly subtasks = signal<Task[]>([]);
  protected readonly comments = signal<Comment[]>([]);
  protected readonly members = signal<Member[]>([]);
  protected readonly history = signal<HistoryEntry[]>([]);
  protected readonly historyNext = signal<number | null>(null);
  protected readonly error = signal('');
  protected readonly addingSub = signal(false);
  protected readonly picking = signal(false);
  protected readonly posting = signal(false);
  protected title = '';
  protected description = '';
  protected commentText = '';
  private dateBtn = viewChild<ElementRef<HTMLElement>>('dateBtn');

  protected readonly project = computed(() => {
    const t = this.task();
    return t ? this.store.project(t.projectId) : undefined;
  });
  protected readonly canEdit = computed(() => this.project()?.role !== 'GUEST' && !this.project()?.archived);
  protected readonly canComplete = computed(() =>
    this.canEdit() || this.task()?.assignee?.id === this.auth.user()?.id);
  protected readonly me = computed(() => this.auth.user());
  protected readonly dueText = computed(() => {
    const t = this.task();
    if (!t?.dueDate) return 'No date';
    let s = dueChip(t.dueDate, t.dueTime, this.auth.user()?.timeFormat).label;
    if (t.durationMinutes) s += ` · ${formatDuration(t.durationMinutes)}`;
    return s;
  });
  protected readonly dueTone = computed(() => {
    const t = this.task();
    return t?.dueDate ? dueChip(t.dueDate, t.dueTime).tone : '';
  });
  protected readonly mentionHint = computed(() =>
    this.members().filter((m) => m.userId !== this.me()?.id).map((m) => '@' + m.name.split(/\s+/)[0]).join(', '));

  constructor() {
    // Load whenever another task is opened, or something changes while it's open.
    effect(() => {
      const id = this.store.openTaskId();
      this.store.tasksVersion();
      untracked(() => (id ? this.load(id) : this.reset()));
    });
  }

  private loadedId: number | null = null;

  private load(id: number): void {
    const fresh = id !== this.loadedId;
    this.loadedId = id;
    if (fresh) {
      this.reset();
      this.loadedId = id;
    }
    this.api.task(id).subscribe({
      next: (t) => {
        if (this.loadedId !== id) return;
        this.task.set(t);
        if (fresh || document.activeElement?.closest('.detail .ttl') == null) this.title = t.title;
        if (fresh || document.activeElement?.closest('.detail .desc') == null) this.description = t.description ?? '';
        if (t.parentId) this.api.task(t.parentId).subscribe({ next: (p) => this.parent.set(p), error: () => this.parent.set(null) });
        else this.parent.set(null);
        this.store.members(t.projectId).subscribe((ms) => this.members.set(ms));
      },
      error: (err) => {
        this.error.set(errorMessage(err, 'This task no longer exists or you don’t have access to it.'));
        this.task.set(null);
      },
    });
    this.api.subtasks(id).subscribe((s) => this.loadedId === id && this.subtasks.set(s));
    this.api.comments(id).subscribe((c) => this.loadedId === id && this.comments.set(c));
    this.loadHistory(false);
  }

  private reset(): void {
    this.loadedId = null;
    this.sentTitle = null;
    this.sentDescription = null;
    this.task.set(null);
    this.parent.set(null);
    this.subtasks.set([]);
    this.comments.set([]);
    this.history.set([]);
    this.historyNext.set(null);
    this.error.set('');
    this.addingSub.set(false);
    this.commentText = '';
  }

  protected color = avatarColor;
  protected ago = timeAgo;

  protected close(): void {
    this.store.openTaskId.set(null);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    // Esc closes the innermost thing first: a date picker, menu, editor or confirm, then the panel.
    if (document.querySelector('app-date-picker, .ctx, .menu, [role="alertdialog"]')) return;
    if (this.store.openTaskId() && !this.picking()) this.close();
  }

  /** What was last sent, so Enter followed by blur doesn't save (and log) the same change twice. */
  private sentTitle: string | null = null;
  private sentDescription: string | null = null;

  protected saveTitle(): void {
    const t = this.task();
    const title = this.title.trim();
    if (!t || !title || title === t.title) return void (this.title = t?.title ?? '');
    if (title === this.sentTitle) return;
    this.sentTitle = title;
    this.actions.update(t.id, { title });
  }

  protected saveDescription(): void {
    const t = this.task();
    const description = this.description.trim();
    if (!t || description === (t.description ?? '') || description === this.sentDescription) return;
    this.sentDescription = description;
    this.actions.update(t.id, { description: this.description });
  }

  protected due() {
    return dueOf(this.task()!);
  }

  protected anchor(): HTMLElement | null {
    return this.dateBtn()?.nativeElement ?? null;
  }

  protected setPriority(p: Priority): void {
    const t = this.task();
    if (t) this.actions.setPriority(t, p);
  }

  protected hasLabel(name: string): boolean {
    return !!this.task()?.labels.some((l) => l.name === name);
  }

  protected toggleLabel(name: string): void {
    const t = this.task();
    if (!t) return;
    const names = t.labels.map((l) => l.name);
    const next = names.includes(name) ? names.filter((n) => n !== name) : [...names, name];
    this.actions.update(t.id, { labels: next });
  }

  // ---- deadline and category ----

  protected deadlineInput(): string {
    const d = this.task()?.deadline;
    return d ? toLocalInput(d) : '';
  }

  protected deadlineMissed(): boolean {
    const d = this.task()?.deadline;
    return !!d && new Date(d).getTime() < Date.now() && !this.task()!.completed;
  }

  protected setDeadline(local: string): void {
    const t = this.task();
    if (!t) return;
    this.actions.update(t.id, local ? { deadline: new Date(local).toISOString() } : { clearDeadline: true });
  }

  protected setCategory(id: number | null): void {
    const t = this.task();
    if (!t || id === (t.category?.id ?? null)) return;
    this.actions.update(t.id, id ? { categoryId: id } : { clearCategory: true });
  }

  // ---- sub-task order ----

  protected reorderSubtasks(e: CdkDragDrop<Task[]>): void {
    if (e.previousIndex === e.currentIndex) return;
    const list = [...this.subtasks()];
    moveItemInArray(list, e.previousIndex, e.currentIndex);
    this.subtasks.set(list);
    const open = list.filter((s) => !s.completed).map((s) => s.id);
    if (open.length > 1) {
      this.api.reorderTasks(open).subscribe({
        error: (err) => {
          this.store.toast(errorMessage(err));
          this.store.tasksChanged();
        },
      });
    }
  }

  // ---- history ----

  protected loadHistory(more: boolean): void {
    const id = this.loadedId;
    if (!id) return;
    this.api.history({ taskId: id, before: more ? this.historyNext() : null, limit: 15 }).subscribe((page) => {
      if (this.loadedId !== id) return;
      this.history.set(more ? [...this.history(), ...page.items] : page.items);
      this.historyNext.set(page.nextBefore);
    });
  }

  protected verb(action: string): string {
    return HISTORY_VERBS[action] ?? action.toLowerCase().replace(/_/g, ' ');
  }

  protected changeList(h: HistoryEntry): { field: string; before: string | null; after: string | null }[] {
    return Object.entries(h.changes ?? {}).map(([field, [before, after]]) => ({
      field, before: formatValue(field, before), after: formatValue(field, after),
    }));
  }

  protected assign(userId: number | null): void {
    const t = this.task();
    if (!t) return;
    this.actions.update(t.id, userId ? { assigneeId: userId } : { clearAssignee: true });
  }

  protected postComment(): void {
    const t = this.task();
    const body = this.commentText.trim();
    if (!t || !body || this.posting()) return;
    this.posting.set(true);
    this.api.addComment(t.id, body).subscribe({
      next: (c) => {
        this.posting.set(false);
        this.commentText = '';
        this.comments.update((cs) => [...cs, c]);
        this.store.tasksChanged();
      },
      error: (err) => {
        this.posting.set(false);
        this.store.toast(errorMessage(err));
      },
    });
  }

  protected async deleteComment(c: Comment): Promise<void> {
    if (!(await this.store.confirm({ title: 'Delete comment?', message: 'This comment will be deleted for everyone.' }))) return;
    this.api.deleteComment(c.id).subscribe(() => {
      this.comments.update((cs) => cs.filter((x) => x.id !== c.id));
      this.store.tasksChanged();
    });
  }

  /** Splits a comment into text and @mention parts so mentions can be highlighted. */
  protected parts(body: string): { text: string; mention: boolean }[] {
    return body.split(/(@[\w.]+)/g).filter(Boolean).map((text) => ({ text, mention: text.startsWith('@') }));
  }
}

/** How each history action reads after the person's name. */
export const HISTORY_VERBS: Record<string, string> = {
  CREATED: 'added this task', UPDATED: 'changed', COMPLETED: 'completed it', REOPENED: 'reopened it',
  MOVED: 'moved it', REORDERED: 'reordered the sub-tasks', DELETED: 'deleted it', RESTORED: 'restored it',
  COMMENTED: 'commented', PROJECT_CREATED: 'created the project', PROJECT_UPDATED: 'changed the project',
  PROJECT_ARCHIVED: 'archived the project', PROJECT_UNARCHIVED: 'unarchived the project',
  MEMBER_JOINED: 'joined', MEMBER_LEFT: 'left', MEMBER_REMOVED: 'removed', ROLE_CHANGED: 'changed the role of',
  IMPORTED: 'imported tasks',
};

/** History values are stored as text; deadlines are instants and read better in local time. */
export function formatValue(field: string, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (field === 'deadline' && typeof v === 'string') return new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return String(v);
}
