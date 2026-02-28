/**
 * Figma API Service
 *
 * Provides typed access to Figma REST API endpoints.
 * Uses Node.js built-in fetch (Node 18+).
 * Migrated from tooling/scripts/lib/figma-api.mjs
 */

import type {
    FetchFigmaFileOptions,
    FetchFigmaNodesOptions,
    FetchFigmaVariablesOptions,
    FetchFigmaImagesOptions,
    FigmaFileResponse,
    FigmaNodesResponse,
    FigmaVariablesResponse,
} from '../types/figma.js';

// ============================================================================
// Constants
// ============================================================================

const FIGMA_API_BASE_URL = 'https://api.figma.com';
const DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize a raw value to a positive integer.
 */
function normalizePositiveInteger(rawValue: unknown, fallback: number): number {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return fallback;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.floor(parsed));
}

/**
 * Sanitize Figma API token.
 */
function sanitizeToken(rawToken: unknown): string {
    const token = String(rawToken || '').trim();
    if (!token) {
        throw new Error('Missing Figma API token. Provide token or set FIGMA_TOKEN.');
    }
    return token;
}

/**
 * Read Retry-After header value in seconds.
 */
function readRetryAfterSeconds(response: Response): number | null {
    const headerValue = response.headers.get('retry-after');
    if (!headerValue) return null;
    const seconds = Number(headerValue);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : null;
}

/**
 * Build error details string from API error payload.
 */
function buildErrorDetails(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const p = payload as Record<string, unknown>;
    const err = String(p.err || p.error || p.message || '').trim();
    return err;
}

/**
 * Resolve fetch function for current runtime.
 */
function resolveFetch(): typeof fetch {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable. Use Node.js 18+.');
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
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
            apiUrl.searchParams.set(key, String(value));
        }
    }

    const runtimeFetch = resolveFetch();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

    try {
        const response = await runtimeFetch(apiUrl.toString(), {
            method: 'GET',
            headers: {
                'X-Figma-Token': normalizedToken,
                'Accept': 'application/json',
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const details = buildErrorDetails(payload);
            const retryAfter = readRetryAfterSeconds(response);
            const retryHint = retryAfter !== null ? ` Retry after ${retryAfter}s.` : '';
            throw new Error(`Figma API error ${response.status}: ${details || response.statusText}${retryHint}`);
        }

        return await response.json() as T;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Figma request timed out after ${normalizedTimeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

// ============================================================================
// Public API Exports
// ============================================================================

/**
 * Fetch Figma file with full document tree.
 */
export async function fetchFigmaFile(options: FetchFigmaFileOptions): Promise<FigmaFileResponse> {
    const { fileKey, token, depth, branchData, geometry, timeoutMs } = options;
    const query: Record<string, unknown> = {};
    if (depth) query.depth = depth;
    if (branchData) query.branch_data = 'true';
    if (geometry) query.geometry = geometry;

    return requestFigmaJson<FigmaFileResponse>({
        endpointPath: `/v1/files/${encodeURIComponent(fileKey)}`,
        token,
        query,
        timeoutMs,
    });
}

/**
 * Fetch specific nodes from Figma file.
 */
export async function fetchFigmaNodes(options: FetchFigmaNodesOptions): Promise<FigmaNodesResponse> {
    const { fileKey, nodeIds, token, depth, geometry, timeoutMs } = options;
    const query: Record<string, unknown> = {
        ids: nodeIds.join(','),
    };
    if (depth) query.depth = depth;
    if (geometry) query.geometry = geometry;

    return requestFigmaJson<FigmaNodesResponse>({
        endpointPath: `/v1/files/${encodeURIComponent(fileKey)}/nodes`,
        token,
        query,
        timeoutMs,
    });
}

/**
 * Fetch local variables from Figma file.
 */
export async function fetchFigmaLocalVariables(options: FetchFigmaVariablesOptions): Promise<FigmaVariablesResponse> {
    const { fileKey, token, timeoutMs } = options;
    return requestFigmaJson<FigmaVariablesResponse>({
        endpointPath: `/v1/files/${encodeURIComponent(fileKey)}/variables/local`,
        token,
        timeoutMs,
    });
}

/**
 * Fetch images for specific nodes from Figma file.
 */
export async function fetchFigmaImages(options: FetchFigmaImagesOptions): Promise<{ images: Record<string, string> }> {
    const { fileKey, nodeIds, token, format = 'png', scale, timeoutMs } = options;
    const query: Record<string, unknown> = {
        ids: nodeIds.join(','),
        format,
    };
    if (scale) query.scale = scale;

    return requestFigmaJson<{ images: Record<string, string> }>({
        endpointPath: `/v1/images/${encodeURIComponent(fileKey)}`,
        token,
        query,
        timeoutMs,
    });
}
