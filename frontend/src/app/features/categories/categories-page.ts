import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { timeAgo } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Category, CategoryHistoryEntry } from '../../core/models';
import { Store } from '../../core/store';

interface Row {
  category: Category;
  depth: number;
}

/**
 * The category tree under "Todos", as an outline: drag to reorder, move a category one level in
 * (under the one above it) or out, add sub-categories, and see each one's history of moves.
 */
@Component({
  selector: 'app-categories-page',
  imports: [Icon, RouterLink, CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="vh">
        <div class="tile"><app-icon name="category" /></div>
        <div class="grow">
          <h1>Categories</h1>
          <p class="muted sub">Drag to reorder. Use the arrows to put a category inside the one above it, or to take it out a level.</p>
        </div>
        <button type="button" class="btn primary" (click)="add(null)"><app-icon name="plus" [small]="true" />Add category</button>
      </header>

      <section class="card">
        <div class="root"><span class="rmark"><app-icon name="tree" [small]="true" /></span><b>Todos</b>
          <span class="muted n">{{ total() }} open tasks</span></div>
        <div cdkDropList class="list" (cdkDropListDropped)="drop($event)" aria-label="Categories">
          @for (r of rows(); track r.category.id; let i = $index) {
            @let c = r.category;
            <div class="item" cdkDrag [cdkDragData]="r" cdkDragLockAxis="y" [style.--depth]="r.depth">
              <div class="row">
                <span class="grip" cdkDragHandle aria-hidden="true"><app-icon name="grip" [small]="true" /></span>
                <span class="dot" [style.background]="'var(--proj-' + c.color + ')'"></span>
                <a class="name" [routerLink]="['/category', c.id]">{{ c.name }}</a>
                @if (counts().get(c.id); as n) { <span class="count">{{ n }}</span> }
                <span class="tools">
                  <button type="button" class="ibtn" title="Take it out one level" [attr.aria-label]="'Move ' + c.name + ' out one level'"
                          [disabled]="!c.parentId" (click)="outdent(c)"><app-icon name="left" [small]="true" /></button>
                  <button type="button" class="ibtn" title="Put it inside the category above" [attr.aria-label]="'Move ' + c.name + ' inside the category above'"
                          [disabled]="!previousSibling(c)" (click)="indentIn(c)"><app-icon name="right" [small]="true" /></button>
                  <button type="button" class="ibtn" title="Add a sub-category" [attr.aria-label]="'Add a sub-category to ' + c.name" (click)="add(c.id)"><app-icon name="plus" [small]="true" /></button>
                  <button type="button" class="ibtn" title="History" [attr.aria-label]="'History of ' + c.name" [class.on]="historyFor() === c.id" (click)="toggleHistory(c.id)"><app-icon name="history" [small]="true" /></button>
                  <button type="button" class="ibtn" title="Edit" [attr.aria-label]="'Edit ' + c.name" (click)="store.editingCategory.set(c)"><app-icon name="edit" [small]="true" /></button>
                </span>
              </div>
              @if (historyFor() === c.id) {
                <ul class="hist">
                  @for (h of history(); track h.id) {
                    <li><span class="what">{{ describe(h) }}</span><span class="muted when">{{ ago(h.createdAt) }}</span></li>
                  } @empty { <li class="muted">No moves or renames yet.</li> }
                </ul>
              }
            </div>
          } @empty {
            <div class="empty"><p class="big">No categories yet</p>
              <p class="muted">Categories group tasks across projects, like Work › Client or Personal › Health.</p></div>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .page { max-width: var(--content-width); margin: 0 auto; padding: 24px 32px 80px; }
    @media (max-width: 760px) { .page { padding: 8px 16px 80px; } }
    .vh { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
    .tile { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: var(--grad-brand);
      box-shadow: 0 6px 14px color-mix(in srgb, var(--brand) 30%, transparent); }
    .grow { flex: 1; min-width: 200px; }
    h1 { font-size: 30px; line-height: 38px; margin: 0; font-weight: 800; letter-spacing: -.02em; }
    .sub { margin: 2px 0 0; font-size: 13px; }
    .card { background: var(--surface); border-radius: 18px; padding: 8px 10px 12px; box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border); }
    .root { display: flex; align-items: center; gap: 10px; padding: 10px 8px; font-size: 16px; }
    .rmark { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; background: var(--brand-tint); color: var(--brand-ink); }
    .n { margin-left: auto; font-size: 12px; }
    .list { min-height: 20px; }
    .item { margin-left: calc(var(--depth) * 26px + 14px); border-left: 1.5px solid var(--border); padding-left: 10px; }
    .row { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 2px 6px; border-radius: 10px; background: var(--surface); }
    .row:hover { background: var(--surface-hover); }
    .grip { cursor: grab; color: var(--ink-subtle); display: flex; touch-action: none; }
    .dot { width: 11px; height: 11px; border-radius: 3px; flex: none; }
    .name { flex: 1; min-width: 0; color: var(--ink); text-decoration: none; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name:hover { text-decoration: underline; }
    .count { font-size: 11px; font-weight: 700; background: var(--surface-sunken); border-radius: 99px; padding: 0 7px; line-height: 18px; color: var(--ink-muted); }
    .tools { display: flex; gap: 2px; opacity: .55; transition: opacity .15s; }
    .row:hover .tools, .row:focus-within .tools { opacity: 1; }
    @media (hover: none) { .tools { opacity: 1; } }
    .ibtn:disabled { opacity: .3; cursor: default; }
    .ibtn.on { background: var(--brand-tint); color: var(--brand-ink); }
    .hist { list-style: none; margin: 2px 0 8px 40px; padding: 8px 12px; border-radius: 12px; background: var(--surface-sunken); font-size: 13px;
      animation: menu-in .18s ease-out both; }
    .hist li { display: flex; gap: 10px; padding: 3px 0; }
    .what { flex: 1; }
    .when { font-size: 12px; white-space: nowrap; }
    .empty { text-align: center; padding: 32px 16px; }
    .empty .big { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
    .empty p { margin: 0; }
    .item.cdk-drag-preview { background: var(--surface); border-radius: 10px; box-shadow: var(--shadow-md); border: 0; }
    .item.cdk-drag-placeholder { opacity: .3; }
    .cdk-drop-list-dragging .item:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0, 0, .2, 1); }
  `,
})
export class CategoriesPage {
  private api = inject(Api);
  protected store = inject(Store);

  protected readonly rows = computed<Row[]>(() => this.store.categoryTree());
  /** Open tasks per category (only those in it, not in its sub-categories). */
  protected readonly counts = signal(new Map<number, number>());
  protected readonly total = signal(0);
  protected readonly historyFor = signal<number | null>(null);
  protected readonly history = signal<CategoryHistoryEntry[]>([]);
  protected ago = timeAgo;

  constructor() {
    this.store.loadCategories();
    effect(() => {
      this.store.tasksVersion();
      untracked(() => this.api.treeTasks().subscribe((ts) => {
        const m = new Map<number, number>();
        for (const t of ts) if (t.category) m.set(t.category.id, (m.get(t.category.id) ?? 0) + 1);
        this.counts.set(m);
        this.total.set(ts.length);
      }));
    });
  }

  protected add(parentId: number | null): void {
    this.store.newCategoryParent.set(parentId);
    this.store.editingCategory.set('new');
  }

  protected siblings(parentId: number | null): Category[] {
    return this.store.categoryChildren().get(parentId) ?? [];
  }

  protected previousSibling(c: Category): Category | undefined {
    const list = this.siblings(c.parentId);
    return list[list.findIndex((x) => x.id === c.id) - 1];
  }

  /** Inside the category just above it, at the end. */
  protected indentIn(c: Category): void {
    const prev = this.previousSibling(c);
    if (prev) this.move(c, prev.id, this.siblings(prev.id).length);
  }

  /** Out to its parent's level, right after its parent. */
  protected outdent(c: Category): void {
    const parent = c.parentId ? this.store.category(c.parentId) : undefined;
    if (!parent) return;
    this.move(c, parent.parentId, this.siblings(parent.parentId).findIndex((x) => x.id === parent.id) + 1);
  }

  /** Dropped on another row: it becomes that row's sibling, before or after it. */
  protected drop(e: CdkDragDrop<unknown>): void {
    if (e.previousIndex === e.currentIndex) return;
    const rows = this.rows();
    const moving = rows[e.previousIndex].category;
    const target = rows[e.currentIndex].category;
    if (this.store.categoryAndDescendants(moving.id).has(target.id)) {
      this.store.toast('A category can’t go inside itself or one of its own sub-categories.');
      return;
    }
    const others = this.siblings(target.parentId).filter((x) => x.id !== moving.id);
    const at = others.findIndex((x) => x.id === target.id) + (e.currentIndex > e.previousIndex ? 1 : 0);
    this.move(moving, target.parentId, at);
  }

  private move(c: Category, parentId: number | null, index: number): void {
    this.api.moveCategory(c.id, parentId, index).subscribe({
      next: (all) => {
        this.store.categories.set(all);
        if (this.historyFor() === c.id) this.loadHistory(c.id);
      },
      error: (err) => {
        this.store.toast(errorMessage(err));
        this.store.loadCategories();
      },
    });
  }

  protected toggleHistory(id: number): void {
    if (this.historyFor() === id) {
      this.historyFor.set(null);
      return;
    }
    this.historyFor.set(id);
    this.history.set([]);
    this.loadHistory(id);
  }

  private loadHistory(id: number): void {
    this.api.categoryHistory(id).subscribe((h) => this.history.set(h));
  }

  protected describe(h: CategoryHistoryEntry): string {
    switch (h.action) {
      case 'CREATED': return `Created in ${h.to}`;
      case 'RENAMED': return `Renamed from “${h.from}” to “${h.to}”`;
      default: return `Moved from ${h.from} to ${h.to}`;
    }
  }
}
