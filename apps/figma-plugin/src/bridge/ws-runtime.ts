/**
 * WebSocket Runtime for Figma Plugin UI
 *
 * Manages WebSocket connections to figma-console-mcp server with:
 * - Port scanning and multi-connection support
 * - Request/response correlation with timeouts
 * - Robust reconnection with backoff
 * - Defensive message parsing
 * - Clean cancellation and resource management
 *
 * Data flow: code.ts <-> postMessage <-> ws-runtime.ts <-> WebSocket <-> Server
 */

import {
  WSRequest,
  WSResponse,
  isWSRequest,
  BridgeEvent,
  BridgeError,
  BRIDGE_EVENTS,
  createBridgeError,
  ERROR_CODES,
  WSRuntimeConfig,
  DEFAULT_WS_CONFIG,
  BridgeConnectionState,
  BridgeStatus,
  isWSResponseSuccess,
  isWSResponseError,
  FileInfoEventData,
  BridgePluginRequestMessage,
  isBridgePluginResponseMessage,
  BridgeMethod,
} from './protocol';

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: BridgeError) => void;
  method: string;
  timeoutId: ReturnType<typeof setTimeout>;
  createdAt: number;
}

interface ClientConnection {
  ws: WebSocket;
  port: number;
  host: string;
  lastActivity: number;
}

type MessageHandler = (data: unknown) => void;
type StatusHandler = (status: BridgeStatus) => void;

interface PendingCodeRequest {
  resolve: (result: unknown) => void;
  reject: (error: BridgeError) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface MessageTargetLike {
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
}

interface ParentPostMessageLike {
  postMessage: (message: unknown, targetOrigin: string) => void;
}

const WS_HOST_CANDIDATES = ['localhost'] as const;

export class WebSocketRuntime {
  private config: WSRuntimeConfig;
  private connections: Map<number, ClientConnection> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestIdCounter = 0;
  private reconnectDelay: number;
  private reconnectAttempts: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isScanning: boolean = false;
  private isStopping = false;
  private status: BridgeStatus = {
    state: 'disconnected',
    configuredPort: DEFAULT_WS_CONFIG.portRangeStart,
    connectedPort: null,
  };
  private messageHandlers: Map<BridgeEvent, Set<MessageHandler>> = new Map();
  private statusHandlers: Set<StatusHandler> = new Set();
  private handshakeComplete: boolean = false;
  private fileKey: string | null = null;
  private pendingCodeRequests: Map<string, PendingCodeRequest> = new Map();
  private pluginMessageListener: ((event: MessageEvent) => void) | null = null;
  private pluginMessageTarget: MessageTargetLike | null = null;

  constructor(config?: Partial<WSRuntimeConfig>) {
    this.config = { ...DEFAULT_WS_CONFIG, ...config };
    this.reconnectDelay = this.config.reconnectDelay;
    this.reconnectAttempts = 0;
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Start scanning for available servers and connect to all of them.
   * Multi-connection support allows multiple MCP server instances.
   */
  async start(): Promise<void> {
    this.isStopping = false;
    if (this.isScanning) {
      console.log('[WS Runtime] Scan already in progress');
      return;
    }

    this.ensurePluginMessageListener();
    console.log(
      `[WS Runtime] Scanning ports ${this.config.portRangeStart}-${this.config.portRangeEnd} for MCP servers...`
    );
    this.updateStatus('connecting', this.config.portRangeStart, null);
    await this.scanAndConnect();
  }

  /**
   * Stop all connections and clean up resources.
   */
  stop(): void {
    console.log('[WS Runtime] Stopping all connections');
    this.isStopping = true;

    // Clear all pending WS requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(createBridgeError(ERROR_CODES.NOT_CONNECTED, 'Runtime stopped'));
    }
    this.pendingRequests.clear();

    // Clear all pending code requests
    for (const [, pending] of this.pendingCodeRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(createBridgeError(ERROR_CODES.NOT_CONNECTED, 'Runtime stopped'));
    }
    this.pendingCodeRequests.clear();

    // Remove message listener
    if (this.pluginMessageListener && this.pluginMessageTarget) {
      this.pluginMessageTarget.removeEventListener('message', this.pluginMessageListener);
      this.pluginMessageListener = null;
      this.pluginMessageTarget = null;
    }

    // Close all connections
    for (const [, conn] of this.connections) {
      conn.ws.close(1000, 'Runtime stopped');
    }
    this.connections.clear();

    this.updateStatus('disconnected', this.status.configuredPort, null);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isScanning = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = this.config.reconnectDelay;
  }

