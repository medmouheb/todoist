import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { Icon } from '../../core/icon';
import { Member, Role, Sharing } from '../../core/models';
import { ProjectActions } from '../../core/project-actions';
import { Store } from '../../core/store';
import { avatarColor } from '../../shared/dropdown';

/** Who's in a project: invite by email, change roles, remove people, revoke invites. */
@Component({
  selector: 'app-share-dialog',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" (click)="close()">
      <div class="dialog share" role="dialog" aria-labelledby="share-title" (click)="$event.stopPropagation()">
        <div class="head">
          <h2 id="share-title">Share “{{ project()?.name }}”</h2>
          <button type="button" class="ibtn" aria-label="Close" (click)="close()"><app-icon name="close" /></button>
        </div>

        @if (isAdmin()) {
          <form class="invite" (ngSubmit)="invite()">
            <input class="input" type="email" name="email" placeholder="Email address" [(ngModel)]="email" aria-label="Email address to invite" />
            <select class="input role" name="role" [(ngModel)]="role" aria-label="Role">
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="GUEST">Guest</option>
            </select>
            <button class="btn primary" type="submit" [disabled]="busy()">Invite</button>
          </form>
          <p class="hint">{{ roleHelp[role] }}</p>
        }
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

        @if (!sharing()) {
          <div class="skeleton"></div>
        } @else {
          <h3>People</h3>
          <ul class="people">
            @for (m of sharing()!.members; track m.userId) {
              <li>
                <span class="av lg" [style.--ac]="color(m.userId)">{{ m.initials }}</span>
                <span class="who"><b>{{ m.name }}{{ m.userId === me() ? ' (you)' : '' }}</b><span class="muted">{{ m.email }}</span></span>
                @if (isAdmin() && m.userId !== me()) {
                  <select class="input role" [ngModel]="m.role" (ngModelChange)="changeRole(m, $event)" [attr.aria-label]="'Role for ' + m.name">
                    <option value="ADMIN">Admin</option><option value="MEMBER">Member</option><option value="GUEST">Guest</option>
                  </select>
                  <button type="button" class="ibtn" [attr.aria-label]="'Remove ' + m.name" (click)="remove(m)"><app-icon name="close" /></button>
                } @else {
                  <span class="badge">{{ roleName(m.role) }}</span>
                }
              </li>
            }
          </ul>

          @if (sharing()!.invites.length) {
            <h3>Waiting to join</h3>
            <ul class="people">
              @for (i of sharing()!.invites; track i.id) {
                <li>
                  <span class="av lg pending"><app-icon name="clock" [small]="true" /></span>
                  <span class="who"><b>{{ i.email }}</b><span class="muted">Invited as {{ roleName(i.role).toLowerCase() }}</span></span>
                  @if (isAdmin()) {
                    <button type="button" class="btn ghost sm" (click)="revoke(i.id)">Cancel invite</button>
                  }
                </li>
              }
            </ul>
          }

          @if (sharing()!.members.length > 1) {
            <div class="actions"><button type="button" class="btn ghost leave" (click)="leave()"><app-icon name="leave" [small]="true" />Leave project</button></div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .share { max-width: 560px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .head h2 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .invite { display: flex; gap: 8px; flex-wrap: wrap; }
    .invite .input:first-child { flex: 1; min-width: 180px; }
    .role { width: auto; }
    .hint { margin: -6px 0 0; }
    h3 { font-size: 13px; margin: 4px 0 0; color: var(--ink-muted); }
    .people { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .people li { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .who b, .who span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .who .muted { font-size: 12px; }
    .people .role { height: 30px; font-size: 13px; }
    .badge { font-size: 12px; color: var(--ink-muted); background: var(--surface-sunken); padding: 2px 8px; border-radius: 99px; }
    .pending { background: var(--surface-sunken); color: var(--ink-muted); }
    .skeleton { height: 120px; border-radius: var(--radius-md); background: var(--surface-sunken); }
    .leave { color: var(--danger); margin-right: auto; }
  `,
})
export class ShareDialog {
  private api = inject(Api);
  private auth = inject(Auth);
  private store = inject(Store);
  private projectActions = inject(ProjectActions);

  protected readonly sharing = signal<Sharing | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected email = '';
  protected role: Role = 'MEMBER';
  protected readonly roleHelp: Record<Role, string> = {
    MEMBER: 'Members can add, edit, complete and delete tasks.',
    ADMIN: 'Admins can also rename, archive or delete the project and manage people.',
    GUEST: 'Guests can see the project, comment, and complete tasks assigned to them.',
  };

  protected readonly project = computed(() => {
    const id = this.store.shareProjectId();
    return id ? this.store.project(id) : undefined;
  });
  protected readonly isAdmin = computed(() => this.sharing()?.myRole === 'ADMIN');
  protected readonly me = computed(() => this.auth.user()?.id);

  constructor() {
    effect(() => {
      const id = this.store.shareProjectId();
      untracked(() => id && this.reload(id));
    });
  }

  protected color = avatarColor;

  protected roleName(r: Role): string {
    return r === 'ADMIN' ? 'Admin' : r === 'GUEST' ? 'Guest' : 'Member';
  }

  protected close(): void {
    this.store.shareProjectId.set(null);
  }

  private reload(id: number): void {
    this.store.forgetMembers(id);
    this.api.sharing(id).subscribe({
      next: (s) => this.sharing.set(s),
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  private changed(): void {
    const id = this.store.shareProjectId()!;
    this.reload(id);
    this.store.loadProjects();
  }

  protected invite(): void {
    const email = this.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('Enter a valid email address.');
    this.busy.set(true);
    this.error.set('');
    this.api.invite(this.store.shareProjectId()!, email, this.role).subscribe({
      next: () => {
        this.busy.set(false);
        this.email = '';
        this.store.toast(`Invitation sent to ${email}`);
        this.changed();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  protected changeRole(m: Member, role: Role): void {
    this.error.set('');
    this.api.changeRole(this.store.shareProjectId()!, m.userId, role).subscribe({
      next: () => this.changed(),
      error: (err) => {
        this.error.set(errorMessage(err));
        this.changed();
      },
    });
  }

  protected async remove(m: Member): Promise<void> {
    const ok = await this.store.confirm({
      title: `Remove ${m.name}?`,
      message: `${m.name} will lose access to “${this.project()?.name}”. Tasks assigned to them become unassigned.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    this.api.removeMember(this.store.shareProjectId()!, m.userId).subscribe({
      next: () => {
        this.changed();
        this.store.tasksChanged();
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected revoke(inviteId: number): void {
    this.api.revokeInvite(this.store.shareProjectId()!, inviteId).subscribe(() => this.changed());
  }

  protected leave(): void {
    const p = this.project();
    if (!p) return;
    this.close();
    this.projectActions.leave(p);
  }
}
