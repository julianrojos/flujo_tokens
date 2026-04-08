import {
  handleGetComponentSpecRoute,
  handlePatchEditorialSpecRoute,
} from "../services/component-spec-db-handler-service.ts";

/**
 * Register component spec routes (DB-first, no filesystem)
 *
 * GET /api/component-spec/:slug - Get complete spec (editorial + structural)
 * PATCH /api/component-spec/:slug/editorial - Update editorial fields with optimistic locking
 */
export function registerComponentSpecRoutes(app, deps) {
  app.get("/api/component-spec/:slug", (c) => handleGetComponentSpecRoute(c, deps));
  app.patch("/api/component-spec/:slug/editorial", (c) => handlePatchEditorialSpecRoute(c, deps));
}
