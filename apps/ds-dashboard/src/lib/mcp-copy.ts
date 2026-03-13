/**
 * MCP Management Copy - Dashboard
 *
 * Centralized copy constants for MCP Management UI in the dashboard.
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
    noSocket: 'No MCP Management connection available. Open MCP Management in Figma and ensure it is connected.',
    connectionTimeout: 'MCP Management connection timed out. Check that MCP Management is open in Figma and retry.',
    ambiguousFileKey: 'Multiple MCP Management connections detected. Provide a Figma URL to specify which file to use.',
    directFailed: 'MCP Management operation failed. Check MCP Management logs in Figma.',
    forbiddenRemote: 'This operation is only allowed from loopback or with internal token.',
  },

  // Hints
  hints: {
    openPlugin: 'Open MCP Management in Figma',
    checkConnection: 'Check MCP Management connection status',
    retryOperation: 'Retry the operation',
  },

  // Success messages
  success: {
    connectionTest: 'MCP Management connection successful',
    variablesSynced: 'Variables synced via MCP Management',
    kitFetched: 'Design system kit fetched via MCP Management',
  },
} as const;
