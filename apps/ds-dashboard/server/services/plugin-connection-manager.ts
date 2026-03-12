/**
 * Plugin Connection Manager
 *
 * Manages direct WebSocket connections from Figma plugins.
 * Replaces the legacy stdio-based MCP communication with direct WS.
 *
 * Phase 1: Direct WS server for plugin <-> dashboard communication.
 */

import { randomUUID } from 'node:crypto';

const WS_OPEN_STATE = 1;

/**
 * Session information from plugin handshake
 */
export interface PluginSessionInfo {
    fileKey: string | null;
    docName: string;
    pluginVersion: string;
    pluginBuild: string;
    timestamp: number;
}

/**
 * Abstract WebSocket interface for compatibility
 */
export interface PluginWebSocket {
    readonly readyState: number;
    readonly protocol?: string;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    onopen: ((event: { type: string }) => void) | null;
    onclose: ((event: { type: string; code: number; reason: string }) => void) | null;
    onerror: ((event: { type: string; message: string }) => void) | null;
    onmessage: ((event: { type: string; data: string }) => void) | null;
}

/**
 * Pending request tracked by requestId
 */
interface PendingRequest {
    socketId: string;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
    method: string;
}

/**
 * Active plugin WebSocket connection
 */
interface ActiveConnection {
    socket: PluginWebSocket;
    sessionInfo: PluginSessionInfo;
    createdAt: number;
}

/**
 * Configuration for PluginConnectionManager
 */
export interface PluginConnectionManagerConfig {
    /** Default timeout for requests in ms */
    defaultTimeoutMs?: number;
    /** Maximum concurrent requests per connection */
    maxPendingRequests?: number;
    /** Callback when a plugin connects */
    onConnect?: (sessionInfo: PluginSessionInfo) => void;
    /** Callback when a plugin disconnects */
    onDisconnect?: (sessionInfo: PluginSessionInfo, reason: string) => void;
}

/**
 * Manages plugin WebSocket connections for direct communication.
 *
 * This service replaces the legacy stdio-based MCP communication with
 * direct WebSocket connections from the Figma plugin.
 */
export class PluginConnectionManager {
    private connections: Map<string, ActiveConnection> = new Map();
    private pendingRequests: Map<string, PendingRequest> = new Map();
    private defaultTimeoutMs: number;
    private maxPendingRequests: number;
    private onConnect?: (sessionInfo: PluginSessionInfo) => void;
    private onDisconnect?: (sessionInfo: PluginSessionInfo, reason: string) => void;
    private socketCounter = 0;

    constructor(config: PluginConnectionManagerConfig = {}) {
        this.defaultTimeoutMs = config.defaultTimeoutMs ?? 60000; // 60s default
        this.maxPendingRequests = config.maxPendingRequests ?? 50;
        this.onConnect = config.onConnect;
        this.onDisconnect = config.onDisconnect;
    }

    /**
     * Register a new plugin WebSocket connection
     */
    register(socket: PluginWebSocket, sessionInfo: PluginSessionInfo): string {
        const socketId = `socket_${++this.socketCounter}`;
        this.connections.set(socketId, {
            socket,
            sessionInfo,
            createdAt: Date.now(),
        });

        this.onConnect?.(sessionInfo);
        console.log(`[PluginConnectionManager] Registered plugin session: ${sessionInfo.docName} (fileKey: ${sessionInfo.fileKey})`);

        return socketId;
    }

    /**
     * Unregister a plugin WebSocket connection
     */
    unregister(socketId: string, reason = 'unknown'): void {
        const connection = this.connections.get(socketId);

        if (connection) {
            // Clean up pending requests for this socket
            this.cleanupPending(socketId);

            this.onDisconnect?.(connection.sessionInfo, reason);
            console.log(`[PluginConnectionManager] Unregistered plugin session: ${connection.sessionInfo.docName} (reason: ${reason})`);

            this.connections.delete(socketId);
        }
    }

