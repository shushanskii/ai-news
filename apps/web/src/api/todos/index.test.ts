import { type Todo, TodoStatus } from "@app/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { todosApi } from "#api/todos";

const todo: Todo = { id: "todo-1", title: "read the conventions", status: TodoStatus.Active };

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("todosApi.list", () => {
  it("parses the response through the schema", async () => {
    mockFetch({ json: () => Promise.resolve([todo]) });

    await expect(todosApi.list()).resolves.toEqual([todo]);
  });

  it("rejects a response that does not match the schema", async () => {
    mockFetch({ json: () => Promise.resolve([{ id: "todo-1", status: "archived" }]) });

    await expect(todosApi.list()).rejects.toThrow();
  });

  it("rejects a non-2xx response", async () => {
    mockFetch({ ok: false, status: 500 });

    await expect(todosApi.list()).rejects.toThrow("GET /api/todos failed with 500");
  });

  it("sends the overdue filter spelled out as a query", async () => {
    const fetchMock = mockFetch({ json: () => Promise.resolve([todo]) });

    await todosApi.list({ overdue: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/todos?overdue=true", { headers: undefined });
  });

  // `overdue=false` asks for the complement; an absent filter asks for everything. A generic query
  // builder would collapse the two.
  it("keeps overdue=false distinct from no filter at all", async () => {
    const fetchMock = mockFetch({ json: () => Promise.resolve([todo]) });

    await todosApi.list({ overdue: false });
    await todosApi.list({});

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/todos?overdue=false", {
      headers: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/todos", { headers: undefined });
  });
});

describe("todosApi.update", () => {
  it("sends a JSON PATCH and returns the parsed todo", async () => {
    const updated = { ...todo, status: TodoStatus.Done };
    const fetchMock = mockFetch({ json: () => Promise.resolve(updated) });

    await expect(todosApi.update(todo.id, { status: TodoStatus.Done })).resolves.toEqual(updated);

    expect(fetchMock).toHaveBeenCalledWith("/api/todos/todo-1", {
      method: "PATCH",
      body: JSON.stringify({ status: TodoStatus.Done }),
      headers: { "content-type": "application/json" },
    });
  });
});

describe("todosApi.remove", () => {
  it("resolves on 204 without parsing a body", async () => {
    mockFetch({ status: 204 });

    await expect(todosApi.remove(todo.id)).resolves.toBeUndefined();
  });
});
