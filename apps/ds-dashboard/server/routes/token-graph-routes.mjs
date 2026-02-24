import {
  handleTokenGraphQueryRoute,
  handleTokenGraphRoute,
  handleTokenUsageIndexRoute,
} from "../services/token-graph-route-handler-service.mjs";

export function registerTokenGraphRoutes(app, deps) {
  app.get("/api/token-usage-index", (c) => handleTokenUsageIndexRoute(c, deps));
  app.get("/api/token-graph", (c) => handleTokenGraphRoute(c, deps));
  app.get("/api/token-graph-query", (c) => handleTokenGraphQueryRoute(c, deps));
}
