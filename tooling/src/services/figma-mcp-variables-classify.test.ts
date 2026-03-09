import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyMcpPingError } from './figma-mcp-variables.js';

describe('classifyMcpPingError', () => {
  it('returns mcp.not_connected for generic disconnection errors', () => {
    const result = classifyMcpPingError(
      'MCP server reports no Figma connection. Ensure Figma Desktop is open.',
    );
    assert.equal(result.code, 'mcp.not_connected');
  });

  it('returns mcp.instance_mismatch when fallback port has other active instances', () => {
    const message = [
      'MCP server reports no Figma connection. Ensure Figma Desktop is open with the Desktop Bridge plugin running.',
      'Details: {"transport":{"websocket":{"port":"9229","preferredPort":"9223","portFallbackUsed":true,"otherInstances":[{"port":9223},{"port":9225}]}}}',
    ].join(' ');

    const result = classifyMcpPingError(message);
    assert.equal(result.code, 'mcp.instance_mismatch');
    assert.match(result.message, /fallback port 9229/i);
    assert.match(result.message, /9223, 9225/);
  });
});
