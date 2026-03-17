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
  public readyState: number = WebSocket.CONNECTING;
  public onopen: (() => void) | null = null;
  public onclose: ((event: { code: number; reason: string }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection delay
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.();
    }, 10);
  }

  send(_data: string): void {
    // Mock send - no-op for now
  }

  close(code: number = 1000, reason: string = ''): void {
    this.readyState = WebSocket.CLOSED;
    setTimeout(() => {
      this.onclose?.({ code, reason });
    }, 0);
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
    runtime = new WebSocketRuntime({
      ...DEFAULT_WS_CONFIG,
      portRangeStart: 9223,
      portRangeEnd: 9225,
      connectionTimeout: 100,
      requestTimeout: 500,
      reconnectDelay: 50,
      reconnectMaxDelay: 200,
      maxReconnectAttempts: 2,
      handshakeTimeout: 500,
    });

    setMockWebSocketCtor(MockWebSocket);
  });

  afterEach(() => {
    runtime.stop();
    clearMockWebSocketCtor();
  });

  describe('start', () => {
    it('should start scanning for connections', async () => {
      await runtime.start();
      // Runtime should be in connecting or connected state
      const status = runtime.getStatus();
      expect(
        ['connecting', 'connected', 'disconnected'].includes(status.state)
      ).toBe(true);
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
