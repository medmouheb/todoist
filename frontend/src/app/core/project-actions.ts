import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Api, errorMessage } from './api';
import { Auth } from './auth';
import { download, pickTextFile } from './download';
import { Project } from './models';
import { Store } from './store';

/** The project menu: archive, duplicate, template CSV, import, leave, delete. */
@Injectable({ providedIn: 'root' })
export class ProjectActions {
  private api = inject(Api);
  private store = inject(Store);
  private auth = inject(Auth);
  private router = inject(Router);

  setArchived(p: Project, archived: boolean): void {
    this.api.updateProject(p.id, { archived }).subscribe({
      next: () => {
        this.store.tasksChanged();
        this.store.toast(archived ? `“${p.name}” archived` : `“${p.name}” is back`,
          () => this.api.updateProject(p.id, { archived: !archived }).subscribe(() => this.store.tasksChanged()));
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  toggleFavorite(p: Project): void {
    this.api.updateProject(p.id, { favorite: !p.favorite }).subscribe(() => this.store.loadProjects());
  }

  duplicate(p: Project): void {
    this.api.duplicateProject(p.id).subscribe({
      next: (copy) => {
        this.store.tasksChanged();
        this.store.toast(`Made “${copy.name}”`);
        this.router.navigate(['/project', copy.id]);
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  exportTemplate(p: Project): void {
    this.api.exportProjectCsv(p.id).subscribe({
      next: (csv) => {
        download(`${(p.inbox ? 'Inbox' : p.name).replace(/[^\w -]/g, '').trim() || 'project'}.csv`, csv, 'text/csv');
        this.store.toast('Template saved as CSV');
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  async importCsv(p: Project): Promise<void> {
    const csv = await pickTextFile('.csv,text/csv');
    if (csv === null) return;
    this.api.importProjectCsv(p.id, csv).subscribe({
      next: (r) => {
        this.store.tasksChanged();
        this.store.toast(r.added === 1 ? '1 task imported' : `${r.added} tasks imported`);
      },
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  async leave(p: Project): Promise<void> {
    const ok = await this.store.confirm({
      title: 'Leave project?',
      message: `You’ll lose access to “${p.name}”. Someone will need to invite you again to rejoin.`,
      confirmLabel: 'Leave',
    });
    if (!ok) return;
    this.api.removeMember(p.id, this.auth.user()!.id).subscribe({
      next: () => this.afterGone(p, `You left “${p.name}”`),
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  async delete(p: Project): Promise<void> {
    const ok = await this.store.confirm({
      title: 'Delete project?',
      message: `“${p.name}” and all of its tasks will be deleted for everyone in it. This can’t be undone.`,
    });
    if (!ok) return;
    this.api.deleteProject(p.id).subscribe({
      next: () => this.afterGone(p, `“${p.name}” deleted`),
      error: (err) => this.store.toast(errorMessage(err)),
    });
  }

  private afterGone(p: Project, message: string): void {
    this.store.tasksChanged();
    this.store.toast(message);
    if (this.router.url.startsWith(`/project/${p.id}`)) this.router.navigateByUrl(this.auth.home());
  }
}
