/**
 * Figma MCP Runtime State
 *
 * Manages runtime state for MCP connections.
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
 * Get the current active port for MCP connections.
 */
export function getActiveMcpPort(): number {
  return getFigmaMcpRuntimeState().activePort;
}

/**
 * Reset runtime state (useful for tests).
 */
export function resetFigmaMcpRuntimeState(): void {
  runtimeState = null;
}
