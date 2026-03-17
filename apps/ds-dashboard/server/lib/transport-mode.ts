/**
 * Transport Mode Configuration
 *
 * Provides utility to get the current transport mode from environment.
 * Phase 5: Integration of business routes to MCP_TRANSPORT
 */

import type { TransportMode } from './resolve-liveness.ts';

/**
 * Valid transport modes
 */
const VALID_TRANSPORT_MODES: readonly TransportMode[] = ['legacy', 'direct', 'shadow'] as const;

/**
 * Default transport mode
 */
const DEFAULT_TRANSPORT_MODE: TransportMode = 'direct';

/**
 * Environment variable name for transport mode
 */
const TRANSPORT_MODE_ENV = 'MCP_TRANSPORT';

/**
 * Get current transport mode from environment
 */
export function getTransportMode(): TransportMode {
    const envMode = process.env[TRANSPORT_MODE_ENV];

    if (!envMode) {
        return DEFAULT_TRANSPORT_MODE;
    }

    const normalizedMode = envMode.trim().toLowerCase();

    if (VALID_TRANSPORT_MODES.includes(normalizedMode as TransportMode)) {
        return normalizedMode as TransportMode;
    }

    console.warn(`[transport-mode] Invalid MCP_TRANSPORT value: "${envMode}". Valid values are: ${VALID_TRANSPORT_MODES.join('|')}. Using default: "${DEFAULT_TRANSPORT_MODE}"`);
    return DEFAULT_TRANSPORT_MODE;
}

/**
 * Check if we're in direct mode
 */
export function isDirectMode(): boolean {
    return getTransportMode() === 'direct';
}

/**
 * Check if we're in shadow mode
 */
export function isShadowMode(): boolean {
    return getTransportMode() === 'shadow';
}

/**
 * Check if we're in legacy mode
 */
export function isLegacyMode(): boolean {
    return getTransportMode() === 'legacy';
}
