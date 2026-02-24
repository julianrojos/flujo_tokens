import {
  handleComponentsHealthRoute,
  handleHealthHistoryRoute,
  handleTokenHealthRoute,
} from "../services/health-route-handler-service.mjs";

export function registerHealthRoutes(app, deps) {
  app.get("/api/token-health", (c) => handleTokenHealthRoute(c, deps));
  app.get("/api/components-health", (c) => handleComponentsHealthRoute(c, deps));
  app.get("/api/health-history", (c) => handleHealthHistoryRoute(c, deps));
}
