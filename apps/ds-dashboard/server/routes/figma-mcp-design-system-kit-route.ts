/**
 * Figma MCP Design System Kit Route
 *
 * Returns tokens + styles from direct plugin WebSocket bridge.
 * Direct-only mode: no legacy MCP stdio fallback.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { fetchDesignSystemKitDirect } from '../services/figma-direct-bridge-service.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';

export interface FigmaMcpDesignSystemKitRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
}

function isAuthorized(c: Context, internalToken: string | undefined, getConnInfoFn: (c: Context) => ConnInfo): boolean {
  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address ?? '').trim();
  if (remoteAddress && isLoopbackAddress(remoteAddress)) return true;
  if (!internalToken) return false;
  const received = String(c.req.header('x-ds-dashboard-internal-token') ?? '').trim();
  return Boolean(received) && received === internalToken;
}

/**
 * Extract fileKey from Figma URL
 */
function extractFileKey(url: string): string | null {
  try {
    const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/figma-mcp/design-system-kit
 *
 * Direct-only: uses WebSocket bridge to plugin. No legacy fallback.
 * Query compatibility:
 * - format: accepted for backward compatibility (currently no-op in direct mode)
 * - include: optional comma-separated sections (tokens,styles)
 */
export async function handleGetDesignSystemKit(c: Context, deps: FigmaMcpDesignSystemKitRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json({ ok: false, code: 'kit.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' }, 403);
  }

  const fileUrl = c.req.query('fileUrl') ?? undefined;
  const format = c.req.query('format') ?? undefined;
  const includeQuery = c.req.query('include') ?? undefined;
  const include = includeQuery
    ? includeQuery
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part === 'tokens' || part === 'styles')
    : [];
  let fileKey = fileUrl ? extractFileKey(fileUrl) : null;

  // Direct-only mode: use direct WebSocket bridge
  // Ambiguity guard: when fileKey is not provided, check for multiple files
  if (!fileKey) {
    const manager = getPluginConnectionManager();
    const connectionCount = manager.getConnectionCount();
    const activeFileKeys = manager.getActiveFileKeys();

    if (connectionCount === 0) {
      return c.json(
        {
          ok: false,
          code: 'kit.no_socket',
          message: 'No plugin connection available. Open the Figma plugin and provide a fileUrl.',
        },
        200
      );
    }

    // True ambiguity: multiple different files connected
    if (activeFileKeys.length > 1) {
      return c.json(
        {
          ok: false,
          code: 'kit.ambiguous_file_key',
          message: 'Multiple plugin connections for different files detected. Provide a fileUrl to specify which file to fetch the design system kit from.',
        },
        200
      );
    }

    // Auto-resolve: single fileKey from active connections
    if (activeFileKeys.length === 1) {
      fileKey = activeFileKeys[0];
    }
    // If activeFileKeys.length === 0 but connectionCount > 0:
    // - If connectionCount === 1: allow draft/unkeyed file (fileKey remains null)
    // - If connectionCount > 1: multiple unkeyed connections is ambiguous
    else if (connectionCount > 1) {
      return c.json(
        {
          ok: false,
          code: 'kit.ambiguous_file_key',
          message: 'Multiple plugin connections without fileKey detected. Provide a fileUrl to specify which file to fetch the design system kit from.',
        },
        200
      );
    }
    // else: connectionCount === 1 && activeFileKeys.length === 0 → draft file, allow with fileKey = null
  }

  try {
    const directResult = await fetchDesignSystemKitDirect(fileKey, { format, include });
    return c.json(directResult, 200);
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
