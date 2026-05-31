/**
 * Tests for figma-descriptions-resolver.ts (S-03)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDescriptionsForRender,
  buildCanonicalKey,
  TTL_MS,
} from './figma-descriptions-resolver.js';

describe('resolveDescriptionsForRender', () => {
  it('returns null when DB data is null', () => {
    const result = resolveDescriptionsForRender(null);
    assert.equal(result, null);
  });

  it('returns data with stale=false when syncedAt is recent', () => {
    const now = Math.floor(Date.now() / 1000);
    const dbData = {
      componentSet: 'A button component',
      variants: [
        { nodeId: 'v1', canonicalKey: 'Size=md', description: 'Medium button' },
      ],
      syncedAt: now,
    };

    const result = resolveDescriptionsForRender(dbData);

    assert.notEqual(result, null);
    assert.equal(result!.componentSet, 'A button component');
    assert.equal(result!.variants.length, 1);
    assert.equal(result!.variants[0].description, 'Medium button');
    assert.equal(result!.stale, false);
  });

  it('returns data with stale=true when syncedAt is older than TTL', () => {
    const oldSync = Math.floor(Date.now() / 1000) - Math.floor(TTL_MS / 1000) - 60;
    const dbData = {
      componentSet: 'Old data',
      variants: [],
      syncedAt: oldSync,
    };

    const result = resolveDescriptionsForRender(dbData);

    assert.notEqual(result, null);
    assert.equal(result!.stale, true);
  });

  it('returns stale=true when syncedAt is null', () => {
    const dbData = {
      componentSet: null,
      variants: [],
      syncedAt: null,
    };

    // This case shouldn't happen in practice (repo returns null if never synced),
    // but the resolver should handle it gracefully.
    const result = resolveDescriptionsForRender(dbData);

    assert.notEqual(result, null);
    assert.equal(result!.stale, true);
  });

  it('passes through empty componentSet string as-is', () => {
    const now = Math.floor(Date.now() / 1000);
    const dbData = {
      componentSet: '',
      variants: [],
      syncedAt: now,
    };

    const result = resolveDescriptionsForRender(dbData);

    assert.notEqual(result, null);
    assert.equal(result!.componentSet, '');
  });
});

describe('buildCanonicalKey', () => {
  it('sorts properties alphabetically and joins with |', () => {
    const props = { Size: 'md', State: 'hover', Color: 'blue' };
    const key = buildCanonicalKey(props);
    assert.equal(key, 'Color=blue|Size=md|State=hover');
  });

  it('handles single property', () => {
    const key = buildCanonicalKey({ Size: 'lg' });
    assert.equal(key, 'Size=lg');
  });

  it('handles empty object', () => {
    const key = buildCanonicalKey({});
    assert.equal(key, '');
  });
});
