import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { PROJECT_COLORS, ProjectColor } from '../../core/models';
import { Store } from '../../core/store';

/** Add a project, or edit one's name, color and favorite. */
@Component({
  selector: 'app-project-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" (click)="close()">
      <form class="dialog" role="dialog" [attr.aria-label]="id ? 'Edit project' : 'Add project'" (click)="$event.stopPropagation()"
            (ngSubmit)="save()" (keydown.escape)="close()">
        <h2>{{ id ? 'Edit project' : 'Add project' }}</h2>
        <div class="field">
          <label for="pname">Name</label>
          <input id="pname" class="input" name="pname" [(ngModel)]="name" autofocus />
        </div>
        <div class="field">
          <span class="label">Color</span>
          <div class="swatches" role="radiogroup" aria-label="Color">
            @for (c of colors; track c) {
              <button type="button" class="sw" role="radio" [attr.aria-checked]="color === c" [attr.aria-label]="c"
                      [style.background]="'var(--proj-' + c + ')'" (click)="color = c"></button>
            }
          </div>
        </div>
        <label class="check"><input type="checkbox" name="fav" [(ngModel)]="favorite" />Add to favorites</label>
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        <div class="actions">
          <button class="btn" type="button" (click)="close()">Cancel</button>
          <button class="btn primary" type="submit">{{ id ? 'Save' : 'Add' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .dialog { max-width: 420px; }
    .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
    .sw { width: 26px; height: 26px; border-radius: 99px; border: 2px solid transparent; cursor: pointer; }
    .sw[aria-checked="true"] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
    .check { display: flex; align-items: center; gap: 8px; }
    .err { margin: 0; }
  `,
})
export class ProjectDialog implements OnInit {
  private api = inject(Api);
  private store = inject(Store);
  private router = inject(Router);

  protected readonly colors = PROJECT_COLORS;
  protected readonly error = signal('');
  protected id: number | null = null;
  protected name = '';
  protected color: ProjectColor = 'moss';
  protected favorite = false;

  ngOnInit(): void {
    const p = this.store.editingProject();
    if (p && p !== 'new') {
      this.id = p.id;
      this.name = p.name;
      this.color = p.color;
      this.favorite = p.favorite;
    }
  }

  protected close(): void {
    this.store.editingProject.set(null);
  }

  protected save(): void {
    if (!this.name.trim()) return this.error.set('Give the project a name.');
    const body = { name: this.name.trim(), color: this.color, favorite: this.favorite };
    const req = this.id === null ? this.api.createProject(body) : this.api.updateProject(this.id, body);
    req.subscribe({
      next: (p) => {
        this.close();
        this.store.loadProjects();
        if (this.id === null) this.router.navigate(['/project', p.id]);
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }
}
