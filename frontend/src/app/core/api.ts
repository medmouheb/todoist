import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AppNotification, AuthResponse, Category, CategoryHistoryEntry, Comment, HistoryPage, Invite, LabelDuplicate, LabelRef, LabelUsage, LockState, NewCondition, NewTask, Project, ProjectColor, Role,
  Settings, Sharing, Task, TaskChanges, TaskView, User,
} from './models';
import { todayIso } from './dates';

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  // ---- account ----
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/forgot-password', { email });
  }
  resetPassword(token: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/reset-password', { token, password });
  }
  sendLoginLink(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/login-link', { email });
  }
  verifyLoginLink(token: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login-link/verify', { token });
  }
  verifyEmail(email: string, code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/verify-email', { email, code });
  }
  verifyEmailLink(token: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/verify-email/link', { token });
  }
  resendVerification(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/verify-email/resend', { email });
  }
  me(): Observable<User> {
    return this.http.get<User>('/api/me');
  }
  updateSettings(s: Settings): Observable<User> {
    return this.http.put<User>('/api/me', s);
  }
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.put<void>('/api/me/password', { currentPassword, newPassword });
  }
  exportData(): Observable<unknown> {
    return this.http.get('/api/me/export');
  }

  // ---- projects ----
  projects(): Observable<Project[]> {
    return this.http.get<Project[]>('/api/projects');
  }
  createProject(body: { name: string; color: ProjectColor; favorite?: boolean }): Observable<Project> {
    return this.http.post<Project>('/api/projects', body);
  }
  updateProject(id: number, body: { name?: string; color?: ProjectColor; favorite?: boolean; archived?: boolean }): Observable<Project> {
    return this.http.put<Project>(`/api/projects/${id}`, body);
  }
  deleteProject(id: number): Observable<void> {
    return this.http.delete<void>(`/api/projects/${id}`);
  }
  duplicateProject(id: number): Observable<Project> {
    return this.http.post<Project>(`/api/projects/${id}/duplicate`, {});
  }
  exportProjectCsv(id: number): Observable<string> {
    return this.http.get(`/api/projects/${id}/export`, { responseType: 'text' });
  }
  importProjectCsv(id: number, csv: string): Observable<{ added: number }> {
    return this.http.post<{ added: number }>(`/api/projects/${id}/import`, csv, { headers: { 'Content-Type': 'text/csv' } });
  }

  reorderProjects(ids: number[]): Observable<void> {
    return this.http.put<void>('/api/projects/order', { ids });
  }

  // ---- categories ----
  categories(): Observable<Category[]> {
    return this.http.get<Category[]>('/api/categories');
  }
  createCategory(body: { name: string; color: ProjectColor; parentId?: number | null }): Observable<Category> {
    return this.http.post<Category>('/api/categories', body);
  }
  updateCategory(id: number, body: { name: string; color: ProjectColor }): Observable<Category> {
    return this.http.put<Category>(`/api/categories/${id}`, body);
  }
  deleteCategory(id: number): Observable<void> {
    return this.http.delete<void>(`/api/categories/${id}`);
  }
  reorderCategories(ids: number[]): Observable<void> {
    return this.http.put<void>('/api/categories/order', { ids });
  }
  /** Puts a category under parentId (null = "Todos") at index among its new siblings; returns all categories. */
  moveCategory(id: number, parentId: number | null, index?: number): Observable<Category[]> {
    return this.http.put<Category[]>(`/api/categories/${id}/move`, { parentId, index });
  }
  categoryHistory(id: number): Observable<CategoryHistoryEntry[]> {
    return this.http.get<CategoryHistoryEntry[]>(`/api/categories/${id}/history`);
  }

  // ---- history ----
  /** Newest first; pass the previous page's nextBefore to get the next one. */
  history(opts: { projectId?: number; taskId?: number; before?: number | null; limit?: number }): Observable<HistoryPage> {
    const params: Record<string, number> = {};
    if (opts.projectId) params['projectId'] = opts.projectId;
    if (opts.taskId) params['taskId'] = opts.taskId;
    if (opts.before) params['before'] = opts.before;
    params['limit'] = opts.limit ?? 30;
    return this.http.get<HistoryPage>('/api/history', { params });
  }

  // ---- sharing ----
  sharing(projectId: number): Observable<Sharing> {
    return this.http.get<Sharing>(`/api/projects/${projectId}/sharing`);
  }
  invite(projectId: number, email: string, role: Role): Observable<Invite> {
    return this.http.post<Invite>(`/api/projects/${projectId}/invites`, { email, role });
  }
  revokeInvite(projectId: number, inviteId: number): Observable<void> {
    return this.http.delete<void>(`/api/projects/${projectId}/invites/${inviteId}`);
  }
  changeRole(projectId: number, userId: number, role: Role): Observable<void> {
    return this.http.put<void>(`/api/projects/${projectId}/members/${userId}`, { role });
  }
  removeMember(projectId: number, userId: number): Observable<void> {
    return this.http.delete<void>(`/api/projects/${projectId}/members/${userId}`);
  }
  myInvites(): Observable<Invite[]> {
    return this.http.get<Invite[]>('/api/invites');
  }
  answerInvite(inviteId: number, accept: boolean): Observable<void> {
    return this.http.post<void>(`/api/invites/${inviteId}/${accept ? 'accept' : 'decline'}`, {});
  }

  // ---- notifications ----
  notifications(): Observable<{ unread: number; items: AppNotification[] }> {
    return this.http.get<{ unread: number; items: AppNotification[] }>('/api/notifications');
  }
  readNotification(id: number): Observable<void> {
    return this.http.post<void>(`/api/notifications/${id}/read`, {});
  }
  readAllNotifications(): Observable<void> {
    return this.http.post<void>('/api/notifications/read-all', {});
  }

  // ---- labels ----
  labels(): Observable<LabelRef[]> {
    return this.http.get<LabelRef[]>('/api/labels');
  }
  labelUsage(): Observable<LabelUsage[]> {
    return this.http.get<LabelUsage[]>('/api/labels/usage');
  }
  labelDuplicates(): Observable<LabelDuplicate[]> {
    return this.http.get<LabelDuplicate[]>('/api/labels/duplicates');
  }
  createLabel(name: string, color?: ProjectColor): Observable<LabelRef> {
    return this.http.post<LabelRef>('/api/labels', { name, color });
  }
  updateLabel(id: number, name: string, color: ProjectColor): Observable<LabelRef> {
    return this.http.put<LabelRef>(`/api/labels/${id}`, { name, color });
  }
  deleteLabel(id: number): Observable<void> {
    return this.http.delete<void>(`/api/labels/${id}`);
  }
  /** Moves every task from one hashtag to another, then deletes the first. */
  mergeLabel(id: number, intoId: number): Observable<LabelRef> {
    return this.http.post<LabelRef>(`/api/labels/${id}/merge`, { intoId });
  }

  // ---- editing locks ----
  /** Takes or renews the lock on a task you're editing; says who holds it. */
  lockTask(id: number): Observable<LockState> {
    return this.http.post<LockState>(`/api/tasks/${id}/lock`, {});
  }
  unlockTask(id: number): Observable<LockState> {
    return this.http.delete<LockState>(`/api/tasks/${id}/lock`);
  }
  requestUnlock(id: number, message: string): Observable<LockState> {
    return this.http.post<LockState>(`/api/tasks/${id}/lock/request`, { message });
  }

  // ---- tasks ----
  /** The browser's local date is sent so "Today" follows the user's time zone. */
  viewTasks(view: TaskView): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks', { params: { view, date: todayIso() } });
  }
  projectTasks(projectId: number): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks', { params: { projectId } });
  }
  subtasks(parentId: number): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks', { params: { parentId } });
  }
  categoryTasks(categoryId: number): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks', { params: { categoryId } });
  }
  /** Every open task and sub-task in active projects. */
  treeTasks(): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks/tree');
  }
  /** Saves a new order for sibling tasks. */
  reorderTasks(ids: number[]): Observable<void> {
    return this.http.put<void>('/api/tasks/order', { ids });
  }
  /** Saves the order of tasks inside a category (null = no category). */
  reorderCategoryTasks(categoryId: number | null, ids: number[]): Observable<void> {
    return this.http.put<void>('/api/tasks/category-order', { categoryId, ids });
  }
  addCondition(taskId: number, body: NewCondition): Observable<Task> {
    return this.http.post<Task>(`/api/tasks/${taskId}/conditions`, body);
  }
  removeCondition(taskId: number, conditionId: number): Observable<Task> {
    return this.http.delete<Task>(`/api/tasks/${taskId}/conditions/${conditionId}`);
  }
  addNotDone(taskId: number, reasons: string[]): Observable<Task> {
    return this.http.post<Task>(`/api/tasks/${taskId}/not-done`, { reasons });
  }
  removeNotDone(taskId: number, entryId: number): Observable<Task> {
    return this.http.delete<Task>(`/api/tasks/${taskId}/not-done/${entryId}`);
  }
  completedTasks(projectId?: number): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks/completed', { params: projectId ? { projectId } : {} });
  }
  task(id: number): Observable<Task> {
    return this.http.get<Task>(`/api/tasks/${id}`);
  }
  createTask(body: NewTask): Observable<Task> {
    return this.http.post<Task>('/api/tasks', body);
  }
  updateTask(id: number, changes: TaskChanges): Observable<Task> {
    return this.http.patch<Task>(`/api/tasks/${id}`, { today: todayIso(), ...changes });
  }
  deleteTask(id: number): Observable<void> {
    return this.http.delete<void>(`/api/tasks/${id}`);
  }
  restoreTask(id: number): Observable<Task> {
    return this.http.post<Task>(`/api/tasks/${id}/restore`, {});
  }

  // ---- comments ----
  comments(taskId: number): Observable<Comment[]> {
    return this.http.get<Comment[]>(`/api/tasks/${taskId}/comments`);
  }
  addComment(taskId: number, body: string): Observable<Comment> {
    return this.http.post<Comment>(`/api/tasks/${taskId}/comments`, { body });
  }
  deleteComment(id: number): Observable<void> {
    return this.http.delete<void>(`/api/comments/${id}`);
  }
}

/** Pulls the human-readable message out of a Spring ProblemDetail response. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Can’t reach the server. Check that the backend container is running.';
    let body = err.error;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { /* not JSON */ }
    }
    const detail = body?.detail;
    if (typeof detail === 'string' && detail !== 'Invalid request content.') return detail;
  }
  return fallback;
}