  /**
   * Scan port range and connect to all active servers.
   */
  private async scanAndConnect(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;

    const portsToTry: number[] = [];
    for (let port = this.config.portRangeStart; port <= this.config.portRangeEnd; port++) {
      if (!this.isPortConnected(port)) {
        portsToTry.push(port);
      }
    }

    if (portsToTry.length === 0) {
      this.isScanning = false;
      return;
    }

    let foundAny = false;
    const pendingConnections: Promise<void>[] = [];

    for (const port of portsToTry) {
      pendingConnections.push(
        new Promise<void>((resolve) => {
          let hostIndex = 0;

          const tryNextHost = (): void => {
            if (hostIndex >= WS_HOST_CANDIDATES.length) {
              resolve();
              return;
            }

            const host = WS_HOST_CANDIDATES[hostIndex];
            hostIndex += 1;

            const testWs = new WebSocket(`ws://${host}:${port}`);
            let advanced = false;
            const timeout = setTimeout(() => {
              if (testWs.readyState !== WebSocket.OPEN) {
                testWs.close();
              }
            }, this.config.connectionTimeout);

            testWs.onopen = () => {
              clearTimeout(timeout);
              foundAny = true;
              this.addConnection(port, host, testWs);
              console.log(
                `[WS Runtime] Connected to ${host}:${port} (${this.connections.size} server(s) total)`
              );
              resolve();
            };

            testWs.onerror = () => {
              if (advanced) return;
              advanced = true;
              clearTimeout(timeout);
              tryNextHost();
            };

            testWs.onclose = () => {
              if (advanced) return;
              advanced = true;
              clearTimeout(timeout);
              tryNextHost();
            };
          };

          tryNextHost();
        })
      );
    }

    await Promise.all(pendingConnections);

    this.isScanning = false;

    if (foundAny) {
      this.reconnectDelay = this.config.reconnectDelay;
      this.reconnectAttempts = 0;
      console.log(`[WS Runtime] Found ${this.connections.size} server(s)`);
    } else {
      // No servers found - retry with backoff
      this.scheduleReconnect();
    }
  }

  /**
   * Add a new connection and attach handlers.
   */
  private addConnection(port: number, host: string, ws: WebSocket): void {
    const connection: ClientConnection = {
      ws,
      port,
      host,
      lastActivity: Date.now(),
    };

    this.connections.set(port, connection);
    this.attachHandlers(ws, port);

    const connectedPort = this.status.connectedPort ?? port;
    const nextState: BridgeConnectionState = this.handshakeComplete ? 'connected' : 'connecting';
    this.updateStatus(nextState, this.status.configuredPort, connectedPort);

    // Mirror original bridge behavior: initialize every new socket with FILE_INFO
    // and VARIABLES_DATA so the server can identify this file immediately.
    void this.bootstrapConnection(port);
  }

  /**
   * Remove a connection from the active list.
   */
  private removeConnection(port: number): void {
    const conn = this.connections.get(port);
    if (conn) {
      conn.ws.close();
      this.connections.delete(port);
      console.log(`[WS Runtime] Removed connection to ${conn.host}:${port}`);

      // Update status if this was the primary connection
      if (this.status.connectedPort === port) {
        const firstConn = this.connections.values().next().value;
        const nextState: BridgeConnectionState =
          this.connections.size > 0
            ? this.handshakeComplete
              ? 'connected'
              : 'connecting'
            : 'disconnected';
        this.updateStatus(
          nextState,
          this.status.configuredPort,
          firstConn ? firstConn.port : null
        );
      }
    }
  }

  /**
   * Bootstrap a freshly opened connection with FILE_INFO and VARIABLES_DATA.
   * This keeps server-side file registration in sync with connection churn.
   */
  private async bootstrapConnection(port: number): Promise<void> {
    const conn = this.connections.get(port);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const fileInfo = await this.requestFromCode('GET_FILE_INFO', {});
      const fileData = fileInfo as Partial<FileInfoEventData>;

      if (typeof fileData.fileKey === 'string' || fileData.fileKey === null) {
        this.fileKey = fileData.fileKey;
        this.handshakeComplete = true;
        this.sendEventToConnection(port, BRIDGE_EVENTS.FILE_INFO, fileInfo);
        this.updateStatus('connected', this.status.configuredPort, this.status.connectedPort ?? port);
      }
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : null;
      if (!this.isStopping && errorCode !== ERROR_CODES.NOT_CONNECTED) {
        console.warn(`[WS Runtime] Failed to bootstrap FILE_INFO for port ${port}:`, error);
      }
    }

