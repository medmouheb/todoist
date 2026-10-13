import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { NewTask, Project, ProjectColor, Task, TaskChanges, TaskView } from './models';
import { todayIso } from './dates';

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  projects(): Observable<Project[]> {
    return this.http.get<Project[]>('/api/projects');
  }

  createProject(body: { name: string; color: ProjectColor; favorite?: boolean }): Observable<Project> {
    return this.http.post<Project>('/api/projects', body);
  }

  updateProject(id: number, body: { name: string; color?: ProjectColor; favorite?: boolean }): Observable<Project> {
    return this.http.put<Project>(`/api/projects/${id}`, body);
  }

  deleteProject(id: number): Observable<void> {
    return this.http.delete<void>(`/api/projects/${id}`);
  }

  /** The browser's local date is sent so "Today" follows the user's time zone. */
  viewTasks(view: TaskView): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks', { params: { view, date: todayIso() } });
  }

  projectTasks(projectId: number, completed = false): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks', { params: { projectId, completed } });
  }

  createTask(body: NewTask): Observable<Task> {
    return this.http.post<Task>('/api/tasks', body);
  }

  updateTask(id: number, changes: TaskChanges): Observable<Task> {
    return this.http.patch<Task>(`/api/tasks/${id}`, changes);
  }

  deleteTask(id: number): Observable<void> {
    return this.http.delete<void>(`/api/tasks/${id}`);
  }
}

/** Pulls the human-readable message out of a Spring ProblemDetail response. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Can’t reach the server. Check that the backend container is running.';
    const detail = err.error?.detail;
    if (typeof detail === 'string' && detail !== 'Invalid request content.') return detail;
  }
  return fallback;
}
