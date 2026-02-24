import {
  enqueueRefreshScriptJob,
  handleCaptureFigmaScreenshotRoute,
  handleCaptureHealthSnapshotRoute,
  handleRefreshNamingDebtRoute,
  handleRunScriptRoute,
  handleSyncFigmaTokensRoute,
} from "../services/command-route-handler-service.mjs";

export function registerCommandRoutes(app, deps) {
  app.post("/api/run/:script", (c) => handleRunScriptRoute(c, deps));
  app.post("/api/refresh-registry", (c) => enqueueRefreshScriptJob(c, "ds:registry:refresh", deps));
  app.post("/api/refresh-token-usage-index", (c) => enqueueRefreshScriptJob(c, "ds:token-usage-index", deps));
  app.post("/api/refresh-token-graph", (c) => enqueueRefreshScriptJob(c, "ds:token-graph", deps));
  app.post("/api/refresh-token-health", (c) => enqueueRefreshScriptJob(c, "ds:token-health", deps));
  app.post("/api/refresh-components-health", (c) => enqueueRefreshScriptJob(c, "ds:registry:report", deps));
  app.post("/api/refresh-naming-debt", (c) => handleRefreshNamingDebtRoute(c, deps));
  app.post("/api/capture-health-snapshot", (c) => handleCaptureHealthSnapshotRoute(c, deps));
  app.post("/api/sync-figma-tokens", (c) => handleSyncFigmaTokensRoute(c, deps));
  app.post("/api/capture-figma-screenshot", (c) => handleCaptureFigmaScreenshotRoute(c, deps));
}
