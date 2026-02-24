import {
  handleAssetRoute,
  handleFileRoute,
  handleFileSnippetRoute,
} from "../services/file-route-handler-service.mjs";

export function registerFileRoutes(app, deps) {
  app.get("/api/file", (c) => handleFileRoute(c, deps));
  app.get("/api/file-snippet", (c) => handleFileSnippetRoute(c, deps));
  app.get("/api/asset", (c) => handleAssetRoute(c, deps));
}
