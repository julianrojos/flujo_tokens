/**
 * MCP Client Service for Figma Plugin
 *
 * Handles communication with dashboard API for MCP management.
 */

export interface McpCapabilities {
  ok: true;
  tools: string[];
  toolsDiscoveryError?: string;
  supports: {
    searchNodes: boolean;
    getChildren: boolean;
    searchStyles: boolean;
    searchVariables: boolean;
    portSwitch: boolean;
  };
  mcp: {
    connected: boolean;
    code: string;
    message: string;
    currentPort: number;
    portFallbackUsed: boolean;
    availablePorts: number[];
    activePort: number;
  };
}

export interface McpError {
  ok: false;
  code: string;
  message: string;
}

export interface PortState {
  activePort: number;
  allowedRange: { start: number; end: number };
  lastChangeAt: number;
  isSwitching: boolean;
}

export interface PortSwitchResult {
  ok: true;
  activePort: number;
  previousPort: number;
  message: string;
}

export interface ConnectionState {
  configuredPort: number;
  connectedPort: number | null;
  state: 'connected' | 'disconnected' | 'mismatch' | 'fallback';
  cause?: string;
}

export interface ReconcileConnectionResponse {
  ok: boolean;
  connected: boolean;
  code?: string;
  message?: string;
  everConnected?: boolean;
  attemptedReset?: boolean;
  restarting?: boolean;
  phase?:
    | 'already_connected'
    | 'connected_after_reset'
    | 'waiting_for_bridge'
    | 'not_recoverable'
    | 'input_error';
}

export interface HeartbeatResponse {
  ok: boolean;
  alive?: boolean;
  ageMs?: number | null;
  lastSeenAt?: number | null;
  sourceFileKey?: string | null;
  sourceDocName?: string | null;
  pluginVersion?: string | null;
  pluginBuild?: string | null;
}

const DEFAULT_API_BASE = 'http://localhost:8787';
const LOCAL_API_BASES = ['http://localhost:8787'] as const;
const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 60_000;

function isTimeoutLikeError(error: unknown): boolean {
  if (!error) return false;
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name || '').toLowerCase()
      : '';
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    name.includes('abort') ||
    name.includes('timeout') ||
    message.includes('signal timed out') ||
    message.includes('timed out') ||
    message.includes('aborterror') ||
    message.includes('timeouterror')
  );
}

export class McpClientService {
  private apiBase: string;
  private apiBaseCandidates: string[];
  private internalToken?: string;
  private capabilitiesCache: { data: McpCapabilities; expiresAt: number } | null = null;
  private lastKnownConfiguredPort = 9223;
  private readonly CACHE_TTL_MS = 60_000; // 60 seconds

  constructor(apiBase: string = DEFAULT_API_BASE, internalToken?: string) {
    this.apiBase = apiBase.replace(/\/$/, '');
    this.apiBaseCandidates = this.buildApiBaseCandidates(this.apiBase);
    this.internalToken = internalToken;
  }

  private buildApiBaseCandidates(apiBase: string): string[] {
    const normalized = apiBase.replace(/\/$/, '');
    if (LOCAL_API_BASES.includes(normalized as (typeof LOCAL_API_BASES)[number])) {
      return [normalized, ...LOCAL_API_BASES.filter((base) => base !== normalized)];
    }
    return [normalized];
  }

  private markApiBaseAsHealthy(apiBase: string): void {
    if (this.apiBaseCandidates[0] === apiBase) {
      this.apiBase = apiBase;
      return;
    }
    this.apiBase = apiBase;
    this.apiBaseCandidates = [
      apiBase,
      ...this.apiBaseCandidates.filter((candidate) => candidate !== apiBase),
    ];
  }

