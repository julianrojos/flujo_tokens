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

  const fetchFn = deps.fetchDesignSystemKitFn ?? fetchDesignSystemKitService;
  const result = await fetchFn({ format, include, fileUrl });

  return c.json(result, 200);
}

export function registerFigmaMcpDesignSystemKitRoute(
  app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpDesignSystemKitRouteDeps = {},
): void {
  app.get('/api/figma-mcp/design-system-kit', (c) => handleGetDesignSystemKit(c, deps));
}
