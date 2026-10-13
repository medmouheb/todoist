import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '../../core/icon';
import { Project } from '../../core/models';
import { ProjectActions } from '../../core/project-actions';
import { Store } from '../../core/store';
import { Dropdown } from '../../shared/dropdown';

/** The "⋯" menu for a project, in the sidebar and in the project header. */
@Component({
  selector: 'app-project-menu',
  imports: [Dropdown, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dropdown [align]="align()">
      <button trigger type="button" class="ibtn" [attr.aria-label]="'Actions for ' + project().name"><app-icon name="more" /></button>
      @if (admin() && !project().inbox) {
        <button type="button" (click)="store.editingProject.set(project())"><app-icon name="edit" [small]="true" />Edit project</button>
      }
      @if (!project().inbox) {
        <button type="button" (click)="actions.toggleFavorite(project())"><app-icon name="star" [small]="true" />{{ project().favorite ? 'Remove from favorites' : 'Add to favorites' }}</button>
        <button type="button" (click)="store.shareProjectId.set(project().id)"><app-icon name="share" [small]="true" />{{ admin() ? 'Share' : 'People' }}</button>
      }
      <hr />
      <button type="button" (click)="actions.duplicate(project())"><app-icon name="copy" [small]="true" />Duplicate</button>
      <button type="button" (click)="actions.exportTemplate(project())"><app-icon name="download" [small]="true" />Save as template (CSV)</button>
      @if (project().role !== 'GUEST' && !project().archived) {
        <button type="button" (click)="actions.importCsv(project())"><app-icon name="upload" [small]="true" />Import from CSV</button>
      }
      @if (!project().inbox) {
        <hr />
        @if (admin()) {
          <button type="button" (click)="actions.setArchived(project(), !project().archived)"><app-icon name="archive" [small]="true" />{{ project().archived ? 'Unarchive' : 'Archive' }}</button>
        }
        @if (project().memberCount > 1) {
          <button type="button" (click)="actions.leave(project())"><app-icon name="leave" [small]="true" />Leave project</button>
        }
        @if (admin()) {
          <button type="button" class="danger" (click)="actions.delete(project())"><app-icon name="trash" [small]="true" />Delete project</button>
        }
      }
    </app-dropdown>
  `,
})
export class ProjectMenu {
  protected store = inject(Store);
  protected actions = inject(ProjectActions);
  readonly project = input.required<Project>();
  readonly align = input<'left' | 'right'>('right');
  protected readonly admin = computed(() => this.project().role === 'ADMIN');
}