  private async fetchFromDashboard(path: string, init: RequestInit): Promise<Response> {
    let lastError: unknown = null;
    const normalizedInit: RequestInit = { ...init };
    const method = String(normalizedInit.method || 'GET').toUpperCase();
    const headers = new Headers(normalizedInit.headers || {});
    // Avoid unnecessary CORS preflights for simple GET/HEAD requests.
    if (method === 'GET' || method === 'HEAD') {
      headers.delete('Content-Type');
    }
    normalizedInit.headers = headers;

    for (const base of this.apiBaseCandidates) {
      try {
        const response = await fetch(`${base}${path}`, normalizedInit);
        this.markApiBaseAsHealthy(base);
        return response;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('Failed to reach dashboard API.');
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.internalToken) {
      headers['x-ds-dashboard-internal-token'] = this.internalToken;
    }
    return headers;
  }

  /**
   * Fetch MCP capabilities with caching.
   */
  async getCapabilities(options?: { forceRefresh?: boolean }): Promise<McpCapabilities | McpError> {
    const forceRefresh = options?.forceRefresh ?? false;
    
    // Check cache first (unless force refresh)
    if (!forceRefresh && this.capabilitiesCache && Date.now() < this.capabilitiesCache.expiresAt) {
      return this.capabilitiesCache.data;
    }

    try {
      const response = await this.fetchFromDashboard('/api/figma-mcp/capabilities', {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(DEFAULT_MCP_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        return {
          ok: false,
          code: 'capabilities.http_error',
          message: `Dashboard API responded with HTTP ${response.status} on /api/figma-mcp/capabilities`,
        };
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        return {
          ok: false,
          code: 'capabilities.invalid_response',
          message:
            'Dashboard API is reachable, but /api/figma-mcp/capabilities returned an invalid response.',
        };
      }

      if (!data || typeof data !== 'object') {
        return {
          ok: false,
          code: 'capabilities.invalid_response',
          message:
            'Dashboard API is reachable, but /api/figma-mcp/capabilities returned an unexpected payload.',
        };
      }
      const parsed = data as Partial<McpCapabilities & McpError>;
      
      // Cache successful capabilities response
      if (parsed.ok === true && parsed.mcp) {
        this.lastKnownConfiguredPort = Number(parsed.mcp.activePort) || this.lastKnownConfiguredPort;
        this.capabilitiesCache = {
          data: parsed as McpCapabilities,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        };
      }

      return parsed as McpCapabilities | McpError;
    } catch (error) {
      if (isTimeoutLikeError(error)) {
        return {
          ok: false,
          code: 'capabilities.timeout',
          message:
            'MCP status request timed out. Dashboard API may be reachable, but MCP is slow or reconnecting.',
        };
      }
      return {
        ok: false,
        code: 'capabilities.fetch_failed',
        message: error instanceof Error ? error.message : 'Failed to fetch capabilities',
      };
    }
  }

  /**
   * Invalidate capabilities cache (call after port switch).
   */
  invalidateCapabilitiesCache(): void {
    this.capabilitiesCache = null;
  }

  /**
   * Get current port state.
   */
  async getPortState(): Promise<PortState | McpError> {
    try {
      const response = await this.fetchFromDashboard('/api/figma-mcp/port', {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(DEFAULT_MCP_REQUEST_TIMEOUT_MS),
      });
      const payload = await response.json();
      if (payload?.ok === true && Number.isFinite(Number(payload.activePort))) {
        this.lastKnownConfiguredPort = Number(payload.activePort);
      }
      return payload;
    } catch (error) {
      return {
        ok: false,
        code: 'port.fetch_failed',
        message: error instanceof Error ? error.message : 'Failed to fetch port state',
      };
    }
  }

  /**
   * Switch MCP port.
   */
  async switchPort(port: number): Promise<PortSwitchResult | McpError> {
    try {
      const response = await this.fetchFromDashboard('/api/figma-mcp/port', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ port }),
        signal: AbortSignal.timeout(DEFAULT_MCP_REQUEST_TIMEOUT_MS),
      });
      const result = await response.json();
      
      // Invalidate cache on successful switch
      if (result.ok === true) {
        this.lastKnownConfiguredPort = Number(result.activePort) || this.lastKnownConfiguredPort;
        this.invalidateCapabilitiesCache();
      }
      
      return result;
    } catch (error) {
      return {
        ok: false,
        code: 'port.switch_failed',
        message: error instanceof Error ? error.message : 'Failed to switch port',
      };
    }
  }

