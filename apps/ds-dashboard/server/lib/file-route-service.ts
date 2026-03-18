/**
 * File Route Service
 *
 * Provides utilities for file-related route handlers.
 * Migrated from apps/ds-dashboard/server/lib/file-route-service.mjs
 */

export interface ResolveRequestedRepoPathOptions {
  repoRoot: string;
  requested: string;
  resolveRepoFilePathFn: (repoRoot: string, requested: string) => string | null;
  code: string;
  userMessage: string;
}

export interface ResolveRequestedRepoPathResult {
  ok: boolean;
  absPath?: string;
  statusCode?: number;
  errorArgs?: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context: {
      requested: string;
    };
  };
}

export interface ParseSnippetLineResult {
  ok: boolean;
  line?: number;
  statusCode?: number;
  errorArgs?: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context: {
      line: string;
    };
  };
}

export interface ReadFileContentPayloadOptions {
  absPath: string;
  requested: string;
  notFoundCode: string;
  readTextFileLimitedFn: (filePath: string, maxBytes: number) => Promise<{ content: string; truncated: boolean }>;
  maxFileBytes: number;
}

export interface ReadFileContentPayloadResult {
  ok: boolean;
  content?: string;
  truncated?: boolean;
  statusCode?: number;
  errorArgs?: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context: {
      requested: string;
    };
  };
}

export interface ResolveSnippetTargetLineOptions {
  rawLine?: string;
  content: string;
  query: string;
  findLineForQueryFn: (content: string, query: string) => number | null;
  requested: string;
}

export interface ResolveSnippetTargetLineResult {
  ok: boolean;
  line?: number;
  matchedBy?: 'line' | 'query';
  statusCode?: number;
  errorArgs?: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context: {
      requested: string;
      query?: string;
    };
  };
}

export interface BuildFileContentResponseOptions {
  requested: string;
  truncated: boolean;
  content: string;
}

export interface BuildFileContentResponseResult {
  ok: boolean;
  file: string;
  truncated: boolean;
  content: string;
}

export interface BuildFileSnippetResponseOptions {
  requested: string;
  snippet: {
    targetLine: number;
    startLine: number;
    endLine: number;
    snippet: string;
  };
  matchedBy?: 'line' | 'query';
}

export interface BuildFileSnippetResponseResult {
  ok: boolean;
  file: string;
  line: number;
  startLine: number;
  endLine: number;
  matchedBy: 'line' | 'query' | '';
  snippet: string;
}

export interface BuildMissingAssetErrorArgsResult {
  code: string;
  userMessage: string;
  recoverable: boolean;
  context: {
    requested: string;
  };
}

export interface BuildNotFoundFileErrorOptions {
  code: string;
  requested: string;
  error: unknown;
}

export interface BuildNotFoundFileErrorResult {
  statusCode: number;
  errorArgs: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context: {
      requested: string;
    };
  };
}

/**
 * Resolve requested repo path with validation.
 */
export function resolveRequestedRepoPath(options: ResolveRequestedRepoPathOptions): ResolveRequestedRepoPathResult {
  const { repoRoot, requested, resolveRepoFilePathFn, code, userMessage } = options;
  const absPath = resolveRepoFilePathFn(repoRoot, requested);
  if (absPath) return { ok: true, absPath };
  return {
    ok: false,
    statusCode: 400,
    errorArgs: {
      code,
      userMessage,
      recoverable: true,
      context: { requested },
    },
  };
}

function parseWindowValue(raw: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Parse snippet window parameters.
 */
export function parseSnippetWindow(rawBefore: unknown, rawAfter: unknown, fallback = 2): { before: number; after: number } {
  return {
    before: parseWindowValue(rawBefore, fallback),
    after: parseWindowValue(rawAfter, fallback),
  };
}

/**
 * Parse snippet line parameter.
 */
export function parseSnippetLine(rawLine: unknown): ParseSnippetLineResult {
  const parsedLine = rawLine ? Number.parseInt(String(rawLine), 10) : Number.NaN;
  if (rawLine && !Number.isFinite(parsedLine)) {
    return {
      ok: false,
      statusCode: 400,
      errorArgs: {
        code: 'validation.invalid_line_parameter',
        userMessage: 'Invalid line parameter.',
        recoverable: true,
        context: { line: String(rawLine) },
      },
    };
  }
  return {
    ok: true,
    line: parsedLine,
  };
}

/**
 * Read file content payload with error handling.
 */
export async function readFileContentPayload(options: ReadFileContentPayloadOptions): Promise<ReadFileContentPayloadResult> {
  const { absPath, requested, notFoundCode, readTextFileLimitedFn, maxFileBytes } = options;
  try {
    const payload = await readTextFileLimitedFn(absPath, maxFileBytes);
    return { ok: true, content: payload.content, truncated: payload.truncated };
  } catch (error) {
    const failure = buildNotFoundFileError({
      code: notFoundCode,
      requested,
      error,
    });
    return {
      ok: false,
      statusCode: failure.statusCode,
      errorArgs: failure.errorArgs,
    };
  }
}

/**
 * Resolve snippet target line from line or query.
 */
export function resolveSnippetTargetLine(options: ResolveSnippetTargetLineOptions): ResolveSnippetTargetLineResult {
  const { rawLine, content, query, findLineForQueryFn, requested } = options;
  if (rawLine) {
    return { ok: true, matchedBy: 'line' };
  }

  const detected = findLineForQueryFn(content, query);
  if (detected) {
    return {
      ok: true,
      line: detected,
      matchedBy: 'query',
    };
  }

  return {
    ok: false,
    statusCode: 404,
    errorArgs: {
      code: 'file.query_not_found',
      userMessage: 'Query not found in file.',
      recoverable: true,
      context: { requested, query },
    },
  };
}

/**
 * Build file content response.
 */
export function buildFileContentResponse(options: BuildFileContentResponseOptions): BuildFileContentResponseResult {
  const { requested, truncated, content } = options;
  return {
    ok: true,
    file: requested,
    truncated,
    content,
  };
}

/**
 * Build file snippet response.
 */
export function buildFileSnippetResponse(options: BuildFileSnippetResponseOptions): BuildFileSnippetResponseResult {
  const { requested, snippet, matchedBy = '' } = options;
  return {
    ok: true,
    file: requested,
    line: snippet.targetLine,
    startLine: snippet.startLine,
    endLine: snippet.endLine,
    matchedBy,
    snippet: snippet.snippet,
  };
}

/**
 * Build missing asset error args.
 */
export function buildMissingAssetErrorArgs(requested: string): BuildMissingAssetErrorArgsResult {
  return {
    code: 'asset.not_found',
    userMessage: 'Asset not found.',
    recoverable: true,
    context: { requested },
  };
}

/**
 * Build not found file error.
 */
export function buildNotFoundFileError(options: BuildNotFoundFileErrorOptions): BuildNotFoundFileErrorResult {
  const { code, requested, error } = options;
  const message = error instanceof Error ? error.message : String(error);
  return {
    statusCode: 404,
    errorArgs: {
      code,
      userMessage: message,
      recoverable: true,
      context: { requested },
    },
  };
}
