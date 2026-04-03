import {
  handleGetComponentSpecRoute,
  handlePatchEditorialSpecRoute,
  handleGetEditorialSuggestionRoute,
  handleDiscardEditorialSuggestionRoute,
  handleMarkSuggestionAppliedRoute,
} from "../services/component-spec-db-handler-service.ts";

/**
 * Register component spec routes (DB-first, no filesystem)
 *
 * GET /api/component-spec/:slug - Get complete spec (editorial + structural)
 * PATCH /api/component-spec/:slug/editorial - Update editorial fields with optimistic locking
 * GET  /api/component-spec/:slug/editorial-suggestion - Get latest pending AI suggestion
 * POST /api/component-spec/:slug/editorial-suggestion/discard - Discard a suggestion
 * POST /api/component-spec/:slug/editorial-suggestion/mark-applied - Mark suggestion as applied
 */
export function registerComponentSpecRoutes(app, deps) {
  app.get("/api/component-spec/:slug", (c) => handleGetComponentSpecRoute(c, deps));
  app.patch("/api/component-spec/:slug/editorial", (c) => handlePatchEditorialSpecRoute(c, deps));
  app.get("/api/component-spec/:slug/editorial-suggestion", (c) => handleGetEditorialSuggestionRoute(c, deps));
  app.post("/api/component-spec/:slug/editorial-suggestion/discard", (c) => handleDiscardEditorialSuggestionRoute(c, deps));
  app.post("/api/component-spec/:slug/editorial-suggestion/mark-applied", (c) => handleMarkSuggestionAppliedRoute(c, deps));
}
