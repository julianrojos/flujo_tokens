/**
 * Figma Plugin WebSocket Server
 *
 * Standalone WebSocket server for direct plugin connections.
 * Runs alongside the main HTTP server.
 *
 * IMPORTANT: This handler destroys any WebSocket upgrade request that doesn't match
 * /ws/figma-plugin. This is safe because:
 * - Vite dev server runs on a separate port (5173) with no WebSocket upgrades
 * - The backend HTTP server (8787) only handles /ws/figma-plugin upgrades
 *
 * If you add additional WebSocket endpoints in the future, refactor to use a central
 * upgrade dispatcher in index.ts that only destroys sockets when NO handler accepts
 * the upgrade path.
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import {
    getPluginConnectionManager,
    type PluginSessionInfo,
    type PluginWebSocket,
} from './plugin-connection-manager.ts';
import { getSharedResponseCache } from './response-cache.ts';

/**
 * Extract session info from URL search params
 */
function extractSessionInfo(url: string): PluginSessionInfo {
    try {
        const urlObj = new URL(url, 'http://localhost');
        const fileKey = urlObj.searchParams.get('fileKey');
        const docName = urlObj.searchParams.get('docName') ?? 'Unknown Document';
        const pluginVersion = urlObj.searchParams.get('pluginVersion') ?? '0.0.0';
        const pluginBuild = urlObj.searchParams.get('pluginBuild') ?? 'unknown';
        const timestamp = urlObj.searchParams.get('timestamp')
            ? parseInt(urlObj.searchParams.get('timestamp')!, 10)
            : Date.now();

        return {
            fileKey,
            docName,
            pluginVersion,
            pluginBuild,
            timestamp,
        };
    } catch {
        return {
            fileKey: null,
            docName: 'Unknown Document',
            pluginVersion: '0.0.0',
            pluginBuild: 'unknown',
            timestamp: Date.now(),
        };
    }
}

/**
 * Convert native WebSocket to our interface
 */
function toPluginWebSocket(ws: WebSocket): PluginWebSocket {
    return {
        get readyState() {
            return ws.readyState;
        },
        get protocol() {
            return ws.protocol;
        },
        send(data: string) {
            ws.send(data);
        },
        close(code?: number, reason?: string) {
            ws.close(code, reason);
        },
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
    };
}

/**
 * Create and start the WebSocket server
 *
 * NOTE: This is currently the only WebSocket handler in the server.
 * Non-matching upgrade paths are destroyed to prevent orphaned connections.
 * If additional WS endpoints are added in the future, refactor to use a
 * central upgrade dispatcher in index.ts that only destroys sockets when
 * no handler accepts the upgrade.
 */
export function createFigmaPluginWsServer(httpServer: http.Server): WebSocketServer {
    const wss = new WebSocketServer({
        noServer: true,
        path: '/ws/figma-plugin',
    });

    const manager = getPluginConnectionManager({
        defaultTimeoutMs: 60000,
        maxPendingRequests: 50,
        onConnect: (sessionInfo) => {
            console.log(`[figma-plugin-ws] Plugin connected: ${sessionInfo.docName} (fileKey: ${sessionInfo.fileKey})`);
            // Invalidate cache on reconnect - data may have changed while disconnected
            if (sessionInfo.fileKey) {
                getSharedResponseCache().invalidateFile(sessionInfo.fileKey);
            }
        },
        onDisconnect: (sessionInfo, reason) => {
            console.log(`[figma-plugin-ws] Plugin disconnected: ${sessionInfo.docName} (reason: ${reason})`);
        },
        onDocumentChange: (fileKey) => {
            getSharedResponseCache().invalidateFile(fileKey);
            console.log(`[figma-plugin-ws] Cache invalidated for fileKey: ${fileKey}`);
        },
    });

    // Handle WebSocket upgrade requests
    // Since this is the only WS handler, destroy sockets for non-matching paths
    // to prevent orphaned/hanging connections.
    httpServer.on('upgrade', (request, socket, head) => {
        const url = request.url ?? '';

        // Normalize URL and verify exact path match
        // This prevents paths like /ws/figma-plugin-x from being accepted
        let normalizedPath: string;
        try {
            normalizedPath = new URL(url, 'http://localhost').pathname;
        } catch {
            // URL is malformed - destroy socket with controlled error
            console.warn(`[figma-plugin-ws] Rejected malformed WebSocket upgrade URL: ${url}`);
            socket.destroy();
            return;
        }

        if (normalizedPath !== '/ws/figma-plugin') {
            // Destroy socket for non-matching paths to prevent orphaned connections
            // This is safe because this is the only WS upgrade handler registered.
            console.warn(`[figma-plugin-ws] Rejected WebSocket upgrade for path: ${normalizedPath}`);
            socket.destroy();
            return;
        }

        // Extract session info
        const sessionInfo = extractSessionInfo(url);

        // Accept the WebSocket connection
        wss.handleUpgrade(request, socket, head, (ws) => {
            // Register the connection
            const socketId = manager.register(toPluginWebSocket(ws), sessionInfo);

            console.log(`[figma-plugin-ws] New connection: socketId=${socketId}, docName=${sessionInfo.docName}`);

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'SESSION_ACK',
                socketId,
                message: 'Connected to dashboard',
                timestamp: Date.now(),
            }));

            // Handle incoming messages
            ws.on('message', (data) => {
                try {
                    const dataStr = data.toString();
                    manager.handleMessage(socketId, dataStr);
                } catch (err) {
                    console.error(`[figma-plugin-ws] Error handling message:`, err);
                }
            });

            // Handle close
            ws.on('close', (code, reason) => {
                console.log(`[figma-plugin-ws] Connection closed: socketId=${socketId}, code=${code}, reason=${reason}`);
                manager.unregister(socketId, `ws_closed:${code}`);
            });

            // Handle errors
            ws.on('error', (err) => {
                console.error(`[figma-plugin-ws] WebSocket error: socketId=${socketId}`, err);
                manager.unregister(socketId, 'ws_error');
            });
        });
    });

    console.log('[figma-plugin-ws] WebSocket server created, path: /ws/figma-plugin');

    return wss;
}