    try {
      const variablesData = await this.requestFromCode('GET_VARIABLES_DATA', {});
      this.sendEventToConnection(port, BRIDGE_EVENTS.VARIABLES_DATA, variablesData);
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : null;
      if (!this.isStopping && errorCode !== ERROR_CODES.NOT_CONNECTED) {
        console.warn(`[WS Runtime] Failed to bootstrap VARIABLES_DATA for port ${port}:`, error);
      }
    }
  }

  /**
   * Attach message/error/close handlers to a WebSocket.
   */
  private attachHandlers(ws: WebSocket, port: number): void {
    ws.onmessage = (event) => {
      this.handleMessage(event.data, port);
    };

    ws.onerror = () => {
      console.warn(`[WS Runtime] WebSocket error on port ${port}`);
    };

    ws.onclose = (event) => {
      console.log(`[WS Runtime] WebSocket disconnected from port ${port} (code: ${event.code})`);
      this.removeConnection(port);

      // Check if replaced by new connection
      const wasReplaced =
        event.code === 1000 &&
        (event.reason === 'Replaced by new connection' ||
          event.reason === 'Replaced by same file reconnection');

      if (!this.isStopping && !wasReplaced && this.connections.size === 0) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * Schedule a reconnection attempt with backoff.
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.config.maxReconnectAttempts) {
      console.log(
        `[WS Runtime] Max reconnect attempts reached (${this.config.maxReconnectAttempts}). Stopping.`
      );
      this.updateStatus('disconnected', this.status.configuredPort, null, 'Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(this.reconnectDelay * 1.5, this.config.reconnectMaxDelay);
    console.log(
      `[WS Runtime] No server found, retrying in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.scanAndConnect();
    }, delay);

    this.reconnectDelay = delay;
  }

  /**
   * Check if a specific port is already connected.
   */
  private isPortConnected(port: number): boolean {
    const conn = this.connections.get(port);
    return conn !== undefined && conn.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Attach a single listener for plugin messages from code.ts.
   * Handles BRIDGE_RESPONSE correlation and event forwarding.
   */
  private ensurePluginMessageListener(): void {
    if (this.pluginMessageListener) return;
    const messageTarget = this.resolveMessageTarget();
    if (!messageTarget) {
      console.warn('[WS Runtime] No message target available; bridge listener not installed');
      return;
    }

    this.pluginMessageListener = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as Record<string, unknown> | undefined;
      if (!msg || typeof msg.type !== 'string') return;

      if (isBridgePluginResponseMessage(msg)) {
        const pending = this.pendingCodeRequests.get(msg.requestId);
        if (!pending) return;

        clearTimeout(pending.timeoutId);
        this.pendingCodeRequests.delete(msg.requestId);

        if (msg.success) {
          pending.resolve(msg.result);
          return;
        }

        pending.reject(
          msg.error ?? createBridgeError(ERROR_CODES.INTERNAL_ERROR, 'Missing bridge error payload')
        );
        return;
      }

      if (msg.type === BRIDGE_EVENTS.CONSOLE_CAPTURE) {
        const consoleData = msg.data ?? {
          level: msg.level,
          message: msg.message,
          args: msg.args,
          timestamp: msg.timestamp,
        };
        this.forwardFromCode(BRIDGE_EVENTS.CONSOLE_CAPTURE, consoleData);
        return;
      }

      if (msg.type === BRIDGE_EVENTS.FILE_INFO && msg.data !== undefined) {
        this.forwardFromCode(BRIDGE_EVENTS.FILE_INFO, msg.data);
        return;
      }

      if (msg.type === BRIDGE_EVENTS.VARIABLES_DATA && msg.data !== undefined) {
        this.forwardFromCode(BRIDGE_EVENTS.VARIABLES_DATA, msg.data);
        return;
      }

      if (msg.type === BRIDGE_EVENTS.DOCUMENT_CHANGE && msg.data !== undefined) {
        this.forwardFromCode(BRIDGE_EVENTS.DOCUMENT_CHANGE, msg.data);
        return;
      }

      if (msg.type === BRIDGE_EVENTS.SELECTION_CHANGE && msg.data !== undefined) {
        this.forwardFromCode(BRIDGE_EVENTS.SELECTION_CHANGE, msg.data);
        return;
      }

      if (msg.type === BRIDGE_EVENTS.PAGE_CHANGE && msg.data !== undefined) {
        this.forwardFromCode(BRIDGE_EVENTS.PAGE_CHANGE, msg.data);
      }
    };

    messageTarget.addEventListener('message', this.pluginMessageListener);
    this.pluginMessageTarget = messageTarget;
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  /**
   * Handle incoming WebSocket message.
   */
  private handleMessage(data: string, port: number): void {
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error(`[WS Runtime] Failed to parse message from port ${port}:`, error);
      return;
    }

    const msg = message as Record<string, unknown>;

    // Check if this is a server request and forward to code.ts.
    if (isWSRequest(msg)) {
      this.forwardServerRequestToCode(msg as WSRequest, port);
      return;
    }

    // Response to a command we sent
    if (typeof msg.id === 'string' && this.pendingRequests.has(msg.id)) {
      this.handleResponse(msg as unknown as WSResponse);
      return;
    }

    // Unsolicited event from server
    if (typeof msg.type === 'string') {
      this.handleEvent(msg.type as BridgeEvent, msg.data);
      return;
    }

    console.warn(`[WS Runtime] Unhandled message from port ${port}:`, msg);
  }

  /**
   * Forward a server request to code.ts via postMessage.
   * Tracks the originating port to route response back correctly.
   */
  private forwardServerRequestToCode(request: WSRequest, originatingPort: number): void {
    this.requestFromCode(request.method, request.params, request.id)
      .then((result) => {
        this.sendSuccessResponse(request.id, result, originatingPort);
      })
      .catch((error) => {
        const bridgeError =
          error && typeof error === 'object' && 'code' in error && 'message' in error
            ? (error as BridgeError)
            : createBridgeError(
                ERROR_CODES.INTERNAL_ERROR,
                error instanceof Error ? error.message : String(error)
              );
        this.sendErrorResponse(request.id, bridgeError, originatingPort);
      });
  }

  /**
   * Send success response back to server via specific port.
   */
  private sendSuccessResponse(id: string, result: unknown, originatingPort: number): void {
    const message = JSON.stringify({ id, result });
    const conn = this.connections.get(originatingPort);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      try {
        conn.ws.send(message);
      } catch (error) {
        console.error(`[WS Runtime] Failed to send response to port ${originatingPort}:`, error);
      }
    }
  }

  /**
   * Send error response back to server via specific port.
   */
  private sendErrorResponse(id: string, error: BridgeError, originatingPort: number): void {
    // Original bridge sends `error` as a plain string.
    const message = JSON.stringify({ id, error: error.message, errorCode: error.code });
    const conn = this.connections.get(originatingPort);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      try {
        conn.ws.send(message);
      } catch (error) {
        console.error(`[WS Runtime] Failed to send error response to port ${originatingPort}:`, error);
      }
    }
  }

  /**
   * Handle a response to a pending request.
   */
  private handleResponse(response: WSResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn(`[WS Runtime] Response without pending request: ${response.id}`);
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(response.id);

    if (isWSResponseError(response)) {
      pending.reject(response.error);
    } else if (isWSResponseSuccess(response)) {
      pending.resolve(response.result);
    } else {
      pending.reject(createBridgeError(ERROR_CODES.INVALID_REQUEST, 'Invalid response format'));
    }
  }

  /**
   * Handle an unsolicited event from the server.
   */
  private handleEvent(eventType: BridgeEvent, data: unknown): void {
    const handlers = this.messageHandlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  // ============================================================================
  // Request/Response
  // ============================================================================

  /**
   * Send a request and wait for response.
   */
  async sendRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestIdCounter}_${Date.now()}`;

      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(createBridgeError(ERROR_CODES.TIMEOUT, `Request ${method} timed out`));
        }
      }, this.config.requestTimeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        method,
        timeoutId,
        createdAt: Date.now(),
      });

