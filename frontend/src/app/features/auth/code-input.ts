import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, signal, viewChildren } from '@angular/core';

/**
 * Six boxes for a verification code: typing moves to the next box, Backspace to the previous one,
 * and pasting "123456" (or "123 456") fills them all. Emits the code once all six are filled.
 */
@Component({
  selector: 'app-code-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="boxes" [class.shake]="shake()" role="group" aria-label="6-digit code">
      @for (i of slots; track i) {
        <input #box type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="1"
               [attr.aria-label]="'Digit ' + (i + 1)" [value]="digits()[i]" [disabled]="disabled()"
               [class.filled]="!!digits()[i]" [class.ok]="success()"
               (input)="onInput(i, $event)" (keydown)="onKey(i, $event)" (paste)="onPaste($event)" (focus)="select($event)" />
        @if (i === 2) { <span class="dash" aria-hidden="true">–</span> }
      }
    </div>
  `,
  styles: `
    .boxes { display: flex; align-items: center; gap: 8px; justify-content: center; }
    input {
      width: 52px; height: 62px; border-radius: 14px; border: 2px solid var(--border); background: var(--surface);
      text-align: center; font-size: 26px; font-weight: 700; color: var(--ink); caret-color: var(--brand);
      transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease, background .3s ease;
    }
    input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 20%, transparent); transform: translateY(-2px); }
    input.filled { border-color: color-mix(in srgb, var(--brand) 60%, var(--border)); }
    input.ok { border-color: var(--date-today); background: color-mix(in srgb, var(--date-today) 12%, var(--surface)); }
    .dash { color: var(--ink-subtle); font-size: 22px; }
    .shake { animation: shake .45s ease; }
    @keyframes shake { 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
    @media (max-width: 420px) { input { width: 42px; height: 54px; font-size: 22px; } .boxes { gap: 5px; } }
    @media (prefers-reduced-motion: reduce) { .shake { animation: none; } }
  `,
})
export class CodeInput {
  readonly disabled = input(false);
  /** Bump this number to shake the boxes and clear them (after a wrong code). */
  readonly error = input(0);
  readonly success = input(false);
  readonly completed = output<string>();

  protected readonly slots = [0, 1, 2, 3, 4, 5];
  protected readonly digits = signal<string[]>(['', '', '', '', '', '']);
  protected readonly shake = signal(false);
  private boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  constructor() {
    effect(() => {
      if (this.error() > 0) {
        this.shake.set(true);
        setTimeout(() => this.shake.set(false), 500);
        this.digits.set(['', '', '', '', '', '']);
        setTimeout(() => this.focus(0), 50);
      }
    });
    setTimeout(() => this.focus(0), 120);
  }

  protected onInput(i: number, e: Event): void {
    const el = e.target as HTMLInputElement;
    const d = el.value.replace(/\D/g, '').slice(-1);
    el.value = d;
    this.set(i, d);
    if (d && i < 5) this.focus(i + 1);
    this.emitIfDone();
  }

  protected onKey(i: number, e: KeyboardEvent): void {
    if (e.key === 'Backspace' && !this.digits()[i] && i > 0) {
      e.preventDefault();
      this.set(i - 1, '');
      this.focus(i - 1);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      this.focus(i - 1);
    } else if (e.key === 'ArrowRight' && i < 5) {
      this.focus(i + 1);
    }
  }

  protected onPaste(e: ClipboardEvent): void {
    const code = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
    if (!code) return;
    e.preventDefault();
    this.digits.set([...code.padEnd(6, ' ')].map((c) => c.trim()));
    this.focus(Math.min(code.length, 5));
    this.emitIfDone();
  }

  protected select(e: FocusEvent): void {
    (e.target as HTMLInputElement).select();
  }

  private set(i: number, d: string): void {
    this.digits.update((ds) => ds.map((x, k) => (k === i ? d : x)));
  }

  private focus(i: number): void {
    this.boxes()[i]?.nativeElement.focus();
  }

  private emitIfDone(): void {
    const code = this.digits().join('');
    if (code.length === 6) this.completed.emit(code);
  }
}
