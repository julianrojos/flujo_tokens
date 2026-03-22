/**
 * Figma MCP Design System Kit Route
 *
 * Returns tokens + styles from direct plugin WebSocket bridge in various formats.
 * Direct-only mode: no legacy MCP stdio fallback.
 *
 * Supported query parameters:
 * @param {string} [format] - Output format (full|summary|compact|auto|dtcg)
 *   - full: Complete variable values across all modes
 *   - summary: Only default mode variable values + full metadata 
 *   - compact: Minimal metadata only (no values)
 *   - auto: Automatically degrade format based on response size
 *   - dtcg: W3C DTCG standard format output
 * @returns {object} Response with design system data:
 *   - tokens: Figma variables and collections (unless dtcg format)
 *   - styles: Figma styles
 *   - responseMeta: Applied compression and format metadata
 */

import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { fetchDesignSystemKitDirect } from '../services/figma-direct-bridge-service.ts';
import type { FigmaVariableCollection } from '../../../../tooling/src/utils/figma.ts';
import { toDtcgTokenSet } from '../lib/dtcg-transform.ts';
import {
  compressKitResult,
  estimateJsonSize,
  resolveCompressionLevel,
  type KitFormat,
  type CompressionLevel,
} from '../lib/response-compressor.ts';
import { resolveFileKeyFromManager, isFileKeySuccess } from '../lib/filekey-utils.ts';

export interface FigmaMcpDesignSystemKitRouteDeps {
  getConnInfoFn?: (c: Context) => ReturnType<typeof getConnInfo>;
  internalToken?: string;
  fetchDesignSystemKitDirectFn?: typeof fetchDesignSystemKitDirect;
}

function isAuthorized(c: Context, internalToken: string | undefined, getConnInfoFn: (c: Context) => ReturnType<typeof getConnInfo>): boolean {
  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address ?? '').trim();
  if (remoteAddress && isLoopbackAddress(remoteAddress)) return true;
  if (!internalToken) return false;
  const received = String(c.req.header('x-ds-dashboard-internal-token') ?? '').trim();
  return Boolean(received) && received === internalToken;
}

/**
 * GET /api/figma-mcp/design-system-kit
 *
 * Returns design system kit (tokens + styles) from direct plugin WebSocket bridge.
 * Direct-only mode: no legacy MCP stdio fallback.
 *
 * @queryParam {string} fileUrl - Optional Figma file URL to scope the request
 * @queryParam {string} format - Response format (default: 'auto')
 *   - 'auto': Auto-select compression based on payload size
 *     - < 500KB → 'full' (no compression)
 *     - 500KB–1MB → 'summary' (single mode value per variable)
 *     - > 1MB → 'compact' (id/name/type only)
 *   - 'full': Return all data unchanged
 *   - 'summary': Keep only default mode value per variable, drop style descriptions
 *   - 'compact': Keep only id/name/resolvedType for variables, drop style descriptions
 *   - 'dtcg': Return W3C DTCG token set format (no compression, transforms to DTCG spec)
 *   - Unknown values: Treated as 'auto' with console warning
 * @queryParam {string} include - Optional comma-separated sections to include ('tokens', 'styles'). Default: all.
 *
 * @returns {Object} Success response
 *   Standard format (format=full|summary|compact|auto):
 *   {
 *     ok: true,
 *     tokens?: { variables: Record<string, Variable>, variableCollections: Record<string, Collection> },
 *     styles?: Style[],
 *     elapsedMs: number,
 *     responseMeta: { appliedFormat: 'full'|'summary'|'compact', estimatedBytes: number }
 *   }
 *
 *   DTCG format (format=dtcg):
 *   {
 *     ok: true,
 *     dtcg: DtcgTokenSet,  // W3C DTCG format with nested token structure
 *     elapsedMs: number,
 *     responseMeta: { appliedFormat: 'dtcg' }
 *   }
 *
 * @returns {Object} Error response
 *   { ok: false, code: string, message: string }
 *   Codes: kit.forbidden_remote, kit.no_socket, kit.ambiguous_file_key, kit.direct_failed
 */
export async function handleGetDesignSystemKit(c: Context, deps: FigmaMcpDesignSystemKitRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  const fetchKitFn = deps.fetchDesignSystemKitDirectFn ?? fetchDesignSystemKitDirect;

  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json({ ok: false, code: 'kit.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' }, 403);
  }

  const fileUrl = c.req.query('fileUrl') ?? undefined;
  const formatParam = c.req.query('format') ?? 'auto';
  const includeQuery = c.req.query('include') ?? undefined;
  const include = includeQuery
    ? includeQuery
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part === 'tokens' || part === 'styles')
    : [];

  // Validate format parameter - unknown values treated as auto with warning
  let format: KitFormat = 'auto';
  const validFormats = ['auto', 'full', 'summary', 'compact', 'dtcg'];
  if (validFormats.includes(formatParam)) {
    format = formatParam as KitFormat;
  } else {
    console.warn(`[design-system-kit-route] Unknown format: ${formatParam}, treating as 'auto'`);
    format = 'auto';
  }

  // Resolve fileKey with ambiguity guard using shared utility
  const resolved = resolveFileKeyFromManager(fileUrl, {
    ambiguous: 'kit.ambiguous_file_key',
    noSocket: 'kit.no_socket',
    ambiguousMessage: 'Multiple plugin connections for different files detected. Provide a fileUrl to specify which file to fetch the design system kit from.',
    noSocketMessage: 'No plugin connection available. Open the Figma plugin and provide a fileUrl.',
  });

  if (!isFileKeySuccess(resolved)) {
    return c.json(resolved, 200);
  }

  const fileKey = resolved.fileKey;

  try {
    const directResult = await fetchKitFn(fileKey, { format: undefined, include });

    // Handle DTCG format separately
    if (format === 'dtcg') {
      const variables = directResult.tokens?.variables ?? {};
      const collections = directResult.tokens?.variableCollections ?? {};
      const dtcg = toDtcgTokenSet(variables, collections);

      return c.json({
        ok: true,
        dtcg,
        responseMeta: {
          appliedFormat: 'dtcg',
        },
        elapsedMs: directResult.elapsedMs,
      }, 200);
    }

    // Compression path
    const estimatedBytes = estimateJsonSize(directResult);
    const level = resolveCompressionLevel(format, estimatedBytes);
    const collections: Record<string, FigmaVariableCollection> = directResult.tokens?.variableCollections ?? {};
    const compressed = compressKitResult(directResult, level, collections);

    return c.json({
      ...compressed,
      responseMeta: {
        appliedFormat: level,
        estimatedBytes,
      },
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check for specific error conditions
    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'kit.no_socket',
          message: 'No plugin connection available. Open the Figma plugin and ensure it is connected.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'kit.direct_failed',
        message,
      },
      200
    );
  }
}

export function registerFigmaMcpDesignSystemKitRoute(
  app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpDesignSystemKitRouteDeps = {},
): void {
  app.get('/api/figma-mcp/design-system-kit', (c) => handleGetDesignSystemKit(c, deps));
}
