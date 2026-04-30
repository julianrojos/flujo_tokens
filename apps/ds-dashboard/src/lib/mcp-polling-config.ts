// MCP polling configuration — single source of truth for all intervals and timeouts.

// Sidebar status dot + unified context
export const MCP_STATUS_POLL_INTERVAL_MS = 8_000;
export const MCP_STATUS_REQUEST_TIMEOUT_MS = 6_000;
export const MCP_HEARTBEAT_POLL_INTERVAL_MS = 8_000;
export const MCP_BACKOFF_MAX_MS = 120_000;
export const MCP_INITIAL_CONFIGURED_PORT = 9_223;

// Resolve-connection polling flow (button)
export const MCP_RESET_POLL_INTERVAL_MS = 2_000;
export const MCP_RESET_POLL_TIMEOUT_MS = 25_000;
export const MCP_WAIT_POLL_TIMEOUT_MS = 30_000;
export const MCP_MAX_POLL_REQUEST_TIMEOUT_MS = 10_000;

// Plugin version pinned to the bundled artefact
export const EXPECTED_MCP_PLUGIN_VERSION = '1.0.0';
