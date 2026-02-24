import {
  handleOperationsHistoryRoute,
  handleOperationsRegressionsRoute,
  handleOperationsReplayRoute,
} from "../services/operations-route-handler-service.mjs";

export function registerOperationsRoutes(app, deps) {
  app.get("/api/operations/history", (c) => handleOperationsHistoryRoute(c, deps));
  app.get("/api/operations/regressions", (c) => handleOperationsRegressionsRoute(c, deps));
  app.post("/api/operations/replay/:eventId", (c) => handleOperationsReplayRoute(c, deps));
}
