import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { Icon } from '../../core/icon';
import { Invite } from '../../core/models';
import { Store } from '../../core/store';

/** Where invite emails link to: accept or decline pending project invitations. */
@Component({
  selector: 'app-invites-page',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h1>Invitations</h1>
      @if (!loaded()) {
        <div class="skeleton"></div>
      } @else {
        @for (i of invites(); track i.id) {
          <div class="card">
            <span class="pmark" [style.background]="'var(--proj-' + (i.projectColor || 'charcoal') + ')'"><app-icon name="share" [small]="true" /></span>
            <div class="text">
              <span class="muted">{{ i.invitedBy ?? 'Someone' }} invited you to the project</span>
              <b class="pname">{{ i.projectName }}</b>
              <span class="role">As <b>{{ roleName(i.role) }}</b> you’ll be able to {{ i.permissions }}.</span>
            </div>
            <button type="button" class="btn" (click)="answer(i, false)">Decline</button>
            <button type="button" class="btn primary" (click)="answer(i, true)">Join</button>
          </div>
        } @empty {
          <p class="muted">No pending invitations. When someone shares a project with you, it shows up here and in your notifications.</p>
        }
      }
    </div>
  `,
  styles: `
    .page { max-width: 640px; margin: 0 auto; padding: 24px 32px; }
    @media (max-width: 760px) { .page { padding: 8px 16px; } }
    h1 { font-size: 30px; line-height: 38px; font-weight: 800; letter-spacing: -.02em; margin: 0 0 18px; }
    .card { display: flex; align-items: center; gap: 14px; padding: 18px; border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow-sm); animation: pop-in .3s ease both; margin-bottom: 8px; background: var(--surface); flex-wrap: wrap; }
    .text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 200px; }
    .pname { font-size: 16px; }
    .role { font-size: 13px; color: var(--ink-muted); }
    .pmark { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: #fff; flex: none; }
    .skeleton { height: 64px; border-radius: var(--radius-lg); background: var(--surface-sunken); }
  `,
})
export class InvitesPage implements OnInit {
  private api = inject(Api);
  private store = inject(Store);
  private router = inject(Router);
  protected readonly invites = signal<Invite[]>([]);
  protected readonly loaded = signal(false);

  ngOnInit(): void {
    this.api.myInvites().subscribe((is) => {
      this.invites.set(is);
      this.loaded.set(true);
    });
  }

  protected roleName(r: string): string {
    return r === 'ADMIN' ? 'an admin' : r === 'GUEST' ? 'a guest' : 'a member';
  }

  protected answer(i: Invite, accept: boolean): void {
    this.api.answerInvite(i.id, accept).subscribe({
      next: () => {
        this.invites.update((is) => is.filter((x) => x.id !== i.id));
        this.store.loadProjects();
        this.store.loadNotifications();
        if (accept) {
          this.store.toast(`You joined “${i.projectName}”`);
          this.router.navigate(['/project', i.projectId]);
        }
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }
}
