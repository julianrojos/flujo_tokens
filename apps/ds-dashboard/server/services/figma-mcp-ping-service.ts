import {
  disposeSharedFigmaMcpClient,
  fetchVariablesFromSharedMcpClient,
  pingSharedFigmaMcp,
  warmupSharedFigmaMcpClient,
  listMcpTools,
  fetchDesignSystemKitFromSharedMcpClient,
  type PingSharedFigmaMcpResult,
  type McpListToolsResult,
  type McpListToolsError,
  type FetchDesignSystemKitOptions,
  type DesignSystemKitResult,
  type DesignSystemKitError,
} from '../../../../tooling/src/services/figma-mcp-variables.js';
import type { FigmaVariablesResponse } from '../../../../tooling/src/utils/figma.js';

export interface FigmaMcpPingServiceArgs {
  figmaUrl?: string;
  figmaToken?: string;
  timeoutMs?: number;
  connectWaitMs?: number;
}

export type FigmaMcpPingServiceResult = PingSharedFigmaMcpResult;

const MCP_STATUS_TIMEOUT_MS = 20_000;
const MCP_CONNECT_WAIT_MS = 5_000;

// A more generous timeout for the initial warmup: first-time npx downloads
// of figma-console-mcp can take longer than the regular per-request timeout.
const MCP_WARMUP_TIMEOUT_MS = 90_000;

export async function pingFigmaMcpService(
  args: FigmaMcpPingServiceArgs = {},
): Promise<FigmaMcpPingServiceResult> {
  const figmaToken = String(args.figmaToken || '').trim();
  const timeoutMsRaw = Number(args.timeoutMs);
  const connectWaitMsRaw = Number(args.connectWaitMs);
  const timeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.floor(timeoutMsRaw)
      : MCP_STATUS_TIMEOUT_MS;
  const connectWaitMs =
    Number.isFinite(connectWaitMsRaw) && connectWaitMsRaw >= 0
      ? Math.floor(connectWaitMsRaw)
      : MCP_CONNECT_WAIT_MS;
  const mergedEnv = figmaToken
    ? ({ ...process.env, FIGMA_ACCESS_TOKEN: figmaToken } as NodeJS.ProcessEnv)
    : process.env;

  return await pingSharedFigmaMcp({
    fileUrl: args.figmaUrl,
    timeoutMs,
    connectWaitMs,
    env: mergedEnv,
  });
}

export function disposeFigmaMcpPingService(): void {
  disposeSharedFigmaMcpClient();
}

/**
 * Eagerly spawn the shared figma-console-mcp process in the background.
 *
 * Call this once at server startup.  By the time the user interacts with the
 * "Test MCP connection" button the process will already be running, its port
 * will be advertised in /tmp, and the bridge plugin will have had a
 * chance to discover and connect to it — avoiding the cold-start timeout that
 * occurs when the client is created lazily on the first ping request.
 */
export function warmupFigmaMcpPingService(args: { env?: NodeJS.ProcessEnv } = {}): void {
  const env = args.env ?? process.env;
  warmupSharedFigmaMcpClient({
    timeoutMs: MCP_WARMUP_TIMEOUT_MS,
    env,
  });
}

export interface FigmaMcpVariablesServiceArgs {
  figmaUrl?: string;
}

export type FigmaMcpVariablesServiceResult = FigmaVariablesResponse;

/**
 * Fetch Figma local variables using the shared MCP client.
 *
 * This reuses the long-lived figma-console-mcp process that the bridge
 * plugin is already connected to, avoiding the subprocess port-
 * mismatch problem where sync subprocesses spawn their own fresh instances
 * that the bridge plugin has never seen.
 */
export async function fetchFigmaMcpVariablesService(
  args: FigmaMcpVariablesServiceArgs = {},
): Promise<FigmaMcpVariablesServiceResult> {
  return await fetchVariablesFromSharedMcpClient({
    fileUrl: args.figmaUrl,
    timeoutMs: MCP_STATUS_TIMEOUT_MS,
    connectWaitMs: MCP_CONNECT_WAIT_MS,
  });
}

/**
 * List available MCP tools from the shared client.
 */
export async function listMcpToolsService(
  args: { timeoutMs?: number } = {},
): Promise<McpListToolsResult | McpListToolsError> {
  const timeoutMsRaw = Number(args.timeoutMs);
  const timeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.floor(timeoutMsRaw)
      : MCP_STATUS_TIMEOUT_MS;

  return await listMcpTools({ timeoutMs });
}

export type FetchDesignSystemKitServiceResult = DesignSystemKitResult | DesignSystemKitError;

export async function fetchDesignSystemKitService(
  args: FetchDesignSystemKitOptions = {},
): Promise<FetchDesignSystemKitServiceResult> {
  const timeoutMsRaw = Number(args.timeoutMs);
  const connectWaitMsRaw = Number(args.connectWaitMs);
  const timeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.floor(timeoutMsRaw)
      : MCP_STATUS_TIMEOUT_MS;
  const connectWaitMs =
    Number.isFinite(connectWaitMsRaw) && connectWaitMsRaw >= 0
      ? Math.floor(connectWaitMsRaw)
      : MCP_CONNECT_WAIT_MS;

  return await fetchDesignSystemKitFromSharedMcpClient({
    fileUrl: args.fileUrl,
    format: args.format ?? 'summary',
    include: args.include ?? ['tokens', 'styles'],
    timeoutMs,
    connectWaitMs,
  });
}
