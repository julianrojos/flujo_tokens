/**
 * Tests for mcp-client.ts
 */

import { describe, it, expect } from 'vitest';
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
