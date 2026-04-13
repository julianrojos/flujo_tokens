import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

import type { ComponentRepository } from '../db/component-repository.js';
import { ComponentRepository as ComponentRepositoryClass } from '../db/component-repository.js';
import { createInMemoryDbFromSchema } from '../db/test-db-helpers.ts';
import { resolveSystemPaths } from '../db/design-system-repository.js';
import type { FigmaVariablesResponse } from '../../../../tooling/src/utils/figma.ts';
import { parseMarkdownFrontmatter } from '../../../../tooling/src/utils/parse-frontmatter.js';
import { syncDesignSystemFromPlugin } from './figma-db-sync-service.ts';

function createTestDb(): Database.Database {
  return createInMemoryDbFromSchema({
    designSystems: [{ id: 'sys-01', name: 'System 01' }],
  });
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
  let originalConsoleWarn: typeof console.warn;

  before(() => {
    originalConsoleWarn = console.warn;
    console.warn = () => { };
  });

  after(() => {
    console.warn = originalConsoleWarn;
  });

  const baseVariablesPayload = buildVariablesPayload({
    collections: {
      col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'm1', name: 'Default' }] },
    },
    variables: {
      v1: {
        id: 'v1',
        name: 'color/ok',
        variableCollectionId: 'col1',
        resolvedType: 'COLOR',
        valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } },
      },
    },
  });

  const bridgeErrorCases: Array<{
    name: string;
    runId: string;
    figmaFileId: string;
    thrownMessage: string;
    expectedMessageIncludes: string;
    expectedCauseIncludes: string;
    operation: 'variables' | 'components';
  }> = [
      {
        name: 'maps no-socket bridge errors to an actionable import message',
        runId: 'run-no-socket',
        figmaFileId: 'FILE_ABC123',
        thrownMessage: 'ws.request.no_socket_for_file:GET_VARIABLES_DATA',
        expectedMessageIncludes: 'no plugin socket is connected for that file',
        expectedCauseIncludes: 'ws.request.no_socket_for_file',
        operation: 'variables',
      },
      {
        name: 'maps timeout bridge errors to an actionable import message',
        runId: 'run-timeout',
        figmaFileId: 'FILE_TIMEOUT',
        thrownMessage: 'ws.request.timeout:GET_VARIABLES_DATA',
        expectedMessageIncludes: 'Timeout while trying to read variables',
        expectedCauseIncludes: 'ws.request.timeout',
        operation: 'variables',
      },
      {
        name: 'maps unavailable-bridge errors to an actionable import message',
        runId: 'run-unavailable-bridge',
        figmaFileId: 'FILE_UNAVAILABLE',
        thrownMessage: 'ws.request.no_connection:GET_VARIABLES_DATA',
        expectedMessageIncludes: 'Plugin bridge is unavailable while trying to read variables',
        expectedCauseIncludes: 'ws.request.no_connection',
        operation: 'variables',
      },
      {
        name: 'maps plugin response errors to an actionable import message',
        runId: 'run-response-error',
        figmaFileId: 'FILE_RESPONSE_ERROR',
        thrownMessage: 'ws.response.error:GET_VARIABLES_DATA:permission_denied',
        expectedMessageIncludes: 'Plugin reported an error while trying to read variables',
        expectedCauseIncludes: 'ws.response.error:',
        operation: 'variables',
      },
      {
        name: 'maps component bridge errors to an actionable import message',
        runId: 'run-components-socket',
        figmaFileId: 'FILE_COMPONENTS',
        thrownMessage: 'ws.request.socket_not_open:SEARCH_COMPONENTS',
        expectedMessageIncludes: 'Plugin connection was lost while trying to read components',
        expectedCauseIncludes: 'ws.request.socket_not_open',
        operation: 'components',
      },
    ];

  for (const testCase of bridgeErrorCases) {
    it(testCase.name, async () => {
      const db = createTestDb();
      try {
        const fetchVariables = async (): Promise<FigmaVariablesResponse> => {
          if (testCase.operation === 'variables') {
            throw new Error(testCase.thrownMessage);
          }
          return baseVariablesPayload;
        };
        const searchComponents = async () => {
          if (testCase.operation === 'components') {
            throw new Error(testCase.thrownMessage);
          }
          return {
            components: [] as Array<{ nodeId: string; name: string }>,
            truncated: false,
          };
        };

        await assert.rejects(
          () =>
            syncDesignSystemFromPlugin({
              db,
              componentRepo: makeComponentRepoStub(),
              dsId: 'sys-01',
              figmaFileId: testCase.figmaFileId,
              includeComponents: testCase.operation === 'components',
              dryRun: false,
              createRunId: () => testCase.runId,
              fetchVariables,
              searchComponents,
            }),
          (err: Error) => {
            if (!err.message.includes(testCase.expectedMessageIncludes)) return false;
            if (!(err.cause instanceof Error)) return false;
            return err.cause.message.includes(testCase.expectedCauseIncludes);
          },
        );
      } finally {
        db.close();
      }
    });
  }

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

      const result = await syncDesignSystemFromPlugin({
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

  it('enriches with empty result when docs dirs do not exist', async () => {
    const db = createTestDb();
    let receivedEntries: Array<Record<string, unknown>> = [];
    let result: Awaited<ReturnType<typeof syncDesignSystemFromPlugin>> | undefined;
    try {
      const componentRepo = {
        deleteAll: () => 0,
        upsertFromRegistry: (_systemId: string, entries: Array<Record<string, unknown>>) => {
          receivedEntries = entries;
          return entries.length;
        },
        markMissingComponents: () => 0,
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

      result = await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-empty-fs',
        fetchVariables,
        searchComponents,
      });

      assert.equal(receivedEntries.length, 1);
      const button = receivedEntries[0] as Record<string, unknown>;
      const specs = button.specs;
      const visualProofs = button.visualProofs;
      assert.ok(specs === undefined || (Array.isArray(specs) && specs.length === 0));
      assert.ok(visualProofs === undefined || (Array.isArray(visualProofs) && visualProofs.length === 0));
      assert.equal(result?.specsEnriched, 0);
      assert.equal(result?.proofsEnriched, 0);
    } finally {
      db.close();
    }
  });

  it('enriches component entries with markdown specs and visual proofs discovered on disk', async () => {
    const db = createTestDb();
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-sync-enrich-'));
    let receivedEntries: Array<Record<string, unknown>> = [];
    let result: Awaited<ReturnType<typeof syncDesignSystemFromPlugin>> | undefined;
    try {
      const paths = resolveSystemPaths('sys-01', repoRoot);
      fs.mkdirSync(paths.componentsDir, { recursive: true });
      fs.mkdirSync(path.join(paths.generatedDir, 'visual-proofs', 'images', 'variants'), { recursive: true });
      fs.writeFileSync(path.join(paths.componentsDir, 'button.md'), '# Button\n', 'utf8');
      fs.writeFileSync(path.join(paths.generatedDir, 'visual-proofs', 'images', 'button.png'), 'png', 'utf8');
      fs.writeFileSync(
        path.join(paths.generatedDir, 'visual-proofs', 'images', 'variants', 'button__01__primary.png'),
        'png-variant',
        'utf8',
      );

      const componentRepo = {
        deleteAll: () => 0,
        upsertFromRegistry: (_systemId: string, entries: Array<Record<string, unknown>>) => {
          receivedEntries = entries;
          return entries.length;
        },
        markMissingComponents: () => 0,
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

      result = await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-components-enriched',
        fetchVariables,
        searchComponents,
        repoRoot,
      });

      assert.ok(result != null);
      assert.equal(receivedEntries.length, 1);
      const button = receivedEntries[0] as Record<string, unknown>;
      const specs = button.specs as Array<{ markdownPath: string; docStatus?: string; coverage?: number }>;
      const visualProofs = button.visualProofs as Array<{
        imagePath: string;
        variantsCount?: number;
        variants?: Array<{ name: string; image_path?: string | null }>;
      }>;
      assert.ok(Array.isArray(specs));
      assert.equal(specs.length, 1);
      assert.equal(specs[0].markdownPath, 'design-systems/sys-01/docs/components/button.md');
      assert.equal(specs[0].docStatus, 'draft');
      assert.equal(specs[0].coverage, 0);
      assert.ok(Array.isArray(visualProofs));
      assert.equal(visualProofs.length, 1);
      assert.equal(visualProofs[0].imagePath, 'design-systems/sys-01/docs/_generated/visual-proofs/images/button.png');
      assert.equal(visualProofs[0].variantsCount, 1);
      assert.ok(Array.isArray(visualProofs[0].variants));
      assert.equal(visualProofs[0].variants?.[0].name, '01 primary');
      assert.equal(
        visualProofs[0].variants?.[0].image_path,
        'design-systems/sys-01/docs/_generated/visual-proofs/images/variants/button__01__primary.png',
      );
      assert.equal(result?.specsEnriched, 1);
      assert.equal(result?.proofsEnriched, 1);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      db.close();
    }
  });

  it('creates component doc templates and captures main proof images during component import', async () => {
    const db = createTestDb();
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-sync-complete-'));
    let receivedEntries: Array<Record<string, unknown>> = [];
    try {
      const componentRepo = {
        deleteAll: () => 0,
        upsertFromRegistry: (_systemId: string, entries: Array<Record<string, unknown>>) => {
          receivedEntries = entries;
          return entries.length;
        },
        markMissingComponents: () => 0,
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
        components: [{ nodeId: '10:1', name: 'Button Primary' }],
        truncated: false,
      });

      const fetchComponentImages = async () => ({
        success: true,
        images: [
          {
            nodeId: '10:1',
            base64: Buffer.from('fake-png-bytes').toString('base64'),
            format: 'PNG',
          },
        ],
        count: 1,
        errors: 0,
      });

      await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        captureComponentProofs: true,
        dryRun: false,
        createRunId: () => 'run-components-complete',
        fetchVariables,
        searchComponents,
        fetchComponentImages,
        repoRoot,
      });

      const paths = resolveSystemPaths('sys-01', repoRoot);
      const markdownPath = path.join(paths.componentsDir, 'button-primary.md');
      const proofPath = path.join(paths.generatedDir, 'visual-proofs', 'images', 'button-primary.png');
      assert.equal(fs.existsSync(markdownPath), true);
      assert.equal(fs.existsSync(proofPath), true);

      assert.equal(receivedEntries.length, 1);
      const button = receivedEntries[0] as Record<string, unknown>;
      const specs = button.specs as Array<{ markdownPath: string }>;
      const visualProofs = button.visualProofs as Array<{ imagePath: string }>;
      assert.ok(Array.isArray(specs));
      assert.equal(specs[0].markdownPath, 'design-systems/sys-01/docs/components/button-primary.md');
      assert.ok(Array.isArray(visualProofs));
      assert.equal(
        visualProofs[0].imagePath,
        'design-systems/sys-01/docs/_generated/visual-proofs/images/button-primary.png',
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      db.close();
    }
  });

  it('writes YAML-safe component names in generated doc frontmatter', async () => {
    const db = createTestDb();
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-sync-safe-frontmatter-'));
    try {
      const componentRepo = {
        deleteAll: () => 0,
        upsertFromRegistry: () => 0,
        markMissingComponents: () => 0,
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
        components: [{ nodeId: '10:1', name: 'Button: Primary [v2]' }],
        truncated: false,
      });

      await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-yaml-safe-frontmatter',
        fetchVariables,
        searchComponents,
        repoRoot,
      });

      const paths = resolveSystemPaths('sys-01', repoRoot);
      const markdownPath = path.join(paths.componentsDir, 'button-primary-v2.md');
      const markdown = fs.readFileSync(markdownPath, 'utf8');
      const parsed = parseMarkdownFrontmatter<Record<string, unknown>>(markdown);
      const figma = parsed.frontmatter.figma as Record<string, unknown>;
      assert.equal(typeof figma.component, 'string');
      assert.equal(String(figma.component), 'Button: Primary [v2]');
      assert.equal(String(figma.node_id), '10:1');
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      db.close();
    }
  });

  it('captures component variant proof images during component import when enabled', async () => {
    const db = createTestDb();
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-sync-complete-variants-'));
    let receivedEntries: Array<Record<string, unknown>> = [];
    try {
      const componentRepo = {
        deleteAll: () => 0,
        upsertFromRegistry: (_systemId: string, entries: Array<Record<string, unknown>>) => {
          receivedEntries = entries;
          return entries.length;
        },
        markMissingComponents: () => 0,
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
        components: [{ nodeId: '10:1', name: 'Button Primary' }],
        truncated: false,
      });

      const fetchComponentSpec = async () => ({
        success: true as const,
        variants: [
          { nodeId: '10:2', name: 'Size=Sm, State=Default' },
          { nodeId: '10:3', name: 'Size=Lg, State=Hover' },
        ],
      });

      const fetchComponentImages = async (
        _fileKey: string | null,
        params: { nodeIds: string[]; format?: 'PNG' | 'JPG' | 'SVG'; scale?: number },
      ) => {
        const images = params.nodeIds.map((nodeId) => ({
          nodeId,
          base64: Buffer.from(`png-${nodeId}`).toString('base64'),
          format: 'PNG',
        }));
        return {
          success: true,
          images,
          count: images.length,
          errors: 0,
        };
      };

      await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        captureComponentProofs: true,
        captureComponentProofVariants: true,
        dryRun: false,
        createRunId: () => 'run-components-complete-variants',
        fetchVariables,
        searchComponents,
        fetchComponentSpec,
        fetchComponentImages,
        repoRoot,
      });

      const paths = resolveSystemPaths('sys-01', repoRoot);
      const variantDir = path.join(paths.generatedDir, 'visual-proofs', 'images', 'variants');
      const variantFiles = fs.readdirSync(variantDir).filter((name) => name.startsWith('button-primary__'));
      assert.equal(variantFiles.length, 2);

      const button = receivedEntries[0] as Record<string, unknown>;
      const visualProofs = button.visualProofs as Array<{
        variantsCount?: number;
        variants?: Array<{ name?: string; image_path?: string | null }>;
      }>;
      assert.ok(Array.isArray(visualProofs));
      assert.equal(visualProofs[0].variantsCount, 2);
      assert.ok(Array.isArray(visualProofs[0].variants));
      assert.equal(visualProofs[0].variants?.length, 2);
      assert.ok(
        String(visualProofs[0].variants?.[0].image_path || '').includes(
          'design-systems/sys-01/docs/_generated/visual-proofs/images/variants/button-primary__',
        ),
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
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

  it('filters components by selectedComponentNodeIds in partial mode', async () => {
    const db = createTestDb();
    let markMissingCalls = 0;
    let upsertedCount = 0;
    try {
      const componentRepo = {
        deleteAll: () => 0,
        upsertFromRegistry: () => {
          upsertedCount += 1;
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
        components: [
          { nodeId: 'node-selected', name: 'Button' },
          { nodeId: 'node-skipped', name: 'Card' },
        ],
        truncated: false,
      });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        dryRun: false,
        selectedComponentNodeIds: ['node-selected'],
        createRunId: () => 'run-partial-import',
        fetchVariables,
        searchComponents,
      });

      assert.equal(upsertedCount, 1);
      assert.equal(result.importMode, 'partial');
      assert.equal(result.selectedCount, 1);
      assert.equal(result.notSelectedCount, 1);
      assert.equal(result.components, 1);
    } finally {
      db.close();
    }
  });

  it('imports selected components that appear in later paginated pages', async () => {
    const db = createTestDb();
    let upsertedCount = 0;
    const observedOffsets: number[] = [];
    try {
      const componentRepo = {
        deleteAll: () => 0,
        upsertFromRegistry: () => {
          upsertedCount += 1;
          return 1;
        },
        markMissingComponents: () => 0,
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

      const searchComponents = async (
        _fileKey: string | null,
        params: { offset?: number; limit?: number },
      ) => {
        const offset = Number(params.offset || 0);
        observedOffsets.push(offset);
        if (offset === 0) {
          return {
            components: [{ nodeId: 'node-page-1', name: 'Button' }],
            truncated: false,
            total: 2,
            hasMore: true,
            nextOffset: 1,
          };
        }
        return {
          components: [{ nodeId: 'node-page-2', name: 'Card' }],
          truncated: false,
          total: 2,
          hasMore: false,
          nextOffset: null,
        };
      };

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        dryRun: false,
        selectedComponentNodeIds: ['node-page-2'],
        createRunId: () => 'run-partial-paginated-selection',
        fetchVariables,
        searchComponents,
      });

      assert.deepEqual(observedOffsets, [0, 1]);
      assert.equal(upsertedCount, 1);
      assert.equal(result.importMode, 'partial');
      assert.equal(result.selectedCount, 1);
      assert.equal(result.notSelectedCount, 1);
      assert.equal(result.components, 1);
    } finally {
      db.close();
    }
  });

  it('does not request an extra page when scanned total is already exhausted', async () => {
    const db = createTestDb();
    const observedOffsets: number[] = [];
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

      const searchComponents = async (
        _fileKey: string | null,
        params: { offset?: number; limit?: number },
      ) => {
        const offset = Number(params.offset || 0);
        observedOffsets.push(offset);
        return {
          components: [{ nodeId: 'node-only', name: 'Button' }],
          truncated: false,
          total: 1,
          hasMore: undefined,
          nextOffset: null,
        };
      };

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: makeComponentRepoStub(),
        dsId: 'sys-01',
        figmaFileId: 'file-known-total',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-known-total',
        fetchVariables,
        searchComponents,
      });

      assert.equal(result.components, 1);
      assert.deepEqual(observedOffsets, [0]);
    } finally {
      db.close();
    }
  });

  it('returns full importMode when selectedComponentNodeIds is empty', async () => {
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

      const searchComponents = async () => ({
        components: [{ nodeId: '10:1', name: 'Button' }],
        truncated: false,
      });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: makeComponentRepoStub(),
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        dryRun: false,
        selectedComponentNodeIds: [],
        createRunId: () => 'run-full-empty-selection',
        fetchVariables,
        searchComponents,
      });

      assert.equal(result.importMode, 'full');
      assert.equal(result.selectedCount, 1);
      assert.equal(result.notSelectedCount, 0);
    } finally {
      db.close();
    }
  });

  it('returns partial mode with zero imported components when selected IDs do not match scan results', async () => {
    const db = createTestDb();
    let markMissingCalls = 0;
    try {
      const componentRepo = {
        deleteAll: () => 0,
        upsertFromRegistry: () => 0,
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
        components: [
          { nodeId: 'node-a', name: 'Button' },
          { nodeId: 'node-b', name: 'Card' },
        ],
        truncated: false,
      });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo,
        dsId: 'sys-01',
        figmaFileId: 'file_123',
        includeComponents: true,
        dryRun: false,
        selectedComponentNodeIds: ['node-missing'],
        createRunId: () => 'run-partial-no-match',
        fetchVariables,
        searchComponents,
      });

      assert.equal(result.importMode, 'partial');
      assert.equal(result.components, 0);
      assert.equal(result.selectedCount, 0);
      assert.equal(result.notSelectedCount, 2);
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

      const result = await syncDesignSystemFromPlugin({
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

  describe('Layer Token Mapping extraction (extractStructuredFigmaData)', () => {
    let db: Database.Database;
    let componentRepo: ComponentRepository;

    before(() => {
      db = createTestDb();
      componentRepo = new ComponentRepositoryClass(db);

      // Insert design system
      db.prepare("INSERT OR IGNORE INTO design_systems (id, name) VALUES ('ltm-sync-sys', 'LTM Sync Test')").run();

      // Insert a component to receive bindings
      db.prepare(`
        INSERT INTO components (ds_id, slug, name, status, doc_type, figma_component_set_node_id)
        VALUES ('ltm-sync-sys', 'ltm-test', 'LTM Test', 'draft', 'component', '100:1')
      `).run();
    });

    after(() => {
      if (db) db.close();
    });

    it('extracts layerTokens from variants with variant context fields', async () => {
      let receivedEntries: Array<Record<string, unknown>> = [];

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'mode:1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/accent',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { 'mode:1': { r: 0.39, g: 0.4, b: 0.95, a: 1 } },
            },
          },
        });

      const searchComponents = async () => ({
        components: [{ nodeId: '100:1', name: 'LTM Test' }],
        truncated: false,
      });

      const fetchFullComponentSpec = async (_fileKey: string | null, params: { nodeId: string }) => ({
        success: true,
        nodeId: params.nodeId,
        name: 'LTM Test',
        type: 'COMPONENT_SET',
        description: 'Test component',
        variants: [
          {
            key: 'State=Default',
            nodeId: '101:1',
            name: 'Default',
            variantProperties: { State: 'Default' },
            layerTokens: [
              { nodeId: '102:1', nodeName: 'Background', field: 'fills', variableId: 'v1' },
            ],
          },
          {
            key: 'State=Hover',
            nodeId: '101:2',
            name: 'Hover',
            variantProperties: { State: 'Hover' },
            layerTokens: [
              { nodeId: '102:1', nodeName: 'Background', field: 'fills', variableId: 'v1' },
            ],
          },
        ],
        variantAxes: [{ name: 'State', values: ['Default', 'Hover'] }],
        props: [],
        states: [],
        tokenBindings: [],
      });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: {
          deleteAll: () => 0,
          upsertFromRegistry: (_sysId: string, entries: Array<Record<string, unknown>>) => {
            receivedEntries = entries;
            return componentRepo.upsertFromRegistry('ltm-sync-sys', entries as any);
          },
          markMissingComponents: () => 0,
        } as unknown as ComponentRepository,
        dsId: 'ltm-sync-sys',
        figmaFileId: 'file_ltm',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-ltm',
        fetchVariables,
        searchComponents,
        fetchFullComponentSpec,
        enrichComponentSpecConcurrency: 1,
      });

      assert.ok(result);
      // specsEnriched = number of components that had markdown specs found on disk
      // The structured data capture happened regardless
      assert.ok(result.dryRun === false);

      // Verify the entry has tokenBindings with variant context
      assert.equal(receivedEntries.length, 1);
      const entry = receivedEntries[0] as Record<string, any>;
      assert.ok(entry.figma);
      assert.ok(Array.isArray(entry.figma.tokenBindings));
      assert.equal(entry.figma.tokenBindings.length, 2);

      // Check variant context is present
      const defaultBinding = entry.figma.tokenBindings.find(
        (b: any) => b.variantSignature?.includes('State=Default'),
      );
      assert.ok(defaultBinding);
      assert.equal(defaultBinding.variantNodeId, '101:1');
      assert.equal(defaultBinding.propertyPath, 'fills');
      assert.equal(defaultBinding.status, 'resolved');
      assert.equal(defaultBinding.modeId, 'mode:1');
      assert.equal(defaultBinding.modeName, 'Default');
      // Variable name 'color/accent' is converted to 'color.accent' by toTokenPaths
      assert.equal(defaultBinding.tokenPath, 'color.accent');

      const hoverBinding = entry.figma.tokenBindings.find(
        (b: any) => b.variantSignature?.includes('State=Hover'),
      );
      assert.ok(hoverBinding);
      assert.equal(hoverBinding.variantNodeId, '101:2');
    });

    it('marks bindings with unknown variableId as unresolved', async () => {
      let receivedEntries: Array<Record<string, unknown>> = [];

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'mode:1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/accent',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { 'mode:1': { r: 0.39, g: 0.4, b: 0.95, a: 1 } },
            },
          },
        });

      const searchComponents = async () => ({
        components: [{ nodeId: '200:1', name: 'Unresolved Test' }],
        truncated: false,
      });

      db.prepare(`
        INSERT INTO components (ds_id, slug, name, status, doc_type, figma_component_set_node_id)
        VALUES ('ltm-sync-sys', 'unresolved-test', 'Unresolved Test', 'draft', 'component', '200:1')
      `).run();

      const fetchFullComponentSpec = async () => ({
        success: true,
        nodeId: '200:1',
        name: 'Unresolved Test',
        type: 'COMPONENT_SET',
        description: null,
        variants: [
          {
            key: 'Size=MD',
            nodeId: '201:1',
            name: 'MD',
            variantProperties: { Size: 'MD' },
            layerTokens: [
              { nodeId: '202:1', nodeName: 'Icon', field: 'fills', variableId: 'unknown:var' },
            ],
          },
        ],
        variantAxes: [{ name: 'Size', values: ['MD'] }],
        props: [],
        states: [],
        tokenBindings: [],
      });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: {
          deleteAll: () => 0,
          upsertFromRegistry: (_sysId: string, entries: Array<Record<string, unknown>>) => {
            receivedEntries = entries;
            return componentRepo.upsertFromRegistry('ltm-sync-sys', entries as any);
          },
          markMissingComponents: () => 0,
        } as unknown as ComponentRepository,
        dsId: 'ltm-sync-sys',
        figmaFileId: 'file_unresolved',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-unresolved',
        fetchVariables,
        searchComponents,
        fetchFullComponentSpec,
        enrichComponentSpecConcurrency: 1,
      });

      assert.ok(result);
      assert.equal(receivedEntries.length, 1);
      const entry = receivedEntries[0] as Record<string, any>;
      assert.equal(entry.figma.tokenBindings.length, 1);
      assert.equal(entry.figma.tokenBindings[0].status, 'unresolved');
      assert.equal(entry.figma.tokenBindings[0].tokenPath, undefined);
    });

    it('returns empty tokenBindings when no layerTokens exist (no fallback to flat tokenBindings)', async () => {
      let receivedEntries: Array<Record<string, unknown>> = [];

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'mode:1', name: 'Default' }] },
          },
          variables: {
            v2: {
              id: 'v2',
              name: 'spacing/md',
              variableCollectionId: 'col1',
              resolvedType: 'FLOAT',
              valuesByMode: { 'mode:1': 16 },
            },
          },
        });

      const searchComponents = async () => ({
        components: [{ nodeId: '300:1', name: 'No LayerTokens Test' }],
        truncated: false,
      });

      db.prepare(`
        INSERT INTO components (ds_id, slug, name, status, doc_type, figma_component_set_node_id)
        VALUES ('ltm-sync-sys', 'no-layer-test', 'No LayerTokens Test', 'draft', 'component', '300:1')
      `).run();

      // Spec has flat tokenBindings but NO layerTokens on any variant
      const fetchFullComponentSpec = async () => ({
        success: true,
        nodeId: '300:1',
        name: 'No LayerTokens Test',
        type: 'COMPONENT_SET',
        description: null,
        variants: [],
        variantAxes: [],
        props: [],
        states: [],
        tokenBindings: [
          { nodeId: '301:1', nodeName: 'Container', field: 'padding', variableId: 'v2' },
        ],
      });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: {
          deleteAll: () => 0,
          upsertFromRegistry: (_sysId: string, entries: Array<Record<string, unknown>>) => {
            receivedEntries = entries;
            return componentRepo.upsertFromRegistry('ltm-sync-sys', entries as any);
          },
          markMissingComponents: () => 0,
        } as unknown as ComponentRepository,
        dsId: 'ltm-sync-sys',
        figmaFileId: 'file_no_layer',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-no-layer',
        fetchVariables,
        searchComponents,
        fetchFullComponentSpec,
        enrichComponentSpecConcurrency: 1,
      });

      assert.ok(result);
      assert.equal(receivedEntries.length, 1);
      const entry = receivedEntries[0] as Record<string, any>;
      // No layerTokens → no tokenBindings extracted (no fallback)
      assert.ok(
        entry.figma.tokenBindings === undefined ||
        (Array.isArray(entry.figma.tokenBindings) && entry.figma.tokenBindings.length === 0),
        'Should NOT fallback to flat tokenBindings',
      );
    });

    it('derives enum property values from variant axes when props.values is missing', async () => {
      let receivedEntries: Array<Record<string, unknown>> = [];

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'mode:1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/accent',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { 'mode:1': { r: 0.39, g: 0.4, b: 0.95, a: 1 } },
            },
          },
        });

      const searchComponents = async () => ({
        components: [{ nodeId: '400:1', name: 'Variant Values Test' }],
        truncated: false,
      });

      db.prepare(`
        INSERT INTO components (ds_id, slug, name, status, doc_type, figma_component_set_node_id)
        VALUES ('ltm-sync-sys', 'variant-values-test', 'Variant Values Test', 'draft', 'component', '400:1')
      `).run();

      const fetchFullComponentSpec = async () => ({
        success: true,
        nodeId: '400:1',
        name: 'Variant Values Test',
        type: 'COMPONENT_SET',
        description: null,
        variants: [
          {
            key: 'Variant=Default',
            nodeId: '401:1',
            name: 'Default',
            variantProperties: { Variant: 'Default' },
            layerTokens: [],
          },
          {
            key: 'Variant=Accent',
            nodeId: '401:2',
            name: 'Accent',
            variantProperties: { Variant: 'Accent' },
            layerTokens: [],
          },
        ],
        variantAxes: [{ name: 'Variant', values: ['Default', 'Accent'] }],
        props: [{ name: 'Variant', type: 'VARIANT', defaultValue: 'Default' }],
        states: [],
        tokenBindings: [],
      });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: {
          deleteAll: () => 0,
          upsertFromRegistry: (_sysId: string, entries: Array<Record<string, unknown>>) => {
            receivedEntries = entries;
            return componentRepo.upsertFromRegistry('ltm-sync-sys', entries as any);
          },
          markMissingComponents: () => 0,
        } as unknown as ComponentRepository,
        dsId: 'ltm-sync-sys',
        figmaFileId: 'file_variant_values',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-variant-values',
        fetchVariables,
        searchComponents,
        fetchFullComponentSpec,
        enrichComponentSpecConcurrency: 1,
      });

      assert.ok(result);
      assert.equal(receivedEntries.length, 1);
      const entry = receivedEntries[0] as Record<string, any>;
      assert.ok(Array.isArray(entry.figma.props));
      assert.equal(entry.figma.props.length, 1);
      assert.deepEqual(entry.figma.props[0].values, ['Default', 'Accent']);
    });

    it('does not infer enum property values when props.values is explicitly an empty array', async () => {
      let receivedEntries: Array<Record<string, unknown>> = [];

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'mode:1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/accent',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { 'mode:1': { r: 0.39, g: 0.4, b: 0.95, a: 1 } },
            },
          },
        });

      const searchComponents = async () => ({
        components: [{ nodeId: '500:1', name: 'Explicit Empty Values Test' }],
        truncated: false,
      });

      db.prepare(`
        INSERT INTO components (ds_id, slug, name, status, doc_type, figma_component_set_node_id)
        VALUES ('ltm-sync-sys', 'explicit-empty-values-test', 'Explicit Empty Values Test', 'draft', 'component', '500:1')
      `).run();

      const fetchFullComponentSpec = async () => ({
        success: true,
        nodeId: '500:1',
        name: 'Explicit Empty Values Test',
        type: 'COMPONENT_SET',
        description: null,
        variants: [
          {
            key: 'Variant=Default',
            nodeId: '501:1',
            name: 'Default',
            variantProperties: { Variant: 'Default' },
            layerTokens: [],
          },
          {
            key: 'Variant=Accent',
            nodeId: '501:2',
            name: 'Accent',
            variantProperties: { Variant: 'Accent' },
            layerTokens: [],
          },
        ],
        variantAxes: [{ name: 'Variant', values: ['Default', 'Accent'] }],
        props: [{ name: 'Variant', type: 'VARIANT', values: [], defaultValue: 'Default' }],
        states: [],
        tokenBindings: [],
      });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: {
          deleteAll: () => 0,
          upsertFromRegistry: (_sysId: string, entries: Array<Record<string, unknown>>) => {
            receivedEntries = entries;
            return componentRepo.upsertFromRegistry('ltm-sync-sys', entries as any);
          },
          markMissingComponents: () => 0,
        } as unknown as ComponentRepository,
        dsId: 'ltm-sync-sys',
        figmaFileId: 'file_explicit_empty_values',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-explicit-empty-values',
        fetchVariables,
        searchComponents,
        fetchFullComponentSpec,
        enrichComponentSpecConcurrency: 1,
      });

      assert.ok(result);
      assert.equal(receivedEntries.length, 1);
      const entry = receivedEntries[0] as Record<string, any>;
      assert.ok(Array.isArray(entry.figma.props));
      assert.equal(entry.figma.props.length, 1);
      assert.equal(entry.figma.props[0].values, undefined);
    });

    it('does not infer enum property values when props.values is explicitly null', async () => {
      let receivedEntries: Array<Record<string, unknown>> = [];

      const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
        buildVariablesPayload({
          collections: {
            col1: { id: 'col1', name: 'Primitives', modes: [{ modeId: 'mode:1', name: 'Default' }] },
          },
          variables: {
            v1: {
              id: 'v1',
              name: 'color/accent',
              variableCollectionId: 'col1',
              resolvedType: 'COLOR',
              valuesByMode: { 'mode:1': { r: 0.39, g: 0.4, b: 0.95, a: 1 } },
            },
          },
        });

      const searchComponents = async () => ({
        components: [{ nodeId: '600:1', name: 'Explicit Null Values Test' }],
        truncated: false,
      });

      db.prepare(`
        INSERT INTO components (ds_id, slug, name, status, doc_type, figma_component_set_node_id)
        VALUES ('ltm-sync-sys', 'explicit-null-values-test', 'Explicit Null Values Test', 'draft', 'component', '600:1')
      `).run();

      const fetchFullComponentSpec = async () => ({
        success: true,
        nodeId: '600:1',
        name: 'Explicit Null Values Test',
        type: 'COMPONENT_SET',
        description: null,
        variants: [
          {
            key: 'Variant=Default',
            nodeId: '601:1',
            name: 'Default',
            variantProperties: { Variant: 'Default' },
            layerTokens: [],
          },
          {
            key: 'Variant=Accent',
            nodeId: '601:2',
            name: 'Accent',
            variantProperties: { Variant: 'Accent' },
            layerTokens: [],
          },
        ],
        variantAxes: [{ name: 'Variant', values: ['Default', 'Accent'] }],
        props: [{ name: 'Variant', type: 'VARIANT', values: null, defaultValue: 'Default' }],
        states: [],
        tokenBindings: [],
      });

      const result = await syncDesignSystemFromPlugin({
        db,
        componentRepo: {
          deleteAll: () => 0,
          upsertFromRegistry: (_sysId: string, entries: Array<Record<string, unknown>>) => {
            receivedEntries = entries;
            return componentRepo.upsertFromRegistry('ltm-sync-sys', entries as any);
          },
          markMissingComponents: () => 0,
        } as unknown as ComponentRepository,
        dsId: 'ltm-sync-sys',
        figmaFileId: 'file_explicit_null_values',
        includeComponents: true,
        dryRun: false,
        createRunId: () => 'run-explicit-null-values',
        fetchVariables,
        searchComponents,
        fetchFullComponentSpec,
        enrichComponentSpecConcurrency: 1,
      });

      assert.ok(result);
      assert.equal(receivedEntries.length, 1);
      const entry = receivedEntries[0] as Record<string, any>;
      assert.ok(Array.isArray(entry.figma.props));
      assert.equal(entry.figma.props.length, 1);
      assert.equal(entry.figma.props[0].values, undefined);
    });
  });

  describe('strict proof validation', () => {
    it('succeeds when all components have main proofs in strict mode', async () => {
      const db = createTestDb();
      try {
        const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
          buildVariablesPayload({
            collections: {},
            variables: {},
          });

        const searchComponents = async () => ({
          components: [{ nodeId: '10:1', name: 'Button', pageName: 'Components' }],
          truncated: false,
          total: 1,
          hasMore: false,
          nextOffset: null,
        });

        const result = await syncDesignSystemFromPlugin({
          db,
          componentRepo: makeComponentRepoStub(),
          dsId: 'strict-sys',
          figmaFileId: 'file-strict',
          includeComponents: true,
          dryRun: true,
          requireComponentProofs: true,
          requireVariantProofsWhenPresent: true,
          createRunId: () => 'run-strict-success',
          fetchVariables,
          searchComponents,
        });

        assert.ok(result);
        assert.equal(result.importMode, 'full');
      } finally {
        db.close();
      }
    });

    it('fails with component_proofs_required_failed when main proof missing', async () => {
      const db = createTestDb();
      try {
        const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
          buildVariablesPayload({
            collections: {},
            variables: {},
          });

        const searchComponents = async () => ({
          components: [{ nodeId: '10:1', name: 'Button', pageName: 'Components' }],
          truncated: false,
          total: 1,
          hasMore: false,
          nextOffset: null,
        });

        // Simulate a scenario where proof capture would fail (no repoRoot means no proof capture)
        await assert.rejects(
          async () => {
            await syncDesignSystemFromPlugin({
              db,
              componentRepo: makeComponentRepoStub(),
              dsId: 'strict-fail-sys',
              figmaFileId: 'file-strict-fail',
              includeComponents: true,
              dryRun: false,
              requireComponentProofs: true,
              requireVariantProofsWhenPresent: true,
              createRunId: () => 'run-strict-fail',
              fetchVariables,
              searchComponents,
              // No repoRoot means proofs won't be captured, triggering validation failure
            });
          },
          (err: any) => {
            assert.equal(err.code, 'sync.component_proofs_required_failed');
            assert.ok(err.context.missingMainProofSlugs.length > 0);
            return true;
          },
        );
      } finally {
        db.close();
      }
    });

    it('returns structured proof error when strict main proof capture fails early', async () => {
      const db = createTestDb();
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-strict-main-capture-fail-'));
      try {
        const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
          buildVariablesPayload({ collections: {}, variables: {} });

        const searchComponents = async () => ({
          components: [{ nodeId: '10:1', name: 'Button', pageName: 'Components' }],
          truncated: false,
          total: 1,
          hasMore: false,
          nextOffset: null,
        });

        const fetchComponentImages = async () => {
          throw new Error('plugin transport unavailable');
        };

        await assert.rejects(
          async () => {
            await syncDesignSystemFromPlugin({
              db,
              componentRepo: makeComponentRepoStub(),
              dsId: 'strict-main-capture-fail-sys',
              figmaFileId: 'file-strict-main-capture-fail',
              includeComponents: true,
              dryRun: false,
              requireComponentProofs: true,
              requireVariantProofsWhenPresent: false,
              captureComponentProofs: true,
              createRunId: () => 'run-strict-main-capture-fail',
              fetchVariables,
              searchComponents,
              fetchComponentImages: fetchComponentImages as any,
              repoRoot,
            });
          },
          (err: any) => {
            assert.equal(err.code, 'sync.component_proofs_required_failed');
            assert.equal(err.context.proofCaptureStage, 'main_capture');
            assert.match(String(err.context.captureFailureReason || ''), /plugin transport unavailable/i);
            return true;
          },
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
        db.close();
      }
    });

    it('truncates strict-proof error slug payloads while preserving totals', async () => {
      const db = createTestDb();
      try {
        const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
          buildVariablesPayload({
            collections: {},
            variables: {},
          });

        const searchComponents = async () => ({
          components: Array.from({ length: 150 }, (_value, index) => ({
            nodeId: `10:${index + 1}`,
            name: `Component ${index + 1}`,
            pageName: 'Components',
          })),
          truncated: false,
          total: 150,
          hasMore: false,
          nextOffset: null,
        });

        await assert.rejects(
          async () => {
            await syncDesignSystemFromPlugin({
              db,
              componentRepo: makeComponentRepoStub(),
              dsId: 'strict-large-fail-sys',
              figmaFileId: 'file-strict-large-fail',
              includeComponents: true,
              dryRun: false,
              requireComponentProofs: true,
              requireVariantProofsWhenPresent: false,
              createRunId: () => 'run-strict-large-fail',
              fetchVariables,
              searchComponents,
            });
          },
          (err: any) => {
            assert.equal(err.code, 'sync.component_proofs_required_failed');
            assert.equal(err.context.totalMissingMainProofs, 150);
            assert.equal(err.context.missingMainProofSlugs.length, 100);
            return true;
          },
        );
      } finally {
        db.close();
      }
    });

    it('partial import validates only selected components', async () => {
      const db = createTestDb();
      try {
        const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
          buildVariablesPayload({
            collections: {},
            variables: {},
          });

        const searchComponents = async () => ({
          components: [
            { nodeId: 'node-selected', name: 'Button', pageName: 'Components' },
            { nodeId: 'node-skipped', name: 'Card', pageName: 'Components' },
          ],
          truncated: false,
          total: 2,
          hasMore: false,
          nextOffset: null,
        });

        // Without repoRoot, proofs won't be captured → strict mode should fail
        // But the failure should only reference the selected component
        await assert.rejects(
          async () => {
            await syncDesignSystemFromPlugin({
              db,
              componentRepo: makeComponentRepoStub(),
              dsId: 'partial-strict-sys',
              figmaFileId: 'file-partial-strict',
              includeComponents: true,
              dryRun: false,
              requireComponentProofs: true,
              requireVariantProofsWhenPresent: true,
              selectedComponentNodeIds: ['node-selected'],
              createRunId: () => 'run-partial-strict',
              fetchVariables,
              searchComponents,
            });
          },
          (err: any) => {
            assert.equal(err.code, 'sync.component_proofs_required_failed');
            // Should only report the selected component, not the skipped one
            assert.deepEqual(err.context.missingMainProofSlugs, ['button']);
            assert.equal(err.context.importMode, 'partial');
            return true;
          },
        );
      } finally {
        db.close();
      }
    });

    it('fails when variants exist but one or more variant screenshots are missing', async () => {
      const db = createTestDb();
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-strict-missing-variants-'));
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

        const searchComponents = async () => ({
          components: [{ nodeId: '10:1', name: 'Button', pageName: 'Components' }],
          truncated: false,
          total: 1,
          hasMore: false,
          nextOffset: null,
        });

        const fetchComponentSpec = async () => ({
          success: true as const,
          variants: [
            { nodeId: '10:2', name: 'State=Primary' },
            { nodeId: '10:3', name: 'State=Secondary' },
          ],
        });

        const fetchComponentImages = async (
          _fileKey: string | null,
          params: { nodeIds: string[]; format?: 'PNG' | 'JPG' | 'SVG'; scale?: number },
        ) => {
          // Main screenshot always succeeds (node 10:1).
          // Variants: only Primary is returned, Secondary is intentionally missing.
          const images = params.nodeIds
            .filter((nodeId) => nodeId === '10:1' || nodeId === '10:2')
            .map((nodeId) => ({
              nodeId,
              base64: Buffer.from(`png-${nodeId}`).toString('base64'),
              format: 'PNG',
            }));
          return {
            success: true,
            images,
            count: images.length,
            errors: Math.max(0, params.nodeIds.length - images.length),
          };
        };

        await assert.rejects(
          async () => {
            await syncDesignSystemFromPlugin({
              db,
              componentRepo: makeComponentRepoStub(),
              dsId: 'sys-01',
              figmaFileId: 'file-strict-missing-variants',
              includeComponents: true,
              dryRun: false,
              requireComponentProofs: true,
              requireVariantProofsWhenPresent: true,
              captureComponentProofs: true,
              captureComponentProofVariants: true,
              createRunId: () => 'run-strict-missing-variants',
              fetchVariables,
              searchComponents,
              fetchComponentSpec,
              fetchFullComponentSpec: fetchComponentSpec,
              fetchComponentImages,
              repoRoot,
            });
          },
          (err: any) => {
            assert.equal(err.code, 'sync.component_proofs_required_failed');
            assert.ok(Array.isArray(err.context.missingVariantProofSlugs));
            assert.equal(err.context.missingVariantProofSlugs.length, 1);
            assert.equal(err.context.missingVariantProofSlugs[0].slug, 'button');
            assert.ok(err.context.missingVariantProofSlugs[0].missingVariants.includes('state secondary'));
            return true;
          },
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
        db.close();
      }
    });

    it('truncates per-component missing variant names and preserves totalMissingVariants', async () => {
      const db = createTestDb();
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-strict-missing-variants-truncated-'));
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

        const searchComponents = async () => ({
          components: [{ nodeId: '10:1', name: 'Button', pageName: 'Components' }],
          truncated: false,
          total: 1,
          hasMore: false,
          nextOffset: null,
        });

        const fetchComponentSpec = async () => ({
          success: true as const,
          variants: Array.from({ length: 35 }, (_value, index) => ({
            nodeId: `10:${index + 2}`,
            name: `State=Variant${index + 1}`,
          })),
        });

        const fetchComponentImages = async (
          _fileKey: string | null,
          params: { nodeIds: string[]; format?: 'PNG' | 'JPG' | 'SVG'; scale?: number },
        ) => {
          // Only main image available; all variants will be missing.
          const images = params.nodeIds
            .filter((nodeId) => nodeId === '10:1')
            .map((nodeId) => ({
              nodeId,
              base64: Buffer.from(`png-${nodeId}`).toString('base64'),
              format: 'PNG',
            }));
          return {
            success: true,
            images,
            count: images.length,
            errors: Math.max(0, params.nodeIds.length - images.length),
          };
        };

        await assert.rejects(
          async () => {
            await syncDesignSystemFromPlugin({
              db,
              componentRepo: makeComponentRepoStub(),
              dsId: 'sys-01',
              figmaFileId: 'file-strict-missing-variants-truncated',
              includeComponents: true,
              dryRun: false,
              requireComponentProofs: true,
              requireVariantProofsWhenPresent: true,
              captureComponentProofs: true,
              captureComponentProofVariants: true,
              createRunId: () => 'run-strict-missing-variants-truncated',
              fetchVariables,
              searchComponents,
              fetchComponentSpec,
              fetchFullComponentSpec: fetchComponentSpec,
              fetchComponentImages,
              repoRoot,
            });
          },
          (err: any) => {
            assert.equal(err.code, 'sync.component_proofs_required_failed');
            assert.equal(err.context.missingVariantProofSlugs.length, 1);
            assert.equal(err.context.missingVariantProofSlugs[0].slug, 'button');
            assert.equal(err.context.missingVariantProofSlugs[0].missingVariants.length, 20);
            assert.equal(err.context.missingVariantProofSlugs[0].totalMissingVariants, 35);
            return true;
          },
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
        db.close();
      }
    });

    it('fails early when strict variant expectation fallback exceeds operational lookup limit', async () => {
      const db = createTestDb();
      try {
        const fetchVariables = async (): Promise<FigmaVariablesResponse> =>
          buildVariablesPayload({
            collections: {},
            variables: {},
          });

        const searchComponents = async (
          _fileKey: string | null,
          params: { offset?: number; limit?: number },
        ) => {
          const offset = Math.max(0, Number(params.offset || 0));
          const limit = Math.max(1, Number(params.limit || 500));
          const total = 1005;
          const end = Math.min(total, offset + limit);
          return {
            components: Array.from({ length: Math.max(0, end - offset) }, (_value, index) => ({
              nodeId: `10:${offset + index + 1}`,
              name: `Component ${offset + index + 1}`,
              pageName: 'Components',
            })),
            truncated: false,
            total,
            hasMore: end < total,
            nextOffset: end < total ? end : null,
          };
        };

        let lookupCalls = 0;
        const fetchFullComponentSpec = async () => {
          lookupCalls += 1;
          return {
            success: true as const,
            variants: [],
          };
        };

        await assert.rejects(
          async () => {
            await syncDesignSystemFromPlugin({
              db,
              componentRepo: makeComponentRepoStub(),
              dsId: 'sys-01',
              figmaFileId: 'file-strict-fallback-guardrail',
              includeComponents: true,
              dryRun: false,
              requireComponentProofs: false,
              requireVariantProofsWhenPresent: true,
              captureComponentProofs: false,
              captureComponentProofVariants: false,
              createRunId: () => 'run-strict-fallback-guardrail',
              fetchVariables,
              searchComponents,
              fetchFullComponentSpec,
            });
          },
          (err: any) => {
            assert.equal(err.code, 'sync.component_proofs_required_failed');
            assert.equal(err.context.fallbackSpecLookupLimit, 1000);
            assert.ok(Number(err.context.fallbackSpecLookups) >= 1000);
            assert.match(String(err.message || ''), /strict variant screenshot validation stopped/i);
            return true;
          },
        );

        assert.ok(lookupCalls >= 1000);
      } finally {
        db.close();
      }
    });

    it('succeeds with dryRun false when main and variant proofs are present', async () => {
      const db = createTestDb();
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-strict-success-'));
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

        const searchComponents = async () => ({
          components: [{ nodeId: '10:1', name: 'Button', pageName: 'Components' }],
          truncated: false,
          total: 1,
          hasMore: false,
          nextOffset: null,
        });

        const fetchComponentSpec = async () => ({
          success: true as const,
          variants: [
            { nodeId: '10:2', name: 'State=Primary' },
            { nodeId: '10:3', name: 'State=Secondary' },
          ],
        });

        // Return images for main component AND variant nodes
        const fetchComponentImages = async (
          _fileKey: string | null,
          params: { nodeIds: string[]; format?: 'PNG' | 'JPG' | 'SVG'; scale?: number },
        ) => {
          const images = params.nodeIds.map((nodeId) => ({
            nodeId,
            base64: Buffer.from(`png-${nodeId}`).toString('base64'),
            format: 'PNG',
          }));
          return {
            success: true,
            images,
            count: images.length,
            errors: 0,
          };
        };

        const result = await syncDesignSystemFromPlugin({
          db,
          componentRepo: makeComponentRepoStub(),
          dsId: 'sys-01',
          figmaFileId: 'file-strict-success',
          includeComponents: true,
          dryRun: false,
          requireComponentProofs: true,
          requireVariantProofsWhenPresent: true,
          captureComponentProofs: true,
          captureComponentProofVariants: true,
          createRunId: () => 'run-strict-success-real',
          fetchVariables,
          searchComponents,
          fetchComponentSpec,
          fetchFullComponentSpec: fetchComponentSpec,
          fetchComponentImages,
          repoRoot,
        });

        assert.ok(result);
        assert.equal(result.importMode, 'full');
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
        db.close();
      }
    });
  });

});
