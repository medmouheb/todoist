import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { Icon } from '../../core/icon';
import { AuthResponse } from '../../core/models';
import { AuthFrame } from './auth-frame';

/**
 * Where email links land: set a new password (reset), log straight in (login link),
 * or confirm the email address (verify).
 */
@Component({
  selector: 'app-token-page',
  imports: [FormsModule, RouterLink, Icon, AuthFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-frame>
      <section class="panel enter">
        @if (!token()) {
          <h1>This link is incomplete</h1>
          <p class="sub">Open the link from the email again, or ask for a new one.</p>
          <a class="btn big ghost-btn" routerLink="/login">Back to log in</a>
        } @else if (kind() === 'reset') {
          <form class="panel" (ngSubmit)="reset()" novalidate>
            <h1>Choose a new password</h1>
            <p class="sub">You’ll be logged in right after.</p>
            <label class="fld">
              <span>New password</span>
              <span class="ctl"><app-icon name="lock" [small]="true" />
                <input name="pw" [type]="show() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="password" placeholder="At least 8 characters" />
                <button type="button" class="eye" [attr.aria-label]="show() ? 'Hide password' : 'Show password'" (click)="show.set(!show())">
                  <app-icon [name]="show() ? 'eyeOff' : 'eye'" [small]="true" />
                </button>
              </span>
            </label>
            @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
            <button class="btn big primary-btn" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save and log in' }}</button>
            <p class="switch"><a routerLink="/forgot-password">Ask for a new link</a></p>
          </form>
        } @else if (error()) {
          <div class="icon warn"><app-icon name="alarm" /></div>
          <h1>That link didn’t work</h1>
          <p class="err" role="alert">{{ error() }}</p>
          <a class="btn big ghost-btn" routerLink="/login">Back to log in</a>
        } @else if (done()) {
          <div class="success">
            <svg class="burst" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring" cx="60" cy="60" r="46" /><path class="tick" d="M40 62l14 14 28-30" /></svg>
            <h1>{{ kind() === 'verify' ? 'Email confirmed!' : 'You’re in!' }}</h1>
            <p class="sub">Taking you to Doable…</p>
          </div>
        } @else {
          <div class="icon"><span class="spinner"></span></div>
          <h1>{{ kind() === 'verify' ? 'Confirming your email…' : 'Logging you in…' }}</h1>
        }
      </section>
    </app-auth-frame>
  `,
  styleUrl: './auth-page.css',
  styles: `
    .icon { width: 72px; height: 72px; border-radius: 22px; display: grid; place-items: center; background: var(--brand-tint); color: var(--brand-ink); }
    .icon.warn { background: var(--priority-1-tint); color: var(--danger); }
    .icon .spinner { width: 28px; height: 28px; border-width: 3px; }
    a.btn { text-decoration: none; }
  `,
})
export class TokenPage implements OnInit {
  private api = inject(Api);
  private auth = inject(Auth);
  private router = inject(Router);

  /** From the route data. */
  readonly kind = input<'reset' | 'link' | 'verify'>('reset');
  /** From the ?token= query parameter. */
  readonly token = input<string | undefined>(undefined);

  protected password = '';
  protected readonly show = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal(false);

  ngOnInit(): void {
    const token = this.token();
    if (!token || this.kind() === 'reset') return;
    const req = this.kind() === 'verify' ? this.api.verifyEmailLink(token) : this.api.verifyLoginLink(token);
    req.subscribe({
      next: (r) => this.finish(r),
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected reset(): void {
    if (this.password.length < 8) return this.error.set('Use at least 8 characters.');
    this.busy.set(true);
    this.error.set('');
    this.api.resetPassword(this.token()!, this.password).subscribe({
      next: (r) => this.finish(r),
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  private finish(r: AuthResponse): void {
    this.auth.store(r);
    this.done.set(true);
    setTimeout(() => this.router.navigateByUrl(this.auth.home()), 1100);
  }
}