  /**
   * Compute connection state from capabilities.
   */
  computeConnectionState(capabilities: McpCapabilities | McpError): ConnectionState {
    if (!capabilities.ok) {
      return {
        configuredPort: this.lastKnownConfiguredPort,
        connectedPort: null,
        state: 'disconnected',
        cause: capabilities.message,
      };
    }

    const configuredPort = capabilities.mcp.activePort;
    const connectedPort = capabilities.mcp.currentPort;
    const isConnected = capabilities.mcp.connected;

    if (!isConnected) {
      return {
        configuredPort,
        connectedPort: null,
        state: 'disconnected',
        cause: capabilities.mcp.message,
      };
    }

    if (configuredPort === connectedPort) {
      if (capabilities.mcp.portFallbackUsed) {
        return {
          configuredPort,
          connectedPort,
          state: 'fallback',
          cause: `Connected on fallback port ${connectedPort}`,
        };
      }
      return {
        configuredPort,
        connectedPort,
        state: 'connected',
      };
    }

    // Ports don't match - this is a mismatch state
    return {
      configuredPort,
      connectedPort,
      state: 'mismatch',
      cause: `Bridge connected to ${connectedPort}, dashboard configured for ${configuredPort}`,
    };
  }

  /**
   * Poll connection state until stable or timeout.
   */
  async pollUntilStable(
    targetPort: number,
    timeoutMs: number = 30_000,
    intervalMs: number = 2_000
  ): Promise<{ success: boolean; finalState: ConnectionState; elapsedMs: number }> {
    const startedAt = Date.now();
    
    while (Date.now() - startedAt < timeoutMs) {
      // Force refresh during polling to avoid stale cache
      const capabilities = await this.getCapabilities({ forceRefresh: true });
      const state = this.computeConnectionState(capabilities);
      
      // Success: connected (or fallback) and port matches
      if (
        (state.state === 'connected' || state.state === 'fallback') &&
        state.connectedPort === targetPort
      ) {
        return {
          success: true,
          finalState: state,
          elapsedMs: Date.now() - startedAt,
        };
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    // Timeout reached
    const finalCapabilities = await this.getCapabilities({ forceRefresh: true });
    const finalState = this.computeConnectionState(finalCapabilities);
    
    return {
      success: false,
      finalState,
      elapsedMs: Date.now() - startedAt,
    };
  }

  getLastKnownConfiguredPort(): number {
    return this.lastKnownConfiguredPort;
  }

  /**
   * Fetch a design system kit summary (tokens + styles counts).
   * Uses format=summary to get accurate variable counts — compact may return false zeros.
   */
  async getDesignSystemKit(): Promise<DesignSystemKitResponse | McpError> {
    try {
      const response = await this.fetchFromDashboard(
        '/api/figma-mcp/design-system-kit?format=summary&include=tokens,styles',
        {
          method: 'GET',
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(DEFAULT_MCP_REQUEST_TIMEOUT_MS),
        },
      );
      return await response.json() as DesignSystemKitResponse | McpError;
    } catch (error) {
      return {
        ok: false,
        code: 'kit.fetch_failed',
        message: error instanceof Error ? error.message : 'Failed to fetch design system kit',
      };
    }
  }

  /**
   * Compute a human-readable summary from a kit response.
   * Returns null when the kit response is not ok.
   */
  computeKitSummary(kit: DesignSystemKitResponse | McpError): KitSummary | null {
    if (!kit.ok) return null;

    const variableCount = Object.keys(kit.tokens?.variables ?? {}).length;
    const collectionCount = Object.keys(kit.tokens?.variableCollections ?? {}).length;

    const stylesByType: Record<string, number> = {};
    for (const style of kit.styles ?? []) {
      const key = style.styleType || 'OTHER';
      stylesByType[key] = (stylesByType[key] ?? 0) + 1;
    }

    return { variableCount, collectionCount, stylesByType, fetchedAt: new Date() };
  }

  /**
   * Trigger a full token sync via the dashboard's shared MCP client.
   *
   * Route: POST /api/figma-mcp-variables
   * Body:  { figmaUrl?: string }
   *
   * The dashboard reuses the shared MCP process that MCP Management
   * is already connected to, so no new child process is spawned.
   */
  async syncTokens(figmaUrl?: string): Promise<SyncTokensResponse> {
    try {
      const response = await this.fetchFromDashboard('/api/figma-mcp-variables', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ figmaUrl: figmaUrl ?? '' }),
        signal: AbortSignal.timeout(DEFAULT_MCP_REQUEST_TIMEOUT_MS),
      });
      return await response.json() as SyncTokensResponse;
    } catch (error) {
      return {
        ok: false,
        code: 'sync.fetch_failed',
        message: error instanceof Error ? error.message : 'Failed to sync tokens',
      };
    }
  }

  /**
   * Send plugin heartbeat so dashboard can show live plugin presence.
   */
  async sendHeartbeat(args?: {
    fileKey?: string | null;
    docName?: string | null;
    timestamp?: number;
    pluginVersion?: string | null;
    pluginBuild?: string | null;
  }): Promise<HeartbeatResponse> {
    try {
      const response = await this.fetchFromDashboard('/api/figma-mcp/heartbeat', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          fileKey: args?.fileKey ?? null,
          docName: args?.docName ?? null,
          pluginVersion: args?.pluginVersion ?? null,
          pluginBuild: args?.pluginBuild ?? null,
          timestamp: Number.isFinite(Number(args?.timestamp))
            ? Math.floor(Number(args?.timestamp))
            : Date.now(),
        }),
        signal: AbortSignal.timeout(12_000),
      });
      return await response.json() as HeartbeatResponse;
    } catch (error) {
      return {
        ok: false,
        alive: false,
        ageMs: null,
        lastSeenAt: null,
        sourceFileKey: null,
        sourceDocName: null,
        pluginVersion: null,
        pluginBuild: null,
      };
    }
  }

  /**
   * Attempt automatic MCP connection reconciliation on the dashboard side.
   * This performs a local shared-session restart and returns the resulting state.
   */
  async reconcileConnection(args?: {
    figmaUrl?: string;
    figmaToken?: string;
    confirmReconcile?: boolean;
    confirmGlobalReset?: boolean;
  }): Promise<ReconcileConnectionResponse> {
    const confirmReconcile = args?.confirmReconcile === true;
    const confirmGlobalReset = args?.confirmGlobalReset === true;
    try {
      const response = await this.fetchFromDashboard('/api/figma-mcp/reconcile', {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'x-ds-mcp-reconcile-confirm': confirmReconcile ? 'true' : 'false',
          'x-ds-mcp-reset-confirm': confirmGlobalReset ? 'true' : 'false',
        },
        body: JSON.stringify({
          figmaUrl: args?.figmaUrl ?? '',
          figmaToken: args?.figmaToken ?? '',
          confirmReconcile,
          confirmGlobalReset,
        }),
        signal: AbortSignal.timeout(DEFAULT_MCP_REQUEST_TIMEOUT_MS),
      });
      return await response.json() as ReconcileConnectionResponse;
    } catch (error) {
      return {
        ok: false,
        connected: false,
        code: 'reconcile.fetch_failed',
        message: error instanceof Error ? error.message : 'Failed to reconcile MCP connection',
      };
    }
  }
}

/** Shape returned by GET /api/figma-mcp/design-system-kit */
export interface DesignSystemKitResponse {
  ok: true;
  tokens?: {
    variables: Record<string, { id: string; name: string; resolvedType: string }>;
    variableCollections: Record<string, { id: string; name: string; modes: unknown[] }>;
  };
  styles?: Array<{ id: string; name: string; styleType: string }>;
  elapsedMs: number;
}

/** Computed summary from DesignSystemKitResponse */
export interface KitSummary {
  variableCount: number;
  collectionCount: number;
  stylesByType: Record<string, number>;
  fetchedAt: Date;
}

/** Shape returned by POST /api/figma-mcp-variables */
export interface SyncTokensResponse {
  ok: boolean;
  meta?: { variables: Record<string, unknown>; variableCollections: Record<string, unknown> };
  code?: string;
  message?: string;
}

// Singleton instance for plugin use
let _pluginMcpClient: McpClientService | null = null;

export function getPluginMcpClient(apiBase?: string, internalToken?: string): McpClientService {
  if (!_pluginMcpClient) {
    _pluginMcpClient = new McpClientService(apiBase, internalToken);
  }
  return _pluginMcpClient;
}

export function resetPluginMcpClient(): void {
  _pluginMcpClient = null;
}
