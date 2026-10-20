import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { timeAgo } from '../../core/dates';
import { Icon, IconName } from '../../core/icon';
import { AppNotification } from '../../core/models';
import { Store } from '../../core/store';
import { avatarColor } from '../../shared/dropdown';

/** Invites, assignments, comments and mentions, newest first. */
@Component({
  selector: 'app-notifications-panel',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel" role="dialog" aria-label="Notifications">
      <div class="head">
        <b>Notifications</b>
        @if (store.unread()) { <button type="button" class="btn ghost sm" (click)="readAll()">Mark all read</button> }
      </div>
      <div class="list">
        @for (n of store.notifications(); track n.id) {
          <div class="item" [class.unread]="!n.read" (click)="open(n)" (keydown.enter)="open(n)" tabindex="0" role="button">
            @if (n.actorInitials) { <span class="av" [style.--ac]="color(n.actorId)">{{ n.actorInitials }}</span> }
            @else { <span class="av"><app-icon [name]="icon(n)" [small]="true" /></span> }
            <div class="text">
              <span>{{ n.message }}</span>
              <span class="muted when"><app-icon [name]="icon(n)" [small]="true" />{{ ago(n.createdAt) }}</span>
              @if (n.type === 'INVITE' && n.inviteId) {
                <span class="btns">
                  <button type="button" class="btn sm" (click)="$event.stopPropagation(); answer(n, false)">Decline</button>
                  <button type="button" class="btn primary sm" (click)="$event.stopPropagation(); answer(n, true)">Join</button>
                </span>
              }
            </div>
          </div>
        } @empty {
          <p class="none muted">You’re all caught up. Invites, assignments and comments show up here.</p>
        }
      </div>
    </div>
  `,
  styles: `
    .panel { width: 360px; max-width: calc(100vw - 24px); background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-md); display: flex; flex-direction: column; max-height: 70vh; }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--border); min-height: 48px; }
    .list { overflow-y: auto; }
    .item { display: flex; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border); }
    .item:hover { background: var(--surface-hover); }
    .item.unread { background: var(--brand-tint); }
    .item .av:not([style]) { background: var(--surface-sunken); color: var(--ink-muted); }
    .text { display: flex; flex-direction: column; gap: 2px; font-size: 13px; min-width: 0; overflow-wrap: anywhere; }
    .when { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
    .btns { display: flex; gap: 6px; margin-top: 4px; }
    .none { padding: 20px 16px; margin: 0; font-size: 13px; text-align: center; }
  `,
})
export class NotificationsPanel {
  private api = inject(Api);
  private router = inject(Router);
  protected store = inject(Store);
  readonly done = output<void>();

  protected color = avatarColor;
  protected ago = timeAgo;

  protected icon(n: AppNotification): IconName {
    switch (n.type) {
      case 'INVITE': case 'INVITE_ACCEPTED': case 'INVITE_DECLINED': return 'share';
      case 'ASSIGNED': return 'person';
      case 'REMINDER': return 'clock';
      case 'DEADLINE_SOON': case 'DEADLINE_MISSED': return 'alarm';
      case 'ACTIVITY': return 'history';
      default: return 'comment';
    }
  }

  protected open(n: AppNotification): void {
    if (!n.read) this.api.readNotification(n.id).subscribe(() => this.store.loadNotifications());
    if (n.type === 'INVITE') return;
    this.done.emit();
    if (n.projectId && this.store.project(n.projectId)) this.router.navigate(['/project', n.projectId]);
    if (n.taskId) this.store.openTaskId.set(n.taskId);
  }

  protected answer(n: AppNotification, accept: boolean): void {
    this.api.answerInvite(n.inviteId!, accept).subscribe({
      next: () => {
        this.store.loadNotifications();
        this.store.loadProjects();
        if (accept) {
          this.store.toast('You joined the project');
          this.done.emit();
          if (n.projectId) this.router.navigate(['/project', n.projectId]);
        }
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  protected readAll(): void {
    this.api.readAllNotifications().subscribe(() => this.store.loadNotifications());
  }
}
