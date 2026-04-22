import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { fetchHealthHistory } from '../src/lib/api.ts';
import { healthQueryKeys } from '../src/features/health/use-health-queries.ts';

describe('health system scoping', () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, String(value));
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: originalFetch,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('includes the system id in health query keys', () => {
    assert.deepEqual(
      healthQueryKeys.componentCatalog('sys-a'),
      ['health', 'sys-a', 'component-catalog'],
    );
    assert.deepEqual(
      healthQueryKeys.history('sys-a', '30d', 'day'),
      ['health', 'sys-a', 'history', '30d', 'day'],
    );
  });

  it('sends x-ds-system for history requests', async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          headers: new Headers(init?.headers),
        });
        return new Response(JSON.stringify({ ok: true, summary: {}, warnings: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await fetchHealthHistory({ systemId: 'sys-a', range: '30d', bucket: 'day' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, '/api/health-history?range=30d&bucket=day');
    assert.equal(calls[0]?.headers.get('x-ds-system'), 'sys-a');
  });
});
