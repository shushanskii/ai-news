export enum TodoStatus {
  Active = "active",
  Done = "done",
}

export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly status: TodoStatus;
  /**
   * ISO calendar date (`YYYY-MM-DD`) - the last day this todo may stay unfinished. A date and not
   * a timestamp: a deadline without a time of day has no timezone to get wrong, and it compares
   * correctly as text. Absent means no deadline, so the todo is never overdue.
   */
  readonly dueDate?: string;
}
