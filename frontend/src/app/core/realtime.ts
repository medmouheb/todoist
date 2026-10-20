import { Injectable, NgZone, inject } from '@angular/core';
import { Auth } from './auth';
import { NotificationType } from './models';
import { Store } from './store';

interface LiveNotification {
  id: number;
  type: NotificationType;
  message: string;
  projectId: number | null;
  taskId: number | null;
}

/**
 * Keeps one live connection to the server (Server-Sent Events, /api/events) while signed in.
 * - "notification": something for you; the bell updates and a toast shows it.
 * - "changed": someone changed tasks in one of your projects; open lists reload.
 * The browser reconnects by itself if the connection drops (or the server was asleep).
 */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private auth = inject(Auth);
  private store = inject(Store);
  private zone = inject(NgZone);
  private source: EventSource | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    const token = this.auth.token();
    if (!token || this.source) return;
    const es = new EventSource(`/api/events?access_token=${encodeURIComponent(token)}`);
    this.source = es;

    // The stream can't replay what happened while it was down (page loading, network drop,
    // server asleep), so each time it (re)connects, catch up on notifications and lists.
    let connectedBefore = false;
    es.addEventListener('ready', () => this.zone.run(() => {
      this.store.catchUp();
      if (connectedBefore) this.store.tasksChanged();
      connectedBefore = true;
    }));

    es.addEventListener('notification', (e) => this.zone.run(() => {
      const n = JSON.parse((e as MessageEvent).data) as LiveNotification;
      this.store.loadNotifications();
      this.store.toastNotification(n);
    }));

    es.addEventListener('changed', () => this.zone.run(() => {
      // Several changes often arrive together (a task and its sub-tasks): reload once.
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => this.store.tasksChanged(), 300);
    }));

    es.onerror = () => {
      // A closed stream (expired login) won't recover; stop and let the next API call sign out.
      if (es.readyState === EventSource.CLOSED) this.stop();
    };
  }

  stop(): void {
    this.source?.close();
    this.source = null;
  }
}
