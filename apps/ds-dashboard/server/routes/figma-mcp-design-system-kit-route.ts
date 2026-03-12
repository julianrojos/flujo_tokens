/**
 * Figma MCP Design System Kit Route
 *
 * Returns tokens + styles from figma_get_design_system_kit in a single MCP call.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { fetchDesignSystemKitService, type FetchDesignSystemKitServiceResult } from '../services/figma-mcp-ping-service.ts';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { getTransportMode } from '../lib/transport-mode.ts';
import { fetchDesignSystemKitDirect } from '../services/figma-direct-bridge-service.ts';
import { getShadowModeExecutor } from '../services/shadow-parity.ts';
import type { FetchDesignSystemKitOptions } from '../../../../tooling/src/services/figma-mcp-variables.js';

export interface FigmaMcpDesignSystemKitRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  fetchDesignSystemKitFn?: (args: FetchDesignSystemKitOptions) => Promise<FetchDesignSystemKitServiceResult>;
}

function isAuthorized(c: Context, internalToken: string | undefined, getConnInfoFn: (c: Context) => ConnInfo): boolean {
  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address ?? '').trim();
  if (remoteAddress && isLoopbackAddress(remoteAddress)) return true;
  if (!internalToken) return false;
  const received = String(c.req.header('x-ds-dashboard-internal-token') ?? '').trim();
  return Boolean(received) && received === internalToken;
}

export async function handleGetDesignSystemKit(c: Context, deps: FigmaMcpDesignSystemKitRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json({ ok: false, code: 'kit.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' }, 403);
  }

  const rawFormat = String(c.req.query('format') ?? 'summary');
  const format: FetchDesignSystemKitOptions['format'] = rawFormat === 'full' || rawFormat === 'compact' || rawFormat === 'summary' ? rawFormat : 'summary';

  const rawInclude = String(c.req.query('include') ?? 'tokens,styles');
  const include = rawInclude.split(',').map((s) => s.trim()).filter((s): s is 'tokens' | 'styles' | 'components' => s === 'tokens' || s === 'styles' || s === 'components');
  if (include.length === 0) include.push('tokens', 'styles');

  const fileUrl = c.req.query('fileUrl') ?? undefined;

  // Get transport mode
  const transportMode = getTransportMode();

  const fileKey = fileUrl ? extractFileKey(fileUrl) : null;

  // In direct/shadow mode, fileKey is required to avoid ambiguous routing
  if ((transportMode === 'direct' || transportMode === 'shadow') && !fileKey) {
    return c.json(
      {
        ok: false,
        code: 'kit.missing_file_key',
        message: 'fileKey is required in direct/shadow mode. Provide a valid fileUrl.',
        _transport: transportMode,
      },
      400
    );
  }

  if (transportMode === 'direct' || transportMode === 'shadow') {
    try {
      const directResult = await fetchDesignSystemKitDirect(fileKey!);
      if (transportMode === 'shadow') {
        const shadow = getShadowModeExecutor();
        shadow.runShadow(
          'design-system-kit',
          fileKey,
          async () => directResult,
          async () => await (deps.fetchDesignSystemKitFn ?? fetchDesignSystemKitService)({ format, include, fileUrl })
        );
      }
      return c.json(directResult, 200);
    } catch (error) {
      // In direct mode, return explicit error - do NOT fall back to legacy silently
      if (transportMode === 'direct') {
        return c.json(
          {
            ok: false,
            code: 'kit.direct_failed',
            message: error instanceof Error ? error.message : String(error),
            _transport: 'direct',
          },
          200
        );
      }
      // Shadow mode: fall back to legacy, shadow comparison will detect diff
      console.warn('[figma-mcp-kit] Direct mode failed, falling back to legacy:', error);
    }
  }

  const fetchFn = deps.fetchDesignSystemKitFn ?? fetchDesignSystemKitService;
  const result = await fetchFn({ format, include, fileUrl });

  return c.json(result, 200);
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

export function registerFigmaMcpDesignSystemKitRoute(
  app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpDesignSystemKitRouteDeps = {},
): void {
  app.get('/api/figma-mcp/design-system-kit', (c) => handleGetDesignSystemKit(c, deps));
}
