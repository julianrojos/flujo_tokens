export function createCaptureContextMock(overrides = {}) {
  const defaultDeps = {
    createPipelineContextFn: () => ({
      figmaUrl: "https://www.figma.com/design/example-file/Components?node-id=100-200",
      figmaToken: "mock-token",
      system: {
        id: "system",
        paths: {
          docs: "/mock/repo/docs",
          generated: "/mock/repo/docs/_generated",
          specs: "/mock/repo/docs/_spec/components",
          registry: "/mock/repo/docs/_generated/component-registry.json",
          tokenRegistry: "/mock/repo/docs/_generated/token-registry.json",
        },
      },
      paths: {
        docsRootOverride: null,
        docsRootDir: "/mock/repo/docs",
        componentDocsDir: "/mock/repo/docs/components",
        proofDir: "/mock/repo/docs/_generated/visual-proofs",
        proofImageDir: "/mock/repo/docs/_generated/visual-proofs/images",
        resolvedSpecRoot: "/mock/repo/docs/_spec/components",
        templatePath: "/mock/repo/docs/_spec/components/_template.yml",
        tokenRegistryPath: "/mock/repo/docs/_generated/token-registry.json",
        overviewPath: "/mock/repo/docs/overview.md",
        registryIndexPath: "/mock/repo/docs/_generated/component-registry.json",
      },
      flags: {
        componentSlugOverride: "",
        componentKind: "component_set",
        includeVariants: true,
        requireExistingDoc: true,
        continueOnError: true,
        refreshIndices: true,
        dryRun: true,
        injectDocSpecs: true,
        includeSpecExhibits: true,
        variantLimit: 6,
        scale: 2,
        format: "png",
        agent: "auto",
        mainCaptureMode: "rest",
        force: true,
        skipValidation: false,
        allowNonEvidenceUpdates: false,
      },
    }),
    fetchFigmaFileFn: async () => ({
      document: {
        id: "0:0",
        children: [{ id: "100:200", name: "ExampleNode", type: "COMPONENT_SET" }],
      },
    }),
    fetchFigmaNodesFn: async () => ({
      nodes: {
        "100:200": { document: { id: "100:200", name: "ExampleNode", type: "COMPONENT_SET" } },
      },
    }),
    fetchFigmaImagesFn: async () => ({
      images: {
        "100:200": "https://figma.com/mock-image.png",
      },
    }),
    bootstrapInputJsonFromFigmaVariablesFn: async () => ({
      attempted: true,
      created: true,
      reason: "mocked",
    }),
    runTokensCompileIfNeededFn: () => ({
      attempted: true,
      compiled: true,
      reason: "mocked",
    }),
    runJsonCommandFn: () => ({
      data: { ok: true },
    }),
    extractComponentSpecFn: () => null,
    resolveSpecExhibitNodeIdsFn: () => null,
    renderEnrichedMarkdownSeedFn: () => null,
    injectExtractedSpecSectionsIntoMarkdownFn: () => ({ changed: true, content: "mocked" }),
    buildMarkdownSeedFn: () => null,
    writeTextAtomicFn: () => null,
    stderrWriteFn: () => {},
  };

  return { ...defaultDeps, ...overrides };
}
