import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AppNotification, AuthResponse, Comment, Invite, LabelRef, NewTask, Project, ProjectColor, Role, Settings, Sharing,
  Task, TaskChanges, TaskView, User,
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
