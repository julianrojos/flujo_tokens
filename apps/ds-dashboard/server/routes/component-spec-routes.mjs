import {
  handleGetComponentSpecRoute,
  handleRestoreComponentSpecRoute,
  handleSaveComponentSpecRoute,
  handleValidateComponentSpecRoute,
} from "../services/component-spec-http-handler-service.mjs";

export function registerComponentSpecRoutes(app, deps) {
  app.get("/api/component-spec/:slug", (c) => handleGetComponentSpecRoute(c, deps));
  app.post("/api/component-spec/:slug/validate", (c) => handleValidateComponentSpecRoute(c, deps));
  app.post("/api/component-spec/:slug/save", (c) => handleSaveComponentSpecRoute(c, deps));
  app.post("/api/component-spec/:slug/restore-backup", (c) => handleRestoreComponentSpecRoute(c, deps));
}
