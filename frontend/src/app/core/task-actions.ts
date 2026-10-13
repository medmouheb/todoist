import { Injectable, inject } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Api, errorMessage } from './api';
import { Auth } from './auth';
import { dueChip } from './dates';
import { Due, Priority, Task, TaskChanges } from './models';
import { Store } from './store';

/** Every change people make to tasks, each with a toast and, where it makes sense, Undo. */
@Injectable({ providedIn: 'root' })
export class TaskActions {
  private api = inject(Api);
  private store = inject(Store);
  private auth = inject(Auth);

  toggleComplete(t: Task): void {
    const completed = !t.completed;
    this.api.updateTask(t.id, { completed }).subscribe({
      next: (after) => {
        this.store.tasksChanged();
        if (!completed) return this.store.toast('Task reopened');
        if (!after.completed && after.dueDate !== t.dueDate) {
          // A repeating task moved to its next date.
          this.store.toast(`Done. Next: ${this.label(after)}`, () => this.restoreDue(t));
        } else {
          this.store.toast('1 task completed', () => this.update(t.id, { completed: false }));
        }
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  async remove(t: Task): Promise<void> {
    const subs = t.subtaskCount ? ` and its ${t.subtaskCount} sub-task${t.subtaskCount > 1 ? 's' : ''}` : '';
    const ok = await this.store.confirm({
      title: 'Delete task?',
      message: `“${t.title}”${subs} will be deleted.`,
    });
    if (!ok) return;
    this.api.deleteTask(t.id).subscribe({
      next: () => {
        if (this.store.openTaskId() === t.id) this.store.openTaskId.set(null);
        this.store.tasksChanged();
        this.store.toast('Task deleted', () =>
          this.api.restoreTask(t.id).subscribe(() => this.store.tasksChanged()));
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  /** Move tasks to another day, keeping each one's own time, duration and repeat (drag and drop, Reschedule). */
  moveToDate(tasks: Task[], date: string | null): void {
    this.reschedule(tasks, { date, time: null, duration: null, recurrence: null }, true);
  }

  /** Reschedule one or many tasks; Undo puts every one back where it was. */
  reschedule(tasks: Task[], due: Due, keepOwnTime = false): void {
    if (!tasks.length) return;
    const dueFor = (t: Task): Due => (keepOwnTime && due.date ? { ...dueOf(t), date: due.date } : due);
    forkJoin(tasks.map((t) => this.api.updateTask(t.id, dueChanges(dueFor(t))))).subscribe({
      next: () => {
        this.store.tasksChanged();
        const what = tasks.length === 1 ? 'Task' : `${tasks.length} tasks`;
        const where = due.date ? `to ${dueChip(due.date, due.time, this.auth.user()?.timeFormat).label}` : 'to no date';
        this.store.toast(`${what} rescheduled ${where}`, () =>
          forkJoin(tasks.map((t) => this.restoreDue(t, false))).subscribe(() => this.store.tasksChanged()));
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  move(t: Task, projectId: number): void {
    if (projectId === t.projectId) return;
    const name = this.store.project(projectId)?.name ?? 'project';
    this.api.updateTask(t.id, { projectId }).subscribe({
      next: () => {
        this.store.tasksChanged();
        this.store.toast(`Moved to ${this.store.project(projectId)?.inbox ? 'Inbox' : name}`,
          () => this.update(t.id, { projectId: t.projectId }));
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  setPriority(t: Task, priority: Priority): void {
    if (priority === t.priority) return;
    this.update(t.id, { priority });
  }

  update(id: number, changes: TaskChanges): void {
    this.api.updateTask(id, changes).subscribe({
      next: () => this.store.tasksChanged(),
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  private restoreDue(t: Task, subscribe = true) {
    const req = this.api.updateTask(t.id, dueChanges({
      date: t.dueDate, time: t.dueTime?.slice(0, 5) ?? null, duration: t.durationMinutes, recurrence: t.recurrence,
    }));
    if (subscribe) req.subscribe(() => this.store.tasksChanged());
    return req;
  }

  private label(t: Task): string {
    return t.dueDate ? dueChip(t.dueDate, t.dueTime, this.auth.user()?.timeFormat).label : 'no date';
  }
}

/** The PATCH body that sets a task's date, time, duration and repeat to exactly `due`. */
export function dueChanges(due: Due): TaskChanges {
  if (!due.date && !due.recurrence) return { clearDueDate: true };
  return {
    ...(due.date ? { dueDate: due.date } : {}),
    ...(due.time ? { dueTime: due.time } : { clearDueTime: true }),
    ...(due.duration ? { durationMinutes: due.duration } : { clearDuration: true }),
    ...(due.recurrence ? { recurrence: due.recurrence } : { clearRecurrence: true }),
  };
}

export function dueOf(t: Task): Due {
  return { date: t.dueDate, time: t.dueTime?.slice(0, 5) ?? null, duration: t.durationMinutes, recurrence: t.recurrence };
}
