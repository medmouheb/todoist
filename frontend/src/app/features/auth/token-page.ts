import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { Icon } from '../../core/icon';

/** Where email links land: set a new password (reset), or log straight in (login link). */
@Component({
  selector: 'app-token-page',
  imports: [FormsModule, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <div class="card">
        <div class="brand"><span class="mark"><app-icon name="check" [small]="true" /></span>Doable</div>
        @if (!token()) {
          <h1>This link is incomplete</h1>
          <p class="muted">Open the link from the email again, or ask for a new one.</p>
          <p class="links"><a routerLink="/login">Back to log in</a></p>
        } @else if (kind() === 'reset') {
          <form (ngSubmit)="reset()" novalidate>
            <h1>Set a new password</h1>
            <p class="muted sub">You’ll be logged in right after.</p>
            <div class="field">
              <label for="pw">New password</label>
              <input id="pw" class="input" type="password" name="pw" autocomplete="new-password" [(ngModel)]="password" [class.is-error]="!!error()" />
              <span class="hint">At least 8 characters.</span>
            </div>
            @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
            <button class="btn primary submit" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save password' }}</button>
            <p class="links"><a routerLink="/forgot-password">Ask for a new link</a></p>
          </form>
        } @else {
          @if (error()) {
            <h1>That link didn’t work</h1>
            <p class="err" role="alert">{{ error() }}</p>
            <p class="links"><a routerLink="/login">Back to log in</a></p>
          } @else {
            <h1>Logging you in…</h1>
          }
        }
      </div>
    </main>
  `,
  styles: `
    .wrap { min-height: 100%; display: grid; place-items: center; padding: 32px 16px; background: var(--bg-sidebar); }
    .card { width: 100%; max-width: 380px; padding: 28px; background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); }
    .brand { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 700; margin-bottom: 22px; }
    .mark { width: 28px; height: 28px; border-radius: 99px; background: var(--brand); color: var(--on-brand); display: grid; place-items: center; }
    h1 { font-size: 24px; line-height: 32px; margin: 0 0 4px; }
    .sub { margin: 0 0 16px; }
    .submit { width: 100%; height: 40px; margin-top: 16px; }
    .links { margin: 14px 0 0; font-size: 13px; }
  `,
})
export class TokenPage implements OnInit {
  private api = inject(Api);
  private auth = inject(Auth);
  private router = inject(Router);

  /** From the route data. */
  readonly kind = input<'reset' | 'link'>('reset');
  /** From the ?token= query parameter. */
  readonly token = input<string | undefined>(undefined);

  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    if (this.kind() === 'link' && this.token()) {
      this.api.verifyLoginLink(this.token()!).subscribe({
        next: (r) => {
          this.auth.store(r);
          this.router.navigateByUrl(this.auth.home());
        },
        error: (err) => this.error.set(errorMessage(err)),
      });
    }
  }

  protected reset(): void {
    if (this.password.length < 8) return this.error.set('Use at least 8 characters.');
    this.busy.set(true);
    this.error.set('');
    this.api.resetPassword(this.token()!, this.password).subscribe({
      next: (r) => {
        this.auth.store(r);
        this.router.navigateByUrl(this.auth.home());
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
