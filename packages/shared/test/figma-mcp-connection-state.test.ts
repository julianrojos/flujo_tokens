import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveMcpConnectionState,
  getMcpConnectionStateCopy,
} from '../src/figma-mcp-connection-state';

describe('deriveMcpConnectionState', () => {
  it('maps the five canonical connection states', () => {
    assert.equal(
      deriveMcpConnectionState(
        {
          ok: true,
          mcp: {
            connected: true,
            code: 'mcp.connected',
            message: 'connected',
            currentPort: 9223,
            portFallbackUsed: false,
            activePort: 9223,
          },
        },
        9223,
      ).state,
      'connected',
    );

    assert.equal(
      deriveMcpConnectionState(
        {
          ok: true,
          mcp: {
            connected: true,
            code: 'mcp.connected',
            message: 'connected',
            currentPort: 9224,
            portFallbackUsed: true,
            activePort: 9224,
          },
        },
        9223,
      ).state,
      'fallback',
    );

    assert.equal(
      deriveMcpConnectionState(
        {
          ok: true,
          mcp: {
            connected: true,
            code: 'mcp.connected',
            message: 'connected',
            currentPort: 9225,
            portFallbackUsed: false,
            activePort: 9223,
          },
        },
        9223,
      ).state,
      'mismatch',
    );

    assert.equal(
      deriveMcpConnectionState(
        {
          ok: false,
          code: 'capabilities.timeout',
          message: 'timed out',
        },
        9223,
      ).state,
      'connecting',
    );

    assert.equal(
      deriveMcpConnectionState(
        {
          ok: false,
          code: 'capabilities.fetch_failed',
          message: 'unreachable',
        },
        9223,
      ).state,
      'disconnected',
    );
  });
});

describe('getMcpConnectionStateCopy', () => {
  it('keeps the user-facing copy stable', () => {
    assert.deepEqual(getMcpConnectionStateCopy('fallback'), {
      label: 'Fallback port',
      sublabel: 'Session active on fallback MCP port',
    });
  });
});
