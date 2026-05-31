import {
  handleGetDatabaseConfigRoute,
  handleSaveDatabaseConfigRoute,
  handleValidateDatabaseConfigRoute,
} from '../services/database-config-service.ts';
import {
  handleApiHealthRoute,
  handleCreateDesignSystemRoute,
  handleDeleteDesignSystemRoute,
  handleDeletePreviewRoute,
  handleLegacyHealthRoute,
  handleListDesignSystemsRoute,
  handleUpdateDesignSystemRoute,
} from '../services/system-route-handler-service.ts';
import type { Hono } from 'hono';

import type { CreateServerRouteDeps } from '../lib/create-server-route-deps.ts';

export function registerSystemRoutes(
  app: Hono,
  deps: CreateServerRouteDeps,
): void {
  app.get('/health', (c) => handleLegacyHealthRoute(c, deps));
  app.get('/api/health', (c) => handleApiHealthRoute(c, deps));
  app.get('/api/database-config', (c) =>
    handleGetDatabaseConfigRoute(c, {
      repoRoot: deps.repoRoot,
      activeDatabaseUrl: deps.databaseUrl,
      failJson: deps.failJson as never,
    }),
  );
  app.post('/api/database-config/validate', (c) =>
    handleValidateDatabaseConfigRoute(c, {
      repoRoot: deps.repoRoot,
      activeDatabaseUrl: deps.databaseUrl,
      failJson: deps.failJson as never,
    }),
  );
  app.put('/api/database-config', (c) =>
    handleSaveDatabaseConfigRoute(c, {
      repoRoot: deps.repoRoot,
      activeDatabaseUrl: deps.databaseUrl,
      failJson: deps.failJson as never,
    }),
  );
  app.get('/api/design-systems', (c) => handleListDesignSystemsRoute(c, deps));
  app.post('/api/design-systems', (c) =>
    handleCreateDesignSystemRoute(c, deps),
  );
  app.put('/api/design-systems/:id', (c) =>
    handleUpdateDesignSystemRoute(c, deps),
  );
  app.get('/api/design-systems/:id/delete-preview', (c) =>
    handleDeletePreviewRoute(c, deps),
  );
  app.delete('/api/design-systems/:id', (c) =>
    handleDeleteDesignSystemRoute(c, deps),
  );
}
