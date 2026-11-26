import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { Icon } from '../../core/icon';
import { LabelDuplicate, LabelUsage, PROJECT_COLORS, ProjectColor } from '../../core/models';
import { Store } from '../../core/store';

/**
 * Hashtag manager: every hashtag with how many tasks use it; rename, recolor, merge, delete.
 * Hashtags that probably mean the same thing (same word written differently, synonyms,
 * near-identical spelling) are listed at the top with a one-click merge.
 */
@Component({
  selector: 'app-hashtags-page',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="vh">
        <div class="tile"><app-icon name="tag" /></div>
        <div class="grow">
          <h1>Hashtags</h1>
          <p class="muted sub">One hashtag per idea. Typing a hashtag that’s another one written differently (“Meetings” for #meeting) reuses it.</p>
        </div>
        <form class="new" (ngSubmit)="create()">
          <input class="input" name="newName" [(ngModel)]="newName" placeholder="New hashtag" maxlength="60" aria-label="New hashtag" />
          <button type="submit" class="btn primary" [disabled]="!newName.trim()"><app-icon name="plus" [small]="true" />Add</button>
        </form>
      </header>
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

      @if (duplicates().length) {
        <section class="card dups">
          <h2><app-icon name="sparkle" [small]="true" />Possible duplicates</h2>
          <ul>
            @for (d of duplicates(); track d.a.id + '-' + d.b.id) {
              <li>
                <span class="tagchip" [style.--lc]="'var(--proj-' + d.a.color + ')'">#{{ d.a.name }} <small>{{ d.a.taskCount }}</small></span>
                <app-icon name="right" [small]="true" />
                <span class="tagchip" [style.--lc]="'var(--proj-' + d.b.color + ')'">#{{ d.b.name }} <small>{{ d.b.taskCount }}</small></span>
                <span class="muted why">{{ d.reason }}</span>
                <span class="grow"></span>
                <button type="button" class="btn sm ghost" (click)="ignore(d)">Not the same</button>
                <button type="button" class="btn sm primary" (click)="merge(d.a, d.b)">Merge into #{{ d.b.name }}</button>
              </li>
            }
          </ul>
        </section>
      }

      <section class="card">
        <div class="tools">
          <input class="input search" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search hashtags" aria-label="Search hashtags" />
          <select class="input sort" [ngModel]="sort()" (ngModelChange)="sort.set($event)" aria-label="Sort">
            <option value="name">A to Z</option><option value="count">Most used</option><option value="unused">Unused first</option>
          </select>
        </div>
        <ul class="list">
          @for (l of shown(); track l.id; let i = $index) {
            <li [style.--i]="i">
              @if (editing() === l.id) {
                <form class="edit" (ngSubmit)="save(l)">
                  <div class="swatches">
                    @for (c of colors; track c) {
                      <button type="button" class="sw" [class.on]="editColor === c" [style.background]="'var(--proj-' + c + ')'" [attr.aria-label]="c" (click)="editColor = c"></button>
                    }
                  </div>
                  <input class="input" name="editName" [(ngModel)]="editName" maxlength="60" aria-label="Name" />
                  <button type="button" class="btn sm" (click)="editing.set(null)">Cancel</button>
                  <button type="submit" class="btn sm primary">Save</button>
                </form>
              } @else {
                <span class="dot" [style.background]="'var(--proj-' + l.color + ')'"></span>
                <span class="name">#{{ l.name }}</span>
                <span class="count" [class.zero]="!l.taskCount">{{ l.taskCount }} {{ l.taskCount === 1 ? 'task' : 'tasks' }}</span>
                <span class="acts">
                  <select class="input mini" [ngModel]="null" (ngModelChange)="$event && mergeInto(l, $event)" [attr.aria-label]="'Merge #' + l.name + ' into'">
                    <option [ngValue]="null">Merge into…</option>
                    @for (o of others(l); track o.id) { <option [ngValue]="o.id">#{{ o.name }}</option> }
                  </select>
                  <button type="button" class="ibtn" title="Rename or recolor" (click)="startEdit(l)"><app-icon name="edit" [small]="true" /></button>
                  <button type="button" class="ibtn" title="Delete" (click)="remove(l)"><app-icon name="trash" [small]="true" /></button>
                </span>
              }
            </li>
          } @empty { <li class="muted none">No hashtags{{ query() ? ' match' : ' yet' }}.</li> }
        </ul>
      </section>
    </div>
  `,
  styles: `
    .page { max-width: 860px; margin: 0 auto; padding: 24px 32px 80px; }
    @media (max-width: 760px) { .page { padding: 8px 16px 80px; } }
    .vh { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
    .tile { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: var(--grad-brand); flex: none;
      box-shadow: 0 6px 14px color-mix(in srgb, var(--brand) 30%, transparent); }
    .grow { flex: 1; min-width: 200px; }
    h1 { font-size: 30px; line-height: 38px; margin: 0; font-weight: 800; letter-spacing: -.02em; }
    .sub { margin: 2px 0 0; font-size: 13px; }
    .new { display: flex; gap: 6px; }
    .new .input { width: 180px; }
    .card { background: var(--surface); border-radius: 18px; padding: 14px; margin-bottom: 12px; box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border); }
    .dups { background: color-mix(in srgb, #e8a33d 10%, var(--surface)); animation: pop-in .25s ease both; }
    .dups h2 { display: flex; align-items: center; gap: 6px; font-size: 14px; margin: 0 0 8px; }
    ul { list-style: none; margin: 0; padding: 0; }
    .dups li { display: flex; align-items: center; gap: 8px; padding: 6px 0; flex-wrap: wrap; font-size: 13px; }
    .dups li .grow { min-width: 0; }
    .tagchip { display: inline-flex; gap: 6px; align-items: center; padding: 3px 10px; border-radius: 99px; font-weight: 600;
      background: color-mix(in srgb, var(--lc) 16%, var(--surface)); }
    .tagchip small { color: var(--ink-muted); font-weight: 500; }
    .why { font-size: 12px; }
    .tools { display: flex; gap: 8px; margin-bottom: 8px; }
    .search { flex: 1; }
    .sort { width: auto; }
    .list li { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 4px 6px; border-radius: 10px;
      animation: row-in .25s ease backwards; animation-delay: calc(min(var(--i), 15) * 25ms); }
    .list li:hover { background: var(--surface-hover); }
    .dot { width: 11px; height: 11px; border-radius: 3px; flex: none; }
    .name { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .count { font-size: 12px; color: var(--ink-muted); white-space: nowrap; }
    .count.zero { color: var(--ink-subtle); font-style: italic; }
    .acts { display: flex; gap: 4px; align-items: center; }
    .mini { height: 30px; width: auto; max-width: 150px; font-size: 12px; }
    @media (max-width: 560px) { .mini { display: none; } }
    .edit { display: flex; gap: 6px; align-items: center; flex: 1; flex-wrap: wrap; }
    .edit .input { flex: 1; min-width: 140px; height: 32px; }
    .swatches { display: flex; gap: 4px; }
    .sw { width: 20px; height: 20px; border-radius: 6px; border: 0; cursor: pointer; }
    .sw.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
    .none { padding: 12px 6px; }
    .err { margin: 0 0 10px; }
  `,
})
export class HashtagsPage {
  private api = inject(Api);
  private store = inject(Store);
  protected readonly colors = PROJECT_COLORS;

  protected readonly labels = signal<LabelUsage[]>([]);
  protected readonly dupes = signal<LabelDuplicate[]>([]);
  /** Pairs marked "not the same" in this visit. */
  private readonly ignored = signal(new Set<string>());
  protected readonly query = signal('');
  protected readonly sort = signal<'name' | 'count' | 'unused'>('name');
  protected readonly editing = signal<number | null>(null);
  protected readonly error = signal('');
  protected newName = '';
  protected editName = '';
  protected editColor: ProjectColor = 'sky';

  protected readonly duplicates = computed(() => this.dupes().filter((d) => !this.ignored().has(d.a.id + '-' + d.b.id)));

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase().replace(/^#/, '');
    const list = this.labels().filter((l) => !q || l.name.toLowerCase().includes(q));
    switch (this.sort()) {
      case 'count': return [...list].sort((a, b) => b.taskCount - a.taskCount || a.name.localeCompare(b.name));
      case 'unused': return [...list].sort((a, b) => a.taskCount - b.taskCount || a.name.localeCompare(b.name));
      default: return list;
    }
  });

  constructor() {
    this.load();
  }

  private load(): void {
    forkJoin([this.api.labelUsage(), this.api.labelDuplicates()]).subscribe(([ls, ds]) => {
      this.labels.set(ls);
      this.dupes.set(ds);
    });
    this.store.loadLabels();
  }

  protected others(l: LabelUsage): LabelUsage[] {
    return this.labels().filter((o) => o.id !== l.id);
  }

  protected create(): void {
    const name = this.newName.trim().replace(/^#/, '');
    if (!name) return;
    const before = new Set(this.labels().map((l) => l.id));
    this.api.createLabel(name).subscribe({
      next: (l) => {
        this.newName = '';
        this.error.set('');
        if (before.has(l.id)) this.store.toast(`#${l.name} already exists, so it was kept instead of adding “${name}”.`);
        this.load();
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected startEdit(l: LabelUsage): void {
    this.editing.set(l.id);
    this.editName = l.name;
    this.editColor = l.color;
  }

  protected save(l: LabelUsage): void {
    const name = this.editName.trim().replace(/^#/, '');
    if (!name) return;
    this.api.updateLabel(l.id, name, this.editColor).subscribe({
      next: () => {
        this.editing.set(null);
        this.error.set('');
        this.load();
        this.store.tasksChanged();
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected ignore(d: LabelDuplicate): void {
    this.ignored.update((s) => new Set(s).add(d.a.id + '-' + d.b.id));
  }

  protected mergeInto(l: LabelUsage, intoId: number): void {
    const into = this.labels().find((x) => x.id === intoId);
    if (into) this.merge(l, into);
  }

  protected async merge(from: LabelUsage, into: LabelUsage): Promise<void> {
    const ok = await this.store.confirm({
      title: `Merge #${from.name} into #${into.name}?`,
      message: `${from.taskCount} task${from.taskCount === 1 ? '' : 's'} will get #${into.name}, and #${from.name} will be removed.`,
      confirmLabel: 'Merge',
    });
    if (!ok) return;
    this.api.mergeLabel(from.id, into.id).subscribe({
      next: () => {
        this.store.toast(`#${from.name} merged into #${into.name}`);
        this.load();
        this.store.tasksChanged();
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected async remove(l: LabelUsage): Promise<void> {
    const ok = await this.store.confirm({
      title: `Delete #${l.name}?`,
      message: l.taskCount ? `It will be removed from ${l.taskCount} task${l.taskCount === 1 ? '' : 's'}. The tasks stay.` : 'No task uses it.',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteLabel(l.id).subscribe({
      next: () => {
        this.load();
        this.store.tasksChanged();
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }
}
