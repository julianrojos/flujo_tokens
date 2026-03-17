/**
 * Figma MCP Design Changes Route
 *
 * Exposes buffered document changes from plugin push events.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';
import type { DocumentChangeBufferEntry, DocumentChangeWithFileKey } from '../services/plugin-connection-manager.ts';

export interface FigmaMcpDesignChangesRouteDeps {
    getConnInfoFn?: (c: Context) => ConnInfo;
    internalToken?: string;
}

interface DesignChangesResponse {
    ok: true;
    data: Array<DocumentChangeBufferEntry | DocumentChangeWithFileKey>;
    fileKey: string | null;
    count: number;
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
 * GET /api/figma-mcp/design-changes
 * Query params:
 * - fileKey (optional)
 * - scope (optional): 'all' for multi-file aggregation with fileKey per entry
 */
export async function handleGetFigmaMcpDesignChanges(
    c: Context,
    deps: FigmaMcpDesignChangesRouteDeps = {},
): Promise<Response> {
    const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
    const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

    if (!isAuthorized(c, internalToken, getConnInfoFn)) {
        return c.json(
            {
                ok: false,
                code: 'design_changes.forbidden_remote',
                message: 'Endpoint allowed only from loopback or with internal token.',
            },
            403,
        );
    }

    const rawFileKey = c.req.query('fileKey') ?? null;
    const scope = c.req.query('scope') ?? null;

    const manager = getPluginConnectionManager();
    const shouldAggregateAll = scope === 'all' && rawFileKey === null;

    if (shouldAggregateAll) {
        const data = manager.getDocumentChangesWithFileKey();

        const response: DesignChangesResponse = {
            ok: true,
            data,
            fileKey: null,
            count: data.length,
        };

        return c.json(response, 200);
    }

    const targetFileKey = rawFileKey ?? manager.getActiveFileKey();
    const data = targetFileKey ? manager.getDocumentChanges(targetFileKey) : [];

    const response: DesignChangesResponse = {
        ok: true,
        data,
        fileKey: targetFileKey ?? null,
        count: data.length,
    };

    return c.json(response, 200);
}

export function registerFigmaMcpDesignChangesRoute(
    app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
    deps: FigmaMcpDesignChangesRouteDeps = {},
): void {
    app.get('/api/figma-mcp/design-changes', (c) => handleGetFigmaMcpDesignChanges(c, deps));
}
