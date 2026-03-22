/**
 * Figma API Service
 *
 * Provides typed access to Figma REST API endpoints.
 * Uses Node.js built-in fetch (Node 18+).
 */

import type {
  FigmaApiOptions,
  FetchFigmaFileOptions,
  FetchFigmaNodesOptions,
  FetchFigmaVariablesOptions,
  FetchFigmaImagesOptions,
  FigmaFileResponse,
  FigmaNodesResponse,
  FigmaVariablesResponse,
  FigmaImagesResponse,
} from './figma.js';

// Re-export Figma types for consumers
export type { FigmaVariablesResponse };

// ============================================================================
// Constants
// ============================================================================

const FIGMA_API_BASE_URL = 'https://api.figma.com';
const DEFAULT_TIMEOUT_MS = 30_000;

export type FigmaErrorType = 'figma_api_error' | 'figma_timeout' | 'figma_network_error';

export interface FigmaErrorDetail {
  type: FigmaErrorType;
  message: string;
  endpoint: string;
  fileKey?: string;
  status?: number;
  code?: string;
  details?: string;
  retryAfterSeconds?: number | null;
}

/**
 * Structured error emitted for failures while calling Figma REST API.
 */
export class FigmaApiError extends Error {
  readonly type: FigmaErrorType;
  readonly endpoint: string;
  readonly fileKey?: string;
  readonly status?: number;
  readonly code?: string;
  readonly details?: string;
  readonly retryAfterSeconds?: number | null;

  constructor(args: {
    type: FigmaErrorType;
    message: string;
    endpoint: string;
    fileKey?: string;
    status?: number;
    code?: string;
    details?: string;
    retryAfterSeconds?: number | null;
  }) {
    super(args.message);
    this.name = 'FigmaApiError';
    this.type = args.type;
    this.endpoint = args.endpoint;
    this.fileKey = args.fileKey;
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
    this.retryAfterSeconds = args.retryAfterSeconds;
  }
}

/**
 * Convert unknown errors to serializable Figma error details.
 */
