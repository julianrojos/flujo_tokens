import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeSpecPreservingEditorial } from './spec-merge.js';

describe('spec-merge', () => {
  describe('mergeSpecPreservingEditorial()', () => {
    it('preserves editorial fields from existing specs', () => {
      const existing = {
        name: 'Alert',
        status: 'ready',
        anatomy: [{ id: 'container' }],
        summary: {
          purpose: 'Human edited purpose',
          when_to_use: 'When a user needs feedback',
          when_not_to_use: 'For confirmations',
        },
      };
      const incoming = {
        name: 'Alert',
        status: 'draft',
        anatomy: [{ id: 'root' }],
        summary: {
          purpose: 'Generated',
          when_to_use: 'Generated',
          when_not_to_use: 'Generated',
        },
      };

      const result = mergeSpecPreservingEditorial(existing, incoming);
      assert.deepEqual(result.anatomy, [{ id: 'root' }]);
      assert.equal((result.summary as Record<string, string>).purpose, 'Human edited purpose');
      assert.equal(result.status, 'ready');
    });

    it('uses incoming editorial fields on first run', () => {
      const result = mergeSpecPreservingEditorial(
        {},
        {
          status: 'draft',
          summary: {
            purpose: 'Initial',
            when_to_use: 'Initial',
            when_not_to_use: 'Initial',
          },
        },
      );

      assert.equal(result.status, 'draft');
      assert.equal((result.summary as Record<string, string>).purpose, 'Initial');
    });

    it('preserves unknown keys from existing specs', () => {
      const result = mergeSpecPreservingEditorial(
        {
          custom_future_key: { value: 'keep-me' },
        },
        {
          name: 'Alert',
        },
      );

      assert.deepEqual(result.custom_future_key, { value: 'keep-me' });
    });
  });
});
