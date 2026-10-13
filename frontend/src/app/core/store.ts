import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { Project } from './models';

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

/** App-wide state shared by the sidebar and the task views. */
@Injectable({ providedIn: 'root' })
export class Store {
  private api = inject(Api);
  private toastSeq = 0;

  readonly projects = signal<Project[]>([]);
  readonly inbox = computed(() => this.projects().find((p) => p.inbox) ?? null);
  readonly userProjects = computed(() => this.projects().filter((p) => !p.inbox));
  readonly favorites = computed(() => this.userProjects().filter((p) => p.favorite));
  /** Bumped after any task change so open views reload. */
  readonly tasksVersion = signal(0);
  readonly toasts = signal<Toast[]>([]);

  loadProjects(): void {
    this.api.projects().subscribe((ps) => this.projects.set(ps));
  }

  project(id: number): Project | undefined {
    return this.projects().find((p) => p.id === id);
  }

  tasksChanged(): void {
    this.tasksVersion.update((v) => v + 1);
    this.loadProjects();
  }

  toast(message: string, undo?: () => void): void {
    const t: Toast = { id: ++this.toastSeq, message, undo };
    this.toasts.set([t]); // one at a time, newest wins
    setTimeout(() => this.dismiss(t.id), 5000);
  }

  dismiss(id: number): void {
    this.toasts.update((ts) => ts.filter((t) => t.id !== id));
  }
}
