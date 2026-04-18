import {
  handleComponentCatalogRoute,
  handleComponentUsageIndexRoute,
  handleTokenCollectionTreesRoute,
  handleTokenRegistryRoute,
} from "../services/catalog-route-handler-service.mjs";

export function registerCatalogRoutes(app, deps) {
  app.get("/api/component-catalog", (c) => handleComponentCatalogRoute(c, deps));
  app.get("/api/component-usage-index", (c) => handleComponentUsageIndexRoute(c, deps));
  app.get("/api/token-registry", (c) => handleTokenRegistryRoute(c, deps));
  app.get("/api/token-collection-trees", (c) => handleTokenCollectionTreesRoute(c, deps));
}
