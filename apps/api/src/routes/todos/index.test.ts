import { TodoStatus } from "@app/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "#app";

let app: ReturnType<typeof createApp>;

// "Today" is a fixture, not the wall clock: an overdue test that reads the real date is a test that
// changes meaning at midnight.
const TODAY = "2026-10-14";

// A fresh app means a fresh service, so no test can see another's todos.
beforeEach(() => {
  app = createApp(() => new Date(`${TODAY}T12:00:00Z`));
});

async function seedTodo(title: string, dueDate?: string) {
  const response = await request(app)
    .post("/api/todos")
    .send(dueDate === undefined ? { title } : { title, dueDate });
  return response.body;
}

describe("GET /api/todos", () => {
  it("starts empty and lists what was created", async () => {
    const empty = await request(app).get("/api/todos");

    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);

    const created = await seedTodo("read the conventions");
    const listed = await request(app).get("/api/todos");

    expect(listed.body).toEqual([created]);
  });
});

describe("GET /api/todos?overdue", () => {
  // Seeded around TODAY: past, today, future, none, and one already finished.
  async function seedOneOfEach() {
    const overdue = await seedTodo("yesterday", "2026-10-13");
    const dueToday = await seedTodo("today", TODAY);
    const future = await seedTodo("tomorrow", "2026-10-15");
    const undated = await seedTodo("no deadline");
    const seededDone = await seedTodo("finished late", "2026-10-01");
    const doneResponse = await request(app)
      .patch(`/api/todos/${seededDone.id}`)
      .send({ status: TodoStatus.Done });

    // The list returns the todo as it is now, so the fixture has to carry the patched copy.
    return { overdue, dueToday, future, undated, done: doneResponse.body };
  }

  it("answers with the whole list when the filter is absent", async () => {
    const seeded = await seedOneOfEach();

    const listed = await request(app).get("/api/todos");

    expect(listed.body).toEqual(Object.values(seeded));
  });

  // A deadline that has not arrived yet is not overdue, and neither is a todo already finished.
  it("filters to active todos whose deadline has passed", async () => {
    const { overdue } = await seedOneOfEach();

    const listed = await request(app).get("/api/todos?overdue=true");

    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([overdue]);
  });

  it("filters the other way when asked for overdue=false", async () => {
    const { dueToday, future, undated, done } = await seedOneOfEach();

    const listed = await request(app).get("/api/todos?overdue=false");

    expect(listed.body).toEqual([dueToday, future, undated, done]);
  });

  // `?overdue=yes` is a client bug. Coercing it would answer "here is everything" and hide it.
  it("400s on a filter it cannot spell", async () => {
    const response = await request(app).get("/api/todos?overdue=yes");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid query string");
    expect(response.body.fieldErrors.overdue).toBeDefined();
  });
});

describe("GET /api/todos/:id", () => {
  it("returns a single todo", async () => {
    const created = await seedTodo("read the conventions");

    const response = await request(app).get(`/api/todos/${created.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created);
  });

  it("404s on an unknown id", async () => {
    const response = await request(app).get("/api/todos/missing");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "todo not found" });
  });
});

describe("POST /api/todos", () => {
  it("creates an active todo and trims the title", async () => {
    const response = await request(app)
      .post("/api/todos")
      .send({ title: "  read the conventions  " });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: "read the conventions",
      status: TodoStatus.Active,
    });
    expect(response.body.id).toEqual(expect.any(String));
  });

  it("400s on a blank title", async () => {
    const response = await request(app).post("/api/todos").send({ title: "  " });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid request body");
    expect(response.body.fieldErrors.title).toBeDefined();
  });

  it("stores the due date it is given", async () => {
    const response = await request(app)
      .post("/api/todos")
      .send({ title: "file taxes", dueDate: TODAY });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ title: "file taxes", dueDate: TODAY });
  });

  it("400s on a due date that is not a calendar date", async () => {
    const response = await request(app)
      .post("/api/todos")
      .send({ title: "file taxes", dueDate: "14/10/2026" });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.dueDate).toBeDefined();
  });
});

describe("PATCH /api/todos/:id", () => {
  it("updates status and leaves the title alone", async () => {
    const created = await seedTodo("read the conventions");

    const response = await request(app)
      .patch(`/api/todos/${created.id}`)
      .send({ status: TodoStatus.Done });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...created, status: TodoStatus.Done });
  });

  it("400s on an unknown status", async () => {
    const created = await seedTodo("read the conventions");

    const response = await request(app)
      .patch(`/api/todos/${created.id}`)
      .send({ status: "archived" });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.status).toBeDefined();
  });

  it("400s on an empty body", async () => {
    const created = await seedTodo("read the conventions");

    const response = await request(app).patch(`/api/todos/${created.id}`).send({});

    expect(response.status).toBe(400);
    // The "at least one field" rule is a schema-level refinement, so it lands in formErrors.
    expect(response.body.formErrors).toContain(
      "at least one of title, status or dueDate is required",
    );
  });

  it("sets a due date on its own", async () => {
    const created = await seedTodo("read the conventions");

    const response = await request(app).patch(`/api/todos/${created.id}`).send({ dueDate: TODAY });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...created, dueDate: TODAY });
  });

  // Absent leaves the deadline, null removes it — which is why the body has to say which one.
  it("clears a deadline on dueDate null and leaves it when the key is absent", async () => {
    const created = await seedTodo("read the conventions", TODAY);

    const retitled = await request(app)
      .patch(`/api/todos/${created.id}`)
      .send({ title: "renamed" });

    expect(retitled.body).toEqual({ ...created, title: "renamed", dueDate: TODAY });

    const cleared = await request(app).patch(`/api/todos/${created.id}`).send({ dueDate: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.dueDate).toBeUndefined();
  });

  it("400s on a due date that is not a calendar date", async () => {
    const created = await seedTodo("read the conventions");

    const response = await request(app)
      .patch(`/api/todos/${created.id}`)
      .send({ dueDate: "sometime in october" });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.dueDate).toBeDefined();
  });

  it("404s on an unknown id", async () => {
    const response = await request(app).patch("/api/todos/missing").send({ title: "whatever" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/todos/:id", () => {
  it("removes the todo and answers 204", async () => {
    const created = await seedTodo("read the conventions");

    const response = await request(app).delete(`/api/todos/${created.id}`);

    expect(response.status).toBe(204);

    const listed = await request(app).get("/api/todos");

    expect(listed.body).toEqual([]);
  });

  it("404s on an unknown id", async () => {
    const response = await request(app).delete("/api/todos/missing");

    expect(response.status).toBe(404);
  });
});
