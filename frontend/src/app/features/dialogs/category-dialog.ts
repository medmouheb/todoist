import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { PROJECT_COLORS, ProjectColor } from '../../core/models';
import { Store } from '../../core/store';

/** Add, rename, recolor or delete a category. */
@Component({
  selector: 'app-category-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" (click)="close()">
      <form class="dialog" role="dialog" [attr.aria-label]="id ? 'Edit category' : 'Add category'" (click)="$event.stopPropagation()"
            (ngSubmit)="save()" (keydown.escape)="close()">
        <h2>{{ id ? 'Edit category' : 'Add category' }}</h2>
        <p class="hint">Categories group tasks across projects, for example Work, Errands or Health. A task has one category.</p>
        <div class="field">
          <label for="cname">Name</label>
          <input id="cname" class="input" name="cname" [(ngModel)]="name" autofocus maxlength="60" />
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
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        <div class="actions">
          @if (id) { <button class="btn ghost del" type="button" (click)="remove()">Delete</button> }
          <span class="grow"></span>
          <button class="btn" type="button" (click)="close()">Cancel</button>
          <button class="btn primary" type="submit">{{ id ? 'Save' : 'Add' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .dialog { max-width: 420px; }
    .hint { margin: -6px 0 0; }
    .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
    .sw { width: 26px; height: 26px; border-radius: 6px; border: 2px solid transparent; cursor: pointer; }
    .sw[aria-checked="true"] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
    .err { margin: 0; }
    .grow { flex: 1; }
    .del { color: var(--danger); }
  `,
})
export class CategoryDialog implements OnInit {
  private api = inject(Api);
  private store = inject(Store);
  private router = inject(Router);

  protected readonly colors = PROJECT_COLORS;
  protected readonly error = signal('');
  protected id: number | null = null;
  protected name = '';
  protected color: ProjectColor = 'sky';

  ngOnInit(): void {
    const c = this.store.editingCategory();
    if (c && c !== 'new') {
      this.id = c.id;
      this.name = c.name;
      this.color = c.color;
    }
  }

  protected close(): void {
    this.store.editingCategory.set(null);
  }

  protected save(): void {
    const name = this.name.trim();
    if (!name) return this.error.set('Give the category a name.');
    const req = this.id === null
      ? this.api.createCategory({ name, color: this.color })
      : this.api.updateCategory(this.id, { name, color: this.color });
    req.subscribe({
      next: (c) => {
        this.close();
        this.store.loadCategories();
        this.store.tasksChanged();
        if (this.id === null) this.router.navigate(['/category', c.id]);
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected async remove(): Promise<void> {
    const id = this.id!;
    const ok = await this.store.confirm({
      title: 'Delete category?',
      message: `“${this.name}” will be removed. Its tasks stay where they are, without a category.`,
    });
    if (!ok) return;
    this.api.deleteCategory(id).subscribe({
      next: () => {
        this.close();
        this.store.loadCategories();
        this.store.tasksChanged();
        if (this.router.url === `/category/${id}`) this.router.navigateByUrl('/today');
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }
}
