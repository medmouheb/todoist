import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { Store } from '../../core/store';

/** The designed replacement for window.confirm(). Opened through Store.confirm(). */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.confirmRequest(); as r) {
      <div class="overlay" (click)="r.resolve(false)">
        <div class="dialog confirm" role="alertdialog" aria-labelledby="c-title" aria-describedby="c-msg"
             (click)="$event.stopPropagation()" (keydown.escape)="r.resolve(false)">
          <h2 id="c-title">{{ r.title }}</h2>
          <p id="c-msg">{{ r.message }}</p>
          <div class="actions">
            <button type="button" class="btn" (click)="r.resolve(false)">Cancel</button>
            <button #ok type="button" class="btn" [class.danger]="r.danger" [class.primary]="!r.danger" (click)="r.resolve(true)">{{ r.confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .overlay { z-index: 300; }
    .confirm { max-width: 400px; }
    p { margin: 0; color: var(--ink-muted); overflow-wrap: anywhere; }
  `,
})
export class ConfirmDialog {
  protected store = inject(Store);
  private ok = viewChild<ElementRef<HTMLButtonElement>>('ok');

  constructor() {
    // Focus the confirm button each time a confirmation opens, so Enter confirms and Esc cancels.
    effect(() => {
      if (this.store.confirmRequest()) setTimeout(() => this.ok()?.nativeElement.focus());
    });
  }
}
