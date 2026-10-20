import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { Api } from './api';
import { AppNotification, Category, LabelRef, Member, Project } from './models';

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
  /** Optional "Open" action, e.g. for a live notification about a task. */
  open?: () => void;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

/** App-wide state shared by the sidebar, dialogs and task views. */
@Injectable({ providedIn: 'root' })
export class Store {
  private api = inject(Api);
  private toastSeq = 0;
  private membersCache = new Map<number, Member[]>();

  readonly projects = signal<Project[]>([]);
  readonly inbox = computed(() => this.projects().find((p) => p.inbox) ?? null);
  readonly activeProjects = computed(() => this.projects().filter((p) => !p.inbox && !p.archived));
  readonly archivedProjects = computed(() => this.projects().filter((p) => p.archived));
  readonly favorites = computed(() => this.activeProjects().filter((p) => p.favorite));
  /** Projects a task can be added to or moved into. */
  readonly writableProjects = computed(() => this.projects().filter((p) => !p.archived && p.role !== 'GUEST'));
  readonly labels = signal<LabelRef[]>([]);
  readonly categories = signal<Category[]>([]);

  readonly notifications = signal<AppNotification[]>([]);
  readonly unread = signal(0);

  /** Bumped after any task change so open views reload. */
  readonly tasksVersion = signal(0);
  readonly toasts = signal<Toast[]>([]);
  readonly confirmRequest = signal<ConfirmRequest | null>(null);

  // Dialogs and panels opened from anywhere.
  readonly openTaskId = signal<number | null>(null);
  readonly quickAdd = signal(false);
  readonly shareProjectId = signal<number | null>(null);
  /** The project being edited in the project dialog, or 'new'. */
  readonly editingProject = signal<Project | 'new' | null>(null);
  readonly settingsOpen = signal(false);
  readonly shortcutsOpen = signal(false);
  /** The category being edited in the category dialog, or 'new'. */
  readonly editingCategory = signal<Category | 'new' | null>(null);

  loadProjects(): void {
    this.api.projects().subscribe((ps) => this.projects.set(ps));
  }

  loadLabels(): void {
    this.api.labels().subscribe((ls) => this.labels.set(ls));
  }

  loadCategories(): void {
    this.api.categories().subscribe((cs) => this.categories.set(cs));
  }

  category(id: number): Category | undefined {
    return this.categories().find((c) => c.id === id);
  }

  /** Notifications already shown as a toast ("id:message", so a merged update can show again). */
  private toasted = new Set<string>();

  /** Shows a notification as a toast once, with an Open action for task-related ones. */
  toastNotification(n: { id: number; message: string; taskId: number | null }): void {
    const key = n.id + ':' + n.message;
    if (this.toasted.has(key)) return;
    this.toasted.add(key);
    this.toast(n.message, undefined, n.taskId ? () => this.openTaskId.set(n.taskId) : undefined);
  }

  /**
   * After the live connection (re)opens: refresh the bell, and toast the newest unread notification
   * from the last 2 minutes, which may have been pushed while the connection was down.
   */
  catchUp(): void {
    this.api.notifications().subscribe((n) => {
      if (n.unread > this.unread()) this.loadProjects();
      this.notifications.set(n.items);
      this.unread.set(n.unread);
      const recent = n.items.find((x) => !x.read && x.type !== 'INVITE' && Date.now() - new Date(x.createdAt).getTime() < 120_000);
      if (recent) this.toastNotification(recent);
    });
  }

  loadNotifications(): void {
    this.api.notifications().subscribe((n) => {
      // New invites or shares can change which projects exist.
      if (n.unread > this.unread()) this.loadProjects();
      this.notifications.set(n.items);
      this.unread.set(n.unread);
    });
  }

  project(id: number): Project | undefined {
    return this.projects().find((p) => p.id === id);
  }

  /** Members of a project, cached; only fetched for shared projects. */
  members(projectId: number): Observable<Member[]> {
    const p = this.project(projectId);
    if (!p || p.memberCount < 2) return of([]);
    const hit = this.membersCache.get(projectId);
    if (hit) return of(hit);
    return this.api.sharing(projectId).pipe(
      map((s) => s.members),
      tap((ms) => this.membersCache.set(projectId, ms)),
    );
  }

  forgetMembers(projectId: number): void {
    this.membersCache.delete(projectId);
  }

  tasksChanged(): void {
    this.tasksVersion.update((v) => v + 1);
    this.loadProjects();
    this.loadLabels();
  }

  toast(message: string, undo?: () => void, open?: () => void): void {
    const t: Toast = { id: ++this.toastSeq, message, undo, open };
    this.toasts.set([t]); // one at a time, newest wins
    setTimeout(() => this.dismiss(t.id), undo || open ? 7000 : 4000);
  }

  dismiss(id: number): void {
    this.toasts.update((ts) => ts.filter((t) => t.id !== id));
  }

  /** Shows the confirm dialog; resolves true if the person confirms. */
  confirm(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
    return new Promise((resolve) =>
      this.confirmRequest.set({
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Delete',
        danger: opts.danger ?? true,
        resolve: (ok) => {
          this.confirmRequest.set(null);
          resolve(ok);
        },
      }));
  }
}
