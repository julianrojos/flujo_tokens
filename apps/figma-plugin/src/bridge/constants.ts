/**
 * Bridge Constants
 *
 * Centralized configuration for WebSocket bridge communication.
 */

/**
 * Default transport mode for MCP communication
 */
export const DEFAULT_TRANSPORT_MODE = 'direct' as const;

/**
 * Default WebSocket URL for direct mode bridge connection.
 * Can be overridden via window.FIGMA_PLUGIN_CONFIG.directWsUrl for multi-instance deployments.
 */
export const DEFAULT_DIRECT_WS_URL = 'ws://localhost:8787/ws/figma-plugin';
