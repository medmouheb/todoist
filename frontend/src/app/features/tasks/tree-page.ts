import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { dueChip } from '../../core/dates';
import { Icon } from '../../core/icon';
import { Task } from '../../core/models';
import { Store } from '../../core/store';
import { TaskActions } from '../../core/task-actions';
import { GroupBy, NO_FILTER, TaskFilter, TaskToolbar, applyFilter, groupTasks, isFiltering } from './task-filter';

interface Node {
  task: Task;
  children: Node[];
  /** Open sub-tasks anywhere below. */
  descendants: number;
}

interface Root {
  key: string;
  name: string;
  color: string | null;
  kind: 'project' | 'group';
  nodes: Node[];
  count: number;
}

/**
 * Project → task → sub-task (or category / label / priority … → task → sub-task) as an animated,
 * foldable tree. Search keeps the path to every match visible and opens it.
 */
@Component({
  selector: 'app-tree-page',
  imports: [Icon, TaskToolbar, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="vh">
        <h1>Tree</h1>
        <div class="tools">
          <button type="button" class="btn ghost sm" (click)="expandAll()"><app-icon name="expand" [small]="true" />Expand all</button>
          <button type="button" class="btn ghost sm" (click)="collapseAll()"><app-icon name="collapse" [small]="true" />Collapse all</button>
        </div>
      </header>
      <app-task-toolbar [(filter)]="filter" [(groupBy)]="groupBy" [(open)]="filtersOpen" [showProjectGroup]="false" noneLabel="Projects" />

      @if (!loaded()) {
        @for (i of [1, 2, 3]; track i) { <div class="skeleton"></div> }
      } @else {
        <ul class="tree" role="tree" aria-label="Projects, tasks and sub-tasks">
          @for (r of roots(); track r.key; let i = $index) {
            <li class="root" role="treeitem" [attr.aria-expanded]="isOpen(r.key)" [style.--i]="i">
              <button type="button" class="rowbtn rootrow" (click)="toggle(r.key)">
                <app-icon name="chevron" [small]="true" class="chev" [class.shut]="!isOpen(r.key)" />
                @if (r.kind === 'project') {
                  <span class="hash" [style.--pc]="'var(--proj-' + (r.color ?? 'charcoal') + ')'">#</span>
                } @else if (r.color) {
                  <span class="gdot" [style.background]="'var(--proj-' + r.color + ')'"></span>
                }
                <span class="rname">{{ r.name }}</span>
                <span class="n">{{ r.count }}</span>
              </button>
              <div class="kids" [class.shut]="!isOpen(r.key)">
                <div class="kids-inner">
                  <ul role="group">
                    @for (n of r.nodes; track n.task.id; let j = $index) {
                      <ng-container [ngTemplateOutlet]="node" [ngTemplateOutletContext]="{ $implicit: n, i: j }" />
                    } @empty {
                      <li class="none muted">No open tasks</li>
                    }
                  </ul>
                </div>
              </div>
            </li>
          } @empty {
            <li class="empty"><p class="big">{{ filtering() ? 'No tasks match' : 'Nothing to show yet' }}</p>
              <p class="muted">{{ filtering() ? 'Try another search or clear the filters.' : 'Add projects and tasks, and they appear here as a tree.' }}</p></li>
          }
        </ul>
      }
    </div>

    <ng-template #node let-n let-i="i">
      <li class="leaf" role="treeitem" [attr.aria-expanded]="n.children.length ? isOpen('t' + n.task.id) : null" [style.--i]="i">
        <div class="trow" [class.hit]="isHit(n.task)">
          @if (n.children.length) {
            <button type="button" class="ibtn tog" [attr.aria-label]="(isOpen('t' + n.task.id) ? 'Collapse ' : 'Expand ') + n.task.title"
                    (click)="toggle('t' + n.task.id)">
              <app-icon name="chevron" [small]="true" class="chev" [class.shut]="!isOpen('t' + n.task.id)" />
            </button>
          } @else { <span class="tog-space"></span> }
          <button type="button" class="check" [class]="'check p' + n.task.priority" role="checkbox" aria-checked="false"
                  [attr.aria-label]="'Complete ' + n.task.title" (click)="actions.toggleComplete(n.task)">
            <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </button>
          <button type="button" class="title" (click)="store.openTaskId.set(n.task.id)">{{ n.task.title }}</button>
          <span class="meta">
            @if (n.task.category; as c) { <span class="cat"><span class="cdot" [style.background]="'var(--proj-' + c.color + ')'"></span>{{ c.name }}</span> }
            @if (n.task.dueDate) { <span [class]="'due ' + chip(n.task).tone">{{ chip(n.task).label }}</span> }
            @if (n.task.deadline) { <span class="dl" [class.missed]="missed(n.task)"><app-icon name="alarm" [small]="true" /></span> }
            @if (n.descendants) { <span class="sub">{{ n.descendants }} sub</span> }
          </span>
        </div>
        @if (n.children.length) {
          <div class="kids" [class.shut]="!isOpen('t' + n.task.id)">
            <div class="kids-inner">
              <ul role="group">
                @for (c of n.children; track c.task.id; let k = $index) {
                  <ng-container [ngTemplateOutlet]="node" [ngTemplateOutletContext]="{ $implicit: c, i: k }" />
                }
              </ul>
            </div>
          </div>
        }
      </li>
    </ng-template>
  `,
  styles: `
    .page { max-width: var(--content-width); margin: 0 auto; padding: 24px 32px 80px; }
    @media (max-width: 760px) { .page { padding: 8px 16px 80px; } }
    .vh { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    h1 { font-size: 30px; line-height: 38px; margin: 0; font-weight: 800; letter-spacing: -.02em; }
    .tools { display: flex; gap: 4px; }
    ul { list-style: none; margin: 0; padding: 0; }
    .tree { margin-top: 8px; }

    /* Each item slides and fades in, one after another. */
    li { animation: grow .32s cubic-bezier(.2, .7, .3, 1) both; animation-delay: calc(min(var(--i, 0), 12) * 35ms); }
    @keyframes grow { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }

    .root { margin-bottom: 6px; }
    .rowbtn { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; cursor: pointer; text-align: left; font: inherit; color: inherit; }
    .rootrow { padding: 8px 6px; border-radius: var(--radius-md); font-weight: 700; font-size: 15px; }
    .rootrow:hover { background: var(--surface-hover); }
    .rname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .n { font-size: 12px; font-weight: 400; color: var(--ink-subtle); }
    .gdot { width: 10px; height: 10px; border-radius: 3px; }
    .chev { transition: transform .22s ease; }
    .chev.shut { transform: rotate(-90deg); }

    /* Folding: the grid row animates from 0 to the content's height. */
    .kids { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .3s ease, opacity .3s ease; }
    .kids.shut { grid-template-rows: 0fr; opacity: 0; }
    .kids-inner { overflow: hidden; min-height: 0; }

    /* Connector lines */
    .kids ul { margin-left: 15px; padding-left: 14px; border-left: 1.5px solid var(--border); }
    .leaf { position: relative; }
    .leaf::before { content: ""; position: absolute; left: -14px; top: 19px; width: 12px; border-top: 1.5px solid var(--border); }

    .trow { display: flex; align-items: center; gap: 6px; min-height: 38px; padding: 2px 6px 2px 0; border-radius: var(--radius-md); transition: background .15s ease; }
    .trow:hover { background: var(--surface-hover); }
    .trow.hit { background: var(--brand-tint); }
    .tog { width: 22px; height: 22px; }
    .tog-space { width: 22px; flex: none; }
    .check {
      --ring: var(--priority-4); --fill: transparent; width: 16px; height: 16px; flex: none; padding: 0; border-radius: 99px;
      border: 1.5px solid var(--ring); background: var(--fill); display: grid; place-items: center; cursor: pointer;
    }
    .check.p1 { --ring: var(--priority-1); --fill: var(--priority-1-tint); border-width: 2px; }
    .check.p2 { --ring: var(--priority-2); --fill: var(--priority-2-tint); border-width: 2px; }
    .check.p3 { --ring: var(--priority-3); --fill: var(--priority-3-tint); border-width: 2px; }
    .check svg { width: 10px; height: 10px; fill: none; stroke: var(--ring); stroke-width: 2.6; stroke-linecap: round; opacity: 0; }
    .check:hover svg { opacity: 1; }
    .title { flex: 1; min-width: 0; border: 0; background: transparent; text-align: left; cursor: pointer; padding: 4px 0; font: inherit; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-muted); flex: none; }
    .cat { display: inline-flex; align-items: center; gap: 4px; }
    .cdot { width: 8px; height: 8px; border-radius: 2px; }
    .due.today { color: var(--date-today); } .due.tomorrow { color: var(--date-tomorrow); } .due.week { color: var(--date-week); } .due.overdue { color: var(--date-overdue); }
    .dl { display: inline-flex; color: var(--ink-subtle); } .dl.missed { color: var(--date-overdue); }
    .sub { color: var(--ink-subtle); }
    @media (max-width: 560px) { .meta .cat, .meta .sub { display: none; } }
    .none { padding: 6px 0 6px 8px; font-size: 13px; }
    .empty { text-align: center; padding: 48px 16px; }
    .empty .big { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
    .empty p { margin: 0; }
    .skeleton { height: 40px; border-radius: var(--radius-md); background: var(--surface-sunken); margin-bottom: 8px; }
    /* Each project (or group) is a card */
    .root { background: var(--surface); border-radius: 18px; padding: 6px 10px 8px; margin-bottom: 12px;
      box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border); }
    .rootrow { font-size: 16px; padding: 10px 6px; }
    .rootrow .hash { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: #fff;
      background: var(--pc); font-size: 14px; }
    .trow { min-height: 40px; }
    @media (prefers-reduced-motion: reduce) { li { animation: none; } .kids, .chev, .trow { transition: none; } }
  `,
})
export class TreePage {
  private api = inject(Api);
  private auth = inject(Auth);
  protected store = inject(Store);
  protected actions = inject(TaskActions);

  protected readonly tasks = signal<Task[]>([]);
  protected readonly loaded = signal(false);
  protected readonly filter = signal<TaskFilter>(NO_FILTER);
  protected readonly groupBy = signal<GroupBy>('none');
  protected readonly filtersOpen = signal(false);
  /** Keys of folded rows ("p3" project, "g…" group, "t7" task). Everything starts open. */
  protected readonly closed = signal<Set<string>>(new Set());
  protected readonly filtering = computed(() => isFiltering(this.filter()));

  /** Tasks matching the search and filters; their ancestors are kept so the path shows. */
  private readonly matches = computed(() => new Set(applyFilter(this.tasks(), this.filter(), this.auth.user()?.id).map((t) => t.id)));

  protected readonly roots = computed<Root[]>(() => {
    const all = this.tasks();
    const byId = new Map(all.map((t) => [t.id, t]));
    const keep = new Set<number>();
    if (this.filtering()) {
      for (const id of this.matches()) {
        for (let t = byId.get(id); t; t = t.parentId ? byId.get(t.parentId) : undefined) keep.add(t.id);
      }
    }
    const visible = this.filtering() ? all.filter((t) => keep.has(t.id)) : all;
    const kids = new Map<number, Task[]>();
    for (const t of visible) if (t.parentId) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
    const build = (t: Task): Node => {
      const children = (kids.get(t.id) ?? []).map(build);
      return { task: t, children, descendants: children.reduce((n, c) => n + 1 + c.descendants, 0) };
    };
    // Top-level here also means "whose parent isn't shown" (a matching sub-task of a non-matching parent is kept via keep).
    const tops = visible.filter((t) => !t.parentId || !byId.has(t.parentId));
    const count = (nodes: Node[]) => nodes.reduce((n, x) => n + 1 + x.descendants, 0);

    if (this.groupBy() === 'none') {
      const projects = [this.store.inbox(), ...this.store.activeProjects()].filter((p) => !!p);
      return projects
        .map((p) => {
          const nodes = tops.filter((t) => t.projectId === p!.id).map(build);
          return { key: 'p' + p!.id, name: p!.inbox ? 'Inbox' : p!.name, color: p!.color, kind: 'project' as const, nodes, count: count(nodes) };
        })
        .filter((r) => !this.filtering() || r.nodes.length);
    }
    return groupTasks(tops, this.groupBy(), (id) => this.store.project(id)).map((g) => {
      const nodes = g.tasks.map(build);
      return { key: 'g' + g.key, name: g.name, color: g.color, kind: 'group' as const, nodes, count: count(nodes) };
    });
  });

  constructor() {
    effect(() => {
      this.store.tasksVersion();
      untracked(() => this.api.treeTasks().subscribe((ts) => {
        this.tasks.set(ts);
        this.loaded.set(true);
      }));
    });
    // Searching opens everything, so every match is in view.
    effect(() => {
      if (this.filtering()) untracked(() => this.closed.set(new Set()));
    });
  }

  protected isOpen(key: string): boolean {
    return !this.closed().has(key);
  }

  protected isHit(t: Task): boolean {
    return this.filtering() && this.matches().has(t.id);
  }

  protected toggle(key: string): void {
    this.closed.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected expandAll(): void {
    this.closed.set(new Set());
  }

  protected collapseAll(): void {
    const keys = new Set<string>(this.roots().map((r) => r.key));
    const walk = (n: Node) => {
      if (n.children.length) keys.add('t' + n.task.id);
      n.children.forEach(walk);
    };
    this.roots().forEach((r) => r.nodes.forEach(walk));
    this.closed.set(keys);
  }

  protected chip(t: Task) {
    return dueChip(t.dueDate!, t.dueTime, this.auth.user()?.timeFormat);
  }

  protected missed(t: Task): boolean {
    return !!t.deadline && new Date(t.deadline).getTime() < Date.now();
  }
}
