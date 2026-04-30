/**
 * WebSocket Runtime Tests
 *
 * Tests for WebSocket runtime connection management.
 * Note: These tests use mocked WebSocket - actual WS connections require running server.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketRuntime } from '../ws-runtime';
import { DEFAULT_WS_CONFIG, ERROR_CODES } from '../protocol';

// Mock WebSocket for testing
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  public readyState: number = MockWebSocket.CONNECTING;
  public onopen: (() => void) | null = null;
  public onclose: ((event: { code: number; reason: string }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  static readonly urls: string[] = [];
  private listeners: Record<string, Array<(event: unknown) => void>> = {
    open: [],
    close: [],
    error: [],
    message: [],
  };

  constructor(public url: string) {
    MockWebSocket.urls.push(url);
    // Simulate connection delay
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('error', {});
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

  send(_data: string): void {
    // Mock send - no-op for now
  }

  close(code: number = 1000, reason: string = ''): void {
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

describe('WebSocketRuntime', () => {
  let runtime: WebSocketRuntime;

  beforeEach(() => {
    MockWebSocket.urls.length = 0;
    runtime = new WebSocketRuntime({
      ...DEFAULT_WS_CONFIG,
      connectionTimeout: 100,
      requestTimeout: 500,
      reconnectDelay: 50,
      reconnectMaxDelay: 200,
      maxReconnectAttempts: 0,
      handshakeTimeout: 500,
      directWsUrl: 'ws://localhost:8787/ws/figma-plugin',
    });

    setMockWebSocketCtor(MockWebSocket);
  });

  afterEach(() => {
    runtime.stop();
    clearMockWebSocketCtor();
  });

  describe('start', () => {
    it('should start direct mode with a single localhost candidate', async () => {
      await runtime.start();
      expect(MockWebSocket.urls).toEqual(['ws://localhost:8787/ws/figma-plugin']);
    });
  });

  describe('stop', () => {
    it('should clean up all connections and pending requests', async () => {
      await runtime.start();
      runtime.stop();

      const status = runtime.getStatus();
      expect(status.state).toBe('disconnected');
      expect(runtime.getConnectionCount()).toBe(0);
    });
  });

  describe('sendRequest', () => {
    it('should reject when no connection is available', async () => {
      try {
        await runtime.sendRequest('GET_FILE_INFO', {});
        fail('Should have rejected');
      } catch (error) {
        expect((error as { code: string }).code).toBe(ERROR_CODES.NOT_CONNECTED);
      }
    });
  });

  describe('isConnected', () => {
    it('should return false when no connections exist', () => {
      expect(runtime.isConnected()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return initial disconnected status', () => {
      const status = runtime.getStatus();
      expect(status.state).toBe('disconnected');
      expect(status.connectedPort).toBe(null);
    });
  });
});
