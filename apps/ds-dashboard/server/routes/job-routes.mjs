import {
  handleDeleteJobRoute,
  handleGetJobRoute,
  handleStreamJobRoute,
} from "../services/job-route-handler-service.mjs";

export function registerJobRoutes(app, deps) {
  app.get("/api/jobs/:jobId", (c) => handleGetJobRoute(c, deps));
  app.delete("/api/jobs/:jobId", (c) => handleDeleteJobRoute(c, deps));
  app.get("/api/jobs/:jobId/stream", (c) => handleStreamJobRoute(c, deps));
}