      const request: WSRequest = { id, method: method as BridgeMethod, params };
      const message = JSON.stringify(request);

      // Send to all connected servers
      let sent = false;
      for (const [port, conn] of this.connections) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          try {
            conn.ws.send(message);
            conn.lastActivity = Date.now();
            sent = true;
          } catch (error) {
            console.error(`[WS Runtime] Failed to send to port ${port}:`, error);
          }
        }
      }

      if (!sent) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(createBridgeError(ERROR_CODES.NOT_CONNECTED, 'No WebSocket connection available'));
      }
    });
  }

  /**
   * Broadcast an event to all connected servers.
   */
  broadcastEvent(eventType: BridgeEvent, data: unknown): void {
    const message = JSON.stringify({ type: eventType, data });

    for (const [port, conn] of this.connections) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        try {
          conn.ws.send(message);
        } catch (error) {
          console.error(`[WS Runtime] Failed to broadcast to port ${port}:`, error);
        }
      }
    }
  }

  // ============================================================================
  // Event Subscription
  // ============================================================================

  /**
   * Subscribe to a specific event type.
   */
  on(eventType: BridgeEvent, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(eventType)) {
      this.messageHandlers.set(eventType, new Set());
    }
    this.messageHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Subscribe to bridge status changes.
   */
  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.getStatus());

    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  // ============================================================================
  // Handshake
  // ============================================================================

  /**
   * Initiate handshake by requesting file info.
   * Only marks connection as 'connected' if there is at least one active WebSocket.
   */
  async initiateHandshake(): Promise<boolean> {
    console.log('[WS Runtime] Initiating handshake...');

    try {
      // Verify at least one active WebSocket connection before proceeding
      if (this.connections.size === 0) {
        console.warn('[WS Runtime] Cannot initiate handshake: no active WebSocket connections');
        this.updateStatus(
          'disconnected',
          this.status.configuredPort,
          null,
          'No WebSocket connections available'
        );
        return false;
      }

      // Request file info from code.ts using requestFromCode
      const fileInfo = await this.requestFromCode('GET_FILE_INFO', {});

      const fileData = fileInfo as FileInfoEventData;

      // Validate fileKey (string or null is valid)
      if (fileData && (typeof fileData.fileKey === 'string' || fileData.fileKey === null)) {
        this.fileKey = fileData.fileKey;
        this.handshakeComplete = true;

        // Broadcast FILE_INFO event to all servers
        this.broadcastEvent('FILE_INFO' as BridgeEvent, fileInfo);

        // Keep behavior aligned with original bridge startup: push variable data eagerly.
        try {
          const variablesData = await this.requestFromCode('GET_VARIABLES_DATA', {});
          this.broadcastEvent(BRIDGE_EVENTS.VARIABLES_DATA, variablesData);
        } catch (error) {
          console.warn('[WS Runtime] Could not fetch variables during handshake:', error);
        }

        // Only mark as connected if we still have active connections
        const hasActiveConnection = Array.from(this.connections.values()).some(
          (conn) => conn.ws.readyState === WebSocket.OPEN
        );

        if (hasActiveConnection) {
          this.updateStatus('connected', this.status.configuredPort, this.status.connectedPort);
        } else {
          this.updateStatus(
            'disconnected',
            this.status.configuredPort,
            null,
            'Lost WebSocket connection during handshake'
          );
        }

        console.log(`[WS Runtime] Handshake complete for file: ${fileData.fileName}`);
        return hasActiveConnection;
      }

      console.warn('[WS Runtime] Invalid file info received');
      this.updateStatus(
        'mismatch',
        this.status.configuredPort,
        this.status.connectedPort,
        'Invalid file info'
      );
      return false;
    } catch (error) {
      console.error('[WS Runtime] Handshake failed:', error);
      this.updateStatus(
        'mismatch',
        this.status.configuredPort,
        this.status.connectedPort,
        error instanceof Error ? error.message : 'Handshake failed'
      );
      return false;
    }
  }

  /**
   * Check if handshake is complete.
   */
  isHandshakeComplete(): boolean {
    return this.handshakeComplete;
  }

  /**
   * Get the current file key.
   */
  getFileKey(): string | null {
    return this.fileKey;
  }

  // ============================================================================
  // Communication with code.ts
  // ============================================================================

  /**
   * Request data from code.ts via postMessage.
   * Uses BRIDGE_REQUEST/BRIDGE_RESPONSE protocol.
   */
  requestFromCode(
    method: string,
    params: Record<string, unknown> = {},
    requestIdOverride?: string
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.ensurePluginMessageListener();
      const parentTarget = this.resolveParentPostMessageTarget();
      if (!parentTarget) {
        reject(createBridgeError(ERROR_CODES.NOT_CONNECTED, 'No parent postMessage target available'));
        return;
      }
      const requestId =
        requestIdOverride ?? `bridge_${method.toLowerCase()}_${++this.requestIdCounter}_${Date.now()}`;
      const timeoutMs = this.config.requestTimeout;

      const timeoutId = setTimeout(() => {
        this.pendingCodeRequests.delete(requestId);
        reject(createBridgeError(ERROR_CODES.TIMEOUT, `${method} request timed out`));
      }, timeoutMs);

      const pendingRequest: PendingCodeRequest = {
        resolve,
        reject,
        timeoutId,
      };

      this.pendingCodeRequests.set(requestId, pendingRequest);

      // Send BRIDGE_REQUEST to code.ts
      const pluginMessage: BridgePluginRequestMessage = {
        type: 'BRIDGE_REQUEST',
        requestId,
        method: method as BridgeMethod,
        params,
      };
      parentTarget.postMessage({ pluginMessage }, '*');
    });
  }

  // ============================================================================
  // Forward Events from code.ts to WebSocket
  // ============================================================================

  /**
   * Forward an event received from code.ts to all WebSocket servers.
   */
  forwardFromCode(eventType: BridgeEvent, data: unknown): void {
    if (this.connections.size === 0) {
      return;
    }
    this.broadcastEvent(eventType, data);
  }

  private sendEventToConnection(port: number, eventType: BridgeEvent, data: unknown): void {
    const conn = this.connections.get(port);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      conn.ws.send(JSON.stringify({ type: eventType, data }));
      conn.lastActivity = Date.now();
    } catch (error) {
      console.error(`[WS Runtime] Failed to send ${eventType} to port ${port}:`, error);
    }
  }

  // ============================================================================
  // Status Management
  // ============================================================================

  /**
   * Update the connection status.
   */
  private updateStatus(
    state: BridgeConnectionState,
    configuredPort: number,
    connectedPort: number | null,
    cause?: string
  ): void {
    this.status = {
      state,
      configuredPort,
      connectedPort,
      cause,
      lastActivity: Date.now(),
    };

    for (const handler of this.statusHandlers) {
      handler(this.getStatus());
    }
  }

  /**
   * Get the current connection status.
   */
  getStatus(): BridgeStatus {
    return { ...this.status };
  }

  /**
   * Check if at least one connection is active.
   */
  isConnected(): boolean {
    for (const conn of this.connections.values()) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the number of active connections.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  private resolveMessageTarget(): MessageTargetLike | null {
    const candidateWithWindow = globalThis as unknown as {
      window?: Partial<MessageTargetLike>;
    };
    const windowTarget = candidateWithWindow.window;
    if (
      windowTarget &&
      typeof windowTarget.addEventListener === 'function' &&
      typeof windowTarget.removeEventListener === 'function'
    ) {
      return windowTarget as MessageTargetLike;
    }

    const candidate = globalThis as unknown as Partial<MessageTargetLike>;
    if (
      typeof candidate.addEventListener === 'function' &&
      typeof candidate.removeEventListener === 'function'
    ) {
      return candidate as MessageTargetLike;
    }
    return null;
  }

  private resolveParentPostMessageTarget(): ParentPostMessageLike | null {
    const candidate = globalThis as unknown as {
      parent?: Partial<ParentPostMessageLike>;
      window?: { parent?: Partial<ParentPostMessageLike> };
    };

    const parentTarget = candidate.window?.parent ?? candidate.parent;
    if (parentTarget && typeof parentTarget.postMessage === 'function') {
      return parentTarget as ParentPostMessageLike;
    }

    return null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _wsRuntime: WebSocketRuntime | null = null;

export function getWSRuntime(config?: Partial<WSRuntimeConfig>): WebSocketRuntime {
  if (!_wsRuntime) {
    _wsRuntime = new WebSocketRuntime(config);
  }
  return _wsRuntime;
}

export function resetWSRuntime(): void {
  _wsRuntime = null;
}