export function toFigmaErrorDetail(error: unknown): FigmaErrorDetail | null {
  if (!(error instanceof FigmaApiError)) return null;
  return {
    type: error.type,
    message: error.message,
    endpoint: error.endpoint,
    fileKey: error.fileKey,
    status: error.status,
    code: error.code,
    details: error.details,
    retryAfterSeconds: error.retryAfterSeconds,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize a raw value to a positive integer.
 */
export function normalizePositiveInteger(rawValue: unknown, fallback: number): number {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${rawValue}`);
  }
  if (parsed <= 0) {
    throw new Error(`Expected a positive integer. Received: ${rawValue}`);
  }
  return Math.floor(parsed);
}

/**
 * Sanitize Figma API token.
 */
export function sanitizeToken(rawToken: unknown): string {
  const token = String(rawToken || '').trim();
  if (!token) {
    throw new Error('Missing Figma API token. Provide --token <token> or set FIGMA_TOKEN.');
  }
  return token;
}

/**
 * Normalize Figma file key.
 */
export function normalizeFileKey(rawFileKey: unknown): string {
  const fileKey = String(rawFileKey || '').trim();
  if (!fileKey) {
    throw new Error('Missing Figma file key.');
  }
  return fileKey;
}

/**
 * Read Retry-After header value in seconds.
 */
function readRetryAfterSeconds(response: Response): number | null {
  const headerValue = String(response.headers.get('retry-after') || '').trim();
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.floor(seconds);
}

/**
 * Build error details string from API error payload.
 */
function buildErrorDetails(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const err = String(record.err || record.error || '').trim();
  const msg = String(record.message || '').trim();
  if (err && msg) return `${err}: ${msg}`;
  return err || msg;
}

function extractFigmaFileKeyFromEndpoint(rawEndpoint: string): string | undefined {
  try {
    const parsed = new URL(rawEndpoint);
    const segments = parsed.pathname.split('/').filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === 'files') {
        const rawKey = segments[i + 1] || '';
        if (!rawKey) return undefined;
        return decodeURIComponent(rawKey);
      }
    }
  } catch {
    // no-op
  }
  return undefined;
}

/**
 * Resolve fetch function for current runtime.
 */
function resolveFetch(): typeof fetch {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable in this Node runtime. Use Node.js 18+.');
  }
  return fetch;
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Make a request to Figma JSON API with error handling and timeout.
 */
async function requestFigmaJson<T>(options: {
  endpointPath: string;
  token: string;
  query?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<T> {
  const { endpointPath, token, query = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  
  const normalizedToken = sanitizeToken(token);
  const normalizedTimeoutMs = normalizePositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS);
  const apiUrl = new URL(endpointPath, FIGMA_API_BASE_URL);
  
  // Add query parameters
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    apiUrl.searchParams.set(key, String(value));
  }

  const runtimeFetch = resolveFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

  let response: Response;
  try {
    response = await runtimeFetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'X-Figma-Token': normalizedToken,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (String(reason).toLowerCase().includes('abort')) {
      throw new FigmaApiError({
        type: 'figma_timeout',
        message: `Figma request timed out after ${normalizedTimeoutMs}ms: ${apiUrl.toString()}`,
        endpoint: apiUrl.toString(),
        fileKey: extractFigmaFileKeyFromEndpoint(apiUrl.toString()),
      });
    }
    throw new FigmaApiError({
      type: 'figma_network_error',
      message: `Figma request failed: ${reason}`,
      endpoint: apiUrl.toString(),
      fileKey: extractFigmaFileKeyFromEndpoint(apiUrl.toString()),
      details: reason,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const rawText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
    const details = buildErrorDetails(payload);
    const payloadRecord =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const payloadCode = String(payloadRecord?.err || payloadRecord?.error || '').trim() || undefined;
    const retryAfter = readRetryAfterSeconds(response);
    const retryHint = retryAfter !== null ? ` Retry after ${retryAfter}s.` : '';
    throw new FigmaApiError({
      type: 'figma_api_error',
      message: `Figma API error ${response.status} for ${apiUrl.toString()}.${details ? ` ${details}.` : ''}${retryHint}`,
      status: response.status,
      endpoint: apiUrl.toString(),
      fileKey: extractFigmaFileKeyFromEndpoint(apiUrl.toString()),
      code: payloadCode,
      details: details || undefined,
      retryAfterSeconds: retryAfter,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Figma API returned non-JSON response for ${apiUrl.toString()}.`);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Figma API returned non-JSON response for ${apiUrl.toString()}.`);
  }

  return payload as T;
}

// ============================================================================
// Public API Exports
// ============================================================================

/**
 * Build Figma file endpoint URL with query parameters.
 */
export function buildFigmaFileEndpoint(options: {
  fileKey: string;
  depth?: number;
  branchData?: boolean;
  geometry?: string;
}): string {
  const { fileKey, depth, branchData = false, geometry = '' } = options;
  const normalizedFileKey = normalizeFileKey(fileKey);
  const apiUrl = new URL(`/v1/files/${encodeURIComponent(normalizedFileKey)}`, FIGMA_API_BASE_URL);

  if (depth !== undefined && depth !== null) {
    apiUrl.searchParams.set(
      'depth',
      String(normalizePositiveInteger(depth, 0))
    );
  }
  if (String(branchData).trim().toLowerCase() === 'true') {
    apiUrl.searchParams.set('branch_data', 'true');
  }
  if (geometry) {
    apiUrl.searchParams.set('geometry', String(geometry));
  }
  return apiUrl.toString();
}

/**
 * Fetch Figma file with full document tree.
 */
export async function fetchFigmaFile(options: FetchFigmaFileOptions): Promise<FigmaFileResponse> {
  const { fileKey, token, depth, branchData = false, geometry = '', timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  
  const endpoint = buildFigmaFileEndpoint({ fileKey, depth, branchData, geometry });
  
  return requestFigmaJson<FigmaFileResponse>({
    endpointPath: endpoint,
    token,
    timeoutMs,
  });
}

/**
 * Fetch specific nodes from Figma file.
 */
export async function fetchFigmaNodes(options: FetchFigmaNodesOptions): Promise<FigmaNodesResponse> {
  const { fileKey, nodeIds = [], token, depth, geometry = '', timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  
  const normalizedFileKey = normalizeFileKey(fileKey);
  const ids = Array.isArray(nodeIds)
    ? nodeIds
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(',')
    : String(nodeIds || '').trim();
  
  if (!ids) {
    throw new Error('Missing node ids for fetchFigmaNodes.');
  }

  const query: Record<string, string> = { ids };
  if (depth !== undefined && depth !== null) {
    query.depth = String(normalizePositiveInteger(depth, 0));
  }
  if (geometry) {
    query.geometry = String(geometry);
  }

  return requestFigmaJson<FigmaNodesResponse>({
    endpointPath: `/v1/files/${encodeURIComponent(normalizedFileKey)}/nodes`,
    token,
    query,
    timeoutMs,
  });
}

/**
 * Fetch local variables from Figma file.
 */
export async function fetchFigmaLocalVariables(options: FetchFigmaVariablesOptions): Promise<FigmaVariablesResponse> {
  const { fileKey, token, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  
  const normalizedFileKey = normalizeFileKey(fileKey);
  return requestFigmaJson<FigmaVariablesResponse>({
    endpointPath: `/v1/files/${encodeURIComponent(normalizedFileKey)}/variables/local`,
    token,
    timeoutMs,
  });
}

/**
 * Fetch images for specific nodes from Figma file.
 */
export async function fetchFigmaImages(options: FetchFigmaImagesOptions): Promise<FigmaImagesResponse> {
  const { fileKey, nodeIds = [], token, format = 'png', scale, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  
  const normalizedFileKey = normalizeFileKey(fileKey);
  const ids = Array.isArray(nodeIds)
    ? nodeIds
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(',')
    : String(nodeIds || '').trim();
  
  if (!ids) {
    throw new Error('Missing node ids for fetchFigmaImages.');
  }

  const query: Record<string, string> = { ids, format };
  if (scale !== undefined && scale !== null) {
    const normalizedScale = normalizePositiveInteger(scale, 0);
    if (normalizedScale <= 0) {
      throw new Error(`Invalid scale value: ${scale}. Expected a positive integer.`);
    }
    query.scale = String(normalizedScale);
  }

  return requestFigmaJson<FigmaImagesResponse>({
    endpointPath: `/v1/images/${encodeURIComponent(normalizedFileKey)}`,
    token,
    query,
    timeoutMs,
  });
}
