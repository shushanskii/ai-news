import { describe, expect, it } from "vitest";
import { createTodoSchema, todoListQuerySchema, todoSchema, updateTodoSchema } from "#schemas/todo";
import { TodoStatus } from "#types/todo";

describe("todoSchema", () => {
  it("accepts a todo with no due date", () => {
    const result = todoSchema.safeParse({ id: "todo-1", title: "x", status: TodoStatus.Active });

    expect(result.success).toBe(true);
  });

  it("accepts an ISO calendar date as the due date", () => {
    const result = todoSchema.safeParse({
      id: "todo-1",
      title: "x",
      status: TodoStatus.Active,
      dueDate: "2026-10-20",
    });

    expect(result.success).toBe(true);
  });

  // A timestamp would compare wrong against a date, so the wire format does not allow one.
  it("rejects a due date that is not a calendar date", () => {
    expect(
      todoSchema.safeParse({
        id: "todo-1",
        title: "x",
        status: TodoStatus.Active,
        dueDate: "2026-10-20T00:00:00Z",
      }).success,
    ).toBe(false);

    expect(
      todoSchema.safeParse({
        id: "todo-1",
        title: "x",
        status: TodoStatus.Active,
        dueDate: "2026-13-01",
      }).success,
    ).toBe(false);
  });
});

describe("createTodoSchema", () => {
  it("trims the title", () => {
    const result = createTodoSchema.safeParse({ title: "  read the conventions  " });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ title: "read the conventions" });
  });

  it("rejects a blank title", () => {
    expect(createTodoSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(createTodoSchema.safeParse({}).success).toBe(false);
  });

  it("treats the due date as optional", () => {
    expect(createTodoSchema.safeParse({ title: "x" }).data).toEqual({ title: "x" });
    expect(createTodoSchema.safeParse({ title: "x", dueDate: "2026-10-20" }).data).toEqual({
      title: "x",
      dueDate: "2026-10-20",
    });
    expect(createTodoSchema.safeParse({ title: "x", dueDate: "next tuesday" }).success).toBe(false);
  });
});

describe("updateTodoSchema", () => {
  it("accepts a partial update", () => {
    const result = updateTodoSchema.safeParse({ status: TodoStatus.Done });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: TodoStatus.Done });
  });

  it("rejects an empty update", () => {
    expect(updateTodoSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a status outside the enum", () => {
    expect(updateTodoSchema.safeParse({ status: "archived" }).success).toBe(false);
  });

  it("accepts a due date on its own", () => {
    expect(updateTodoSchema.safeParse({ dueDate: "2026-10-20" }).data).toEqual({
      dueDate: "2026-10-20",
    });
  });

  // Absent leaves the deadline alone, null takes it off - two different requests.
  it("tells an absent due date from a cleared one", () => {
    expect(updateTodoSchema.safeParse({ title: "x" }).data).toEqual({ title: "x" });
    expect(updateTodoSchema.safeParse({ dueDate: null }).data).toEqual({ dueDate: null });
    expect(updateTodoSchema.safeParse({ dueDate: null }).success).toBe(true);
  });
});

describe("todoListQuerySchema", () => {
  it("leaves an absent filter absent", () => {
    expect(todoListQuerySchema.safeParse({}).data).toEqual({ overdue: undefined });
  });

  it("reads the two wire spellings of the boolean", () => {
    expect(todoListQuerySchema.safeParse({ overdue: "true" }).data).toEqual({ overdue: true });
    expect(todoListQuerySchema.safeParse({ overdue: "false" }).data).toEqual({ overdue: false });
  });

  // Anything else is a client bug, and coercing it to false would hide it as "show everything".
  it("rejects a filter it cannot spell", () => {
    expect(todoListQuerySchema.safeParse({ overdue: "1" }).success).toBe(false);
    expect(todoListQuerySchema.safeParse({ overdue: "yes" }).success).toBe(false);
  });
});
