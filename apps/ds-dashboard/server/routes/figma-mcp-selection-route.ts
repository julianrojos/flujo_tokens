/**
 * Figma MCP Selection Route
 *
 * Exposes buffered selection state from plugin push events.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';
import type { SelectionBufferEntry } from '../services/plugin-connection-manager.ts';

export interface FigmaMcpSelectionRouteDeps {
    getConnInfoFn?: (c: Context) => ConnInfo;
    internalToken?: string;
}

interface SelectionResponse {
    ok: true;
    data: SelectionBufferEntry | null;
    fileKey: string | null;
}

function isAuthorized(
    c: Context,
    internalToken: string | undefined,
    getConnInfoFn: (c: Context) => ConnInfo,
): boolean {
    const connInfo = getConnInfoFn(c);
    const remoteAddress = String(connInfo?.remote?.address || '').trim();

    if (remoteAddress && isLoopbackAddress(remoteAddress)) {
        return true;
    }
    if (!internalToken) return false;
    const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
    return receivedToken === internalToken;
}

/**
 * GET /api/figma-mcp/selection
 * Query params: fileKey (optional)
 */
export async function handleGetFigmaMcpSelection(
    c: Context,
    deps: FigmaMcpSelectionRouteDeps = {},
): Promise<Response> {
    const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
    const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

    if (!isAuthorized(c, internalToken, getConnInfoFn)) {
        return c.json(
            {
                ok: false,
                code: 'selection.forbidden_remote',
                message: 'Endpoint allowed only from loopback or with internal token.',
            },
            403,
        );
    }

    const rawFileKey = c.req.query('fileKey') ?? null;

    const manager = getPluginConnectionManager();
    const targetFileKey = rawFileKey ?? manager.getActiveFileKey();
    const data = targetFileKey ? manager.getSelection(targetFileKey) : null;

    const response: SelectionResponse = {
        ok: true,
        data,
        fileKey: targetFileKey ?? null,
    };

    return c.json(response, 200);
}

export function registerFigmaMcpSelectionRoute(
    app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
    deps: FigmaMcpSelectionRouteDeps = {},
): void {
    app.get('/api/figma-mcp/selection', (c) => handleGetFigmaMcpSelection(c, deps));
}
