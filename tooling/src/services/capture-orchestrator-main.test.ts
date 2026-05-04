import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runCaptureFromFigmaUrl } from './capture-orchestrator-main.js';

describe('runCaptureFromFigmaUrl', () => {
  it('falls back to published Figma components when the file tree has no component nodes', async () => {
    const buildCaptureTargetsCalls: Array<{ sourceCandidates: Array<Record<string, unknown>> }> = [];
    const fetchFigmaFileComponentsCalls: Array<{ fileKey: string }> = [];

    const result = await runCaptureFromFigmaUrl(
      {
        url: 'https://www.figma.com/design/abc123/Test-File',
        'figma-token': 'figma-token',
        'component-kind': 'all',
        'main-capture-mode': 'rest',
        'tokens-source': 'mcp',
        'skip-db-persistence': 'true',
      },
      {
        createPipelineContext: async () => ({
          system: {
            id: 'sys-01',
            repoRoot: '/repo',
            figmaFileId: 'abc123',
            captureFromFigmaUrlScriptPath: 'tooling/src/runners/capture-from-figma-url-runner.ts',
            paths: {
              docs: '/repo/design-systems/sys-01/docs',
              generated: '/repo/design-systems/sys-01/output',
            },
          } as any,
          paths: {
            docsRootOverride: '/repo/design-systems/sys-01/docs',
            proofDir: '/repo/design-systems/sys-01/output/visual-proofs',
            proofImageDir: '/repo/design-systems/sys-01/output/visual-proofs/images',
            resolvedSpecRoot: '/repo/design-systems/sys-01/docs',
          } as any,
          flags: {
            componentSlugOverride: '',
            componentKind: 'all',
            includeVariants: false,
            continueOnError: true,
            dryRun: false,
            includeSpecExhibits: false,
            variantLimit: 6,
            scale: 2,
            format: 'png',
            agent: 'auto',
            mainCaptureMode: 'rest',
            tokensSource: 'mcp',
            force: false,
            skipValidation: false,
            allowNonEvidenceUpdates: false,
            skipDbPersistence: true,
          },
          argsRaw: {},
          id: 'sys-01',
          fileKey: 'abc123',
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
          fileSlug: 'Test-File',
          fileName: 'Test-File',
          surface: 'design',
          rootNodeId: '',
        } as any),
        orchestrateTokenSyncFn: async () => ({ tokenBootstrap: { ok: true } }),
        createCaptureServicesFn: () => ({
          readComponentRegistry: async () => [],
          readMarkdownContent: () => '',
          markdownExists: () => false,
          specExists: () => true,
          runScriptJson: () => ({}),
          fetchFigmaFile: async () => ({}) as any,
          fetchFigmaNodes: async () => ({}) as any,
          fetchFigmaImages: async () => ({}) as any,
          stderrWrite: () => {},
          extractComponentSpec: (() => ({})) as any,
        }),
        configureFigmaContextFn: () => ({
          ensureFilePayload: async () => ({ document: { id: 'root', type: 'CANVAS', name: 'Root' } }),
          resolveContext: async () => ({
            componentMap: {
              fileKey: 'abc123',
              fileName: 'Test-File',
              fileSlug: 'Test-File',
              surface: 'design',
              rootNodeId: '',
              figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
              components: [],
              componentSets: [],
              pages: [],
              tree_contains: [],
              instance_uses: [],
              unresolved_instance_uses: [],
              dependency_edges: [],
            },
            singleNodeCandidate: null,
          }),
          getFilePayload: () => null,
        }),
        fetchFigmaFileComponentsFn: async ({ fileKey }) => {
          fetchFigmaFileComponentsCalls.push({ fileKey });
          return {
            status: 200,
            error: false,
            meta: {
              components: [
                {
                  key: 'component-key',
                  name: 'Primary Button',
                  node_id: '111:222',
                  description: '',
                  componentSetId: '111:222',
                },
              ],
            },
          };
        },
        buildCaptureTargetsFn: async ({ sourceCandidates }) => {
          buildCaptureTargetsCalls.push({ sourceCandidates: sourceCandidates as Array<Record<string, unknown>> });
          return {
            targets: sourceCandidates.map((candidate) => ({
              slug: String(candidate.name || 'primary_button').toLowerCase().replace(/\s+/g, '_'),
              nodeId: String(candidate.node_id || ''),
              nodeUrl: 'https://www.figma.com/file/abc123/Test-File?node-id=111:222&surface=design',
              name: String(candidate.name || 'Primary Button'),
              kind: 'component',
              pageName: null,
              specExists: true,
              specExhibits: null,
            })),
            skipped: [],
          };
        },
        executeCaptureBatchAndRefreshFn: () => ({
          ok: true,
          captured: [{ slug: 'primary_button' }],
          failed: [],
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(fetchFigmaFileComponentsCalls.length, 1);
    assert.equal(buildCaptureTargetsCalls.length, 1);
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates.length, 1);
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates[0]?.node_id, '111:222');
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates[0]?.name, 'Primary Button');
  });

  it('does not use published components or registry candidates for filtered component kinds', async () => {
    const buildCaptureTargetsCalls: Array<{ sourceCandidates: Array<Record<string, unknown>> }> = [];
    let fallbackCalled = false;

    const result = await runCaptureFromFigmaUrl(
      {
        url: 'https://www.figma.com/design/abc123/Test-File',
        'figma-token': 'figma-token',
        'component-kind': 'component_set',
        'main-capture-mode': 'rest',
        'tokens-source': 'mcp',
        'skip-db-persistence': 'true',
      },
      {
        createPipelineContext: async () => ({
          system: {
            id: 'sys-01',
            repoRoot: '/repo',
            figmaFileId: 'abc123',
            captureFromFigmaUrlScriptPath: 'tooling/src/runners/capture-from-figma-url-runner.ts',
            paths: {
              docs: '/repo/design-systems/sys-01/docs',
              generated: '/repo/design-systems/sys-01/output',
            },
          } as any,
          paths: {
            docsRootOverride: '/repo/design-systems/sys-01/docs',
            proofDir: '/repo/design-systems/sys-01/output/visual-proofs',
            proofImageDir: '/repo/design-systems/sys-01/output/visual-proofs/images',
            resolvedSpecRoot: '/repo/design-systems/sys-01/docs',
          } as any,
          flags: {
            componentSlugOverride: '',
            componentKind: 'component_set',
            includeVariants: false,
            continueOnError: true,
            dryRun: false,
            includeSpecExhibits: false,
            variantLimit: 6,
            scale: 2,
            format: 'png',
            agent: 'auto',
            mainCaptureMode: 'rest',
            tokensSource: 'mcp',
            force: false,
            skipValidation: false,
            allowNonEvidenceUpdates: false,
            skipDbPersistence: true,
          },
          argsRaw: {},
          id: 'sys-01',
          fileKey: 'abc123',
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
          fileSlug: 'Test-File',
          fileName: 'Test-File',
          surface: 'design',
          rootNodeId: '',
        } as any),
        orchestrateTokenSyncFn: async () => ({ tokenBootstrap: { ok: true } }),
        createCaptureServicesFn: () => ({
          readComponentRegistry: async () => [
            {
              slug: 'button',
              figma: {
                component_set_node_id: '1:23',
              },
            },
          ],
          readMarkdownContent: () => '',
          markdownExists: () => false,
          specExists: () => true,
          runScriptJson: () => ({}),
          fetchFigmaFile: async () => ({}) as any,
          fetchFigmaNodes: async () => ({}) as any,
          fetchFigmaImages: async () => ({}) as any,
          stderrWrite: () => {},
          extractComponentSpec: (() => ({})) as any,
        }),
        configureFigmaContextFn: () => ({
          ensureFilePayload: async () => ({ document: { id: 'root', type: 'CANVAS', name: 'Root' } }),
          resolveContext: async () => ({
            componentMap: {
              fileKey: 'abc123',
              fileName: 'Test-File',
              fileSlug: 'Test-File',
              surface: 'design',
              rootNodeId: '',
              figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
              components: [],
              componentSets: [],
              pages: [],
              tree_contains: [],
              instance_uses: [],
              unresolved_instance_uses: [],
              dependency_edges: [],
            },
            singleNodeCandidate: null,
          }),
          getFilePayload: () => null,
        }),
        fetchFigmaFileComponentsFn: async () => {
          fallbackCalled = true;
          throw new Error('fallback should not be used for filtered component kinds');
        },
        buildCaptureTargetsFn: async ({ sourceCandidates }) => {
          buildCaptureTargetsCalls.push({ sourceCandidates: sourceCandidates as Array<Record<string, unknown>> });
          return {
            targets: [],
            skipped: [],
          };
        },
        executeCaptureBatchAndRefreshFn: () => ({
          ok: true,
          captured: [],
          failed: [],
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(fallbackCalled, false);
    assert.equal(buildCaptureTargetsCalls.length, 1);
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates.length, 0);
  });

  it('uses file-level component sets when the tree has no component nodes', async () => {
    const buildCaptureTargetsCalls: Array<{ sourceCandidates: Array<Record<string, unknown>> }> = [];

    const result = await runCaptureFromFigmaUrl(
      {
        url: 'https://www.figma.com/design/abc123/Test-File',
        'figma-token': 'figma-token',
        'component-kind': 'all',
        'main-capture-mode': 'rest',
        'tokens-source': 'mcp',
        'skip-db-persistence': 'true',
      },
      {
        createPipelineContext: async () => ({
          system: {
            id: 'sys-01',
            repoRoot: '/repo',
            figmaFileId: 'abc123',
            captureFromFigmaUrlScriptPath: 'tooling/src/runners/capture-from-figma-url-runner.ts',
            paths: {
              docs: '/repo/design-systems/sys-01/docs',
              generated: '/repo/design-systems/sys-01/output',
            },
          } as any,
          paths: {
            docsRootOverride: '/repo/design-systems/sys-01/docs',
            proofDir: '/repo/design-systems/sys-01/output/visual-proofs',
            proofImageDir: '/repo/design-systems/sys-01/output/visual-proofs/images',
            resolvedSpecRoot: '/repo/design-systems/sys-01/docs',
          } as any,
          flags: {
            componentSlugOverride: '',
            componentKind: 'all',
            includeVariants: false,
            continueOnError: true,
            dryRun: false,
            includeSpecExhibits: false,
            variantLimit: 6,
            scale: 2,
            format: 'png',
            agent: 'auto',
            mainCaptureMode: 'rest',
            tokensSource: 'mcp',
            force: false,
            skipValidation: false,
            allowNonEvidenceUpdates: false,
            skipDbPersistence: true,
          },
          argsRaw: {},
          id: 'sys-01',
          fileKey: 'abc123',
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
          fileSlug: 'Test-File',
          fileName: 'Test-File',
          surface: 'design',
          rootNodeId: '',
        } as any),
        orchestrateTokenSyncFn: async () => ({ tokenBootstrap: { ok: true } }),
        createCaptureServicesFn: () => ({
          readComponentRegistry: async () => [],
          readMarkdownContent: () => '',
          markdownExists: () => false,
          specExists: () => true,
          runScriptJson: () => ({}),
          fetchFigmaFile: async () => ({}) as any,
          fetchFigmaNodes: async () => ({}) as any,
          fetchFigmaImages: async () => ({}) as any,
          stderrWrite: () => {},
          extractComponentSpec: (() => ({})) as any,
        }),
        configureFigmaContextFn: () => ({
          ensureFilePayload: async () => ({ document: { id: 'root', type: 'CANVAS', name: 'Root' } }),
          resolveContext: async () => ({
            componentMap: {
              fileKey: 'abc123',
              fileName: 'Test-File',
              fileSlug: 'Test-File',
              surface: 'design',
              rootNodeId: '',
              figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
              components: [],
              componentSets: [
                {
                  id: '333:444',
                  name: 'Badge Set',
                  nodeId: '333-444',
                  type: 'component_set',
                  description: '',
                },
              ],
              pages: [],
              tree_contains: [],
              instance_uses: [],
              unresolved_instance_uses: [],
              dependency_edges: [],
            },
            singleNodeCandidate: null,
          }),
          getFilePayload: () => null,
        }),
        fetchFigmaFileComponentsFn: async () => {
          throw new Error('fallback should not be used when component sets already exist');
        },
        buildCaptureTargetsFn: async ({ sourceCandidates }) => {
          buildCaptureTargetsCalls.push({ sourceCandidates: sourceCandidates as Array<Record<string, unknown>> });
          return {
            targets: sourceCandidates.map((candidate) => ({
              slug: String(candidate.name || 'badge_set').toLowerCase().replace(/\s+/g, '_'),
              nodeId: String(candidate.node_id || ''),
              nodeUrl: 'https://www.figma.com/file/abc123/Test-File?node-id=333:444&surface=design',
              name: String(candidate.name || 'Badge Set'),
              kind: 'component_set',
              pageName: null,
              specExists: true,
              specExhibits: null,
            })),
            skipped: [],
          };
        },
        executeCaptureBatchAndRefreshFn: () => ({
          ok: true,
          captured: [{ slug: 'badge_set' }],
          failed: [],
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(buildCaptureTargetsCalls.length, 1);
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates.length, 1);
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates[0]?.node_id, '333:444');
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates[0]?.name, 'Badge Set');
  });

  it('falls back to persisted registry component set node ids when Figma discovery is empty', async () => {
    const buildCaptureTargetsCalls: Array<{ sourceCandidates: Array<Record<string, unknown>> }> = [];

    const result = await runCaptureFromFigmaUrl(
      {
        url: 'https://www.figma.com/design/abc123/Test-File',
        'figma-token': 'figma-token',
        'component-kind': 'all',
        'main-capture-mode': 'rest',
        'tokens-source': 'mcp',
        'skip-db-persistence': 'true',
      },
      {
        createPipelineContext: async () => ({
          system: {
            id: 'sys-01',
            repoRoot: '/repo',
            figmaFileId: 'abc123',
            captureFromFigmaUrlScriptPath: 'tooling/src/runners/capture-from-figma-url-runner.ts',
            paths: {
              docs: '/repo/design-systems/sys-01/docs',
              generated: '/repo/design-systems/sys-01/output',
            },
          } as any,
          paths: {
            docsRootOverride: '/repo/design-systems/sys-01/docs',
            proofDir: '/repo/design-systems/sys-01/output/visual-proofs',
            proofImageDir: '/repo/design-systems/sys-01/output/visual-proofs/images',
            resolvedSpecRoot: '/repo/design-systems/sys-01/docs',
          } as any,
          flags: {
            componentSlugOverride: '',
            componentKind: 'all',
            includeVariants: false,
            continueOnError: true,
            dryRun: false,
            includeSpecExhibits: false,
            variantLimit: 6,
            scale: 2,
            format: 'png',
            agent: 'auto',
            mainCaptureMode: 'rest',
            tokensSource: 'mcp',
            force: false,
            skipValidation: false,
            allowNonEvidenceUpdates: false,
            skipDbPersistence: true,
          },
          argsRaw: {},
          id: 'sys-01',
          fileKey: 'abc123',
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
          fileSlug: 'Test-File',
          fileName: 'Test-File',
          surface: 'design',
          rootNodeId: '',
        } as any),
        orchestrateTokenSyncFn: async () => ({ tokenBootstrap: { ok: true } }),
        createCaptureServicesFn: () => ({
          readComponentRegistry: async () => [
            {
              slug: 'button',
              figma: {
                component_set_node_id: '1:23',
              },
            },
          ],
          readMarkdownContent: () => '',
          markdownExists: () => false,
          specExists: () => true,
          runScriptJson: () => ({}),
          fetchFigmaFile: async () => ({}) as any,
          fetchFigmaNodes: async () => ({}) as any,
          fetchFigmaImages: async () => ({}) as any,
          stderrWrite: () => {},
          extractComponentSpec: (() => ({})) as any,
        }),
        configureFigmaContextFn: () => ({
          ensureFilePayload: async () => ({ document: { id: 'root', type: 'CANVAS', name: 'Root' } }),
          resolveContext: async () => ({
            componentMap: {
              fileKey: 'abc123',
              fileName: 'Test-File',
              fileSlug: 'Test-File',
              surface: 'design',
              rootNodeId: '',
              figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
              components: [],
              componentSets: [],
              pages: [],
              tree_contains: [],
              instance_uses: [],
              unresolved_instance_uses: [],
              dependency_edges: [],
            },
            singleNodeCandidate: null,
          }),
          getFilePayload: () => null,
        }),
        fetchFigmaFileComponentsFn: async () => ({
          status: 200,
          error: false,
          meta: { components: [] },
        }),
        buildCaptureTargetsFn: async ({ sourceCandidates }) => {
          buildCaptureTargetsCalls.push({ sourceCandidates: sourceCandidates as Array<Record<string, unknown>> });
          return {
            targets: sourceCandidates.map((candidate) => ({
              slug: String(candidate.name || 'button').toLowerCase(),
              nodeId: String(candidate.node_id || ''),
              nodeUrl: 'https://www.figma.com/file/abc123/Test-File?node-id=1:23&surface=design',
              name: String(candidate.name || 'button'),
              kind: 'component_set',
              pageName: null,
              specExists: true,
              specExhibits: null,
            })),
            skipped: [],
          };
        },
        executeCaptureBatchAndRefreshFn: () => ({
          ok: true,
          captured: [{ slug: 'button' }],
          failed: [],
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(buildCaptureTargetsCalls.length, 1);
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates.length, 1);
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates[0]?.node_id, '1:23');
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates[0]?.name, 'button');
  });

  it('merges persisted registry component set node ids with discovered Figma candidates', async () => {
    const buildCaptureTargetsCalls: Array<{ sourceCandidates: Array<Record<string, unknown>> }> = [];

    const result = await runCaptureFromFigmaUrl(
      {
        url: 'https://www.figma.com/design/abc123/Test-File',
        'figma-token': 'figma-token',
        'component-kind': 'all',
        'main-capture-mode': 'rest',
        'tokens-source': 'mcp',
        'skip-db-persistence': 'true',
      },
      {
        createPipelineContext: async () => ({
          system: {
            id: 'sys-01',
            repoRoot: '/repo',
            figmaFileId: 'abc123',
            captureFromFigmaUrlScriptPath: 'tooling/src/runners/capture-from-figma-url-runner.ts',
            paths: {
              docs: '/repo/design-systems/sys-01/docs',
              generated: '/repo/design-systems/sys-01/output',
            },
          } as any,
          paths: {
            docsRootOverride: '/repo/design-systems/sys-01/docs',
            proofDir: '/repo/design-systems/sys-01/output/visual-proofs',
            proofImageDir: '/repo/design-systems/sys-01/output/visual-proofs/images',
            resolvedSpecRoot: '/repo/design-systems/sys-01/docs',
          } as any,
          flags: {
            componentSlugOverride: '',
            componentKind: 'all',
            includeVariants: false,
            continueOnError: true,
            dryRun: false,
            includeSpecExhibits: false,
            variantLimit: 6,
            scale: 2,
            format: 'png',
            agent: 'auto',
            mainCaptureMode: 'rest',
            tokensSource: 'mcp',
            force: false,
            skipValidation: false,
            allowNonEvidenceUpdates: false,
            skipDbPersistence: true,
          },
          argsRaw: {},
          id: 'sys-01',
          fileKey: 'abc123',
          figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
          fileSlug: 'Test-File',
          fileName: 'Test-File',
          surface: 'design',
          rootNodeId: '',
        } as any),
        orchestrateTokenSyncFn: async () => ({ tokenBootstrap: { ok: true } }),
        createCaptureServicesFn: () => ({
          readComponentRegistry: async () => [
            {
              slug: 'button',
              figma: {
                component_set_node_id: '1:23',
              },
            },
          ],
          readMarkdownContent: () => '',
          markdownExists: () => false,
          specExists: () => true,
          runScriptJson: () => ({}),
          fetchFigmaFile: async () => ({}) as any,
          fetchFigmaNodes: async () => ({}) as any,
          fetchFigmaImages: async () => ({}) as any,
          stderrWrite: () => {},
          extractComponentSpec: (() => ({})) as any,
        }),
        configureFigmaContextFn: () => ({
          ensureFilePayload: async () => ({ document: { id: 'root', type: 'CANVAS', name: 'Root' } }),
          resolveContext: async () => ({
            componentMap: {
              fileKey: 'abc123',
              fileName: 'Test-File',
              fileSlug: 'Test-File',
              surface: 'design',
              rootNodeId: '',
              figmaUrl: 'https://www.figma.com/design/abc123/Test-File',
              components: [
                {
                  id: '999:111',
                  name: 'Secondary Button',
                  nodeId: '999-111',
                  type: 'component',
                  description: '',
                },
              ],
              componentSets: [],
              pages: [],
              tree_contains: [],
              instance_uses: [],
              unresolved_instance_uses: [],
              dependency_edges: [],
            },
            singleNodeCandidate: null,
          }),
          getFilePayload: () => null,
        }),
        fetchFigmaFileComponentsFn: async () => ({
          status: 200,
          error: false,
          meta: { components: [] },
        }),
        buildCaptureTargetsFn: async ({ sourceCandidates }) => {
          buildCaptureTargetsCalls.push({ sourceCandidates: sourceCandidates as Array<Record<string, unknown>> });
          return {
            targets: sourceCandidates.map((candidate) => ({
              slug: String(candidate.name || '').toLowerCase(),
              nodeId: String(candidate.node_id || ''),
              nodeUrl: 'https://www.figma.com/file/abc123/Test-File?node-id=999:111&surface=design',
              name: String(candidate.name || ''),
              kind: String(candidate.kind || 'component'),
              pageName: null,
              specExists: true,
              specExhibits: null,
            })),
            skipped: [],
          };
        },
        executeCaptureBatchAndRefreshFn: () => ({
          ok: true,
          captured: [{ slug: 'secondary button' }],
          failed: [],
        }),
      },
    );

    assert.equal(result.ok, true);
    assert.equal(buildCaptureTargetsCalls.length, 1);
    assert.equal(buildCaptureTargetsCalls[0]?.sourceCandidates.length, 2);
    assert.deepEqual(
      buildCaptureTargetsCalls[0]?.sourceCandidates.map((candidate) => candidate.node_id),
      ['999:111', '1:23'],
    );
  });
});
