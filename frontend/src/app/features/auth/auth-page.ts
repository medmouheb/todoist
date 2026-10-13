import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { Icon } from '../../core/icon';

@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <form class="card" (ngSubmit)="submit()" novalidate>
        <div class="brand"><span class="mark"><app-icon name="check" [small]="true" /></span>Doable</div>
        <h1>{{ isSignup() ? 'Sign up' : 'Log in' }}</h1>
        <p class="muted sub">{{ isSignup() ? 'Organize your work and life.' : 'Welcome back.' }}</p>

        <div class="fields">
          @if (isSignup()) {
            <div class="field">
              <label for="name">Name</label>
              <input id="name" class="input" name="name" autocomplete="name" [(ngModel)]="name" required />
            </div>
          }
          <div class="field">
            <label for="email">Email</label>
            <input id="email" class="input" type="email" name="email" autocomplete="email" [(ngModel)]="email" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" class="input" type="password" name="password" [class.is-error]="!!error()"
                   [autocomplete]="isSignup() ? 'new-password' : 'current-password'" [(ngModel)]="password" required />
            @if (isSignup()) { <span class="muted hint">At least 8 characters.</span> }
            @if (error()) { <span class="err" role="alert">{{ error() }}</span> }
          </div>
        </div>

        <button class="btn primary submit" type="submit" [disabled]="busy()">
          {{ busy() ? 'Please wait…' : isSignup() ? 'Sign up' : 'Log in' }}
        </button>

        <p class="switch muted">
          @if (isSignup()) {
            Already have an account? <a routerLink="/login">Log in</a>
          } @else {
            New here? <a routerLink="/signup">Sign up</a>
          }
        </p>
      </form>
    </main>
  `,
  styles: `
    .wrap { min-height: 100%; display: grid; place-items: center; padding: 32px 16px; background: var(--bg-sidebar); }
    .card { width: 100%; max-width: 380px; padding: 28px; background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); }
    .brand { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 700; letter-spacing: -.01em; margin-bottom: 22px; }
    .mark { width: 28px; height: 28px; border-radius: 99px; background: var(--brand); color: var(--on-brand); display: grid; place-items: center; }
    h1 { font-size: 24px; line-height: 32px; margin: 0; }
    .sub { margin: 0 0 16px; }
    .fields { display: flex; flex-direction: column; gap: 12px; }
    .hint { font-size: 12px; }
    .submit { width: 100%; height: 40px; margin-top: 16px; }
    .switch { margin: 14px 0 0; font-size: 13px; text-align: center; }
    .switch a { font-weight: 600; }
  `,
})
export class AuthPage {
  private auth = inject(Auth);
  private router = inject(Router);

  /** Set from the route's data. */
  readonly mode = input<'login' | 'signup'>('login');
  protected readonly isSignup = computed(() => this.mode() === 'signup');

  protected name = '';
  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    const email = this.email.trim();
    if (this.isSignup() && !this.name.trim()) return this.error.set('Please enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('Please enter a valid email address.');
    if (this.isSignup() && this.password.length < 8) return this.error.set('Use at least 8 characters for your password.');
    if (!this.password) return this.error.set('Please enter your password.');

    this.busy.set(true);
    this.error.set('');
    const req = this.isSignup()
      ? this.auth.signup(this.name.trim(), email, this.password)
      : this.auth.login(email, this.password);
    req.subscribe({
      next: () => this.router.navigateByUrl('/today'),
      error: (err) => {
        this.busy.set(false);
        this.password = '';
        this.error.set(errorMessage(err));
      },
    });
  }
}
