import { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './core/auth';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [signedOutGuard],
    data: { mode: 'login' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'signup',
    canActivate: [signedOutGuard],
    data: { mode: 'signup' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: '',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'today' },
      { path: 'inbox', data: { view: 'inbox' }, loadComponent: () => import('./features/tasks/task-list-page').then((m) => m.TaskListPage) },
      { path: 'today', data: { view: 'today' }, loadComponent: () => import('./features/tasks/task-list-page').then((m) => m.TaskListPage) },
      { path: 'upcoming', data: { view: 'upcoming' }, loadComponent: () => import('./features/tasks/task-list-page').then((m) => m.TaskListPage) },
      { path: 'project/:id', loadComponent: () => import('./features/tasks/task-list-page').then((m) => m.TaskListPage) },
    ],
  },
  { path: '**', redirectTo: 'today' },
];
