/**
 * Figma MCP Runtime State
 *
 * Manages runtime state for MCP connections, including hot port switching.
 * This state is in-memory only and resets on server restart.
 */

export interface McpPortRange {
  start: number;
  end: number;
}

export interface FigmaMcpRuntimeState {
  activePort: number;
  allowedRange: McpPortRange;
  lastChangeAt: number;
  isSwitching: boolean;
  pendingSwitch?: {
    requestedPort: number;
    previousPort: number;
    startedAt: number;
  };
}

const DEFAULT_PORT_RANGE: McpPortRange = { start: 9223, end: 9232 };

let runtimeState: FigmaMcpRuntimeState | null = null;

/**
 * Get or create the singleton runtime state.
 */
export function getFigmaMcpRuntimeState(): FigmaMcpRuntimeState {
  if (!runtimeState) {
    const initialPort = parseInt(process.env.FIGMA_WS_PORT || '9223', 10);
    runtimeState = {
      activePort: Number.isFinite(initialPort) ? initialPort : 9223,
      allowedRange: DEFAULT_PORT_RANGE,
      lastChangeAt: Date.now(),
      isSwitching: false,
    };
  }
  return runtimeState;
}

/**
 * Validate that a port number is within the allowed range.
 */
export function isPortAllowed(port: number, range: McpPortRange): boolean {
  return Number.isInteger(port) && port >= range.start && port <= range.end;
}

/**
 * Begin a port switch operation.
 * Returns true if successful, false if another switch is in progress.
 */
export function beginPortSwitch(requestedPort: number): { ok: true; previousPort: number } | { ok: false; code: 'switch_in_progress' } {
  const state = getFigmaMcpRuntimeState();
  
  if (state.isSwitching) {
    return { ok: false, code: 'switch_in_progress' };
  }

  const previousPort = state.activePort;
  state.isSwitching = true;
  state.pendingSwitch = {
    requestedPort,
    previousPort,
    startedAt: Date.now(),
  };

  return { ok: true, previousPort };
}

/**
 * Complete a port switch operation successfully.
 */
export function completePortSwitch(newPort: number): void {
  const state = getFigmaMcpRuntimeState();
  state.activePort = newPort;
  state.lastChangeAt = Date.now();
  state.isSwitching = false;
  state.pendingSwitch = undefined;
}

/**
 * Rollback a port switch operation after failure.
 */
export function rollbackPortSwitch(previousPort: number): void {
  const state = getFigmaMcpRuntimeState();
  state.activePort = previousPort;
  state.isSwitching = false;
  state.pendingSwitch = undefined;
}

/**
 * Get the current active port for MCP connections.
 */
export function getActiveMcpPort(): number {
  return getFigmaMcpRuntimeState().activePort;
}

/**
 * Check if a port switch is currently in progress.
 */
export function isPortSwitchInProgress(): boolean {
  return getFigmaMcpRuntimeState().isSwitching;
}

/**
 * Reset runtime state (useful for tests).
 */
export function resetFigmaMcpRuntimeState(): void {
  runtimeState = null;
}
