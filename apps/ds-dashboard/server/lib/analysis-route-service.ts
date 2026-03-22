/**
 * Analysis Route Service
 *
 * Provides utilities for analysis route handlers.
 * Migrated from apps/ds-dashboard/server/lib/analysis-route-service.mjs
 */

import fs from 'node:fs/promises';

type RouteValidationError = {
  statusCode: number;
  errorArgs: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context?: Record<string, unknown>;
  };
};

export type GitRefValidationResult =
  | {
      ok: true;
      beforeRef: string;
    }
  | ({
      ok: false;
    } & RouteValidationError);

export type ImpactRequestResult =
  | {
      ok: true;
      payload: {
        tokenPath: string;
        newValue: string | null;
        depth?: number;
      };
    }
  | ({
      ok: false;
    } & RouteValidationError);

export interface ImpactArtifacts {
  tokenRegistry: Record<string, unknown>;
  tokenGraph: Record<string, unknown>;
  tokenUsageIndex: Record<string, unknown>;
  tokenHealth: Record<string, unknown>;
  componentRegistry: Record<string, unknown>;
  wcagPairs: Record<string, unknown>;
}

export interface LoadImpactArtifactsDeps {
  readFileFn?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  normalizeImpactWcagPairsFn: (value: Record<string, unknown>) => unknown;
}

export interface SystemContext {
  tokenRegistryPath: string;
  tokenGraphVizPath: string;
  tokenUsageIndexPath: string;
  tokenHealthPath: string;
  componentRegistryPath: string;
  wcagPairsPath: string;
  [key: string]: string;
}

export interface ImpactFailureResult {
  statusCode: number;
  errorArgs: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context: {
      tokenPath: string;
    };
  };
}

/**
 * Parse refresh query parameter.
 */
export function parseRefreshQuery(raw: unknown): boolean {
  return String(raw ?? 'false').trim() === 'true';
}

/**
 * Parse and validate token diff beforeRef parameter.
 */
export function parseTokenDiffBeforeRef(
  rawBeforeRef: unknown,
  validateGitRefFn: (value: string) => string | null
): GitRefValidationResult {
  const beforeRefRaw = rawBeforeRef ?? 'HEAD~1';
  const beforeRef = validateGitRefFn(String(beforeRefRaw));
  if (beforeRef) return { ok: true, beforeRef };
  return {
    ok: false,
    statusCode: 400,
    errorArgs: {
      code: 'validation.invalid_git_ref',
      userMessage: 'Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -',
      recoverable: true,
      context: { beforeRef: String(beforeRefRaw) },
    },
  };
}

/**
 * Parse impact request parameters.
 */
export function parseImpactRequest(params: {
  tokenPathRaw: unknown;
  newValueRaw: unknown;
  depthRaw: unknown;
}): ImpactRequestResult {
  const { tokenPathRaw, newValueRaw, depthRaw } = params;

  const tokenPath = String(tokenPathRaw ?? '').trim();
  if (!tokenPath) {
    return {
      ok: false,
      statusCode: 400,
      errorArgs: {
        code: 'validation.token_path_required',
        userMessage: 'tokenPath query param is required.',
        recoverable: true,
        context: { field: 'tokenPath' },
      },
    };
  }

  const newValue = newValueRaw ? String(newValueRaw).trim() : null;
  const depthParsed = depthRaw ? Number.parseInt(String(depthRaw), 10) : Number.NaN;
  const depth = Number.isFinite(depthParsed) ? depthParsed : undefined;
  return {
    ok: true,
    payload: { tokenPath, newValue, depth },
  };
}

/**
 * Load all impact analysis artifacts.
 */
export async function loadImpactArtifacts(
  sysCtx: SystemContext,
  deps: LoadImpactArtifactsDeps
): Promise<ImpactArtifacts> {
  const readFileFn =
    deps.readFileFn ??
    (async (filePath: string, encoding: BufferEncoding): Promise<string> => {
      return await fs.readFile(filePath, encoding);
    });
  const normalizeImpactWcagPairsFn = deps.normalizeImpactWcagPairsFn;
  if (typeof normalizeImpactWcagPairsFn !== 'function') {
    throw new Error('normalizeImpactWcagPairsFn is required');
  }

  const [
    tokenRegistryRaw,
    tokenGraphRaw,
    tokenUsageRaw,
    tokenHealthRaw,
    componentRegistryRaw,
    wcagPairsRaw,
  ] = await Promise.all([
    readFileFn(sysCtx.tokenRegistryPath, 'utf8'),
    readFileFn(sysCtx.tokenGraphVizPath, 'utf8'),
    readFileFn(sysCtx.tokenUsageIndexPath, 'utf8'),
    readFileFn(sysCtx.tokenHealthPath, 'utf8').catch(() => 'null'),
    readFileFn(sysCtx.componentRegistryPath, 'utf8').catch(() => 'null'),
    readFileFn(sysCtx.wcagPairsPath, 'utf8').catch(() => '{"pairs": []}'),
  ]);

  return {
    tokenRegistry: JSON.parse(tokenRegistryRaw),
    tokenGraph: JSON.parse(tokenGraphRaw),
    tokenUsageIndex: JSON.parse(tokenUsageRaw),
    tokenHealth: JSON.parse(tokenHealthRaw),
    componentRegistry: JSON.parse(componentRegistryRaw),
    wcagPairs: normalizeImpactWcagPairsFn(
      JSON.parse(wcagPairsRaw) as Record<string, unknown>
    ) as Record<string, unknown>,
  };
}

/**
 * Build impact failure response.
 */
export function buildImpactFailure(tokenPath: string, error: unknown): ImpactFailureResult {
  const message = error instanceof Error ? error.message : String(error);
  const notFound = message.includes('not found');
  return {
    statusCode: notFound ? 404 : 400,
    errorArgs: {
      code: notFound ? 'impact.token_not_found' : 'impact.invalid_request',
      userMessage: message,
      recoverable: true,
      context: { tokenPath },
    },
  };
}
