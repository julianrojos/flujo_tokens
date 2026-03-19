/**
 * Runtime Integration Tests
 *
 * Tests for WebSocket runtime integration scenarios:
 * - Server request forwarding to Main
 * - Handshake with correlated requestId
 * - Event forwarding from code.ts to WebSocket
 * - Cleanup on stop()
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WS_CONFIG } from '../protocol';
import { WebSocketRuntime } from '../ws-runtime';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  public readyState = MockWebSocket.CONNECTING;
  public onopen: (() => void) | null = null;
  public onclose: ((event: { code: number; reason: string }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public sentMessages: string[] = [];
  private listeners: Record<string, Array<(event: unknown) => void>> = {
    open: [],
    close: [],
    error: [],
    message: [],
  };

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open', {});
    }, 10);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const group = this.listeners[type];
    if (!group) return;
    this.listeners[type] = group.filter((item) => item !== listener);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    setTimeout(() => {
      this.emit('close', { code, reason });
    }, 0);
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }

    if (type === 'open') this.onopen?.();
    if (type === 'close') this.onclose?.(event as { code: number; reason: string });
    if (type === 'error') this.onerror?.();
    if (type === 'message') this.onmessage?.(event as { data: string });
  }
}

function setMockWebSocketCtor(ctor: typeof MockWebSocket): void {
  (
    globalThis as unknown as {
      WebSocket?: typeof WebSocket;
    }
  ).WebSocket = ctor as unknown as typeof WebSocket;
}

function clearMockWebSocketCtor(): void {
  delete (
    globalThis as unknown as {
      WebSocket?: typeof WebSocket;
    }
  ).WebSocket;
}

function getConnectedSocket(): MockWebSocket {
  const connected = MockWebSocket.instances.find((ws) => ws.readyState === MockWebSocket.OPEN);
  if (!connected) {
    throw new Error('No open WebSocket instance found');
  }
  return connected;
}

function dispatchPluginMessage(pluginMessage: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        pluginMessage,
      },
    })
  );
}

describe('Runtime Integration', () => {
  let runtime: WebSocketRuntime;
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    MockWebSocket.instances = [];

    runtime = new WebSocketRuntime({
      ...DEFAULT_WS_CONFIG,
      portRangeStart: 9223,
      portRangeEnd: 9223,
      connectionTimeout: 100,
      requestTimeout: 500,
      reconnectDelay: 50,
      reconnectMaxDelay: 200,
      maxReconnectAttempts: 2,
      handshakeTimeout: 500,
    });

    setMockWebSocketCtor(MockWebSocket);

    postMessageSpy = vi.spyOn(window.parent, 'postMessage').mockImplementation((message: unknown) => {
      const payload = message as {
        pluginMessage?: {
          type?: string;
          requestId?: string;
          method?: string;
        };
      };

      if (payload.pluginMessage?.type === 'BRIDGE_REQUEST' && payload.pluginMessage.requestId) {
        const requestId = payload.pluginMessage.requestId;
        const method = payload.pluginMessage.method;

        if (method === 'GET_FILE_INFO') {
          dispatchPluginMessage({
            type: 'BRIDGE_RESPONSE',
            requestId,
            success: true,
            result: {
              fileName: 'Test File',
              fileKey: 'test-key',
              currentPage: 'Page 1',
              currentPageId: 'page-1',
              selectionCount: 0,
            },
          });
          return;
        }

        if (method === 'GET_VARIABLES_DATA') {
          dispatchPluginMessage({
            type: 'BRIDGE_RESPONSE',
            requestId,
            success: true,
            result: {
              success: true,
              timestamp: Date.now(),
              fileKey: 'test-key',
              variables: [],
              variableCollections: [],
            },
          });
          return;
        }

        if (method === 'DELETE_NODE') {
          dispatchPluginMessage({
            type: 'BRIDGE_RESPONSE',
            requestId,
            success: false,
            error: {
              code: 'NODE_NOT_FOUND',
              message: 'Node not found: missing-node',
            },
          });
        }
      }
    });
  });

  afterEach(() => {
    runtime.stop();
    postMessageSpy.mockRestore();
    clearMockWebSocketCtor();
    vi.clearAllMocks();
  });

  it('forwards incoming WS requests to code.ts and replies on the same WS connection', async () => {
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 40));

    const ws = getConnectedSocket();

    ws.onmessage?.({
      data: JSON.stringify({
        id: 'server_req_123',
        method: 'GET_FILE_INFO',
        params: {},
      }),
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(postMessageSpy).toHaveBeenCalled();

    const response = ws.sentMessages
      .map((raw) => JSON.parse(raw) as { id?: string; result?: unknown })
      .find((msg) => msg.id === 'server_req_123');

    expect(response).toBeTruthy();
    expect(response?.result).toMatchObject({
      fileName: 'Test File',
      fileKey: 'test-key',
    });
  });

  it('uses correlated requestId for handshake and marks handshake complete', async () => {
    // Start runtime to establish a mock WebSocket connection
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const ok = await runtime.initiateHandshake();

    expect(ok).toBe(true);
    expect(runtime.isHandshakeComplete()).toBe(true);
    expect(runtime.getFileKey()).toBe('test-key');
  });

  it('forwards bridge events from code.ts to connected WS clients', async () => {
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 40));

    const ws = getConnectedSocket();

    dispatchPluginMessage({ type: 'FILE_INFO', data: { fileKey: 'k1' } });
    dispatchPluginMessage({ type: 'VARIABLES_DATA', data: { success: true } });
    dispatchPluginMessage({ type: 'DOCUMENT_CHANGE', data: { changeCount: 1 } });
    dispatchPluginMessage({ type: 'SELECTION_CHANGE', data: { count: 2 } });
    dispatchPluginMessage({ type: 'PAGE_CHANGE', data: { pageId: 'p1' } });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const forwardedTypes = ws.sentMessages
      .map((raw) => JSON.parse(raw) as { type?: string })
      .map((msg) => msg.type)
      .filter((type): type is string => typeof type === 'string');

    expect(forwardedTypes).toContain('FILE_INFO');
    expect(forwardedTypes).toContain('VARIABLES_DATA');
    expect(forwardedTypes).toContain('DOCUMENT_CHANGE');
    expect(forwardedTypes).toContain('SELECTION_CHANGE');
    expect(forwardedTypes).toContain('PAGE_CHANGE');
  });

  it('bootstraps FILE_INFO and VARIABLES_DATA for each new WS connection', async () => {
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 40));

    const ws = getConnectedSocket();
    const bootstrappedTypes = ws.sentMessages
      .map((raw) => JSON.parse(raw) as { type?: string })
      .map((msg) => msg.type)
      .filter((type): type is string => typeof type === 'string');

    expect(bootstrappedTypes).toContain('FILE_INFO');
    expect(bootstrappedTypes).toContain('VARIABLES_DATA');
  });

  it('returns WS error payload with legacy string format', async () => {
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 40));

    const ws = getConnectedSocket();
    ws.onmessage?.({
      data: JSON.stringify({
        id: 'server_req_404',
        method: 'DELETE_NODE',
        params: { nodeId: 'missing-node' },
      }),
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    const response = ws.sentMessages
      .map((raw) => JSON.parse(raw) as { id?: string; error?: unknown; errorCode?: unknown })
      .find((msg) => msg.id === 'server_req_404');

    expect(response).toBeTruthy();
    expect(typeof response?.error).toBe('string');
    expect(response?.error).toContain('Node not found');
    expect(response?.errorCode).toBe('NODE_NOT_FOUND');
  });

  it('cleans up pending requests and connections on stop()', async () => {
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 40));

    const pending = runtime.sendRequest('GET_FILE_INFO', {});
    runtime.stop();

    await expect(pending).rejects.toBeTruthy();
    expect(runtime.getConnectionCount()).toBe(0);
  });
});
