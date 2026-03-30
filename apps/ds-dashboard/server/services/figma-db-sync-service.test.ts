import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ComponentRepository } from '../db/component-repository.js';
import { resolveSystemPaths } from '../db/design-system-repository.js';
import type { FigmaVariablesResponse } from '../../../../tooling/src/utils/figma.ts';
import { syncDesignSystemFromPlugin } from './figma-db-sync-service.ts';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE design_systems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE tokens (
      id TEXT NOT NULL,
      ds_id TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
      slash_path TEXT NOT NULL,
      css_var TEXT NOT NULL,
      type TEXT NOT NULL,
      collection TEXT NOT NULL,
      raw_value TEXT NOT NULL,
      PRIMARY KEY (ds_id, id)
    );

    CREATE TABLE token_mode_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ds_id TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
      token_path TEXT NOT NULL,
      mode TEXT NOT NULL,
      resolved_value TEXT NOT NULL
    );

    CREATE TABLE figma_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ds_id TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
      from_path TEXT NOT NULL,
      to_path TEXT NOT NULL,
      modes TEXT NOT NULL,
      UNIQUE(ds_id, from_path, to_path)
    );

    CREATE TABLE token_graph (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ds_id TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
      graph_json TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      UNIQUE(ds_id)
    );

    CREATE TABLE token_usage_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ds_id TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      owner TEXT NOT NULL,
      detail TEXT NOT NULL,
      UNIQUE(ds_id, token_id, kind, source, owner, detail),
      FOREIGN KEY (ds_id, token_id) REFERENCES tokens(ds_id, id) ON DELETE CASCADE
    );

    CREATE TABLE tokens_staging (
      id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      ds_id TEXT NOT NULL,
      slash_path TEXT NOT NULL,
      css_var TEXT NOT NULL,
      type TEXT NOT NULL,
      collection TEXT NOT NULL,
      raw_value TEXT NOT NULL,
      PRIMARY KEY (id, run_id)
    );

    CREATE TABLE token_mode_values_staging (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      ds_id TEXT NOT NULL,
      token_path TEXT NOT NULL,
      mode TEXT NOT NULL,
      resolved_value TEXT NOT NULL
    );

    CREATE TABLE figma_aliases_staging (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      ds_id TEXT NOT NULL,
      from_path TEXT NOT NULL,
      to_path TEXT NOT NULL,
      modes TEXT NOT NULL
    );
  `);
  db.prepare(`INSERT INTO design_systems (id, name) VALUES (?, ?)`).run('sys-01', 'System 01');
  return db;
}

function makeComponentRepoStub(): ComponentRepository {
  return {
    deleteAll: () => 0,
    upsertFromRegistry: () => 0,
    markMissingComponents: () => 0,
  } as unknown as ComponentRepository;
}

function buildVariablesPayload(input: {
  collections: Record<string, { id: string; name: string; modes: Array<{ modeId: string; name: string }> }>;
  variables: Record<string, {
    id: string;
    name: string;
    variableCollectionId: string;
    resolvedType: string;
    valuesByMode: Record<string, unknown>;
  }>;
}): FigmaVariablesResponse {
  return {
    meta: {
      variableCollections: input.collections,
      variables: input.variables,
    },
  };
}

describe('figma-db-sync-service', () => {
  it('fails fast when staging ends up empty (no token rows)', async () => {
    const db = createTestDb();
    try {
      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/empty',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: {},
            },
          },
        });

      await assert.rejects(
        () =>
          syncDesignSystemFromPlugin({
            db,
            componentRepo: makeComponentRepoStub(),
            dsId: 'sys-01',
            figmaFileId: 'file_123',
            includeComponents: false,
            dryRun: false,
            createRunId: () => 'run-empty',
            fetchVariables,
          }),
        /No tokens in staging after import/,
      );
    } finally {
      db.close();
    }
  });

  it('aborts swap when staged aliases reference missing token endpoints', async () => {
    const db = createTestDb();
    try {
      db.exec(`
        CREATE TRIGGER inject_orphan_alias
        AFTER INSERT ON figma_aliases_staging
        BEGIN
          INSERT INTO figma_aliases_staging (run_id, ds_id, from_path, to_path, modes)
          VALUES (NEW.run_id, NEW.ds_id, 'ghost.from', 'ghost.to', '[]');
        END;
      `);

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            base: {
              id: 'base',
              name: 'color/base',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } },
            },
            alias: {
              id: 'alias',
              name: 'color/alias',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'base' } },
            },
          },
        });

      await assert.rejects(
        () =>
          syncDesignSystemFromPlugin({
            db,
            componentRepo: makeComponentRepoStub(),
            dsId: 'sys-01',
            figmaFileId: 'file_123',
            includeComponents: false,
            dryRun: false,
            createRunId: () => 'run-orphan',
            fetchVariables,
          }),
        /figma aliases with missing token endpoints/,
      );
    } finally {
      db.close();
    }
  });

  it('aborts swap when staged mode values reference missing tokens', async () => {
    const db = createTestDb();
    try {
      db.exec(`
        CREATE TRIGGER inject_orphan_mode
        AFTER INSERT ON token_mode_values_staging
        BEGIN
          INSERT INTO token_mode_values_staging (run_id, ds_id, token_path, mode, resolved_value)
          VALUES (NEW.run_id, NEW.ds_id, 'ghost.token', NEW.mode, NEW.resolved_value);
        END;
      `);

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/base',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
            },
          },
        });

      await assert.rejects(
        () =>
          syncDesignSystemFromPlugin({
            db,
            componentRepo: makeComponentRepoStub(),
            dsId: 'sys-01',
            figmaFileId: 'file_123',
            includeComponents: false,
            dryRun: false,
            createRunId: () => 'run-orphan-mode',
            fetchVariables,
          }),
        /mode value rows with missing token endpoints/,
      );
    } finally {
      db.close();
    }
  });

  it('rolls back production deletes when swap fails mid-transaction', async () => {
    const db = createTestDb();
    try {
      db.prepare(`
        INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('legacy.token', 'sys-01', 'legacy/token', '--legacy-token', 'color', 'Primitives', '#FFFFFF');

      db.exec(`
        CREATE TRIGGER fail_new_token_insert
        BEFORE INSERT ON tokens
        WHEN NEW.ds_id = 'sys-01' AND NEW.id = 'new.token'
        BEGIN
          SELECT RAISE(ABORT, 'boom_insert_tokens');
        END;
      `);

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'new/token',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 0, g: 0, b: 0, a: 1 } },
            },
          },
        });

      await assert.rejects(
        () =>
          syncDesignSystemFromPlugin({
            db,
            componentRepo: makeComponentRepoStub(),
            dsId: 'sys-01',
            figmaFileId: 'file_123',
            includeComponents: false,
            dryRun: false,
            createRunId: () => 'run-fail',
            fetchVariables,
          }),
        /boom_insert_tokens/,
      );

      const legacy = db
        .prepare(`SELECT COUNT(*) as count FROM tokens WHERE ds_id = ? AND id = ?`)
        .get('sys-01', 'legacy.token') as { count: number };
      const fresh = db
        .prepare(`SELECT COUNT(*) as count FROM tokens WHERE ds_id = ? AND id = ?`)
        .get('sys-01', 'new.token') as { count: number };

      assert.equal(legacy.count, 1);
      assert.equal(fresh.count, 0);
    } finally {
      db.close();
    }
  });

  it('successfully swaps rows and preserves compatible token usage', async () => {
    const db = createTestDb();
    try {
      db.prepare(`
        INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('legacy.token', 'sys-01', 'legacy/token', '--legacy-token', 'color', 'Primitives', '#FFFFFF');
      db.prepare(`
        INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('gone.token', 'sys-01', 'gone/token', '--gone-token', 'color', 'Primitives', '#000000');
      db.prepare(`
        INSERT INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('sys-01', 'legacy.token', 'component-spec', 'component-spec', 'button', 'background');
      db.prepare(`
        INSERT INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('sys-01', 'gone.token', 'component-spec', 'component-spec', 'button', 'border');

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'legacy/token',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
            },
            v2: {
              id: 'v2',
              name: 'new/token',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 0, g: 0, b: 0, a: 1 } },
            },
          },
        });

      await syncDesignSystemFromPlugin({
        db,
        componentRepo: makeComponentRepoStub(),
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: false,
        dryRun: false,
        createRunId: () => 'run-success',
        fetchVariables,
      });

      const tokenCount = (db.prepare(`SELECT COUNT(*) as count FROM tokens WHERE ds_id = ?`).get('sys-01') as { count: number }).count;
      const legacyUsage = (db.prepare(`
        SELECT COUNT(*) as count
        FROM token_usage_occurrences
        WHERE ds_id = ? AND token_id = ?
      `).get('sys-01', 'legacy.token') as { count: number }).count;
      const goneUsage = (db.prepare(`
        SELECT COUNT(*) as count
        FROM token_usage_occurrences
        WHERE ds_id = ? AND token_id = ?
      `).get('sys-01', 'gone.token') as { count: number }).count;
      const stagedTokens = (db.prepare(`
        SELECT COUNT(*) as count
        FROM tokens_staging
        WHERE run_id = ? AND ds_id = ?
      `).get('run-success', 'sys-01') as { count: number }).count;

      assert.equal(tokenCount, 2);
      assert.equal(legacyUsage, 1);
      assert.equal(goneUsage, 0);
      assert.equal(stagedTokens, 0);
    } finally {
      db.close();
    }
  });

  it('does not call deleteAll during component sync', async () => {
    const db = createTestDb();
    let deleteAllCalls = 0;
    let upsertCalls = 0;
    let markMissingCalls = 0;
    try {
      const componentRepo = {
        deleteAll: () => {
          deleteAllCalls += 1;
          return 0;
        },
        upsertFromRegistry: () => {
          upsertCalls += 1;
          return 1;
        },
        markMissingComponents: () => {
          markMissingCalls += 1;
          return 0;
        },
      } as unknown as ComponentRepository;

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/base',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
            },
          },
        });

      const searchComponents = async () => ({
        components: [{ nodeId: '10:1', name: 'Button' }],
        truncated: false,
      });

      await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-components',
        fetchVariables,
        searchComponents,
      });

      assert.equal(deleteAllCalls, 0);
      assert.equal(upsertCalls, 1);
      assert.equal(markMissingCalls, 1);
    } finally {
      db.close();
    }
  });

  it('does not mark missing components when search results are truncated', async () => {
    const db = createTestDb();
    let markMissingCalls = 0;
    try {
      const componentRepo = {
        deleteAll: () => 0,
        upsertFromRegistry: () => 1,
        markMissingComponents: () => {
          markMissingCalls += 1;
          return 0;
        },
      } as unknown as ComponentRepository;

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/base',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
            },
          },
        });

      const searchComponents = async () => ({
        components: [{ nodeId: '10:1', name: 'Button' }],
        truncated: true,
      });

      await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-components-truncated',
        fetchVariables,
        searchComponents,
      });

      assert.equal(markMissingCalls, 0);
    } finally {
      db.close();
    }
  });

  it('deduplicates token mode values when two collections share the same normalized token path', async () => {
    const db = createTestDb();
    try {
      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
            col2: { id: 'col2', name: 'Semantic', modes: [{ modeId: 'm2', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/primary',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } },
            },
            v2: {
              id: 'v2',
              name: 'color/primary',
              variableCollectionId: 'col2',
              resolvedType: 'COLOR',
              valuesByMode: { m2: { r: 0, g: 1, b: 0, a: 1 } },
            },
          },
        });

      await syncDesignSystemFromPlugin({
        db,
        componentRepo: makeComponentRepoStub(),
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: false,
        dryRun: false,
        createRunId: () => 'run-duplicate-mode-key',
        fetchVariables,
      });

      const modeRows = db.prepare(`
        SELECT token_path, mode, resolved_value
        FROM token_mode_values
        WHERE ds_id = ? AND token_path = ? AND mode = ?
      `).all('sys-01', 'color.primary', 'Default') as Array<{
        token_path: string;
        mode: string;
        resolved_value: string;
      }>;

      assert.equal(modeRows.length, 1);
      assert.equal(modeRows[0].resolved_value, '#00FF00');
    } finally {
      db.close();
    }
  });

  it('does not fail sync when reindex has no scan sources (reports failed status + warnings)', async () => {
    const db = createTestDb();
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-sync-nosources-'));
    try {
      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/base',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
            },
          },
        });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: makeComponentRepoStub(),
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: false,
        dryRun: false,
        createRunId: () => 'run-nosources',
        fetchVariables,
        repoRoot,
        reindexUsageFromFilesystem: true,
        usageReindexStrict: true,
      });

      assert.equal(result.usageReindexStatus, 'failed');
      assert.equal(result.usageReindexReason, 'no_sources');
      assert.equal(result.usageReindexed, 0);
      assert.ok(result.usageReindexWarnings.length > 0);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      db.close();
    }
  });

  it('reports failed status when reindex is requested without repoRoot in non-strict mode', async () => {
    const db = createTestDb();
    try {
      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/base',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
            },
          },
        });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: makeComponentRepoStub(),
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: false,
        dryRun: false,
        createRunId: () => 'run-missing-reporoot',
        fetchVariables,
        reindexUsageFromFilesystem: true,
        usageReindexStrict: false,
      });

      assert.equal(result.usageReindexStatus, 'failed');
      assert.equal(result.usageReindexReason, 'missing_repo_root');
      assert.ok(
        result.usageReindexWarnings.some((warning) =>
          warning.toLowerCase().includes('reporoot is missing')
        )
      );
    } finally {
      db.close();
    }
  });

  it('throws when reindex is requested without repoRoot in strict mode', async () => {
    const db = createTestDb();
    try {
      db.prepare(`
        INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('legacy.token', 'sys-01', 'legacy/token', '--legacy-token', 'color', 'Primitives', '#FFFFFF');

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/base',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
            },
          },
        });

      await assert.rejects(
        () =>
          syncDesignSystemFromPlugin({
            db,
            componentRepo: makeComponentRepoStub(),
            dsId: 'sys-01',
            figmaFileId: 'file_123',
            includeComponents: false,
            dryRun: false,
            createRunId: () => 'run-missing-reporoot-strict',
            fetchVariables,
            reindexUsageFromFilesystem: true,
            usageReindexStrict: true,
          }),
        /reporoot is missing/i,
      );

      // strict missing-repoRoot must fail before mutating production rows
      const preserved = db.prepare(`
        SELECT COUNT(*) as count
        FROM tokens
        WHERE ds_id = ? AND id = ?
      `).get('sys-01', 'legacy.token') as { count: number };
      const inserted = db.prepare(`
        SELECT COUNT(*) as count
        FROM tokens
        WHERE ds_id = ? AND id = ?
      `).get('sys-01', 'color.base') as { count: number };
      assert.equal(preserved.count, 1);
      assert.equal(inserted.count, 0);
    } finally {
      db.close();
    }
  });

  it('skips pre-reindex usage restore when reindexUsageFromFilesystem is enabled', async () => {
    const db = createTestDb();
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-sync-reindex-'));
    try {
      const paths = resolveSystemPaths('sys-01', repoRoot);
      fs.mkdirSync(paths.specsDir, { recursive: true });
      fs.writeFileSync(
        path.join(paths.specsDir, 'button.yml'),
        `token_mapping:\n  surface:\n    default: "legacy.token"\n`,
        'utf8'
      );

      db.prepare(`
        INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('legacy.token', 'sys-01', 'legacy/token', '--legacy-token', 'color', 'Primitives', '#FFFFFF');
      db.prepare(`
        INSERT INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('sys-01', 'legacy.token', 'component-spec', 'component-spec', 'button', 'background');

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'legacy/token',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
            },
          },
        });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: makeComponentRepoStub(),
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: false,
        dryRun: false,
        createRunId: () => 'run-reindex-skip-restore',
        fetchVariables,
        repoRoot,
        reindexUsageFromFilesystem: true,
        usageReindexStrict: true,
      });

      assert.equal(result.usageRestored, 0);
      assert.equal(result.usageDropped, 0);
      assert.equal(result.usageReindexStatus, 'ok');
      assert.equal(result.usageReindexReason, 'none');
      assert.ok(result.usageReindexed > 0);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      db.close();
    }
  });
});
