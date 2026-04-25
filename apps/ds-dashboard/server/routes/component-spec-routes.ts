/**
 * Component Spec Routes
 *
 * DB-first route wiring for component spec endpoints.
 */

import type { Hono } from 'hono';

import {
  handleGetComponentSpecRoute,
  handlePatchEditorialSpecRoute,
} from '../services/component-spec-db-handler-service.ts';
import type { ComponentSpecDeps } from '../lib/register-all-routes-service.ts';

export function registerComponentSpecRoutes(
  app: Hono,
  deps: ComponentSpecDeps,
): void {
  app.get('/api/component-spec/:slug', (c) =>
    handleGetComponentSpecRoute(c, deps),
  );
  app.patch('/api/component-spec/:slug/editorial', (c) =>
    handlePatchEditorialSpecRoute(c, deps),
  );
}
