import { z } from "zod";
import { type Todo, TodoStatus } from "#types/todo";

// Wire formats live here, not in `types/`: a schema is runtime behaviour, and `types/` holds only
// types. The request DTOs are inferred from the schemas, so validation and types cannot drift.

// Responses are checked against the domain model rather than inferring a second copy of it. The
// `ZodType<Todo>` annotation makes a schema that drifts from `Todo` a compile error.
export const todoSchema: z.ZodType<Todo> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(TodoStatus),
  dueDate: z.iso.date().optional(),
});

export const todoListSchema = z.array(todoSchema);

export const createTodoSchema = z.object({
  title: z.string().trim().min(1),
  dueDate: z.iso.date().optional(),
});

// `null` clears a deadline someone else set; `undefined` (the key absent) leaves it alone. Without
// the third state there is no way to take a due date back off a todo.
export const updateTodoSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    status: z.enum(TodoStatus).optional(),
    dueDate: z.iso.date().nullable().optional(),
  })
  // An all-optional object accepts `{}`, which would report success while changing nothing.
  .refine(
    (update) =>
      update.title !== undefined || update.status !== undefined || update.dueDate !== undefined,
    { message: "at least one of title, status or dueDate is required" },
  );

// Query parameters arrive as strings, so `?overdue` is validated rather than coerced: `Boolean` of
// the text "false" is true, which is how a filter turns into its own opposite. Absent stays absent
// so the service can tell "no filter" from "filter off".
export const todoListQuerySchema = z.object({
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type CreateTodo = z.infer<typeof createTodoSchema>;
export type UpdateTodo = z.infer<typeof updateTodoSchema>;
// `Partial` because the transform makes the key always present in the parsed output, and a caller
// building a request needs to leave it out entirely.
export type TodoListQuery = Partial<z.infer<typeof todoListQuerySchema>>;
