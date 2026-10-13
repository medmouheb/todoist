import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { Icon } from '../../core/icon';
import { PROJECT_COLORS, Project, ProjectColor } from '../../core/models';
import { Store } from '../../core/store';
import { TaskEditor } from '../tasks/task-editor';

interface ProjectForm {
  id: number | null;
  name: string;
  color: ProjectColor;
  favorite: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Icon, TaskEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  protected auth = inject(Auth);
  protected store = inject(Store);
  private api = inject(Api);
  private router = inject(Router);

  protected readonly colors = PROJECT_COLORS;
  protected readonly sidebarOpen = signal(false);
  protected readonly quickAdd = signal(false);
  protected readonly projectForm = signal<ProjectForm | null>(null);
  protected readonly projectError = signal('');

  constructor() {
    this.store.loadProjects();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.sidebarOpen.set(false));
  }

  protected initials(): string {
    const name = this.auth.user()?.name ?? '?';
    return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  /** Q opens Add task from anywhere, unless the person is typing. */
  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.quickAdd.set(true);
    }
    if (e.key === 'Escape') {
      this.quickAdd.set(false);
      this.projectForm.set(null);
    }
  }

  protected newProject(): void {
    this.projectError.set('');
    this.projectForm.set({ id: null, name: '', color: 'moss', favorite: false });
  }

  protected editProject(p: Project): void {
    this.projectError.set('');
    this.projectForm.set({ id: p.id, name: p.name, color: p.color, favorite: p.favorite });
  }

  protected saveProject(): void {
    const f = this.projectForm();
    if (!f) return;
    if (!f.name.trim()) return this.projectError.set('Give the project a name.');
    const body = { name: f.name.trim(), color: f.color, favorite: f.favorite };
    const req = f.id === null ? this.api.createProject(body) : this.api.updateProject(f.id, body);
    req.subscribe({
      next: (p) => {
        this.projectForm.set(null);
        this.store.loadProjects();
        if (f.id === null) this.router.navigate(['/project', p.id]);
      },
      error: (err) => this.projectError.set(errorMessage(err)),
    });
  }

  protected deleteProject(): void {
    const f = this.projectForm();
    if (!f?.id) return;
    if (!confirm(`Delete “${f.name}” and all of its tasks? This can’t be undone.`)) return;
    this.api.deleteProject(f.id).subscribe({
      next: () => {
        this.projectForm.set(null);
        this.store.tasksChanged();
        if (this.router.url === `/project/${f.id}`) this.router.navigateByUrl('/today');
      },
      error: (err) => this.projectError.set(errorMessage(err)),
    });
  }

  protected updateForm(patch: Partial<ProjectForm>): void {
    this.projectForm.update((f) => (f ? { ...f, ...patch } : f));
  }
}
