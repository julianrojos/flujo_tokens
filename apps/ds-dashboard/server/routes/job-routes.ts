import type { Hono } from "hono";

import {
  handleDeleteJobRoute,
  handleGetJobRoute,
  handleStreamJobRoute,
  type JobRouteDeps,
} from "../services/job-route-handler-service.ts";

export function registerJobRoutes(app: Hono, deps: JobRouteDeps): void {
  app.get("/api/jobs/:jobId", (c) => handleGetJobRoute(c, deps));
  app.delete("/api/jobs/:jobId", (c) => handleDeleteJobRoute(c, deps));
  app.get("/api/jobs/:jobId/stream", (c) => handleStreamJobRoute(c, deps));
}
