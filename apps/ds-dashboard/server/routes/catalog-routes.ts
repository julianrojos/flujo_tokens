import type { Hono } from 'hono';

import {
  handleComponentCatalogRoute,
  handleComponentUsageIndexRoute,
  handleTokenCollectionTreesRoute,
  handleTokenCatalogRoute,
  type CatalogRouteHandlerDeps,
} from '../services/catalog-route-handler-service.ts';

export type CatalogRoutesDeps = CatalogRouteHandlerDeps;

export function registerCatalogRoutes(
  app: Hono,
  deps: CatalogRoutesDeps,
): void {
  app.get('/api/component-catalog', (c) =>
    handleComponentCatalogRoute(c, deps),
  );
  app.get('/api/component-usage-index', (c) =>
    handleComponentUsageIndexRoute(c, deps),
  );
  app.get('/api/token-catalog', (c) => handleTokenCatalogRoute(c, deps));
  app.get('/api/token-collection-trees', (c) =>
    handleTokenCollectionTreesRoute(c, deps),
  );
}
