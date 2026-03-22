import {
  handleComponentRegistryRoute,
  handleComponentUsageIndexRoute,
  handleTokenCollectionTreesRoute,
  handleTokenRegistryRoute,
} from "../services/registry-route-handler-service.mjs";

export function registerRegistryRoutes(app, deps) {
  app.get("/api/component-registry", (c) => handleComponentRegistryRoute(c, deps));
  app.get("/api/component-usage-index", (c) => handleComponentUsageIndexRoute(c, deps));
  app.get("/api/token-registry", (c) => handleTokenRegistryRoute(c, deps));
  app.get("/api/token-collection-trees", (c) => handleTokenCollectionTreesRoute(c, deps));
}
