import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  bootstrapFigmaTokensToDatabase,
  getSystemRepository,
  setSystemRepositoryFactory,
} from './capture-system-bootstrap.js';
import type { SyncFigmaTokensToDatabaseOptions } from './figma-token-sync.js';

function uniqueSystemId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function createInMemorySystemRepository(repoRoot: string) {
  const systems = new Map<
    string,
    {
      id: string;
      name: string;
      collections: string[];
    }
  >();
  let defaultSystemId: string | undefined;

  const resolvePaths = (systemId: string) => ({
    input: path.join(repoRoot, 'design-systems', systemId, 'input'),
    docs: path.join(repoRoot, 'design-systems', systemId, 'docs'),
    output: path.join(repoRoot, 'design-systems', systemId, 'output'),
  });

  return {
    async create(system: {
      id: string;
      name: string;
      collections?: string[];
    }) {
      const entry = {
        id: system.id,
        name: system.name,
        collections: [...(system.collections ?? [])],
      };
      systems.set(system.id, entry);
      return entry;
    },
    async getById(systemId: string) {
      const entry = systems.get(systemId);
      return entry ? { ...entry } : null;
    },
    async setDefaultSystemId(systemId: string) {
      defaultSystemId = systemId;
      return { defaultSystemId };
    },
    async resolveSystemContext(systemId: string) {
      const entry = systems.get(systemId);
      if (!entry) return null;
      return {
        ...entry,
        id: entry.id,
        name: entry.name,
        paths: resolvePaths(systemId),
      };
    },
    async update(systemId: string, patch: { collections?: string[]; name?: string }) {
      const entry = systems.get(systemId);
      if (!entry) return null;
      const updated = {
        ...entry,
        ...patch,
        collections: patch.collections ? [...patch.collections] : [...entry.collections],
      };
      systems.set(systemId, updated);
      return { ...updated };
    },
    async dispose() {
      void defaultSystemId;
      systems.clear();
    },
  };
}

describe('capture-system-bootstrap', () => {
  beforeEach(() => {
    setSystemRepositoryFactory(({ repoRoot }) => createInMemorySystemRepository(repoRoot));
  });

  afterEach(() => {
    setSystemRepositoryFactory(null);
  });

  it('bootstraps token rows and returns sync result', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bootstrap-'));
    try {
      const calls: SyncFigmaTokensToDatabaseOptions[] = [];
      const result = await bootstrapFigmaTokensToDatabase({
        repoRoot,
        fileKey: 'FILE123',
        figmaToken: 'token',
        system: {
          id: 'demo',
          paths: {
            databaseUrl: 'postgres://demo',
          },
        },
        syncFigmaTokensToDatabaseFn: async (args) => {
          calls.push(args);
          return {
            attempted: true,
            reason: 'bootstrapped',
            tokens_written: 7,
            tokens_total: 9,
            collections: ['Primitives'],
          };
        },
      });

      assert.equal(calls.length, 1);
      assert.equal(result.attempted, true);
      assert.equal(result.created, true);
      assert.equal(result.reason, 'bootstrapped');
      assert.equal(result.tokens_written, 7);
      assert.equal(result.tokens_total, 9);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('updates collection metadata when sync returns collections', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bootstrap-'));
    try {
      const calls: SyncFigmaTokensToDatabaseOptions[] = [];
      const result = await bootstrapFigmaTokensToDatabase({
        repoRoot,
        fileKey: 'FILE123',
        figmaToken: 'token',
        system: {
          id: 'demo',
          paths: {
            databaseUrl: 'postgres://demo',
          },
        },
        syncFigmaTokensToDatabaseFn: async (args) => {
          calls.push(args);
          return {
            attempted: true,
            reason: 'bootstrapped',
            tokens_written: 42,
            collections: ['Primitives', 'Semantic'],
          };
        },
      });

      assert.equal(calls.length, 1);
      assert.equal(result.attempted, true);
      assert.equal(result.created, true);
      assert.equal(result.reason, 'bootstrapped');
      assert.equal(result.tokens_written, 42);
      assert.equal(result.tokens_total, 42);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

});
