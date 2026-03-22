/**
 * Figma MCP Console Logs Route
 *
 * Exposes buffered console logs from plugin push events.
 */

import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';
import type { ConsoleLogBufferEntry, ConsoleLogWithFileKey } from '../services/plugin-connection-manager.ts';

export interface FigmaMcpConsoleLogsRouteDeps {
    getConnInfoFn?: (c: Context) => ReturnType<typeof getConnInfo>;
    internalToken?: string;
}

interface ConsoleLogsResponse {
    ok: true;
    data: Array<ConsoleLogBufferEntry | ConsoleLogWithFileKey>;
    fileKey: string | null;
    count: number;
}

function isAuthorized(
    c: Context,
    internalToken: string | undefined,
    getConnInfoFn: (c: Context) => ReturnType<typeof getConnInfo>,
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
 * GET /api/figma-mcp/console-logs
 * Query params:
 * - fileKey (optional)
 * - clear (optional, default false)
 * - scope (optional): 'all' for multi-file aggregation with fileKey per entry
 */
export async function handleGetFigmaMcpConsoleLogs(
    c: Context,
    deps: FigmaMcpConsoleLogsRouteDeps = {},
): Promise<Response> {
    const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
    const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

    if (!isAuthorized(c, internalToken, getConnInfoFn)) {
        return c.json(
            {
                ok: false,
                code: 'console_logs.forbidden_remote',
                message: 'Endpoint allowed only from loopback or with internal token.',
            },
            403,
        );
    }

    const rawFileKey = c.req.query('fileKey') ?? null;
    const scope = c.req.query('scope') ?? null;
    const clear = c.req.query('clear') === 'true';

    const manager = getPluginConnectionManager();
    const shouldAggregateAll = scope === 'all' && rawFileKey === null;

    if (shouldAggregateAll) {
        const data = manager.getConsoleLogsWithFileKey();

        // Only clear global logs when explicitly requested with scope=all&clear=true
        // This prevents accidental global clears when client expects "clear current file"
        if (clear) {
            manager.clearConsoleLogs(null);
        }

        const response: ConsoleLogsResponse = {
            ok: true,
            data,
            fileKey: null,
            count: data.length,
        };

        return c.json(response, 200);
    }

    // Default behavior: use active file key when fileKey is omitted
    const targetFileKey = rawFileKey ?? manager.getActiveFileKey();
    const data = targetFileKey ? manager.getConsoleLogs(targetFileKey) : [];

    // Only clear when we have a valid target (prevents accidental global clears)
    // When fileKey is omitted, clear applies to active file (not global!)
    if (clear && targetFileKey) {
        manager.clearConsoleLogs(targetFileKey);
    }

    const response: ConsoleLogsResponse = {
        ok: true,
        data,
        fileKey: targetFileKey ?? null,
        count: data.length,
    };

    return c.json(response, 200);
}

export function registerFigmaMcpConsoleLogsRoute(
    app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
    deps: FigmaMcpConsoleLogsRouteDeps = {},
): void {
    app.get('/api/figma-mcp/console-logs', (c) => handleGetFigmaMcpConsoleLogs(c, deps));
}
