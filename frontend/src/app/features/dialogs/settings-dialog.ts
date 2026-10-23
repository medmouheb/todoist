import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { Auth } from '../../core/auth';
import { Icon } from '../../core/icon';
import { AccountType, HomeView, TeamSize, Theme, TimeFormat, UseCase } from '../../core/models';
import { Store } from '../../core/store';

/** Profile, password and preferences. */
@Component({
  selector: 'app-settings-dialog',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" (click)="close()">
      <div class="dialog settings" role="dialog" aria-labelledby="settings-title" (click)="$event.stopPropagation()" (keydown.escape)="close()">
        <div class="head">
          <h2 id="settings-title">Settings</h2>
          <button type="button" class="ibtn" aria-label="Close" (click)="close()"><app-icon name="close" /></button>
        </div>

        <form class="block" (ngSubmit)="saveSettings()">
          <h3>Profile and preferences</h3>
          <div class="field"><label for="s-name">Name</label><input id="s-name" class="input" name="name" [(ngModel)]="name" /></div>
          <div class="field"><span class="label">Email</span><span class="muted">{{ auth.user()?.email }}</span></div>
          <div class="grid">
            <div class="field"><label for="s-type">Account</label>
              <select id="s-type" class="input" name="type" [(ngModel)]="accountType">
                <option value="INDIVIDUAL">Individual</option><option value="ORGANIZATION">Organization</option>
              </select>
            </div>
            @if (accountType === 'ORGANIZATION') {
              <div class="field"><label for="s-org">Organization</label><input id="s-org" class="input" name="org" [(ngModel)]="organizationName" /></div>
              <div class="field"><label for="s-size">Team size</label>
                <select id="s-size" class="input" name="size" [(ngModel)]="teamSize">
                  <option value="">Not set</option>
                  @for (s of sizes; track s) { <option [value]="s">{{ s }} people</option> }
                </select>
              </div>
              <div class="field"><label for="s-title">Your role</label><input id="s-title" class="input" name="title" [(ngModel)]="jobTitle" /></div>
            } @else {
              <div class="field"><label for="s-use">Mainly for</label>
                <select id="s-use" class="input" name="use" [(ngModel)]="useCase">
                  <option value="">Not set</option><option value="personal">Personal life</option><option value="work">Work</option>
                  <option value="study">Studies</option><option value="freelance">Freelancing</option><option value="other">Something else</option>
                </select>
              </div>
            }
          </div>
          <div class="grid">
            <div class="field"><label for="s-theme">Theme</label>
              <select id="s-theme" class="input" name="theme" [(ngModel)]="theme">
                <option value="system">Match my device</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </div>
            <div class="field"><label for="s-home">Home view</label>
              <select id="s-home" class="input" name="home" [(ngModel)]="homeView">
                <option value="today">Today</option><option value="inbox">Inbox</option><option value="upcoming">Upcoming</option>
              </select>
            </div>
            <div class="field"><label for="s-time">Time format</label>
              <select id="s-time" class="input" name="time" [(ngModel)]="timeFormat">
                <option value="24h">24-hour (15:00)</option><option value="12h">12-hour (3:00 PM)</option>
              </select>
            </div>
            <div class="field"><label for="s-week">Week starts on</label>
              <select id="s-week" class="input" name="week" [(ngModel)]="weekStart">
                <option [ngValue]="1">Monday</option><option [ngValue]="0">Sunday</option>
              </select>
            </div>
          </div>
          @if (settingsMsg()) { <p class="msg" [class.err]="settingsErr()">{{ settingsMsg() }}</p> }
          <div class="actions"><button class="btn primary" type="submit">Save</button></div>
        </form>

        <form class="block" (ngSubmit)="changePassword()">
          <h3>Change password</h3>
          <div class="grid">
            <div class="field"><label for="s-cur">Current password</label>
              <input id="s-cur" class="input" type="password" name="cur" autocomplete="current-password" [(ngModel)]="currentPassword" /></div>
            <div class="field"><label for="s-new">New password</label>
              <input id="s-new" class="input" type="password" name="new" autocomplete="new-password" [(ngModel)]="newPassword" /></div>
          </div>
          @if (passwordMsg()) { <p class="msg" [class.err]="passwordErr()">{{ passwordMsg() }}</p> }
          <div class="actions"><button class="btn" type="submit">Change password</button></div>
        </form>
      </div>
    </div>
  `,
  styles: `
    .settings { max-width: 560px; }
    .head { display: flex; align-items: center; justify-content: space-between; }
    .block { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
    h3 { margin: 0; font-size: 14px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
    .msg { margin: 0; font-size: 13px; color: var(--success, var(--date-today)); }
    .msg.err { color: var(--danger); }
  `,
})
export class SettingsDialog implements OnInit {
  private api = inject(Api);
  protected auth = inject(Auth);
  private store = inject(Store);

  protected name = '';
  protected theme: Theme = 'system';
  protected homeView: HomeView = 'today';
  protected timeFormat: TimeFormat = '24h';
  protected weekStart: 0 | 1 = 1;
  protected accountType: AccountType = 'INDIVIDUAL';
  protected organizationName = '';
  protected teamSize: TeamSize | '' = '';
  protected jobTitle = '';
  protected useCase: UseCase | '' = '';
  protected readonly sizes: TeamSize[] = ['1-10', '11-50', '51-200', '201-1000', '1000+'];
  protected currentPassword = '';
  protected newPassword = '';
  protected readonly settingsMsg = signal('');
  protected readonly settingsErr = signal(false);
  protected readonly passwordMsg = signal('');
  protected readonly passwordErr = signal(false);

  ngOnInit(): void {
    const u = this.auth.user();
    if (!u) return;
    this.name = u.name;
    this.theme = u.theme;
    this.homeView = u.homeView;
    this.timeFormat = u.timeFormat;
    this.weekStart = u.weekStart;
    this.accountType = u.accountType;
    this.organizationName = u.organizationName ?? '';
    this.teamSize = u.teamSize ?? '';
    this.jobTitle = u.jobTitle ?? '';
    this.useCase = u.useCase ?? '';
  }

  protected close(): void {
    this.store.settingsOpen.set(false);
  }

  protected saveSettings(): void {
    if (!this.name.trim()) {
      this.settingsErr.set(true);
      return this.settingsMsg.set('Your name can’t be empty.');
    }
    this.api.updateSettings({
      name: this.name.trim(), theme: this.theme, homeView: this.homeView, timeFormat: this.timeFormat, weekStart: this.weekStart,
      accountType: this.accountType, useCase: this.accountType === 'INDIVIDUAL' ? this.useCase : '',
      organizationName: this.accountType === 'ORGANIZATION' ? this.organizationName.trim() : '',
      teamSize: this.accountType === 'ORGANIZATION' ? this.teamSize : '',
      jobTitle: this.accountType === 'ORGANIZATION' ? this.jobTitle.trim() : '',
    }).subscribe({
      next: (u) => {
        this.auth.setUser(u);
        this.settingsErr.set(false);
        this.settingsMsg.set('Saved.');
        this.store.tasksChanged();
      },
      error: (err) => {
        this.settingsErr.set(true);
        this.settingsMsg.set(errorMessage(err));
      },
    });
  }

  protected changePassword(): void {
    if (this.newPassword.length < 8) {
      this.passwordErr.set(true);
      return this.passwordMsg.set('Use at least 8 characters for the new password.');
    }
    this.api.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.passwordErr.set(false);
        this.passwordMsg.set('Password changed.');
        this.currentPassword = '';
        this.newPassword = '';
      },
      error: (err) => {
        this.passwordErr.set(true);
        this.passwordMsg.set(errorMessage(err));
      },
    });
  }
}
