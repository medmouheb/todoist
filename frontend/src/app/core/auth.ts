import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AuthResponse, User } from './models';

const TOKEN_KEY = 'doable.token';
const USER_KEY = 'doable.user';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly token = signal<string | null>(read(TOKEN_KEY));
  readonly user = signal<User | null>(JSON.parse(read(USER_KEY) ?? 'null'));
  readonly signedIn = computed(() => this.token() !== null);

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }).pipe(tap((r) => this.store(r)));
  }

  signup(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/signup', { name, email, password })
      .pipe(tap((r) => this.store(r)));
  }

  logout(): void {
    this.token.set(null);
    this.user.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* storage unavailable: nothing to clear */
    }
    this.router.navigateByUrl('/login');
  }

  private store(r: AuthResponse): void {
    this.token.set(r.token);
    this.user.set(r.user);
    try {
      localStorage.setItem(TOKEN_KEY, r.token);
      localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    } catch {
      /* storage unavailable: stay signed in for this tab only */
    }
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

export const signedInGuard: CanActivateFn = () =>
  inject(Auth).signedIn() || inject(Router).parseUrl('/login');

export const signedOutGuard: CanActivateFn = () =>
  !inject(Auth).signedIn() || inject(Router).parseUrl('/today');
