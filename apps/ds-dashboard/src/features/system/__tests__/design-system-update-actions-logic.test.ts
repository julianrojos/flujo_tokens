import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildUpdateComponentsPayload } from '../design-system-update-actions-logic.js';

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
