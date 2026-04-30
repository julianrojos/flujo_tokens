import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getConnectionStatusTitle,
  getConnectionStatusTone,
} from '../connection-status-dot';

describe('getConnectionStatusTone', () => {
  it('maps fallback and mismatch to warning while keeping the other tones distinct', () => {
    assert.equal(getConnectionStatusTone('connected'), 'success');
    assert.equal(getConnectionStatusTone('connecting'), 'warning');
    assert.equal(getConnectionStatusTone('disconnected'), 'error');
    assert.equal(getConnectionStatusTone('mismatch'), 'warning');
    assert.equal(getConnectionStatusTone('fallback'), 'warning');
  });
});

describe('getConnectionStatusTitle', () => {
  it('builds a compact title from the shared connection copy', () => {
    assert.equal(
      getConnectionStatusTitle({
        configuredPort: 9223,
        connectedPort: 9223,
        state: 'connected',
      }),
      'Connected: MCP session is active for this file',
    );
  });
});
