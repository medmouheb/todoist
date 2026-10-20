export type Theme = 'system' | 'light' | 'dark';
export type TimeFormat = '24h' | '12h';
export type HomeView = 'today' | 'inbox' | 'upcoming';

export interface User {
  id: number;
  email: string;
  name: string;
  initials: string;
  theme: Theme;
  timeFormat: TimeFormat;
  /** 1 = Monday, 0 = Sunday */
  weekStart: 0 | 1;
  homeView: HomeView;
  timeZone: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const PROJECT_COLORS = [
  'moss', 'clay', 'sky', 'plum', 'sun', 'rose', 'slate', 'teal', 'lime', 'charcoal',
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export type Role = 'ADMIN' | 'MEMBER' | 'GUEST';

export interface Project {
  id: number;
  name: string;
  color: ProjectColor;
  favorite: boolean;
  inbox: boolean;
  archived: boolean;
  position: number;
  openTasks: number;
  role: Role;
  memberCount: number;
}

/** 1 is the most urgent (P1); 4 means no priority. */
export type Priority = 1 | 2 | 3 | 4;

export interface LabelRef {
  id: number;
  name: string;
  color: ProjectColor;
}

export interface PersonRef {
  id: number;
  name: string;
  initials: string;
}

export interface Task {
  id: number;
  projectId: number;
  parentId: number | null;
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null; // yyyy-mm-dd
  dueTime: string | null; // HH:mm:ss
  durationMinutes: number | null;
  recurrence: string | null;
  completed: boolean;
  completedAt: string | null;
  position: number;
  createdAt: string;
  createdBy: PersonRef | null;
  assignee: PersonRef | null;
  labels: LabelRef[];
  subtaskCount: number;
  subtaskDone: number;
  commentCount: number;
  category: CategoryRef | null;
  /** ISO instant */
  deadline: string | null;
}

export interface CategoryRef {
  id: number;
  name: string;
  color: ProjectColor;
}

export interface Category extends CategoryRef {
  position: number;
}

/** Date, time, duration and repeat travel together through the date picker. */
export interface Due {
  date: string | null;
  time: string | null; // HH:mm
  duration: number | null;
  recurrence: string | null;
}

export interface NewTask {
  title: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
  durationMinutes?: number | null;
  recurrence?: string | null;
  projectId?: number | null;
  parentId?: number | null;
  assigneeId?: number | null;
  labels?: string[];
  categoryId?: number | null;
  deadline?: string | null;
}

export interface TaskChanges {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
  dueTime?: string;
  clearDueTime?: boolean;
  durationMinutes?: number;
  clearDuration?: boolean;
  recurrence?: string;
  clearRecurrence?: boolean;
  clearDueDate?: boolean;
  projectId?: number;
  assigneeId?: number;
  clearAssignee?: boolean;
  labels?: string[];
  completed?: boolean;
  today?: string;
  categoryId?: number;
  clearCategory?: boolean;
  deadline?: string;
  clearDeadline?: boolean;
}

export type TaskView = 'inbox' | 'today' | 'upcoming';

export interface Member {
  userId: number;
  name: string;
  email: string;
  initials: string;
  role: Role;
}

export interface Invite {
  id: number;
  projectId: number;
  projectName: string;
  projectColor: ProjectColor;
  email: string;
  role: Role;
  /** What the role allows, in plain words. */
  permissions: string;
  invitedBy: string | null;
  createdAt: string;
}

export interface Sharing {
  myRole: Role;
  members: Member[];
  invites: Invite[];
}

export interface Comment {
  id: number;
  taskId: number;
  authorId: number;
  authorName: string;
  authorInitials: string;
  body: string;
  createdAt: string;
}

export type NotificationType = 'INVITE' | 'INVITE_ACCEPTED' | 'INVITE_DECLINED' | 'ASSIGNED' | 'COMMENT' | 'MENTION'
  | 'ACTIVITY' | 'REMINDER' | 'DEADLINE_SOON' | 'DEADLINE_MISSED';

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
  actorId: number | null;
  actorName: string | null;
  actorInitials: string | null;
  projectId: number | null;
  taskId: number | null;
  inviteId: number | null;
  read: boolean;
  createdAt: string;
}

export interface Settings {
  name?: string;
  theme?: Theme;
  timeFormat?: TimeFormat;
  weekStart?: 0 | 1;
  homeView?: HomeView;
  timeZone?: string;
}

export interface HistoryEntry {
  id: number;
  action: string;
  actorId: number | null;
  actorName: string;
  actorInitials: string;
  projectId: number;
  projectName: string | null;
  projectColor: ProjectColor | null;
  taskId: number | null;
  taskTitle: string | null;
  /** field → [before, after] */
  changes: Record<string, [unknown, unknown]> | null;
  createdAt: string;
}

export interface HistoryPage {
  items: HistoryEntry[];
  nextBefore: number | null;
}
