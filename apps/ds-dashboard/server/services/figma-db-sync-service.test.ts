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

});
