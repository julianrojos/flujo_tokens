/**
 * Debug Endpoint Authorization Helper
 *
 * Shared authorization logic for debug endpoints.
 * Used by /api/figma-plugin/debug and similar endpoints.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from './loopback-utils.ts';

/**
 * Check if a request is authorized for debug endpoints.
 * Fail-closed: empty remoteAddress requires valid token.
 */
export function checkDebugEndpointAuth(
    c: Context,
    internalToken: string | undefined,
    getConnInfoFn: (c: Context) => ConnInfo = getConnInfo
): { allowed: boolean; code?: string } {
    const isDev = process.env.NODE_ENV === 'development';

    // In development mode, always allow
    if (isDev) {
        return { allowed: true };
    }

    // Wrap getConnInfoFn in try/catch to prevent exceptions from crashing the route
    // If conninfo fails, treat as empty remoteAddress (fail-closed to token/dev check)
    let remoteAddress = '';
    try {
        const connInfo = getConnInfoFn(c);
        remoteAddress = String(connInfo?.remote?.address ?? '').trim();
    } catch {
        // getConnInfoFn failed - treat as empty remoteAddress, will fail-closed to token check
        remoteAddress = '';
    }

    const isLoopback = remoteAddress ? isLoopbackAddress(remoteAddress) : false;

    // Loopback is always allowed
    if (isLoopback) {
        return { allowed: true };
    }

    const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') ?? '').trim();
    const hasValidToken = Boolean(
        internalToken && receivedToken && receivedToken === internalToken
    );

    if (hasValidToken) {
        return { allowed: true };
    }

    return { allowed: false, code: 'debug.forbidden' };
}
