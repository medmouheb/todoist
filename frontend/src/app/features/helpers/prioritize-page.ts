import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Api, errorMessage } from '../../core/api';
import { Icon } from '../../core/icon';
import { Priority, Task } from '../../core/models';
import { MatrixResult, contradictions, priorityFromPoints, weigh } from '../../core/planning';
import { Store, indent } from '../../core/store';

const MAX = 12;

/** The 7 answers for a pair, from "A far more important" to "B far more important", as a[i][j]. */
const ANSWERS: { value: number; label: string; side: 'a' | 'b' | 'eq' }[] = [
  { value: 9, label: 'Far more', side: 'a' },
  { value: 5, label: 'More', side: 'a' },
  { value: 3, label: 'A bit more', side: 'a' },
  { value: 1, label: 'Equal', side: 'eq' },
  { value: 1 / 3, label: 'A bit more', side: 'b' },
  { value: 1 / 5, label: 'More', side: 'b' },
  { value: 1 / 9, label: 'Far more', side: 'b' },
];

/**
 * Priority by comparison matrix: pick up to 12 tasks, say which of each pair matters more,
 * and get importance points (0–100) with a consistency check. Save them, and optionally set
 * each task's priority from its points.
 */
@Component({
  selector: 'app-prioritize-page',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="vh">
        <div class="tile"><app-icon name="matrix" /></div>
        <div class="grow">
          <h1>Prioritize</h1>
          <p class="muted sub">Compare tasks two at a time. Doable turns your answers into importance points and priorities.</p>
        </div>
      </header>

      <ol class="steps">
        <li [class.on]="step() === 'pick'" [class.done]="step() !== 'pick'">1 · Pick tasks</li>
        <li [class.on]="step() === 'compare'" [class.done]="step() === 'result'">2 · Compare</li>
        <li [class.on]="step() === 'result'">3 · Results</li>
      </ol>

      @switch (step()) {
        @case ('pick') {
          <section class="card">
            <div class="row">
              <label class="field">From
                <select class="input" [ngModel]="scope()" (ngModelChange)="scope.set($event)">
                  <option value="all">All my open tasks</option>
                  <optgroup label="Project">
                    @for (p of store.writableProjects(); track p.id) { <option [value]="'p' + p.id">{{ p.inbox ? 'Inbox' : p.name }}</option> }
                  </optgroup>
                  <optgroup label="Category">
                    @for (o of store.categoryTree(); track o.category.id) { <option [value]="'c' + o.category.id">{{ indent(o.depth) }}{{ o.category.name }}</option> }
                  </optgroup>
                </select>
              </label>
              <span class="grow"></span>
              <button type="button" class="btn sm" (click)="pickTop()">Pick the first {{ max }}</button>
              <button type="button" class="btn ghost sm" (click)="picked.set([])">Clear</button>
            </div>
            <ul class="pick">
              @for (t of pool(); track t.id) {
                <li>
                  <label [class.on]="isPicked(t)">
                    <input type="checkbox" [checked]="isPicked(t)" [disabled]="!isPicked(t) && picked().length >= max" (change)="togglePick(t)" />
                    <span class="ptitle">{{ t.title }}</span>
                    @if (t.importance !== null) { <span class="pts">{{ t.importance }} pts</span> }
                    @if (t.priority < 4) { <span class="prio" [class]="'prio p' + t.priority">P{{ t.priority }}</span> }
                  </label>
                </li>
              } @empty { <li class="muted none">No open tasks here.</li> }
            </ul>
            <div class="foot">
              <span class="muted">{{ picked().length }} of {{ max }} picked · {{ pairCount() }} comparisons</span>
              <button type="button" class="btn primary" [disabled]="picked().length < 2" (click)="start()">Start comparing</button>
            </div>
          </section>
        }
        @case ('compare') {
          @if (pair(); as pr) {
            <section class="card compare">
              <div class="progress"><span [style.width.%]="(index() / pairs().length) * 100"></span></div>
              <p class="muted count">Comparison {{ index() + 1 }} of {{ pairs().length }}</p>
              <h2 class="q">Which matters more?</h2>
              <div class="duel">
                <div class="side a"><span class="tag">A</span>{{ picked()[pr[0]].title }}</div>
                <span class="vs">vs</span>
                <div class="side b"><span class="tag">B</span>{{ picked()[pr[1]].title }}</div>
              </div>
              <div class="answers" role="group" aria-label="Answer">
                @for (a of answers; track $index; let k = $index) {
                  <button type="button" class="ans" [class]="'ans ' + a.side" [class.sel]="answerAt(pr) === a.value" (click)="answer(a.value)"
                          [attr.aria-label]="a.side === 'eq' ? 'Equal' : (a.side === 'a' ? 'A ' : 'B ') + a.label + ' important'">
                    <span class="who">{{ a.side === 'eq' ? '=' : a.side.toUpperCase() }}</span>{{ a.label }}<kbd>{{ k + 1 }}</kbd>
                  </button>
                }
              </div>
              <div class="foot">
                <button type="button" class="btn ghost sm" [disabled]="index() === 0" (click)="index.set(index() - 1)"><app-icon name="left" [small]="true" />Back</button>
                <span class="grow"></span>
                <button type="button" class="btn ghost sm" (click)="step.set('pick')">Change tasks</button>
              </div>
            </section>
          }
        }
        @case ('result') {
          <section class="card">
            <div class="consistency" [class.bad]="circles().length">
              <app-icon [name]="circles().length ? 'alarm' : 'check'" [small]="true" />
              <span>
                @if (circles().length) {
                  Some answers go in a circle: {{ circleText(circles()[0]) }}{{ circles().length > 1 ? ' (and ' + (circles().length - 1) + ' more)' : '' }}.
                  The ranking is still usable; go back to adjust if that isn’t what you meant.
                } @else {
                  Your answers agree with each other.
                  @if (result().consistency > 0.1) { <span class="note">How much more each task matters varies a little (ratio {{ pct(result().consistency) }}), which is normal.</span> }
                }
              </span>
            </div>
            <ol class="ranking">
              @for (r of ranking(); track r.task.id; let i = $index) {
                <li [style.--i]="i">
                  <span class="rank">{{ i + 1 }}</span>
                  <span class="rtitle">{{ r.task.title }}</span>
                  <span class="bar"><span [style.width.%]="r.points"></span></span>
                  <span class="pts">{{ r.points }}</span>
                  <span class="prio" [class]="'prio p' + r.priority">{{ r.priority === 4 ? 'P4' : 'P' + r.priority }}</span>
                </li>
              }
            </ol>
            <details class="matrix">
              <summary>Show the comparison matrix</summary>
              <div class="mscroll">
                <table>
                  <tr><th></th>@for (t of picked(); track t.id; let j = $index) { <th [title]="t.title">{{ j + 1 }}</th> }<th>Weight</th></tr>
                  @for (row of matrix(); track $index; let i = $index) {
                    <tr><th class="rowh" [title]="picked()[i].title">{{ i + 1 }}. {{ picked()[i].title }}</th>
                      @for (x of row; track $index) { <td>{{ fraction(x) }}</td> }
                      <td class="w">{{ pct(result().weights[i]) }}</td></tr>
                  }
                </table>
              </div>
            </details>
            @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
            <div class="foot">
              <button type="button" class="btn ghost sm" (click)="index.set(pairs().length - 1); step.set('compare')"><app-icon name="left" [small]="true" />Adjust answers</button>
              <span class="grow"></span>
              <button type="button" class="btn" [disabled]="saving()" (click)="save(false)">Save importance</button>
              <button type="button" class="btn primary" [disabled]="saving()" (click)="save(true)">Save and set priorities</button>
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .page { max-width: 860px; margin: 0 auto; padding: 24px 32px 80px; }
    @media (max-width: 760px) { .page { padding: 8px 16px 80px; } }
    .vh { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
    .tile { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: var(--grad-brand); flex: none;
      box-shadow: 0 6px 14px color-mix(in srgb, var(--brand) 30%, transparent); }
    .grow { flex: 1; }
    h1 { font-size: 30px; line-height: 38px; margin: 0; font-weight: 800; letter-spacing: -.02em; }
    .sub { margin: 2px 0 0; font-size: 13px; }
    .steps { display: flex; gap: 8px; list-style: none; padding: 0; margin: 0 0 14px; flex-wrap: wrap; }
    .steps li { padding: 6px 12px; border-radius: 99px; font-size: 13px; font-weight: 600; color: var(--ink-subtle); background: var(--surface-sunken); }
    .steps li.on { background: var(--grad-brand); color: #fff; }
    .steps li.done { color: var(--brand-ink); background: var(--brand-tint); }
    .card { background: var(--surface); border-radius: 18px; padding: 18px; box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border); animation: pop-in .25s ease both; }
    .row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-muted); min-width: 220px; }
    .pick { list-style: none; margin: 0; padding: 0; max-height: 420px; overflow-y: auto; }
    .pick label { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; cursor: pointer; }
    .pick label:hover { background: var(--surface-hover); }
    .pick label.on { background: var(--brand-tint); }
    .ptitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pts { font-size: 12px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
    .prio { font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 99px; background: var(--surface-sunken); color: var(--ink-muted); }
    .prio.p1 { color: var(--priority-1); background: var(--priority-1-tint); } .prio.p2 { color: var(--priority-2); background: var(--priority-2-tint); }
    .prio.p3 { color: var(--priority-3); background: var(--priority-3-tint); }
    .none { padding: 12px; }
    .foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    .progress { height: 6px; border-radius: 99px; background: var(--surface-sunken); overflow: hidden; }
    .progress span { display: block; height: 100%; background: var(--grad-brand); transition: width .3s ease; }
    .count { font-size: 12px; margin: 10px 0 0; }
    .q { font-size: 22px; font-weight: 800; margin: 4px 0 14px; }
    .duel { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch; }
    @media (max-width: 600px) { .duel { grid-template-columns: 1fr; } .vs { text-align: center; } }
    .side { padding: 18px; border-radius: 14px; font-size: 16px; font-weight: 700; display: flex; gap: 10px; align-items: flex-start; animation: pop-in .25s ease both; }
    .side.a { background: color-mix(in srgb, var(--brand) 12%, var(--surface)); }
    .side.b { background: color-mix(in srgb, #e8a33d 16%, var(--surface)); }
    .tag { width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; font-size: 12px; flex: none; color: #fff; }
    .a .tag { background: var(--brand); } .b .tag { background: #d08a24; }
    .vs { align-self: center; font-weight: 800; color: var(--ink-subtle); }
    .answers { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 16px; }
    @media (max-width: 700px) { .answers { grid-template-columns: repeat(3, 1fr); } .ans.eq { grid-column: span 3; } }
    .ans { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px; border-radius: 12px; border: 0; cursor: pointer;
      font: inherit; font-size: 12px; font-weight: 600; background: var(--surface-sunken); color: var(--ink); transition: transform .12s, background .12s; }
    .ans:hover { transform: translateY(-2px); }
    .ans.a:hover, .ans.a.sel { background: color-mix(in srgb, var(--brand) 22%, var(--surface)); }
    .ans.b:hover, .ans.b.sel { background: color-mix(in srgb, #e8a33d 28%, var(--surface)); }
    .ans.eq:hover, .ans.eq.sel { background: var(--surface-selected); }
    .who { font-size: 16px; font-weight: 800; }
    kbd { font-size: 10px; color: var(--ink-subtle); }
    .consistency { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; font-size: 13px;
      background: color-mix(in srgb, var(--brand) 10%, var(--surface)); color: var(--brand-ink); margin-bottom: 12px; }
    .consistency.bad { background: color-mix(in srgb, var(--date-overdue) 10%, var(--surface)); color: var(--date-overdue); }
    .note { display: block; color: var(--ink-muted); font-size: 12px; margin-top: 2px; }
    .ranking { list-style: none; margin: 0; padding: 0; }
    .ranking li { display: grid; grid-template-columns: 28px 1fr minmax(80px, 180px) 34px 40px; gap: 10px; align-items: center; padding: 8px 4px;
      border-bottom: 1px solid var(--border); animation: row-in .3s ease backwards; animation-delay: calc(var(--i) * 40ms); }
    .rank { width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; font-size: 12px; font-weight: 800; background: var(--surface-sunken); }
    .rtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar { height: 8px; border-radius: 99px; background: var(--surface-sunken); overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: 99px; background: var(--grad-brand); }
    .ranking .pts { text-align: right; font-weight: 700; color: var(--ink); }
    .matrix { margin-top: 14px; font-size: 13px; }
    .matrix summary { cursor: pointer; color: var(--brand-ink); font-weight: 600; }
    .mscroll { overflow-x: auto; margin-top: 8px; }
    table { border-collapse: collapse; font-size: 12px; }
    th, td { padding: 5px 8px; border: 1px solid var(--border); text-align: center; font-variant-numeric: tabular-nums; }
    th.rowh { text-align: left; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    td.w { font-weight: 700; color: var(--brand-ink); }
    .err { margin: 8px 0 0; }
  `,
})
export class PrioritizePage {
  private api = inject(Api);
  protected store = inject(Store);
  protected readonly indent = indent;
  protected readonly max = MAX;
  protected readonly answers = ANSWERS;

  protected readonly step = signal<'pick' | 'compare' | 'result'>('pick');
  protected readonly scope = signal('all');
  private readonly openTasks = signal<Task[]>([]);
  protected readonly picked = signal<Task[]>([]);
  /** Answers by pair key "i-j" (i < j): how much more important i is than j. */
  private readonly given = signal(new Map<string, number>());
  protected readonly index = signal(0);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  /** Open top-level tasks in the chosen project or category. */
  protected readonly pool = computed(() => {
    const s = this.scope();
    const tops = this.openTasks().filter((t) => !t.parentId);
    if (s.startsWith('p')) return tops.filter((t) => t.projectId === +s.slice(1));
    if (s.startsWith('c')) {
      const ids = this.store.categoryAndDescendants(+s.slice(1));
      return tops.filter((t) => t.category && ids.has(t.category.id));
    }
    return tops;
  });

  protected readonly pairCount = computed(() => (this.picked().length * (this.picked().length - 1)) / 2);

  protected readonly pairs = computed(() => {
    const n = this.picked().length;
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
    // Spread each task's comparisons out, so the same one doesn't show many times in a row.
    return out.sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]) || a[0] - b[0]);
  });

  protected readonly pair = computed(() => this.pairs()[this.index()]);

  protected readonly matrix = computed(() => {
    const n = this.picked().length;
    const m = Array.from({ length: n }, () => Array<number>(n).fill(1));
    for (const [key, v] of this.given()) {
      const [i, j] = key.split('-').map(Number);
      if (i < n && j < n) {
        m[i][j] = v;
        m[j][i] = 1 / v;
      }
    }
    return m;
  });

  protected readonly result = computed<MatrixResult>(() => weigh(this.matrix()));
  protected readonly circles = computed(() => contradictions(this.matrix()));

  protected readonly ranking = computed(() => this.picked()
    .map((task, i) => ({ task, points: this.result().points[i], priority: priorityFromPoints(this.result().points[i]) }))
    .sort((a, b) => b.points - a.points));

  constructor() {
    this.api.treeTasks().subscribe((ts) => this.openTasks.set(ts));
  }

  protected isPicked(t: Task): boolean {
    return this.picked().some((x) => x.id === t.id);
  }

  protected togglePick(t: Task): void {
    this.picked.update((ps) => (this.isPicked(t) ? ps.filter((x) => x.id !== t.id) : ps.length < MAX ? [...ps, t] : ps));
  }

  protected pickTop(): void {
    this.picked.set(this.pool().slice(0, MAX));
  }

  protected start(): void {
    this.given.set(new Map());
    this.index.set(0);
    this.step.set('compare');
  }

  protected answerAt(pr: [number, number]): number | undefined {
    return this.given().get(pr[0] + '-' + pr[1]);
  }

  protected answer(value: number): void {
    const pr = this.pair();
    if (!pr) return;
    this.given.update((m) => new Map(m).set(pr[0] + '-' + pr[1], value));
    if (this.index() < this.pairs().length - 1) this.index.update((i) => i + 1);
    else this.step.set('result');
  }

  /** Keys 1–7 answer, Backspace goes back. */
  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if (this.step() !== 'compare' || (e.target as HTMLElement).closest('input, textarea, select')) return;
    const k = Number(e.key);
    if (k >= 1 && k <= 7) {
      e.preventDefault();
      this.answer(ANSWERS[k - 1].value);
    } else if (e.key === 'Backspace' && this.index() > 0) {
      this.index.update((i) => i - 1);
    }
  }

  protected save(setPriority: boolean): void {
    this.saving.set(true);
    this.error.set('');
    const reqs = this.ranking().map((r) => this.api.updateTask(r.task.id, {
      importance: r.points,
      ...(setPriority ? { priority: r.priority as Priority } : {}),
    }));
    forkJoin(reqs).subscribe({
      next: () => {
        this.saving.set(false);
        this.store.tasksChanged();
        this.store.toast(setPriority ? 'Importance and priorities saved' : 'Importance saved');
        this.step.set('pick');
        this.picked.set([]);
        this.api.treeTasks().subscribe((ts) => this.openTasks.set(ts));
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  protected circleText([i, j, k]: [number, number, number]): string {
    const t = (x: number) => '“' + this.picked()[x].title + '”';
    return `${t(i)} over ${t(j)}, ${t(j)} over ${t(k)}, but ${t(k)} over ${t(i)}`;
  }

  protected pct(x: number): string {
    return Math.round(x * 100) + '%';
  }

  protected fraction(x: number): string {
    if (x >= 1) return String(Math.round(x));
    return '1/' + Math.round(1 / x);
  }
}
