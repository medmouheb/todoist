import type { Task } from './models';

/** An enum value with a key (what the API stores) and a value (what people read). */
abstract class KeyedEnum<K extends string> {
  constructor(readonly key: K, readonly value: string) {}
  toString(): string {
    return this.key;
  }
}

export type TodoStateKey = 'TODO' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'TO_FOLLOW_UP' | 'CONDITIONAL' | 'DELETED';

export class TodoStateEnum extends KeyedEnum<TodoStateKey> {
  static readonly TODO = new TodoStateEnum('TODO', 'To do');
  static readonly DAILY = new TodoStateEnum('DAILY', 'Daily');
  static readonly WEEKLY = new TodoStateEnum('WEEKLY', 'Weekly');
  static readonly MONTHLY = new TodoStateEnum('MONTHLY', 'Monthly');
  static readonly TO_FOLLOW_UP = new TodoStateEnum('TO_FOLLOW_UP', 'To follow up');
  static readonly CONDITIONAL = new TodoStateEnum('CONDITIONAL', 'Conditional');
  static readonly DELETED = new TodoStateEnum('DELETED', 'Deleted');

  static readonly ALL = [
    TodoStateEnum.TODO, TodoStateEnum.DAILY, TodoStateEnum.WEEKLY, TodoStateEnum.MONTHLY,
    TodoStateEnum.TO_FOLLOW_UP, TodoStateEnum.CONDITIONAL, TodoStateEnum.DELETED,
  ];

  static of(key: string | null | undefined): TodoStateEnum {
    return TodoStateEnum.ALL.find((s) => s.key === key) ?? TodoStateEnum.TODO;
  }
}

export type PossibleTimesKey = 'ALL_TIMES' | 'WORKING_HOURS' | 'ONLY_WEEKENDS';

export class TodoPossibleTimesEnum extends KeyedEnum<PossibleTimesKey> {
  static readonly ALL_TIMES = new TodoPossibleTimesEnum('ALL_TIMES', 'Any time');
  static readonly WORKING_HOURS = new TodoPossibleTimesEnum('WORKING_HOURS', 'Working hours');
  static readonly ONLY_WEEKENDS = new TodoPossibleTimesEnum('ONLY_WEEKENDS', 'Only weekends');

  static readonly ALL = [TodoPossibleTimesEnum.ALL_TIMES, TodoPossibleTimesEnum.WORKING_HOURS, TodoPossibleTimesEnum.ONLY_WEEKENDS];

  static of(key: string | null | undefined): TodoPossibleTimesEnum {
    return TodoPossibleTimesEnum.ALL.find((s) => s.key === key) ?? TodoPossibleTimesEnum.ALL_TIMES;
  }
}

/** Why a task is worth doing. */
export interface ReasonToDoIt {
  money: number | null;
  timeToGainInYearByHours: number | null;
  /** 0–10 */
  emotionalOnScaleTo10: number | null;
}

/** Why it wasn't done when its notification went out. */
export interface NotDoneEntry {
  id: number;
  notificationTime: string;
  reasonOfNotDoing: string[];
  createdAt: string;
}

export class TodoCategory {
  constructor(readonly id: number, readonly label: string) {}
}

/**
 * The to-do model, built from a task as the API returns it. Most fields are the task's own under
 * another name: content is the title, isDone is completed, hashtagList are the labels, steps are the
 * sub-tasks, dependancyList are the tasks it must wait for ("after" conditions), contentHistory comes
 * from the task's history.
 */
export default class ToDo {
  id = 0;
  content = '';
  dueDate: Date | null = null;
  /** In hours: 0.25 is 15 minutes. */
  duration = 0.25;
  isDone = false;
  state: TodoStateEnum = TodoStateEnum.TODO;
  parent: { id: number; content: string } | null = null;
  /** Sub-task ids. */
  steps: number[] = [];
  possibleTimesToDoIt: TodoPossibleTimesEnum = TodoPossibleTimesEnum.ALL_TIMES;
  /** Earlier names, oldest first. */
  contentHistory: string[] = [];
  reasonToDoIt: ReasonToDoIt = { money: null, timeToGainInYearByHours: null, emotionalOnScaleTo10: null };
  notificationTime: Date | null = null;
  hashtagList: string[] = [];
  whyNotdoneWhenNotified: { notificationTime: Date; reasonOfNotDoing: string[] }[] = [];
  /** Ids of the tasks this one waits for. */
  dependancyList: number[] = [];
  category: TodoCategory | null = null;

  static fromTask(t: Task, extra: { parent?: Task | null; subtasks?: Task[]; contentHistory?: string[] } = {}): ToDo {
    const todo = new ToDo();
    todo.id = t.id;
    todo.content = t.title;
    todo.dueDate = t.dueDate ? new Date(t.dueDate + (t.dueTime ? 'T' + t.dueTime : 'T00:00')) : null;
    todo.duration = t.durationMinutes != null ? t.durationMinutes / 60 : 0.25;
    todo.isDone = t.completed;
    todo.state = TodoStateEnum.of(t.state);
    todo.parent = extra.parent ? { id: extra.parent.id, content: extra.parent.title } : null;
    todo.steps = (extra.subtasks ?? []).map((s) => s.id);
    todo.possibleTimesToDoIt = TodoPossibleTimesEnum.of(t.possibleTimes);
    todo.contentHistory = extra.contentHistory ?? [];
    if (t.reason) todo.reasonToDoIt = { ...t.reason };
    todo.notificationTime = t.notificationTime ? new Date(t.notificationTime) : null;
    todo.hashtagList = t.labels.map((l) => l.name);
    todo.whyNotdoneWhenNotified = (t.notDone ?? []).map((n) => ({
      notificationTime: new Date(n.notificationTime), reasonOfNotDoing: n.reasons,
    }));
    todo.dependancyList = t.conditions.filter((c) => c.type === 'AFTER' && c.afterTaskId).map((c) => c.afterTaskId!);
    todo.category = t.category ? new TodoCategory(t.category.id, t.category.name) : null;
    return todo;
  }

  /** From a task's JSON (as the API sends it). */
  static createFromJson(json: Task): ToDo {
    return ToDo.fromTask(json);
  }
}
