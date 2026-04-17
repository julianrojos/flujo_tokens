/**
 * File Route Handler Service
 *
 * Handles file-related API routes.
 * Migrated from apps/ds-dashboard/server/lib/file-route-handler-service.mjs
 */

import fs from 'node:fs/promises';
import type { Context } from 'hono';

import {
  buildFileContentResponse,
  buildFileSnippetResponse,
  buildMissingAssetErrorArgs,
  buildNotFoundFileError,
  parseSnippetWindow,
  parseSnippetLine,
  readFileContentPayload,
  resolveRequestedRepoPath,
  resolveSnippetTargetLine,
} from './file-route-service.ts';

export interface FileRouteHandlerDeps {
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => any;
  getSystemContext: (
    systemHeader: string,
  ) => { repoRoot: string } | Promise<{ repoRoot: string }>;
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

async function resolvePath(c: Context, deps: FileRouteHandlerDeps, { requested, code, userMessage }: { requested: string; code: string; userMessage: string }) {
  const { getSystemContext, resolveRepoFilePath } = deps;
  const sysCtx = await getSystemContext(c.req.header('x-ds-system') || '');
  return resolveRequestedRepoPath({
    repoRoot: sysCtx.repoRoot,
    requested,
    resolveRepoFilePathFn: resolveRepoFilePath,
    code,
    userMessage,
  });
}

/**
 * Handle file route.
 */
export async function handleFileRoute(c: Context, deps: FileRouteHandlerDeps): Promise<any> {
  const { failJson, readTextFileLimited, MAX_FILE_BYTES } = deps;
  const requested = c.req.query('path') ?? c.req.query('file') ?? '';
  const resolved = await resolvePath(c, deps, {
    requested,
    code: 'file.invalid_path',
    userMessage: 'Invalid file path.',
  });
  if (!resolved.ok) return failJson(c, resolved.statusCode ?? 500, resolved.errorArgs ?? {});
  if (!resolved.absPath) {
    return failJson(c, 500, {
      code: 'file.path_resolution_failed',
      userMessage: 'Unable to resolve file path.',
    });
  }

  const loaded = await readFileContentPayload({
    absPath: resolved.absPath,
    requested,
    notFoundCode: 'file.not_found',
    readTextFileLimitedFn: readTextFileLimited,
    maxFileBytes: MAX_FILE_BYTES,
  });
  // Verificación explícita: loaded.ok debe ser true antes de acceder a campos (R-014)
  if (!loaded.ok) return failJson(c, loaded.statusCode ?? 500, loaded.errorArgs ?? {});

  // Defaults intencionales: loaded.content y loaded.truncated siempre están definidos cuando ok=true
  // Los || false y || '' son defensivos por si la interfaz cambia en el futuro
  return c.json(
    buildFileContentResponse({
      requested,
      truncated: loaded.truncated || false,
      content: loaded.content || '',
    })
  );
}

/**
 * Handle file snippet route.
 */
export async function handleFileSnippetRoute(c: Context, deps: FileRouteHandlerDeps): Promise<any> {
  const { failJson, readTextFileLimited, MAX_FILE_BYTES, findLineForQuery, buildSnippet } = deps;
  const requested = c.req.query('file') ?? '';
  const resolved = await resolvePath(c, deps, {
    requested,
    code: 'file.invalid_path',
    userMessage: 'Invalid file path.',
  });
  if (!resolved.ok) return failJson(c, resolved.statusCode ?? 500, resolved.errorArgs ?? {});
  if (!resolved.absPath) {
    return failJson(c, 500, {
      code: 'file.path_resolution_failed',
      userMessage: 'Unable to resolve file path.',
    });
  }

  const rawLine = c.req.query('line');
  const rawBefore = c.req.query('before');
  const rawAfter = c.req.query('after');
  const { before = 0, after } = parseSnippetWindow(rawBefore, rawAfter, 2);
  const query = c.req.query('q') ?? '';

  const parsedLine = parseSnippetLine(rawLine);
  if (!parsedLine.ok) {
    return failJson(c, parsedLine.statusCode ?? 500, parsedLine.errorArgs ?? {});
  }
  let line = parsedLine.line;

  const loaded = await readFileContentPayload({
    absPath: resolved.absPath,
    requested,
    notFoundCode: 'file.not_found',
    readTextFileLimitedFn: readTextFileLimited,
    maxFileBytes: MAX_FILE_BYTES,
  });
  // Verificación explícita: loaded.ok debe ser true antes de acceder a campos (R-014)
  if (!loaded.ok) return failJson(c, loaded.statusCode ?? 500, loaded.errorArgs ?? {});
  // Defaults intencionales: content siempre está definido cuando ok=true
  const { content = '' } = loaded; // content siempre está definido cuando ok=true

  const resolvedLine = resolveSnippetTargetLine({
    rawLine,
    content,
    query,
    findLineForQueryFn: findLineForQuery,
    requested,
  });
  if (!resolvedLine.ok) {
    return failJson(c, resolvedLine.statusCode ?? 500, resolvedLine.errorArgs ?? {});
  }
  if (Number.isFinite(resolvedLine.line as number)) line = resolvedLine.line as number;
  const matchedBy = resolvedLine.matchedBy;

  const targetLine = typeof line === 'number' && Number.isFinite(line) ? line : 1;
  const snippet = buildSnippet(content, targetLine, before, after);
  return c.json(buildFileSnippetResponse({ requested, snippet, matchedBy }));
}

/**
 * Handle asset route.
 */
export async function handleAssetRoute(c: Context, deps: FileRouteHandlerDeps): Promise<any> {
  const { failJson, guessContentType } = deps;
  const requested = c.req.query('path') ?? '';
  const resolved = await resolvePath(c, deps, {
    requested,
    code: 'asset.invalid_path',
    userMessage: 'Invalid asset path.',
  });
  if (!resolved.ok) return failJson(c, resolved.statusCode ?? 500, resolved.errorArgs ?? {});
  if (!resolved.absPath) {
    return failJson(c, 500, {
      code: 'asset.path_resolution_failed',
      userMessage: 'Unable to resolve asset path.',
    });
  }
  const absPath = resolved.absPath;

  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      return failJson(c, 404, buildMissingAssetErrorArgs(requested) as unknown as Record<string, unknown>);
    }
    const buffer = await fs.readFile(absPath);
    return c.body(buffer, 200, {
      'Content-Type': guessContentType(absPath),
      'Cache-Control': 'no-store',
    });
  } catch (error) {
    const failure = buildNotFoundFileError({
      code: 'asset.not_found',
      requested,
      error,
    });
    return failJson(c, failure.statusCode, failure.errorArgs);
  }
}
