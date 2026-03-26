/**
 * DS Graph Copy - Dashboard
 *
 * Centralized copy constants for DS Graph UI in the dashboard.
 * All user-facing messages related to MCP connection/capabilities should use these constants.
 */

export const MCP_COPY = {
  // Connection states
  connection: {
    connected: 'DS Graph connected',
    disconnected: 'DS Graph disconnected',
    connecting: 'Connecting to DS Graph...',
    fallback: 'DS Graph on fallback port',
    mismatch: 'DS Graph port mismatch',
  },

  // Actions
  actions: {
    testConnection: 'Test MCP connection',
    resolveConnection: 'Resolve connection',
    resetMcp: 'Reset DS Graph',
    reconnect: 'Reconnect',
  },

  // Errors
  errors: {
    noSocket: 'No DS Graph connection available. Open DS Graph in Figma and ensure it is connected.',
    connectionTimeout: 'DS Graph connection timed out. Check that DS Graph is open in Figma and retry.',
    ambiguousFileKey: 'Multiple DS Graph connections detected. Provide a Figma URL to specify which file to use.',
    directFailed: 'DS Graph operation failed. Check DS Graph logs in Figma.',
    forbiddenRemote: 'This operation is only allowed from loopback or with internal token.',
  },

  // Hints
  hints: {
    openPlugin: 'Open DS Graph in Figma',
    checkConnection: 'Check DS Graph connection status',
    retryOperation: 'Retry the operation',
  },

  // Success messages
  success: {
    connectionTest: 'DS Graph connection successful',
    variablesSynced: 'Variables synced via DS Graph',
    kitFetched: 'Design system kit fetched via DS Graph',
  },
} as const;
