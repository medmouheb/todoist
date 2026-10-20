import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { download } from '../../core/download';
import { Icon } from '../../core/icon';
import { Category, Project, Theme } from '../../core/models';
import { Realtime } from '../../core/realtime';
import { Store } from '../../core/store';
import { Dropdown, avatarColor } from '../../shared/dropdown';
import { CategoryDialog } from '../dialogs/category-dialog';
import { ConfirmDialog } from '../dialogs/confirm-dialog';
import { ProjectDialog } from '../dialogs/project-dialog';
import { SettingsDialog } from '../dialogs/settings-dialog';
import { ShareDialog } from '../dialogs/share-dialog';
import { ShortcutsDialog } from '../dialogs/shortcuts-dialog';
import { TaskDetail } from '../tasks/task-detail';
import { TaskEditor } from '../tasks/task-editor';
import { NotificationsPanel } from './notifications-panel';
import { ProjectMenu } from './project-menu';

/** Live events do the real work; this slow check only catches anything missed while offline. */
const POLL_MS = 5 * 60_000;

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, Icon, Dropdown, TaskEditor, TaskDetail, ProjectMenu, NotificationsPanel,
    ShareDialog, ProjectDialog, SettingsDialog, ShortcutsDialog, ConfirmDialog, CategoryDialog, CdkDropList, CdkDrag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  protected auth = inject(Auth);
  protected store = inject(Store);
  private api = inject(Api);
  private router = inject(Router);
  private realtime = inject(Realtime);

  protected readonly sidebarOpen = signal(false);
  protected readonly bellOpen = signal(false);
  protected readonly archivedOpen = signal(false);
  protected readonly categoriesOpen = signal(true);
  /** Set after pressing G, waiting for the second key. */
  private goPending = false;

  constructor() {
    this.store.loadProjects();
    this.store.loadLabels();
    this.store.loadCategories();
    this.store.loadNotifications();
    this.api.me().subscribe((u) => {
      this.auth.setUser(u);
      // Reminders fire in the person's own time zone; keep it in sync with this device.
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone && zone !== u.timeZone) this.api.updateSettings({ timeZone: zone }).subscribe((v) => this.auth.setUser(v));
    });
    this.realtime.start();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.sidebarOpen.set(false));

    const timer = setInterval(() => this.store.loadNotifications(), POLL_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.realtime.stop();
    });
  }

  protected color = avatarColor;

  @HostListener('window:focus')
  protected onFocus(): void {
    this.store.loadNotifications();
  }

  /** Drag and drop in the sidebar: saves the new project order right away. */
  protected dropProject(e: CdkDragDrop<Project[]>): void {
    if (e.previousIndex === e.currentIndex) return;
    const list = [...this.store.activeProjects()];
    moveItemInArray(list, e.previousIndex, e.currentIndex);
    const order = new Map(list.map((p, i) => [p.id, i]));
    this.store.projects.update((ps) => ps.map((p) => (order.has(p.id) ? { ...p, position: order.get(p.id)! + 1 } : p))
      .sort((a, b) => Number(b.inbox) - Number(a.inbox) || a.position - b.position));
    this.api.reorderProjects(list.map((p) => p.id)).subscribe({ error: (err) => this.failedReorder(err) });
  }

  protected dropCategory(e: CdkDragDrop<Category[]>): void {
    if (e.previousIndex === e.currentIndex) return;
    const list = [...this.store.categories()];
    moveItemInArray(list, e.previousIndex, e.currentIndex);
    this.store.categories.set(list);
    this.api.reorderCategories(list.map((c) => c.id)).subscribe({ error: (err) => this.failedReorder(err) });
  }

  private failedReorder(err: unknown): void {
    this.store.toast(errorMessage(err));
    this.store.loadProjects();
    this.store.loadCategories();
  }

  protected setTheme(theme: Theme): void {
    this.api.updateSettings({ theme }).subscribe({
      next: (u) => this.auth.setUser(u),
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  protected exportData(): void {
    this.api.exportData().subscribe({
      next: (data) => {
        download(`doable-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
        this.store.toast('Your data was downloaded');
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(e: Event): void {
    if (this.bellOpen() && !(e.target as HTMLElement).closest('.bell-wrap')) this.bellOpen.set(false);
  }

  /** Global shortcuts: Q add, ? help, G then I/T/U/C to navigate. */
  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    const dialogOpen = this.store.quickAdd() || this.store.openTaskId() || this.store.confirmRequest()
      || this.store.shareProjectId() || this.store.settingsOpen() || this.store.editingProject() || this.store.shortcutsOpen()
      || this.store.editingCategory();
    if (e.key === 'Escape') {
      this.store.quickAdd.set(false);
      this.store.shareProjectId.set(null);
      this.store.settingsOpen.set(false);
      this.store.shortcutsOpen.set(false);
      this.store.editingProject.set(null);
      this.store.editingCategory.set(null);
      this.bellOpen.set(false);
      return;
    }
    if (dialogOpen) return;
    if (this.goPending) {
      this.goPending = false;
      const to = { i: '/inbox', t: '/today', u: '/upcoming', c: '/completed', r: '/tree', h: '/history' }[e.key.toLowerCase()];
      if (to) {
        e.preventDefault();
        this.router.navigateByUrl(to);
      }
      return;
    }
    if (e.key === 'q') {
      e.preventDefault();
      this.store.quickAdd.set(true);
    } else if (e.key === '?') {
      e.preventDefault();
      this.store.shortcutsOpen.set(true);
    } else if (e.key === 'g') {
      this.goPending = true;
      setTimeout(() => (this.goPending = false), 1500);
    }
  }
}
