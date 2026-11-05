import { type Request, type Response, Router } from "express";

// The route a readiness probe reads. It is deliberately not under `/api`: a probe asks this process
// whether it can answer, which is not a statement about todos, and the routing rules in front of the
// app match on `/api` — kubelet reaches the pod directly, so the prefix would only add the health
// endpoint to the surface the browser can reach.
export function createHealthRouter(): Router {
  function handleHealth(_request: Request, response: Response): void {
    response.json({ status: "ok" });
  }

  const router = Router();

  router.get("/", handleHealth);

  return router;
}
