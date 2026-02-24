import {
  handleImpactRoute,
  handleNamingDebtRoute,
  handleTokenDiffRoute,
} from "../services/analysis-route-handler-service.mjs";

export function registerAnalysisRoutes(app, deps) {
  app.get("/api/token-diff", (c) => handleTokenDiffRoute(c, deps));
  app.get("/api/naming-debt", (c) => handleNamingDebtRoute(c, deps));
  app.get("/api/impact", (c) => handleImpactRoute(c, deps));
}
