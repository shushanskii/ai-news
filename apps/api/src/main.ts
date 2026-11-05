import { TodoStatus } from "@app/shared";
import { createApp } from "#app";
import { createTodosService, type TodosService } from "#services/todos";

const port = Number(process.env.PORT ?? 3000);
const dayInMs = 24 * 60 * 60 * 1000;

// An empty list is what a freshly restarted service answers with, and on screen it is
// indistinguishable from a broken app. These rows are props for the example domain, not a feature:
// they go away with the todos themselves (conventions/project.md, "The example domain is
// disposable"), and this file is the whole of their footprint.
//
// Deadlines are offsets from today rather than dates, so a row cannot quietly stop being overdue
// next month; and `now` is the clock the service already holds, so the seed and the overdue filter
// cannot disagree about what today is.
function seedTodos(service: TodosService, now: () => Date): void {
  const today = now().getTime();

  function dueIn(days: number): string {
    return new Date(today + days * dayInMs).toISOString().slice(0, 10);
  }

  // `status` is carried per row because one todo starts finished: `create` always opens a todo
  // Active, so a finished row is a create plus the update that closes it.
  const rows: readonly {
    readonly title: string;
    readonly dueDate?: string;
    readonly done: boolean;
  }[] = [
    { title: "read the conventions top to bottom", dueDate: dueIn(-3), done: false },
    { title: "rename the @app scope to something yours", dueDate: dueIn(2), done: false },
    { title: "swap the in-memory store for a real repository", done: false },
    { title: "turn on branch protection for main", done: true },
  ];

  for (const row of rows) {
    const created = service.create({ title: row.title, dueDate: row.dueDate });

    if (row.done) {
      service.update(created.id, { status: TodoStatus.Done });
    }
  }
}

const now = () => new Date();
const service = createTodosService(now);

// `pnpm dev` starts with rows to look at; a process started as production starts as empty, because
// nobody wants demo todos in a deployment that grew out of this template.
if (process.env.NODE_ENV !== "production") {
  seedTodos(service, now);
}

createApp(now, service).listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
