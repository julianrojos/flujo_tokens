import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildUpdateComponentsPayload,
  resolveTokensSyncProgressMessage,
} from '../design-system-update-actions-logic.js';

describe('buildUpdateComponentsPayload', () => {
  it('includes both components and component sets in the update payload', () => {
    const result = buildUpdateComponentsPayload({
      figmaUrl: 'https://www.figma.com/design/abc123/Test-File?node-id=1-2',
      figmaToken: 'token_123',
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    assert.equal(result.payload.componentKind, 'all');
    assert.equal(result.payload.figmaUrl, 'https://www.figma.com/design/abc123/Test-File');
    assert.equal(result.payload.figmaToken, 'token_123');
  });
});

describe('resolveTokensSyncProgressMessage', () => {
  it('describes the queued and running tokens phases more clearly', () => {
    const queued = resolveTokensSyncProgressMessage({
      status: 'queued',
      summary: null,
      progress: null,
    });
    const running = resolveTokensSyncProgressMessage({
      status: 'running',
      summary: null,
      progress: null,
    });

    assert.equal(queued.label, 'Queueing token CSS and usage index…');
    assert.equal(running.label, 'Generating CSS and indexing token usage…');
    assert.equal(running.detail, 'CSS generation, usage indexing, and persistence.');
  });
});
