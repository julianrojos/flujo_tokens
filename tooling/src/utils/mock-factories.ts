/**
 * Mock Factories for Testing
 *
 * Provides mock dependencies for testing spec orchestration and related services.
 * Migrated from tooling/scripts/lib/mock-factories.mjs
 */

export interface PipelineContext {
  figmaUrl: string;
  figmaToken: string;
  system: {
    id: string;
    paths: {
      docs: string;
      generated: string;
      specs: string;
      registry: string;
      tokenRegistry: string;
    };
  };
  paths: {
    docsRootOverride: string | null;
    docsRootDir: string;
    componentDocsDir: string;
    proofDir: string;
    proofImageDir: string;
    resolvedSpecRoot: string;
    templatePath: string;
    tokenRegistryPath: string;
    overviewPath: string;
    registryIndexPath: string;
  };
  flags: {
    componentSlugOverride: string;
    componentKind: string;
    includeVariants: boolean;
    requireExistingDoc: boolean;
    continueOnError: boolean;
    refreshIndices: boolean;
    dryRun: boolean;
    injectDocSpecs: boolean;
    includeSpecExhibits: boolean;
    variantLimit: number;
    scale: number;
    format: string;
    agent: string;
    mainCaptureMode: string;
    force: boolean;
    skipValidation: boolean;
    allowNonEvidenceUpdates: boolean;
  };
}

export interface MockDeps {
  createPipelineContextFn: () => PipelineContext;
  fetchFigmaFileFn: () => Promise<{ document: { id: string; name: string; type: string; children?: any[] } }>;
  fetchFigmaNodesFn: () => Promise<{ nodes: Record<string, { document: { id: string; name: string; type: string } }> }>;
  fetchFigmaImagesFn: () => Promise<{ images: Record<string, string> }>;
  bootstrapInputJsonFromFigmaVariablesFn: () => Promise<{ attempted: boolean; created: boolean; reason: string }>;
  runTokensCompileIfNeededFn: () => { attempted: boolean; compiled: boolean; reason: string };
  runJsonCommandFn: () => { data: { ok: boolean } };
  extractComponentSpecFn: () => null;
  resolveSpecExhibitNodeIdsFn: () => null;
  renderEnrichedMarkdownSeedFn: () => null;
  injectExtractedSpecSectionsIntoMarkdownFn: () => { changed: boolean; content: string };
  buildMarkdownSeedFn: () => null;
  writeTextAtomicFn: () => void;
  stderrWriteFn: () => void;
  [key: string]: any;
}

/**
 * Create mock dependencies for testing spec orchestration.
 *
 * @param overrides - Partial mock dependencies to override defaults
 * @returns Complete mock dependencies object
 */
export function createCaptureContextMock(overrides: Partial<MockDeps> = {}): MockDeps {
  const defaultDeps: MockDeps = {
    createPipelineContextFn: () => ({
      figmaUrl: 'https://www.figma.com/design/example-file/Components?node-id=100-200',
      figmaToken: 'mock-token',
      system: {
        id: 'system',
        paths: {
          docs: '/mock/repo/docs',
          generated: '/mock/repo/docs/_generated',
          specs: '/mock/repo/docs/_spec/components',
          registry: '/mock/repo/docs/_generated/component-registry.json',
          tokenRegistry: '/mock/repo/docs/_generated/token-registry.json',
        },
      },
      paths: {
        docsRootOverride: null,
        docsRootDir: '/mock/repo/docs',
        componentDocsDir: '/mock/repo/docs/components',
        proofDir: '/mock/repo/docs/_generated/visual-proofs',
        proofImageDir: '/mock/repo/docs/_generated/visual-proofs/images',
        resolvedSpecRoot: '/mock/repo/docs/_spec/components',
        templatePath: '/mock/repo/docs/_spec/components/_template.yml',
        tokenRegistryPath: '/mock/repo/docs/_generated/token-registry.json',
        overviewPath: '/mock/repo/docs/overview.md',
        registryIndexPath: '/mock/repo/docs/_generated/component-registry.json',
      },
      flags: {
        componentSlugOverride: '',
        componentKind: 'component_set',
        includeVariants: true,
        requireExistingDoc: true,
        continueOnError: true,
        refreshIndices: true,
        dryRun: true,
        injectDocSpecs: true,
        includeSpecExhibits: true,
        variantLimit: 6,
        scale: 2,
        format: 'png',
        agent: 'auto',
        mainCaptureMode: 'rest',
        force: true,
        skipValidation: false,
        allowNonEvidenceUpdates: false,
      },
    }),
    fetchFigmaFileFn: async () => ({
      document: {
        id: '0:0',
        children: [{ id: '100:200', name: 'ExampleNode', type: 'COMPONENT_SET' }],
      },
    }),
    fetchFigmaNodesFn: async () => ({
      nodes: {
        '100:200': { document: { id: '100:200', name: 'ExampleNode', type: 'COMPONENT_SET' } },
      },
    }),
    fetchFigmaImagesFn: async () => ({
      images: {
        '100:200': 'https://figma.com/mock-image.png',
      },
    }),
    bootstrapInputJsonFromFigmaVariablesFn: async () => ({
      attempted: true,
      created: true,
      reason: 'mocked',
    }),
    runTokensCompileIfNeededFn: () => ({
      attempted: true,
      compiled: true,
      reason: 'mocked',
    }),
    runJsonCommandFn: () => ({
      data: { ok: true },
    }),
    extractComponentSpecFn: () => null,
    resolveSpecExhibitNodeIdsFn: () => null,
    renderEnrichedMarkdownSeedFn: () => null,
    injectExtractedSpecSectionsIntoMarkdownFn: () => ({ changed: true, content: 'mocked' }),
    buildMarkdownSeedFn: () => null,
    writeTextAtomicFn: () => {},
    stderrWriteFn: () => {},
  };

  return { ...defaultDeps, ...overrides };
}
