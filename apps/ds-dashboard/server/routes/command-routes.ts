/**
 * Command Routes
 *
 * Registers command-related API routes.
 * Migrated from apps/ds-dashboard/server/routes/command-routes.mjs
 */

import type { Context } from 'hono';

import {
  enqueueRefreshScriptJob,
  handleCaptureFigmaScreenshotRoute,
  handleCaptureHealthSnapshotRoute,
  handleRefreshNamingDebtRoute,
  handleRunScriptRoute,
  handleSyncFigmaTokensRoute,
} from '../services/command-route-handler-service.mjs';

export interface CommandRoutesDeps {
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => unknown;
  createApiRequestId: () => string;
  readJsonBody: (c: Context) => Promise<Record<string, unknown>>;
  getSystemContext: (systemHeader: string) => {
    repoRoot: string;
    systemId: string;
    healthSnapshotScriptPath: string;
    tokensFromFigmaScriptPath: string;
    captureFromFigmaUrlScriptPath: string;
  };
  queueJobAcceptedPayload: (job: { id: string }) => { ok: boolean; jobId: string };
  enqueueQueueJob: (args: any) => { id: string };
  sha256Text: (value: string) => string;
  runQueuedSpawnCommand: (options: any) => Promise<{ ok: boolean }>;
  queueNpmScript: (args: any) => { id: string };
  enqueueRefreshNamingDebtJob: (args: any) => { id: string };
  queueNodeJsonCommand: (args: any) => { id: string };
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
  validateGitRef: (value: string) => string | null;
}

/**
 * Register command routes on the Hono app.
 */
export function registerCommandRoutes(app: { post: (path: string, handler: (c: Context) => any) => void }, deps: CommandRoutesDeps): void {
  app.post('/api/run/:script', (c: Context) => handleRunScriptRoute(c, deps));
  app.post('/api/refresh-registry', (c: Context) => enqueueRefreshScriptJob(c, 'ds:registry:refresh', deps));
  app.post('/api/refresh-token-usage-index', (c: Context) => enqueueRefreshScriptJob(c, 'ds:token-usage-index', deps));
  app.post('/api/refresh-token-graph', (c: Context) => enqueueRefreshScriptJob(c, 'ds:token-graph', deps));
  app.post('/api/refresh-token-health', (c: Context) => enqueueRefreshScriptJob(c, 'ds:token-health', deps));
  app.post('/api/refresh-components-health', (c: Context) => enqueueRefreshScriptJob(c, 'ds:registry:report', deps));
  app.post('/api/refresh-naming-debt', (c: Context) => handleRefreshNamingDebtRoute(c, deps));
  app.post('/api/capture-health-snapshot', (c: Context) => handleCaptureHealthSnapshotRoute(c, deps));
  app.post('/api/sync-figma-tokens', (c: Context) => handleSyncFigmaTokensRoute(c, deps));
  app.post('/api/capture-figma-screenshot', (c: Context) => handleCaptureFigmaScreenshotRoute(c, deps));
}
