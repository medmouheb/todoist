import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CanActivateFn, RedirectFunction, Router } from '@angular/router';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AuthResponse, SignupDetails, User } from './models';

const TOKEN_KEY = 'doable.token';
const USER_KEY = 'doable.user';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: keep it in memory for this tab */
  }
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly token = signal<string | null>(read(TOKEN_KEY));
  readonly user = signal<User | null>(JSON.parse(read(USER_KEY) ?? 'null'));
  readonly signedIn = computed(() => this.token() !== null);

  constructor() {
    // The theme setting overrides the OS preference through <html data-theme>.
    effect(() => {
      const theme = this.user()?.theme ?? 'system';
      if (theme === 'system') delete document.documentElement.dataset['theme'];
      else document.documentElement.dataset['theme'] = theme;
    });
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(tap((r) => this.store(r)));
  }

  /** Creates the account. Until the email is confirmed the response has no token, so nothing is stored. */
  signup(details: SignupDetails): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/signup', details).pipe(tap((r) => this.store(r)));
  }

  /** After a password reset or login link. */
  store(r: AuthResponse): void {
    if (!r.token) return; // waiting for email verification
    this.token.set(r.token);
    write(TOKEN_KEY, r.token);
    this.setUser(r.user);
  }

  setUser(u: User): void {
    this.user.set(u);
    write(USER_KEY, JSON.stringify(u));
  }

  /** Where to go after signing in: the page they were sent away from, or their home view. */
  home(returnUrl?: string | null): string {
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) return returnUrl;
    return '/' + (this.user()?.homeView ?? 'today');
  }

  logout(): void {
    this.token.set(null);
    this.user.set(null);
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
    this.router.navigateByUrl('/login');
  }
}

/** Adds the bearer token to API calls and signs out when the server rejects it. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const token = auth.token();
  const authed = token && req.url.startsWith('/api/') && !req.url.startsWith('/api/auth/')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;
  return next(authed).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && authed !== req) auth.logout();
      return throwError(() => err);
    }),
  );
};

export const signedInGuard: CanActivateFn = (_route, state) =>
  inject(Auth).signedIn() || inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

export const signedOutGuard: CanActivateFn = () =>
  !inject(Auth).signedIn() || inject(Router).parseUrl(inject(Auth).home());

/** "/" goes to the home view chosen in settings. */
export const homeRedirect: RedirectFunction = () => inject(Auth).home().slice(1);
