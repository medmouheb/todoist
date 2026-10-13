import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { dueChip, formatDuration, timeAgo } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Comment, Member, Priority, Task } from '../../core/models';
import { Store } from '../../core/store';
import { TaskActions, dueOf } from '../../core/task-actions';
import { DatePicker } from '../../shared/date-picker';
import { Dropdown, avatarColor } from '../../shared/dropdown';
import { TaskEditor } from './task-editor';
import { TaskRow } from './task-row';

/** The full view of one task: every field, its sub-tasks and its comments. */
@Component({
  selector: 'app-task-detail',
  imports: [FormsModule, Icon, TaskRow, TaskEditor, DatePicker, Dropdown],
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
  }

  private reset(): void {
    this.loadedId = null;
    this.task.set(null);
    this.parent.set(null);
    this.subtasks.set([]);
    this.comments.set([]);
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

  protected saveTitle(): void {
    const t = this.task();
    const title = this.title.trim();
    if (!t || !title || title === t.title) return void (this.title = t?.title ?? '');
    this.actions.update(t.id, { title });
  }

  protected saveDescription(): void {
    const t = this.task();
    if (!t || this.description.trim() === (t.description ?? '')) return;
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
