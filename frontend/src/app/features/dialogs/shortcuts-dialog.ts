import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Icon } from '../../core/icon';
import { Store } from '../../core/store';

/** Every keyboard shortcut, opened with "?". */
@Component({
  selector: 'app-shortcuts-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" (click)="close()">
      <div class="dialog keys" role="dialog" aria-labelledby="keys-title" (click)="$event.stopPropagation()">
        <div class="head">
          <h2 id="keys-title">Keyboard shortcuts</h2>
          <button type="button" class="ibtn" aria-label="Close" (click)="close()"><app-icon name="close" /></button>
        </div>
        @for (g of groups; track g.name) {
          <h3>{{ g.name }}</h3>
          <dl>
            @for (k of g.keys; track k[1]) {
              <dt>@for (part of k[0].split(' '); track $index) { <span class="kbd">{{ part }}</span> }</dt><dd>{{ k[1] }}</dd>
            }
          </dl>
        }
      </div>
    </div>
  `,
  styles: `
    .keys { max-width: 520px; }
    .head { display: flex; align-items: center; justify-content: space-between; }
    h3 { margin: 4px 0 0; font-size: 13px; color: var(--ink-muted); }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; align-items: center; }
    dt { display: flex; gap: 4px; } dd { margin: 0; font-size: 13px; }
  `,
})
export class ShortcutsDialog {
  private store = inject(Store);
  protected readonly groups = [
    { name: 'Anywhere', keys: [['Q', 'Add a task'], ['G I', 'Go to Inbox'], ['G T', 'Go to Today'], ['G U', 'Go to Upcoming'],
      ['G C', 'Go to Completed'], ['?', 'Show these shortcuts'], ['Esc', 'Close a dialog or panel']] },
    { name: 'In a task list', keys: [['↑ ↓', 'Select the previous or next task (or K / J)'], ['Enter', 'Open the selected task'],
      ['E', 'Edit the selected task'], ['T', 'Change its date'], ['1 2 3 4', 'Set its priority'],
      ['Ctrl Enter', 'Complete it (⌘ Enter on Mac)'], ['Del', 'Delete it']] },
    { name: 'Adding or editing', keys: [['Enter', 'Save'], ['Ctrl Enter', 'Save from the description'], ['Esc', 'Cancel']] },
  ];

  protected close(): void {
    this.store.shortcutsOpen.set(false);
  }
}
