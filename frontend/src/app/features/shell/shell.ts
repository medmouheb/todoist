import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { download } from '../../core/download';
import { Icon } from '../../core/icon';
import { Theme } from '../../core/models';
import { Store } from '../../core/store';
import { Dropdown, avatarColor } from '../../shared/dropdown';
import { ConfirmDialog } from '../dialogs/confirm-dialog';
import { ProjectDialog } from '../dialogs/project-dialog';
import { SettingsDialog } from '../dialogs/settings-dialog';
import { ShareDialog } from '../dialogs/share-dialog';
import { ShortcutsDialog } from '../dialogs/shortcuts-dialog';
import { TaskDetail } from '../tasks/task-detail';
import { TaskEditor } from '../tasks/task-editor';
import { NotificationsPanel } from './notifications-panel';
import { ProjectMenu } from './project-menu';

const POLL_MS = 30_000;

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, Icon, Dropdown, TaskEditor, TaskDetail, ProjectMenu, NotificationsPanel,
    ShareDialog, ProjectDialog, SettingsDialog, ShortcutsDialog, ConfirmDialog,
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

  protected readonly sidebarOpen = signal(false);
  protected readonly bellOpen = signal(false);
  protected readonly archivedOpen = signal(false);
  /** Set after pressing G, waiting for the second key. */
  private goPending = false;

  constructor() {
    this.store.loadProjects();
    this.store.loadLabels();
    this.store.loadNotifications();
    this.api.me().subscribe((u) => this.auth.setUser(u));
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.sidebarOpen.set(false));

    // Notifications (invites, assignments, comments) arrive by polling.
    const timer = setInterval(() => this.store.loadNotifications(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected color = avatarColor;

  @HostListener('window:focus')
  protected onFocus(): void {
    this.store.loadNotifications();
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
      || this.store.shareProjectId() || this.store.settingsOpen() || this.store.editingProject() || this.store.shortcutsOpen();
    if (e.key === 'Escape') {
      this.store.quickAdd.set(false);
      this.store.shareProjectId.set(null);
      this.store.settingsOpen.set(false);
      this.store.shortcutsOpen.set(false);
      this.store.editingProject.set(null);
      this.bellOpen.set(false);
      return;
    }
    if (dialogOpen) return;
    if (this.goPending) {
      this.goPending = false;
      const to = { i: '/inbox', t: '/today', u: '/upcoming', c: '/completed' }[e.key.toLowerCase()];
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
