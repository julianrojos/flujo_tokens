import {
  handleComponentCatalogRoute,
  handleComponentUsageIndexRoute,
  handleTokenCollectionTreesRoute,
  handleTokenCatalogRoute,
} from "../services/catalog-route-handler-service.mjs";

export function registerCatalogRoutes(app, deps) {
  app.get("/api/component-catalog", (c) => handleComponentCatalogRoute(c, deps));
  app.get("/api/component-usage-index", (c) => handleComponentUsageIndexRoute(c, deps));
  app.get("/api/token-catalog", (c) => handleTokenCatalogRoute(c, deps));
  app.get("/api/token-collection-trees", (c) => handleTokenCollectionTreesRoute(c, deps));
}
