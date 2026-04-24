import type { Context } from 'hono';
import type { SharedSystemContextDeps } from '../lib/register-all-routes-service.ts';
import type { ComponentRepository } from '../db/component-repository.js';
import type { TokenRepository } from '../db/token-repository.js';

export interface CatalogRouteHandlerDeps extends SharedSystemContextDeps {
  componentRepo?: ComponentRepository;
  tokenRepo?: TokenRepository;
}

export function handleComponentCatalogRoute(
  c: Context,
  deps: CatalogRouteHandlerDeps,
): Promise<Response>;

export function handleComponentUsageIndexRoute(
  c: Context,
  deps: CatalogRouteHandlerDeps,
): Promise<Response>;

export function handleTokenCatalogRoute(
  c: Context,
  deps: CatalogRouteHandlerDeps,
): Promise<Response>;

export function handleTokenCollectionTreesRoute(
  c: Context,
  deps: CatalogRouteHandlerDeps,
): Promise<Response>;
