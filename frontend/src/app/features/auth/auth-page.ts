import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { Icon } from '../../core/icon';
import { AccountType, AuthResponse, TeamSize, UseCase } from '../../core/models';
import { AuthFrame } from './auth-frame';
import { CodeInput } from './code-input';

type Mode = 'login' | 'signup' | 'forgot' | 'link';

const RESEND_SECONDS = 60;

/**
 * Log in, sign up (account type → details → email code), forgot password and "email me a link".
 * Unverified accounts land on the code screen, both after sign-up and when they try to log in.
 */
@Component({
  selector: 'app-auth-page',
  imports: [FormsModule, RouterLink, Icon, AuthFrame, CodeInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
})
export class AuthPage {
  private auth = inject(Auth);
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /** From the route's data. */
  readonly routeMode = input<Mode>('login', { alias: 'mode' });
  private readonly override = signal<Mode | null>(null);
  protected readonly mode = computed(() => this.override() ?? this.routeMode());

  // Sign-up
  protected readonly step = signal<1 | 2>(1);
  protected readonly accountType = signal<AccountType | null>(null);
  protected name = '';
  protected email = '';
  protected password = '';
  protected readonly passwordValue = signal('');
  protected readonly showPassword = signal(false);
  protected useCase: UseCase | null = null;
  protected organizationName = '';
  protected teamSize: TeamSize | null = null;
  protected jobTitle = '';

  // Shared
  /** Running on this computer: emails go to Mailpit, so say where to find them. */
  protected readonly local = ['localhost', '127.0.0.1'].includes(location.hostname);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly sentTo = signal('');

  // Email verification
  protected readonly verifying = signal<string | null>(null);
  protected readonly codeError = signal(0);
  protected readonly verified = signal(false);
  protected readonly resendIn = signal(0);
  protected readonly notice = signal('');
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly useCases: { value: UseCase; label: string; icon: 'person' | 'today' | 'upcoming' | 'sparkle' | 'more' }[] = [
    { value: 'personal', label: 'Personal life', icon: 'person' },
    { value: 'work', label: 'My work', icon: 'today' },
    { value: 'study', label: 'Studies', icon: 'upcoming' },
    { value: 'freelance', label: 'Freelancing', icon: 'sparkle' },
    { value: 'other', label: 'Something else', icon: 'more' },
  ];
  protected readonly teamSizes: TeamSize[] = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

  /** 0–4, from length and the mix of character kinds. */
  protected readonly strength = computed(() => {
    const p = this.passwordValue();
    if (!p) return 0;
    let s = p.length >= 8 ? 1 : 0;
    if (p.length >= 12) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
    else if (/\d|[^A-Za-z0-9]/.test(p) && s < 4) s += p.length >= 10 ? 1 : 0;
    return Math.min(s, 4);
  });
  protected readonly strengthLabel = computed(() => ['Too short', 'Okay', 'Good', 'Strong', 'Excellent'][this.strength()]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearInterval(this.timer));
  }

  protected switchTo(mode: Mode): void {
    this.override.set(mode);
    this.error.set('');
  }

  // ---- sign-up ----

  protected chooseType(t: AccountType): void {
    this.accountType.set(t);
    this.error.set('');
    setTimeout(() => this.step.set(2), 180); // let the selection animate first
  }

  protected setPassword(v: string): void {
    this.password = v;
    this.passwordValue.set(v);
  }

  protected signup(): void {
    const email = this.email.trim();
    const org = this.accountType() === 'ORGANIZATION';
    if (!this.name.trim()) return this.error.set('Please enter your name.');
    if (org && !this.organizationName.trim()) return this.error.set('Please enter your organization’s name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('Please enter a valid email address.');
    if (this.password.length < 8) return this.error.set('Use at least 8 characters for your password.');

    this.busy.set(true);
    this.error.set('');
    this.auth.signup({
      accountType: this.accountType()!,
      name: this.name.trim(),
      email,
      password: this.password,
      useCase: org ? null : this.useCase,
      organizationName: org ? this.organizationName.trim() : null,
      teamSize: org ? this.teamSize : null,
      jobTitle: org ? this.jobTitle.trim() || null : null,
    }).subscribe({
      next: (r) => this.afterAuth(r, email),
      error: (err) => this.fail(err),
    });
  }

  // ---- log in, forgot, link ----

  protected submit(): void {
    const email = this.email.trim();
    const mode = this.mode();
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('Please enter a valid email address.');
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
        error: (err) => this.fail(err),
      });
      return;
    }
    this.auth.login(email, this.password).subscribe({
      next: (r) => this.afterAuth(r, email),
      error: (err) => {
        if (err instanceof HttpErrorResponse && err.status === 403 && err.error?.code === 'EMAIL_NOT_VERIFIED') {
          // Their earlier code may have expired: send a fresh one and show the code screen.
          this.busy.set(false);
          this.startVerifying(email);
          this.resend(true);
          return;
        }
        this.password = '';
        this.passwordValue.set('');
        this.fail(err);
      },
    });
  }

  // ---- verification ----

  protected checkCode(code: string): void {
    const email = this.verifying();
    if (!email || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.verifyEmail(email, code).subscribe({
      next: (r) => {
        this.auth.store(r);
        this.verified.set(true);
        setTimeout(() => this.goHome(), 1300); // let the success animation play
      },
      error: (err) => {
        this.busy.set(false);
        this.codeError.update((n) => n + 1);
        this.error.set(errorMessage(err, 'That code isn’t right.'));
      },
    });
  }

  protected resend(silent = false): void {
    const email = this.verifying();
    if (!email || this.resendIn() > 0) return;
    this.api.resendVerification(email).subscribe({
      next: () => {
        if (!silent) this.notice.set('A new code is on its way. Check your inbox.');
        this.countdown();
      },
      error: (err) => {
        if (!silent) this.error.set(errorMessage(err));
        const wait = /(\d+) seconds/.exec(errorMessage(err))?.[1];
        if (wait) this.countdown(Number(wait));
      },
    });
  }

  protected changeEmail(): void {
    this.verifying.set(null);
    this.error.set('');
    this.notice.set('');
    if (this.mode() === 'signup') this.step.set(2);
  }

  private afterAuth(r: AuthResponse, email: string): void {
    this.busy.set(false);
    if (r.verificationRequired) {
      this.startVerifying(email);
      this.countdown();
    } else {
      this.goHome();
    }
  }

  private startVerifying(email: string): void {
    this.error.set('');
    this.notice.set('');
    this.codeError.set(0);
    this.verifying.set(email);
  }

  private countdown(seconds = RESEND_SECONDS): void {
    if (this.timer) clearInterval(this.timer);
    this.resendIn.set(seconds);
    this.timer = setInterval(() => {
      this.resendIn.update((s) => Math.max(0, s - 1));
      if (this.resendIn() === 0 && this.timer) clearInterval(this.timer);
    }, 1000);
  }

  private goHome(): void {
    this.router.navigateByUrl(this.auth.home(this.route.snapshot.queryParamMap.get('returnUrl')));
  }

  private fail(err: unknown): void {
    this.busy.set(false);
    this.error.set(errorMessage(err));
  }
}
