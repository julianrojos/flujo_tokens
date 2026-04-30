/**
 * Tests for mcp-client.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { McpClientService } from './mcp-client.ts';

describe('McpClientService.computeConnectionState', () => {
  const client = new McpClientService('http://localhost:3000');

  it('returns connecting when capabilities request timed out', () => {
    const state = client.computeConnectionState({
      ok: false,
      code: 'capabilities.timeout',
      message: 'timed out',
    });
    expect(state.state).toBe('connecting');
  });
});

describe('McpClientService.fetchFromDashboard fallback behavior', () => {
  it('does not probe 127.0.0.1 when localhost is the configured base', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('localhost:8787')) {
          throw new Error('localhost unreachable');
        }
        return new Response(
          JSON.stringify({
            ok: true,
            mcp: {
              connected: true,
              code: 'OK',
              message: 'connected',
              currentPort: 9223,
              portFallbackUsed: false,
              availablePorts: [9223],
              activePort: 9223,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      });

    try {
      const client = new McpClientService('http://localhost:8787');
      await client.getCapabilities({ forceRefresh: true });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
        'http://localhost:8787/api/figma-mcp/capabilities',
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
