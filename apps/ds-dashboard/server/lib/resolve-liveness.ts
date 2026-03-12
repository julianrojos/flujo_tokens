/**
 * Liveness Resolution Utility
 *
 * Provides a pure function to determine connection liveness based on
 * transport mode and various connection states.
 *
 * Single source of truth for liveness decisions.
 */

/**
 * Transport mode for MCP communication
 * - legacy: Current architecture (WS → MCP process → stdio → Dashboard)
 * - direct: New direct WS connection to Dashboard
 * - shadow: Direct mode + parallel legacy execution for parity checking
 */
export type TransportMode = 'legacy' | 'direct' | 'shadow';

/**
 * Input for liveness resolution
 */
export interface LivenessInput {
    mode: TransportMode;
    wsAlive: boolean;
    heartbeatAlive: boolean;
    pingConnected: boolean;
}

/**
 * Result of liveness resolution
 */
export interface LivenessResult {
    alive: boolean;
    /**
     * Source that determined the liveness state:
     * - 'ws': Direct WebSocket connection
     * - 'legacy': Legacy MCP stdio connection
     * - 'hybrid': Combined WS + legacy fallback
     * - 'none': No active connection (disconnected state)
     */
    source: 'ws' | 'legacy' | 'hybrid' | 'none';
}

/**
 * Resolve liveness based on transport mode and connection states.
 *
 * This is a PURE FUNCTION - no side effects, same input always returns same output.
 *
 * Rules:
 * - direct mode: WS first, allow heartbeat fallback during migration
 * - shadow mode: use WS if available, fallback to ping/heartbeat (hybrid)
 * - legacy mode: use ping/heartbeat (legacy)
 */
export function resolveLiveness(input: LivenessInput): LivenessResult {
    const { mode, wsAlive, heartbeatAlive, pingConnected } = input;

    if (mode === 'direct') {
        if (wsAlive) {
            return { alive: true, source: 'ws' };
        }
        if (heartbeatAlive) {
            return { alive: true, source: 'hybrid' };
        }
        // Disconnected: no WS session and no heartbeat fallback
        return { alive: false, source: 'none' };
    }

    if (mode === 'shadow') {
        // Shadow mode: WS is primary, but allow fallback to legacy for compatibility
        // This ensures we don't report disconnected when WS is down but legacy works
        const isWsAlive = wsAlive;
        const isLegacyAlive = pingConnected || heartbeatAlive;

        if (isWsAlive) {
            return { alive: true, source: 'ws' };
        }

        // If WS is down but legacy is alive, still report as alive (hybrid)
        if (isLegacyAlive) {
            return { alive: true, source: 'hybrid' };
        }

        // Disconnected: neither WS nor legacy is alive
        return { alive: false, source: 'none' };
    }

    // Legacy mode: use ping + heartbeat
    const isAlive = pingConnected || heartbeatAlive;
    return { alive: isAlive, source: isAlive ? 'legacy' : 'none' };
}

/**
 * Disconnection cause based on liveness result and input states
 */
export type DisconnectionCauseCode =
    | 'none'
    | 'no_ws_session'
    | 'legacy_not_connected'
    | 'instance_mismatch'
    | 'timeout'
    | 'unknown';

/**
 * Determine disconnection cause based on liveness result and ping error
 */
export function resolveDisconnectionCause(
    liveness: LivenessResult,
    input: LivenessInput,
    pingErrorCode?: string
): { code: DisconnectionCauseCode; message: string } {
    // If we're alive, there's no disconnection cause
    if (liveness.alive) {
        return { code: 'none', message: 'Connected' };
    }

    const { mode, wsAlive, heartbeatAlive, pingConnected } = input;

    // Check for explicit error codes first
    if (pingErrorCode === 'mcp.instance_mismatch') {
        return {
            code: 'instance_mismatch',
            message: 'Port conflict between plugin and dashboard MCP instances',
        };
    }

    if (pingErrorCode === 'mcp.timeout' || pingErrorCode === 'timeout') {
        return {
            code: 'timeout',
            message: 'Connection timed out',
        };
    }

    // Mode-specific causes
    if (mode === 'direct') {
        if (!wsAlive && !heartbeatAlive) {
            return {
                code: 'no_ws_session',
                message: 'No active plugin WebSocket session or heartbeat',
            };
        }
    }

    if (mode === 'legacy' || mode === 'shadow') {
        if (!pingConnected && !heartbeatAlive) {
            return {
                code: 'legacy_not_connected',
                message: 'Legacy MCP not connected (no heartbeat and no successful ping)',
            };
        }
    }

    // Fallback for unknown state - concise message for logs, details in debug info
    return {
        code: 'unknown',
        message: `Disconnected (${mode} mode). Check logs for details.`,
    };
}

/**
 * Debug info for liveness calculation
 */
export function getLivenessDebugInfo(input: LivenessInput): {
    resolved: LivenessResult;
    cause: { code: DisconnectionCauseCode; message: string };
    input: LivenessInput;
} {
    const resolved = resolveLiveness(input);
    const cause = resolveDisconnectionCause(resolved, input);
    return { resolved, cause, input };
}
