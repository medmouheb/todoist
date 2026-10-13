import { Routes } from '@angular/router';
import { homeRedirect, signedInGuard, signedOutGuard } from './core/auth';

const authPage = () => import('./features/auth/auth-page').then((m) => m.AuthPage);
const tokenPage = () => import('./features/auth/token-page').then((m) => m.TokenPage);
const taskList = () => import('./features/tasks/task-list-page').then((m) => m.TaskListPage);

export const routes: Routes = [
  { path: 'login', canActivate: [signedOutGuard], data: { mode: 'login' }, loadComponent: authPage },
  { path: 'signup', canActivate: [signedOutGuard], data: { mode: 'signup' }, loadComponent: authPage },
  { path: 'forgot-password', canActivate: [signedOutGuard], data: { mode: 'forgot' }, loadComponent: authPage },
  // Links from emails; they work whether or not someone is signed in.
  { path: 'reset-password', data: { kind: 'reset' }, loadComponent: tokenPage },
  { path: 'login/link', data: { kind: 'link' }, loadComponent: tokenPage },
  {
    path: '',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: homeRedirect },
      { path: 'inbox', data: { view: 'inbox' }, loadComponent: taskList },
      { path: 'today', data: { view: 'today' }, loadComponent: taskList },
      { path: 'upcoming', data: { view: 'upcoming' }, loadComponent: taskList },
      { path: 'project/:id', loadComponent: taskList },
      { path: 'completed', loadComponent: () => import('./features/tasks/completed-page').then((m) => m.CompletedPage) },
      { path: 'invites', loadComponent: () => import('./features/invites/invites-page').then((m) => m.InvitesPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
