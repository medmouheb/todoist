import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { Icon } from '../../core/icon';

type Mode = 'login' | 'signup' | 'forgot' | 'link';

/** Log in, sign up, forgot password and "email me a login link". */
@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <div class="card">
        <div class="brand"><span class="mark"><app-icon name="check" [small]="true" /></span>Doable</div>

        @if (sentTo()) {
          <h1>Check your email</h1>
          <p class="muted sub">If there’s an account for <b>{{ sentTo() }}</b>, we’ve sent it a link. It works once and expires soon.</p>
          <p class="hint">Running Doable locally? Emails land in Mailpit at <a href="http://localhost:8025" target="_blank" rel="noopener">localhost:8025</a>.</p>
          <button class="btn submit" type="button" (click)="sentTo.set('')">Use a different email</button>
          <p class="switch muted"><a routerLink="/login">Back to log in</a></p>
        } @else {
          <form (ngSubmit)="submit()" novalidate>
            <h1>{{ titles[mode()] }}</h1>
            <p class="muted sub">{{ subtitles[mode()] }}</p>

            @if (mode() === 'login') {
              <button class="btn wide outline" type="button" (click)="switchTo('link')"><app-icon name="comment" [small]="true" />Continue with email link</button>
              <div class="or"><span></span>or<span></span></div>
            }

            <div class="fields">
              @if (mode() === 'signup') {
                <div class="field">
                  <label for="name">Name</label>
                  <input id="name" class="input" name="name" autocomplete="name" [(ngModel)]="name" required />
                </div>
              }
              <div class="field">
                <label for="email">Email</label>
                <input id="email" class="input" type="email" name="email" autocomplete="email" [(ngModel)]="email" required />
              </div>
              @if (needsPassword()) {
                <div class="field">
                  <label for="password">Password</label>
                  <input id="password" class="input" type="password" name="password" [class.is-error]="!!error()"
                         [autocomplete]="mode() === 'signup' ? 'new-password' : 'current-password'" [(ngModel)]="password" required />
                  @if (mode() === 'signup') { <span class="hint">At least 8 characters.</span> }
                </div>
              }
              @if (error()) { <span class="err" role="alert">{{ error() }}</span> }
            </div>

            <button class="btn primary submit" type="submit" [disabled]="busy()">{{ busy() ? 'Please wait…' : buttons[mode()] }}</button>

            <div class="links muted">
              @switch (mode()) {
                @case ('login') {
                  <a routerLink="/forgot-password">Forgot password?</a>
                  <span>New here? <a routerLink="/signup" class="strong">Sign up</a></span>
                }
                @case ('signup') { <span>Already have an account? <a routerLink="/login" class="strong">Log in</a></span> }
                @default { <a routerLink="/login">Back to log in</a> }
              }
            </div>
          </form>
        }
      </div>
    </main>
  `,
  styles: `
    .wrap { min-height: 100%; display: grid; place-items: center; padding: 32px 16px; background: var(--bg-sidebar); }
    .card { width: 100%; max-width: 380px; padding: 28px; background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); }
    .brand { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 700; letter-spacing: -.01em; margin-bottom: 22px; }
    .mark { width: 28px; height: 28px; border-radius: 99px; background: var(--brand); color: var(--on-brand); display: grid; place-items: center; }
    h1 { font-size: 24px; line-height: 32px; margin: 0; }
    .sub { margin: 0 0 16px; }
    .wide { width: 100%; height: 40px; }
    .outline { border: 1px solid var(--border-strong); background: var(--surface); }
    .or { display: flex; align-items: center; gap: 10px; margin: 16px 0; font-size: 12px; color: var(--ink-subtle); }
    .or span { flex: 1; height: 1px; background: var(--border); }
    .fields { display: flex; flex-direction: column; gap: 12px; }
    .submit { width: 100%; height: 40px; margin-top: 16px; }
    .links { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 14px; font-size: 13px; }
    .strong { font-weight: 600; }
    .switch { margin: 14px 0 0; font-size: 13px; text-align: center; }
  `,
})
export class AuthPage {
  private auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /** Set from the route's data. */
  readonly routeMode = input<Mode>('login', { alias: 'mode' });
  private readonly override = signal<Mode | null>(null);
  protected readonly mode = computed(() => this.override() ?? this.routeMode());
  protected readonly needsPassword = computed(() => this.mode() === 'login' || this.mode() === 'signup');

  protected readonly titles: Record<Mode, string> = {
    login: 'Log in', signup: 'Sign up', forgot: 'Forgot your password?', link: 'Log in with a link',
  };
  protected readonly subtitles: Record<Mode, string> = {
    login: 'Welcome back.', signup: 'Organize your work and life.',
    forgot: 'Enter your email and we’ll send you a link to set a new password.',
    link: 'We’ll email you a link that logs you in, no password needed.',
  };
  protected readonly buttons: Record<Mode, string> = {
    login: 'Log in', signup: 'Sign up', forgot: 'Send reset link', link: 'Email me a link',
  };

  protected name = '';
  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly sentTo = signal('');

  protected switchTo(mode: Mode): void {
    this.override.set(mode);
    this.error.set('');
  }

  protected submit(): void {
    const email = this.email.trim();
    const mode = this.mode();
    if (mode === 'signup' && !this.name.trim()) return this.error.set('Please enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('Please enter a valid email address.');
    if (mode === 'signup' && this.password.length < 8) return this.error.set('Use at least 8 characters for your password.');
    if (mode === 'login' && !this.password) return this.error.set('Please enter your password.');

    this.busy.set(true);
    this.error.set('');
    if (mode === 'forgot' || mode === 'link') {
      const req = mode === 'forgot' ? this.api.forgotPassword(email) : this.api.sendLoginLink(email);
      req.subscribe({
        next: () => {
          this.busy.set(false);
          this.sentTo.set(email);
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(errorMessage(err));
        },
      });
      return;
    }
    const req = mode === 'signup' ? this.auth.signup(this.name.trim(), email, this.password) : this.auth.login(email, this.password);
    req.subscribe({
      next: () => this.router.navigateByUrl(this.auth.home(this.route.snapshot.queryParamMap.get('returnUrl'))),
      error: (err) => {
        this.busy.set(false);
        this.password = '';
        this.error.set(errorMessage(err));
      },
    });
  }
}
