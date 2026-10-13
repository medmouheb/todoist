import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';

/**
 * A button that opens a menu. Put the button in [trigger] and the items (buttons) inside.
 * Clicking an item, clicking outside or pressing Escape closes it.
 */
@Component({
  selector: 'app-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="trigger" (click)="toggle($event)"><ng-content select="[trigger]" /></span>
    @if (open()) {
      <div class="menu" role="menu" [class.right]="align() === 'right'" [class.up]="up()" (click)="onItemClick($event)">
        <ng-content />
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-flex; }
    .trigger { display: inline-flex; }
    .menu { top: calc(100% + 4px); left: 0; }
    .menu.right { left: auto; right: 0; }
    .menu.up { top: auto; bottom: calc(100% + 4px); }
  `,
})
export class Dropdown {
  private host = inject(ElementRef<HTMLElement>);
  readonly align = input<'left' | 'right'>('left');
  readonly up = input(false);
  readonly open = signal(false);

  toggle(e: Event): void {
    e.stopPropagation();
    this.open.update((o) => !o);
  }

  close(): void {
    this.open.set(false);
  }

  protected onItemClick(e: Event): void {
    const el = e.target as HTMLElement;
    if (el.closest('button, a') && !el.closest('[data-keep-open]')) this.close();
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close();
  }
}

/** A stable avatar colour for a person. */
export function avatarColor(id: number | null | undefined): string {
  const colors = ['moss', 'clay', 'sky', 'plum', 'rose', 'slate', 'teal', 'lime'];
  return `var(--proj-${colors[Math.abs(id ?? 0) % colors.length]})`;
}
