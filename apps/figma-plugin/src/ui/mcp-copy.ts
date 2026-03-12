/**
 * MCP Management Copy - Plugin
 *
 * Centralized copy constants for MCP Management UI in the Figma plugin.
 * All user-facing messages related to MCP connection/capabilities should use these constants.
 */

export const MCP_COPY = {
  // Connection states
  connection: {
    connected: 'MCP Management connected',
    disconnected: 'MCP Management disconnected',
    connecting: 'Connecting to MCP Management...',
    fallback: 'MCP Management on fallback port',
    mismatch: 'MCP Management port mismatch',
  },

  // Actions
  actions: {
    testConnection: 'Test MCP connection',
    resolveConnection: 'Resolve connection',
    resetMcp: 'Reset MCP Management',
    reconnect: 'Reconnect',
  },

  // Errors
  errors: {
    noSocket: 'No MCP Management connection. Open MCP Management in Figma.',
    connectionTimeout: 'MCP Management connection timed out. Retry in a few seconds.',
    versionMismatch: 'MCP Management version mismatch. Reimport MCP Management plugin.',
    transportConnectedNoHeartbeat: 'MCP Management transport connected but no heartbeat detected.',
  },

  // Hints
  hints: {
    openPlugin: 'Open MCP Management in Figma',
    checkConnection: 'Check MCP Management connection',
    retryOperation: 'Retry',
  },

  // Success messages
  success: {
    connectionTest: 'MCP Management connected successfully',
    variablesSynced: 'Variables synced',
    kitFetched: 'Design system kit fetched',
  },

  // Status messages
  status: {
    healthy: 'Healthy: MCP Management active',
    pluginAliveTransportDead: 'MCP Management plugin alive, transport not connected',
    noHeartbeat: 'No MCP Management heartbeat detected',
    unknown: 'Run test to refresh status',
  },
} as const;
