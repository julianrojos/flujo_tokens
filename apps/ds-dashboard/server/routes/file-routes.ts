/**
 * File Routes
 *
 * Registers file-related API routes.
 * Migrated from apps/ds-dashboard/server/routes/file-routes.mjs
 */

import type { Context } from 'hono';

import {
  handleAssetRoute,
  handleFileRoute,
  handleFileSnippetRoute,
} from '../lib/file-route-handler-service.ts';

export interface FileRoutesDeps {
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => any;
  getSystemContext: (systemHeader: string) => any;
  resolveRepoFilePath: (repoRoot: string, requested: string) => string | null;
  readTextFileLimited: (filePath: string, maxBytes: number) => Promise<{ content: string; truncated: boolean }>;
  findLineForQuery: (content: string, query: string) => number | null;
  buildSnippet: (content: string, line: number, before: number, after: number) => {
    targetLine: number;
    startLine: number;
    endLine: number;
    snippet: string;
  };
  guessContentType: (filePath: string) => string;
  MAX_FILE_BYTES: number;
}

/**
 * Register file routes on the Hono app.
 */
export function registerFileRoutes(
  app: { get: (path: string, handler: (c: Context) => any) => void },
  deps: FileRoutesDeps
): void {
  app.get('/api/file', (c: Context) => handleFileRoute(c, deps));
  app.get('/api/file-snippet', (c: Context) => handleFileSnippetRoute(c, deps));
  app.get('/api/asset', (c: Context) => handleAssetRoute(c, deps));
}
