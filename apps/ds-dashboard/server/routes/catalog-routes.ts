import type { Hono } from 'hono';

import {
  handleComponentCatalogRoute,
  handleComponentUsageIndexRoute,
  handleTokenCollectionTreesRoute,
  handleTokenCatalogRoute,
} from '../services/catalog-route-handler-service.mjs';
import type { SharedSystemContextDeps } from '../lib/register-all-routes-service.ts';
import type { ComponentRepository } from '../db/component-repository.js';
import type { TokenRepository } from '../db/token-repository.js';

export interface CatalogRoutesDeps extends SharedSystemContextDeps {
  componentRepo?: ComponentRepository;
  tokenRepo?: TokenRepository;
}

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
