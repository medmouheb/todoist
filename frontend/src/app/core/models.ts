export interface User {
  id: number;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const PROJECT_COLORS = [
  'moss', 'clay', 'sky', 'plum', 'sun', 'rose', 'slate', 'teal', 'lime', 'charcoal',
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export interface Project {
  id: number;
  name: string;
  color: ProjectColor;
  favorite: boolean;
  inbox: boolean;
  position: number;
  openTasks: number;
}

/** 1 is the most urgent (P1); 4 means no priority. */
export type Priority = 1 | 2 | 3 | 4;

export interface Task {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null; // yyyy-mm-dd
  completed: boolean;
  completedAt: string | null;
  position: number;
  createdAt: string;
}

export interface NewTask {
  title: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  projectId?: number | null;
}

export interface TaskChanges {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
  clearDueDate?: boolean;
  projectId?: number;
  completed?: boolean;
}

export type TaskView = 'inbox' | 'today' | 'upcoming';