    /**
     * Check if a fileKey has any active sessions
     */
    isAlive(fileKey: string | null): boolean {
        if (!fileKey) return false;

        for (const connection of this.connections.values()) {
            if (connection.sessionInfo.fileKey === fileKey) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get all active fileKeys
     */
    getActiveFileKeys(): string[] {
        const fileKeys = new Set<string>();
        for (const connection of this.connections.values()) {
            if (connection.sessionInfo.fileKey) {
                fileKeys.add(connection.sessionInfo.fileKey);
            }
        }
        return Array.from(fileKeys);
    }

    /**
     * Get count of active connections
     */
    getConnectionCount(): number {
        return this.connections.size;
    }

    /**
     * Resolve the most recently created socket for a given file key.
     * When fileKey is omitted, returns the most recent socket globally.
     * Only considers sockets with readyState === OPEN (1).
     */
    getPreferredSocketId(fileKey?: string | null): string | null {
        let preferred: { socketId: string; createdAt: number } | null = null;

        for (const [socketId, connection] of this.connections.entries()) {
            // Filter out closed sockets
            if (connection.socket.readyState !== WS_OPEN_STATE) {
                continue;
            }

            if (fileKey != null && connection.sessionInfo.fileKey !== fileKey) {
                continue;
            }
            if (!preferred || connection.createdAt > preferred.createdAt) {
                preferred = { socketId, createdAt: connection.createdAt };
            }
        }

        return preferred?.socketId ?? null;
    }

    /**
     * Send a request to a specific plugin and wait for response.
     * Uses requestId for correlation.
     */
    async request<T = unknown>(
        socketId: string,
        method: string,
        params: Record<string, unknown> = {},
        timeoutMs?: number
    ): Promise<T> {
        const connection = this.connections.get(socketId);

        if (!connection) {
            throw new Error(`ws.request.no_connection:${method}`);
        }
        if (connection.socket.readyState !== WS_OPEN_STATE) {
            throw new Error(`ws.request.socket_not_open:${method}`);
        }

        // Check pending request limit
        if (this.pendingRequests.size >= this.maxPendingRequests) {
            throw new Error(`ws.request.too_many_pending:${method}`);
        }

        const requestId = randomUUID();
        const timeout = timeoutMs ?? this.defaultTimeoutMs;

        return new Promise((resolve, reject) => {
            // Set up timeout
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`ws.request.timeout:${method}`));
            }, timeout);

            // Track pending request with socketId
            this.pendingRequests.set(requestId, {
                socketId,
                resolve: resolve as (value: unknown) => void,
                reject,
                timeoutId,
                method,
            });

            // Send request
            const message = {
                id: requestId,
                method,
                params,
            };

            try {
                connection.socket.send(JSON.stringify(message));
            } catch (err) {
                clearTimeout(timeoutId);
                this.pendingRequests.delete(requestId);
                reject(new Error(`ws.request.send_failed:${method}`));
            }
        });
    }

    /**
     * Send a request to the preferred socket for a given file key.
     */
    async requestForFileKey<T = unknown>(
        fileKey: string | null | undefined,
        method: string,
        params: Record<string, unknown> = {},
        timeoutMs?: number
    ): Promise<T> {
        const socketId = this.getPreferredSocketId(fileKey ?? null);
        if (!socketId) {
            throw new Error(`ws.request.no_socket_for_file:${method}`);
        }
        return this.request<T>(socketId, method, params, timeoutMs);
    }

    /**
     * Handle incoming message from plugin
     */
    handleMessage(socketId: string, data: string): void {
        const connection = this.connections.get(socketId);
        if (!connection) return;

        let message: Record<string, unknown>;
        try {
            message = JSON.parse(data);
        } catch {
            console.error('[PluginConnectionManager] Failed to parse message:', data);
            return;
        }

        const messageType = message.type as string;

        if (messageType === 'RESPONSE') {
            this.handleResponse(message);
        } else if (typeof message.id === 'string' && ('result' in message || 'error' in message)) {
            this.handleResponse(message);
        } else if (messageType === 'PING') {
            // Respond to ping for keep-alive
            connection.socket.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        } else if (messageType === 'SESSION_INFO') {
            const raw = (message.sessionInfo as Record<string, unknown> | undefined) ?? message;
            const updatedInfo: PluginSessionInfo = {
                fileKey:
                    typeof raw.fileKey === 'string'
                        ? raw.fileKey
                        : (raw.fileKey === null ? null : connection.sessionInfo.fileKey),
                docName: typeof raw.docName === 'string' ? raw.docName : connection.sessionInfo.docName,
                pluginVersion: typeof raw.pluginVersion === 'string' ? raw.pluginVersion : connection.sessionInfo.pluginVersion,
                pluginBuild: typeof raw.pluginBuild === 'string' ? raw.pluginBuild : connection.sessionInfo.pluginBuild,
                timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
            };
            this.connections.set(socketId, {
                ...connection,
                sessionInfo: updatedInfo,
            });
            console.log(`[PluginConnectionManager] Updated session: ${updatedInfo.docName} (fileKey: ${updatedInfo.fileKey})`);
        }
    }

    /**
     * Handle response from plugin
     */
    private handleResponse(message: Record<string, unknown>): void {
        const requestId = (typeof message.requestId === 'string'
            ? message.requestId
            : message.id) as string;
        const pending = this.pendingRequests.get(requestId);

        if (!pending) {
            console.warn(`[PluginConnectionManager] Received response for unknown requestId: ${requestId}`);
            return;
        }

        // Clear timeout
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(requestId);

        const error = message.error;
        if (error) {
            const errorCode =
                typeof error === 'object' && error !== null && 'code' in error
                    ? String((error as Record<string, unknown>).code ?? 'UNKNOWN')
                    : String((message.errorCode as string) ?? 'UNKNOWN');
            const errorMessage =
                typeof error === 'object' && error !== null && 'message' in error
                    ? String((error as Record<string, unknown>).message ?? 'Unknown error')
                    : String(error);
            pending.reject(new Error(`ws.response.error:${errorCode}:${errorMessage}`));
        } else {
            pending.resolve(message.result);
        }
    }

    /**
     * Clean up pending requests on disconnect - only affect requests for this socket
     */
    private cleanupPending(socketId: string): void {
        // Only reject pending requests for the specified socket
        for (const [requestId, pending] of this.pendingRequests.entries()) {
            if (pending.socketId !== socketId) continue;
            clearTimeout(pending.timeoutId);
            pending.reject(new Error(`ws.connection.closed:${pending.method}`));
            this.pendingRequests.delete(requestId);
        }
    }

    /**
     * Get connection info for debugging
     */
    getDebugInfo(): {
        connectionCount: number;
        pendingRequestCount: number;
        activeFileKeys: string[];
        connections: Array<{
            docName: string;
            fileKey: string | null;
            pluginVersion: string;
            uptimeMs: number;
        }>;
    } {
        const connections: Array<{
            docName: string;
            fileKey: string | null;
            pluginVersion: string;
            uptimeMs: number;
        }> = [];

        for (const conn of this.connections.values()) {
            connections.push({
                docName: conn.sessionInfo.docName,
                fileKey: conn.sessionInfo.fileKey,
                pluginVersion: conn.sessionInfo.pluginVersion,
                uptimeMs: Date.now() - conn.createdAt,
            });
        }

        return {
            connectionCount: this.connections.size,
            pendingRequestCount: this.pendingRequests.size,
            activeFileKeys: this.getActiveFileKeys(),
            connections,
        };
    }
}

// Singleton instance
let _pluginConnectionManager: PluginConnectionManager | null = null;

/**
 * Get or create the singleton PluginConnectionManager
 */
export function getPluginConnectionManager(config?: PluginConnectionManagerConfig): PluginConnectionManager {
    if (!_pluginConnectionManager) {
        _pluginConnectionManager = new PluginConnectionManager(config);
    }
    return _pluginConnectionManager;
}

/**
 * Reset the singleton (for testing)
 */
export function resetPluginConnectionManager(): void {
    _pluginConnectionManager = null;
}
