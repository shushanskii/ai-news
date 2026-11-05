import { createTodoSchema, todoListQuerySchema, updateTodoSchema } from "@app/shared";
import { type Request, type Response, Router } from "express";
import { type ZodError, z } from "zod";
import type { TodosService } from "#services/todos";

function badRequest(res: Response, error: ZodError, subject: string): void {
  const { formErrors, fieldErrors } = z.flattenError(error);

  res.status(400).json({ error: `invalid ${subject}`, formErrors, fieldErrors });
}

export function createTodosRouter(service: TodosService): Router {
  function handleList(req: Request, res: Response): void {
    // A query parameter is as untrusted as a body: `?overdue=yes` is a client bug and answers 400,
    // not "here is everything".
    const parsed = todoListQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      badRequest(res, parsed.error, "query string");
      return;
    }

    res.json(service.list(parsed.data));
  }

  function handleRead(req: Request, res: Response): void {
    const todo = service.find(String(req.params.id));

    if (todo === undefined) {
      res.status(404).json({ error: "todo not found" });
      return;
    }

    res.json(todo);
  }

  function handleCreate(req: Request, res: Response): void {
    const parsed = createTodoSchema.safeParse(req.body);

    if (!parsed.success) {
      badRequest(res, parsed.error, "request body");
      return;
    }

    res.status(201).json(service.create(parsed.data));
  }

  function handleUpdate(req: Request, res: Response): void {
    const parsed = updateTodoSchema.safeParse(req.body);

    if (!parsed.success) {
      badRequest(res, parsed.error, "request body");
      return;
    }

    const updated = service.update(String(req.params.id), parsed.data);

    if (updated === undefined) {
      res.status(404).json({ error: "todo not found" });
      return;
    }

    res.json(updated);
  }

  function handleDelete(req: Request, res: Response): void {
    if (!service.remove(String(req.params.id))) {
      res.status(404).json({ error: "todo not found" });
      return;
    }

    res.status(204).end();
  }

  const router = Router();

  router.get("/", handleList);
  router.get("/:id", handleRead);
  router.post("/", handleCreate);
  router.patch("/:id", handleUpdate);
  router.delete("/:id", handleDelete);

  return router;
}
