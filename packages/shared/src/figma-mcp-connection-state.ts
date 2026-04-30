export type McpConnectionStateValue =
  | "connected"
  | "connecting"
  | "disconnected"
  | "mismatch"
  | "fallback";

export interface McpConnectionState {
  configuredPort: number;
  connectedPort: number | null;
  state: McpConnectionStateValue;
  cause?: string;
}

export interface McpCapabilitiesLike {
  ok: true;
  mcp: {
    connected: boolean;
    code: string;
    message: string;
    currentPort: number;
    portFallbackUsed: boolean;
    activePort: number;
  };
}

export interface McpErrorLike {
  ok: false;
  code: string;
  message: string;
}

export type McpConnectionPayload = McpCapabilitiesLike | McpErrorLike;

export interface McpConnectionCopy {
  label: string;
  sublabel: string;
}

export function isTimeoutLikeError(error: unknown): boolean {
  if (!error) return false;
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name || "").toLowerCase()
      : "";
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return (
    name.includes("abort") ||
    name.includes("timeout") ||
    message.includes("signal timed out") ||
    message.includes("timed out") ||
    message.includes("aborterror") ||
    message.includes("timeouterror")
  );
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function deriveMcpConnectionState(
  payload: McpConnectionPayload,
  lastKnownConfiguredPort: number,
): McpConnectionState {
  if (!payload.ok) {
    if (payload.code === "capabilities.timeout") {
      return {
        configuredPort: lastKnownConfiguredPort,
        connectedPort: null,
        state: "connecting",
        cause: payload.message,
      };
    }
    return {
      configuredPort: lastKnownConfiguredPort,
      connectedPort: null,
      state: "disconnected",
      cause: payload.message,
    };
  }

  const configuredPort = toPositiveInteger(
    payload.mcp.activePort,
    lastKnownConfiguredPort,
  );
  const connectedPort = toPositiveInteger(payload.mcp.currentPort, configuredPort);
  const isConnected = payload.mcp.connected === true;

  if (!isConnected) {
    return {
      configuredPort,
      connectedPort: null,
      state: "disconnected",
      cause: payload.mcp.message,
    };
  }

  if (configuredPort === connectedPort) {
    if (payload.mcp.portFallbackUsed) {
      return {
        configuredPort,
        connectedPort,
        state: "fallback",
        cause: `Connected on fallback port ${connectedPort}`,
      };
    }

    return {
      configuredPort,
      connectedPort,
      state: "connected",
    };
  }

  return {
    configuredPort,
    connectedPort,
    state: "mismatch",
    cause: `Bridge connected to ${connectedPort}, dashboard configured for ${configuredPort}`,
  };
}

export function getMcpConnectionStateCopy(
  state: McpConnectionStateValue | undefined,
): McpConnectionCopy {
  switch (state) {
    case "connected":
      return {
        label: "Connected",
        sublabel: "MCP session is active for this file",
      };
    case "connecting":
      return {
        label: "Connecting…",
        sublabel: "Checking Dashboard and MCP session",
      };
    case "disconnected":
      return {
        label: "Disconnected",
        sublabel: "No active MCP session for this file",
      };
    case "mismatch":
      return {
        label: "Port mismatch",
        sublabel: "Session active on a different MCP port",
      };
    case "fallback":
      return {
        label: "Fallback port",
        sublabel: "Session active on fallback MCP port",
      };
    default:
      return {
        label: "Checking…",
        sublabel: "",
      };
  }
}
