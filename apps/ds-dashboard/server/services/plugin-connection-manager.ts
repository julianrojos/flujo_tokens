/**
 * Plugin Connection Manager
 *
 * Manages direct WebSocket connections from Figma plugins.
 * Replaces the legacy stdio-based MCP communication with direct WS.
 *
 * Phase 1: Direct WS server for plugin <-> dashboard communication.
 */

import { randomUUID } from 'node:crypto';
import type { ConsoleCaptureEventData, DocumentChangeEventData, SelectionChangeEventData, BridgeEvent } from '../../../figma-plugin/src/bridge/protocol.ts';

const WS_OPEN_STATE = 1;
const BRIDGE_EVENT_TYPES = new Set([
  'FILE_INFO',
  'VARIABLES_DATA',
  'DOCUMENT_CHANGE',
  'SELECTION_CHANGE',
  'PAGE_CHANGE',
  'CONSOLE_CAPTURE',
]);

function isBridgeEvent(event: string): event is BridgeEvent {
  return BRIDGE_EVENT_TYPES.has(event);
}

/**
 * Type guard to check if a value is a Record<string, unknown>
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Serialize an unknown value to a string, capping at maxLen chars.
 * Used to prevent huge args from bloating the console log buffer.
 */
function safeStringify(arg: unknown, maxLen: number): string {
  let s: string;
  if (typeof arg === 'string') {
    s = arg;
  } else {
    try {
      s = JSON.stringify(arg) ?? String(arg);
    } catch {
      s = String(arg);
    }
  }
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * Circular buffer with fixed size using ring buffer implementation.
 * All operations (push, toArray) are O(1) for push and O(n) for toArray.
 * When full, oldest items are discarded on push.
 */
export class CircularBuffer<T> {
    private buffer: T[];
    private maxSize: number;
    private head: number; // Write position
    private size: number; // Current number of elements

    constructor(maxSize: number) {
        this.maxSize = maxSize;
        this.buffer = new Array<T>(maxSize);
        this.head = 0;
        this.size = 0;
    }

    /**
     * Push an item to the buffer. O(1) operation.
     * If buffer is full, overwrites the oldest item.
     */
    push(item: T): void {
        this.buffer[this.head] = item;
        this.head = (this.head + 1) % this.maxSize;
        if (this.size < this.maxSize) {
            this.size++;
        }
    }

    /**
     * Return all items in insertion order. O(n) operation.
     */
    toArray(): readonly T[] {
        const result: T[] = [];
        // Start from oldest item (head - size, wrapping around)
        const start = (this.head - this.size + this.maxSize) % this.maxSize;
        for (let i = 0; i < this.size; i++) {
            result.push(this.buffer[(start + i) % this.maxSize]);
        }
        return result;
    }

    /**
     * Get current number of items in buffer.
     */
    get length(): number {
        return this.size;
    }
}

/**
 * Buffer entry for console logs
 */
export interface ConsoleLogBufferEntry extends ConsoleCaptureEventData {}

/**
 * Buffer entry for document changes
 */
export interface DocumentChangeBufferEntry extends DocumentChangeEventData {}

/**
 * Buffer entry for selection changes
 */
export interface SelectionBufferEntry extends SelectionChangeEventData {}

export interface ConsoleLogWithFileKey extends ConsoleLogBufferEntry {
    fileKey: string;
}

export interface DocumentChangeWithFileKey extends DocumentChangeBufferEntry {
    fileKey: string;
}

/**
 * Push event buffers per fileKey
 */
interface FileEventBuffer {
    consoleLogs: CircularBuffer<ConsoleLogBufferEntry>;
    documentChanges: CircularBuffer<DocumentChangeBufferEntry>;
    selection: SelectionBufferEntry | null;
}

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
    /** Callback when SESSION_INFO updates the resolved session metadata */
    onSessionInfoUpdate?: (sessionInfo: PluginSessionInfo, previousSessionInfo: PluginSessionInfo) => void;
    /** Callback when a plugin disconnects */
    onDisconnect?: (sessionInfo: PluginSessionInfo, reason: string) => void;
    /** Callback when a DOCUMENT_CHANGE push event is received from the plugin */
    onDocumentChange?: (fileKey: string) => void;
    /** TTL in ms for buffer cleanup after last socket disconnects (default: 60000ms = 1min) */
    bufferCleanupTtlMs?: number;
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
    private pushEventBuffers: Map<string, FileEventBuffer> = new Map();
    private bufferCleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private _activeFileKey: string | null = null;
    private defaultTimeoutMs: number;
    private maxPendingRequests: number;
    private bufferCleanupTtlMs: number;
    private onConnect?: (sessionInfo: PluginSessionInfo) => void;
    private onSessionInfoUpdate?: (sessionInfo: PluginSessionInfo, previousSessionInfo: PluginSessionInfo) => void;
    private onDisconnect?: (sessionInfo: PluginSessionInfo, reason: string) => void;
    private onDocumentChange?: (fileKey: string) => void;
    private socketCounter = 0;

    constructor(config: PluginConnectionManagerConfig = {}) {
        this.defaultTimeoutMs = config.defaultTimeoutMs ?? 60000; // 60s default
        this.maxPendingRequests = config.maxPendingRequests ?? 50;
        this.bufferCleanupTtlMs = config.bufferCleanupTtlMs ?? 60000; // 60s TTL default
        this.onConnect = config.onConnect;
        this.onSessionInfoUpdate = config.onSessionInfoUpdate;
        this.onDisconnect = config.onDisconnect;
        this.onDocumentChange = config.onDocumentChange;
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

        // Cancel any pending cleanup timer for this fileKey (reconnection within TTL)
        // Use toBufferKey to handle null fileKey -> '__unknown__' consistently
        const bufferKey = toBufferKey(sessionInfo.fileKey);
        const pendingTimer = this.bufferCleanupTimers.get(bufferKey);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            this.bufferCleanupTimers.delete(bufferKey);
            console.log(`[PluginConnectionManager] Cancelled pending cleanup timer for fileKey: ${bufferKey}`);
        }

        this.onConnect?.(sessionInfo);
        console.log(`[PluginConnectionManager] Registered plugin session: ${sessionInfo.docName} (fileKey: ${sessionInfo.fileKey})`);

        return socketId;
    }

    /**
     * Unregister a plugin WebSocket connection
     *
     * NOTE: Also cleans up push event buffers when the last socket for a fileKey disconnects
     * to prevent memory leaks in long-running sessions with multiple files.
     * Also invalidates _activeFileKey if the disconnected socket was the active one.
     * 
     * Buffer cleanup is delayed by TTL to allow for quick reconnections without data loss.
     */
    unregister(socketId: string, reason = 'unknown'): void {
        const connection = this.connections.get(socketId);

        if (connection) {
            const fileKey = connection.sessionInfo.fileKey;

            // Clean up pending requests for this socket
            this.cleanupPending(socketId);

            this.onDisconnect?.(connection.sessionInfo, reason);
            console.log(`[PluginConnectionManager] Unregistered plugin session: ${connection.sessionInfo.docName} (reason: ${reason})`);

            this.connections.delete(socketId);

            // Use consistent buffer key for cleanup (handles null fileKey -> '__unknown__')
            const bufferKey = toBufferKey(fileKey);

            // Schedule buffer cleanup with TTL when the last socket for this fileKey disconnects
            // This allows quick reconnections without losing buffered data
            // Use isAliveBufferKey to properly handle __unknown__ buffer key
            if (!this.isAliveBufferKey(bufferKey)) {
                // Cancel any existing timer for this fileKey
                const existingTimer = this.bufferCleanupTimers.get(bufferKey);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                }

                // Schedule cleanup after TTL (unref to prevent process hang)
                const timerId = setTimeout(() => {
                    // Double-check that no new connection was established during TTL
                    if (!this.isAliveBufferKey(bufferKey)) {
                        this.pushEventBuffers.delete(bufferKey);
                        this.bufferCleanupTimers.delete(bufferKey);
                        console.log(`[PluginConnectionManager] Cleaned up buffers for fileKey: ${bufferKey} (after TTL)`);

                        // Invalidate _activeFileKey if it pointed to this disconnected fileKey
                        if (this._activeFileKey === bufferKey) {
                            this._activeFileKey = this.getActiveFileKeys()[0] ?? null;
                            console.log(`[PluginConnectionManager] Updated _activeFileKey to: ${this._activeFileKey ?? 'null'}`);
                        }
                    }
                }, this.bufferCleanupTtlMs);

                // Allow process to exit even if timer is pending (prevents 60s hang in tests/tooling)
                timerId.unref?.();

                this.bufferCleanupTimers.set(bufferKey, timerId);
                console.log(`[PluginConnectionManager] Scheduled buffer cleanup for fileKey: ${bufferKey} in ${this.bufferCleanupTtlMs}ms`);
            }
        }
    }

    /**
     * Check if a fileKey has any active sessions.
     * 
     * NOTE: This checks raw fileKey values. For buffer key checks (including '__unknown__'),
     * use isAliveBufferKey() instead.
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
     * Check if a buffer key has any active sessions.
     * Normalizes fileKey to buffer key for consistent comparison (handles '__unknown__').
     */
    isAliveBufferKey(bufferKey: string): boolean {
        for (const connection of this.connections.values()) {
            if (toBufferKey(connection.sessionInfo.fileKey) === bufferKey) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get or create the push event buffer for a fileKey.
     * 
     * Also cancels any pending cleanup timer for this fileKey (access within TTL preserves buffer).
     */
    private getOrCreateBuffer(fileKey: string): FileEventBuffer {
        // Cancel pending cleanup timer if accessing buffer within TTL
        const pendingTimer = this.bufferCleanupTimers.get(fileKey);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            this.bufferCleanupTimers.delete(fileKey);
        }

        if (!this.pushEventBuffers.has(fileKey)) {
            this.pushEventBuffers.set(fileKey, {
                consoleLogs: new CircularBuffer<ConsoleLogBufferEntry>(1000),
                documentChanges: new CircularBuffer<DocumentChangeBufferEntry>(200),
                selection: null,
            });
        }
        return this.pushEventBuffers.get(fileKey)!;
    }

    /**
     * Get console logs from the buffer.
     * 
     * @param fileKey - If provided, returns logs for that specific file.
     *                  If null/undefined, returns ALL logs from ALL files (merged in buffer order).
     *                  NOTE: When merging multiple files, log order is not guaranteed across files.
     * @returns Array of console log entries
     */
    getConsoleLogs(fileKey?: string | null): ConsoleLogBufferEntry[] {
        if (!fileKey) {
            // Return all logs from all files (merged)
            const allLogs: ConsoleLogBufferEntry[] = [];
            for (const buffer of this.pushEventBuffers.values()) {
                allLogs.push(...buffer.consoleLogs.toArray());
            }
            return allLogs;
        }
        const buffer = this.pushEventBuffers.get(fileKey);
        return buffer ? [...buffer.consoleLogs.toArray()] : [];
    }

    /**
     * Get all console logs including fileKey metadata per entry.
     */
    getConsoleLogsWithFileKey(): ConsoleLogWithFileKey[] {
        const logs: ConsoleLogWithFileKey[] = [];
        for (const [fileKey, buffer] of this.pushEventBuffers.entries()) {
            for (const entry of buffer.consoleLogs.toArray()) {
                logs.push({
                    ...entry,
                    fileKey,
                });
            }
        }
        return logs;
    }

    /**
     * Get document changes from the buffer.
     * 
     * @param fileKey - If provided, returns changes for that specific file.
     *                  If null/undefined, returns ALL changes from ALL files (merged in buffer order).
     *                  NOTE: When merging multiple files, change order is not guaranteed across files.
     * @returns Array of document change entries
     */
    getDocumentChanges(fileKey?: string | null): DocumentChangeBufferEntry[] {
        if (!fileKey) {
            // Return all changes from all files (merged)
            const allChanges: DocumentChangeBufferEntry[] = [];
            for (const buffer of this.pushEventBuffers.values()) {
                allChanges.push(...buffer.documentChanges.toArray());
            }
            return allChanges;
        }
        const buffer = this.pushEventBuffers.get(fileKey);
        return buffer ? [...buffer.documentChanges.toArray()] : [];
    }

    /**
     * Get all document changes including fileKey metadata per entry.
     */
    getDocumentChangesWithFileKey(): DocumentChangeWithFileKey[] {
        const changes: DocumentChangeWithFileKey[] = [];
        for (const [fileKey, buffer] of this.pushEventBuffers.entries()) {
            for (const entry of buffer.documentChanges.toArray()) {
                changes.push({
                    ...entry,
                    fileKey,
                });
            }
        }
        return changes;
    }

    /**
     * Get current selection from the buffer
     */
    getSelection(fileKey?: string | null): SelectionBufferEntry | null {
        if (!fileKey) {
            // Return selection from active file
            const activeBuffer = this._activeFileKey ? this.pushEventBuffers.get(this._activeFileKey) : null;
            return activeBuffer?.selection ?? null;
        }
        const buffer = this.pushEventBuffers.get(fileKey);
        return buffer?.selection ?? null;
    }

    /**
     * Clear console logs for a fileKey (or all if not specified)
     */
    clearConsoleLogs(fileKey?: string | null): void {
        if (!fileKey) {
            for (const buffer of this.pushEventBuffers.values()) {
                buffer.consoleLogs = new CircularBuffer<ConsoleLogBufferEntry>(1000);
            }
        } else {
            const buffer = this.pushEventBuffers.get(fileKey);
            if (buffer) {
                buffer.consoleLogs = new CircularBuffer<ConsoleLogBufferEntry>(1000);
            }
        }
    }

    /**
     * Get the active file key (last file with selection/page change)
     */
    getActiveFileKey(): string | null {
        return this._activeFileKey;
    }

    /**
     * Get all active fileKeys from OPEN connections only.
     */
    getActiveFileKeys(): string[] {
        const fileKeys = new Set<string>();
        for (const connection of this.connections.values()) {
            // Only count OPEN connections to avoid zombie fileKeys
            if (connection.socket.readyState !== WS_OPEN_STATE) {
                continue;
            }
            if (connection.sessionInfo.fileKey) {
                fileKeys.add(connection.sessionInfo.fileKey);
            }
        }
        return Array.from(fileKeys);
    }

    /**
     * Get count of active connections
     * Only counts sockets with readyState === OPEN (1) to avoid zombie connections.
     */
    getConnectionCount(): number {
        let count = 0;
        for (const connection of this.connections.values()) {
            if (connection.socket.readyState === WS_OPEN_STATE) count++;
        }
        return count;
    }

    /**
     * Force-close all active plugin sockets to trigger client-side reconnect.
     * Returns number of sockets that were asked to reconnect.
     */
    forceReconnectAll(reason = 'server_reconnect'): number {
        const socketIds = Array.from(this.connections.keys());
        let reconnectedCount = 0;
        for (const socketId of socketIds) {
            const connection = this.connections.get(socketId);
            if (!connection) continue;
            try {
                connection.socket.close(1012, 'Server requested reconnect');
            } catch {
                // Best effort.
            }
            this.unregister(socketId, reason);
            reconnectedCount += 1;
        }
        return reconnectedCount;
    }

    /**
     * Resolve the most recently created socket for a given file key.
     * When fileKey is omitted, returns the most recent socket globally.
     * Only considers sockets with readyState === OPEN (1).
     * Uses _activeFileKey as a tiebreaker when fileKey is not explicitly provided.
     */
    getPreferredSocketId(fileKey?: string | null): string | null {
        // Explicit fileKey: use existing logic unchanged
        if (fileKey != null) {
            return this.getMostRecentOpenSocket(fileKey);
        }
        // No fileKey: prefer active file, then fall back to most recent global
        const targetKey = this._activeFileKey ?? undefined;
        return this.getMostRecentOpenSocket(targetKey) ?? this.getMostRecentOpenSocket(undefined);
    }

    /**
     * Get the most recent open socket for a given fileKey (or globally if undefined).
     * Normalizes fileKey to buffer key for consistent comparison (handles '__unknown__').
     */
    private getMostRecentOpenSocket(fileKey?: string): string | null {
        let preferred: { socketId: string; createdAt: number } | null = null;

        for (const [socketId, connection] of this.connections.entries()) {
            // Filter out closed sockets
            if (connection.socket.readyState !== WS_OPEN_STATE) {
                continue;
            }

            // Normalize both keys for comparison (handles '__unknown__' correctly)
            if (fileKey != null && toBufferKey(connection.sessionInfo.fileKey) !== fileKey) {
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
        timeoutMs?: number,
        signal?: AbortSignal,
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
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
                reject(new Error(`ws.request.timeout:${method}`));
            }, timeout);

            const onAbort = () => {
                clearTimeout(timeoutId);
                this.pendingRequests.delete(requestId);
                reject(new Error(`ws.request.aborted:${method}`));
            };

            if (signal?.aborted) {
                clearTimeout(timeoutId);
                reject(new Error(`ws.request.aborted:${method}`));
                return;
            }
            if (signal) {
                signal.addEventListener('abort', onAbort, { once: true });
            }

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
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
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
        timeoutMs?: number,
        signal?: AbortSignal,
    ): Promise<T> {
        const socketId = this.getPreferredSocketId(fileKey ?? null);
        if (!socketId) {
            throw new Error(`ws.request.no_socket_for_file:${method}`);
        }
        return this.request<T>(socketId, method, params, timeoutMs, signal);
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
            const previousSessionInfo = connection.sessionInfo;
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
            this.onSessionInfoUpdate?.(updatedInfo, previousSessionInfo);
            console.log(`[PluginConnectionManager] Updated session: ${updatedInfo.docName} (fileKey: ${updatedInfo.fileKey})`);
        } else if (isBridgeEvent(messageType)) {
            this.handlePushEvent(socketId, messageType, message);
        }
    }

    /**
     * Handle push events from the plugin (CONSOLE_CAPTURE, DOCUMENT_CHANGE, etc.)
     * 
     * NOTE: The WS runtime sends events as { type: string, data: unknown }.
     * We normalize the payload to handle both formats for backwards compatibility.
     */
    private handlePushEvent(
        socketId: string,
        eventType: BridgeEvent,
        message: Record<string, unknown>
    ): void {
        const connection = this.connections.get(socketId);
        if (!connection) return;

        // Normalize payload: WS runtime sends { type, data }, extract data if present
        const payload = isRecord(message.data) ? message.data : message;

        // Use consistent buffer key (handles null fileKey -> '__unknown__')
        const bufferKey = toBufferKey(connection.sessionInfo.fileKey);
        const buf = this.getOrCreateBuffer(bufferKey);

        switch (eventType) {
            case 'FILE_INFO':
            case 'VARIABLES_DATA':
                // These events are handled elsewhere (not buffered here).
                // FILE_INFO: Used for session tracking via SESSION_INFO
                // VARIABLES_DATA: Handled via GET_VARIABLES_DATA request/response
                // No buffering needed - silent no-op to avoid log noise
                break;

            case 'CONSOLE_CAPTURE': {
                const consolePayload = payload as {
                    level?: string;
                    message?: string;
                    args?: unknown[];
                    timestamp?: number;
                };
                // Truncate message to 1000 chars
                const msg = consolePayload.message ?? '';
                const truncatedMsg = msg.length > 1000 ? msg.slice(0, 1000) : msg;
                // Limit args to 10 entries, truncate each item to 500 chars
                const rawArgs = Array.isArray(consolePayload.args) ? consolePayload.args.slice(0, 10) : [];
                const args = rawArgs.map((arg) => safeStringify(arg, 500));
                buf.consoleLogs.push({
                    level: (consolePayload.level as ConsoleLogBufferEntry['level']) ?? 'log',
                    message: truncatedMsg,
                    args,
                    timestamp: consolePayload.timestamp ?? Date.now(),
                });
                break;
            }
            case 'DOCUMENT_CHANGE': {
                buf.documentChanges.push(payload as unknown as DocumentChangeBufferEntry);
                // Trigger cache invalidation callback if configured
                if (connection.sessionInfo.fileKey && this.onDocumentChange) {
                    try {
                        this.onDocumentChange(connection.sessionInfo.fileKey);
                    } catch {
                        // No-op - never throw from callback
                    }
                }
                break;
            }
            case 'SELECTION_CHANGE': {
                buf.selection = payload as unknown as SelectionBufferEntry;
                this._activeFileKey = bufferKey;
                break;
            }
            case 'PAGE_CHANGE': {
                this._activeFileKey = bufferKey;
                break;
            }
            default:
                // Unknown event type, log and continue
                console.warn(`[PluginConnectionManager] Unknown push event type: ${eventType}`);
                break;
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

    /**
     * Clear all pending cleanup timers.
     * Used for testing to prevent process hang.
     */
    clearAllCleanupTimers(): void {
        for (const timer of this.bufferCleanupTimers.values()) {
            clearTimeout(timer);
        }
        this.bufferCleanupTimers.clear();
    }
}

// Singleton instance
let _pluginConnectionManager: PluginConnectionManager | null = null;

/**
 * Normalize fileKey to buffer key for consistent storage/cleanup.
 * Uses '__unknown__' for null/undefined fileKeys.
 */
function toBufferKey(fileKey: string | null | undefined): string {
    return fileKey ?? '__unknown__';
}

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
 * Reset the singleton (for testing).
 * Also clears all pending cleanup timers to prevent process hang.
 */
export function resetPluginConnectionManager(): void {
    if (_pluginConnectionManager) {
        // Clear all pending cleanup timers to prevent process hang
        _pluginConnectionManager.clearAllCleanupTimers();
    }
    _pluginConnectionManager = null;
}
