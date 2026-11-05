import {
  type CreateTodo,
  type Todo,
  type TodoListQuery,
  todoListSchema,
  todoSchema,
  type UpdateTodo,
} from "@app/shared";
import type { ZodType } from "zod";

// Vite proxies /api to the service in development — see vite.config.ts.
const base = "/api/todos";

// Spelled out rather than handed to URLSearchParams, which would drop the distinction between an
// absent filter and `overdue=false` — the service reads those as two different requests.
function queryString(query: TodoListQuery): string {
  if (query.overdue === undefined) {
    return "";
  }

  return `?overdue=${query.overdue ? "true" : "false"}`;
}

// Every response is parsed through a schema. The server is another process that can be redeployed
// independently, so its output is untrusted input until proven otherwise.
async function send<T>(schema: ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed with ${response.status}`);
  }

  return schema.parse(await response.json());
}

// Exported as one object rather than loose functions: `create`/`update`/`remove` are verbs every
// layer wants, and a single named export keeps them from colliding with actions or slice reducers.
export const todosApi = {
  list(query: TodoListQuery = {}): Promise<readonly Todo[]> {
    return send(todoListSchema, `${base}${queryString(query)}`);
  },

  create(input: CreateTodo): Promise<Todo> {
    return send(todoSchema, base, { method: "POST", body: JSON.stringify(input) });
  },

  update(id: string, input: UpdateTodo): Promise<Todo> {
    return send(todoSchema, `${base}/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  },

  async remove(id: string): Promise<void> {
    const response = await fetch(`${base}/${id}`, { method: "DELETE" });

    // 204 carries no body, so there is nothing to parse.
    if (!response.ok) {
      throw new Error(`DELETE ${base}/${id} failed with ${response.status}`);
    }
  },
};
