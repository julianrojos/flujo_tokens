/**
 * Capture Orchestrator Main
 *
 * Main orchestrator for capture-from-figma-url workflow.
 * Coordinates token sync, Figma context resolution, target building,
 * batch execution, and registry refresh.
 */

import type { ParsedFigmaUrl } from '../utils/figma-url-parser.js';
import type { ScriptSystemContext } from '../utils/system-context.js';
import {
  parseFigmaFileUrl,
  buildFigmaNodeUrl,
} from '../utils/figma-url-parser.js';
import {
  extractComponentSpec,
  renderEnrichedMarkdownSeed,
  type FigmaNode,
  type ExtractedComponentSpec,
} from '../utils/figma-node-spec-extractor.js';
import {
  classifyTargetKind,
  extractSingleNodeCandidate,
  isKindAllowed,
  resolveSpecExhibitNodeIds,
} from '../utils/figma-component-discovery.js';
import { injectSpecZones } from '../utils/spec-to-markdown-injector.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { runJsonCommand } from '../utils/exec.js';
import {
  parseBooleanOption,
  parseComponentKind,
  parseMainCaptureMode,
  parsePositiveNumber,
} from './capture-options.js';
import { createPipelineContext, type PipelineContext } from './pipeline-context.js';
import {
  buildMarkdownSeed,
  ensureSystemDocsScaffold,
  writeTextAtomic,
} from './capture-doc-scaffold.js';
import { resolveDocsPaths } from './capture-path-resolver.js';
import {
  buildSlugLookupFromRegistry,
  buildSlugLookupFromSpecContents,
} from './capture-targets.js';
import { createCaptureServices } from './capture-services.js';
import { buildCaptureTargets, type SourceCandidate } from './capture-target-builder.js';
import { createCaptureReport } from './capture-report.js';
import { executeCaptureBatchAndRefresh } from './capture-batch-execution.js';
import { orchestrateTokenSync } from './capture-token-orchestrator.js';
import { configureFigmaContext } from './capture-figma-context.js';
import type { FigmaComponentMap, FigmaNodePayload, FigmaImagesPayload } from '../types/figma.js';

/**
 * Capture orchestration arguments.
 */
export interface CaptureFromFigmaUrlArgs {
  url?: string;
  'figma-token'?: string;
  'docs-root'?: string;
  'proof-dir'?: string;
  'proof-image-dir'?: string;
  'component-slug'?: string;
  'component-kind'?: string;
  'require-existing-doc'?: string;
  'include-variants'?: string;
  'variant-limit'?: string;
  format?: string;
  scale?: string;
  'main-capture-mode'?: string;
  agent?: string;
  'continue-on-error'?: string;
  'refresh-indices'?: string;
  'dry-run'?: string;
  'inject-doc-specs'?: string;
  'include-spec-exhibits'?: string;
  system?: string;
  help?: boolean | string;
}

/**
 * Dependency injection options for testing.
 */
export interface CaptureFromFigmaUrlDeps {
  projectRoot?: string;
  resolveSystemContextSafeFn?: typeof resolveSystemContextSafe;
  parseFigmaFileUrlFn?: typeof parseFigmaFileUrl;
  fetchFigmaFileFn?: (params: { fileKey: string; token: string }) => Promise<unknown>;
  fetchFigmaNodesFn?: (params: {
    fileKey: string;
    nodeIds: string[];
    token: string;
    depth?: number;
  }) => Promise<FigmaNodePayload>;
  fetchFigmaImagesFn?: (params: {
    fileKey: string;
    nodeIds: string[];
    token: string;
    format: string;
    scale: number;
  }) => Promise<FigmaImagesPayload>;
  buildFigmaComponentMapFn?: (params: {
    filePayload: unknown;
    fileDescriptor: ParsedFigmaUrl;
    includeInstances?: boolean;
  }) => FigmaComponentMap;
  buildFigmaNodeUrlFn?: typeof buildFigmaNodeUrl;
  bootstrapInputJsonFromFigmaVariablesFn?: (params: {
    repoRoot: string;
    system: ScriptSystemContext | null;
    fileKey: string;
    figmaToken: string;
  }) => Promise<Record<string, unknown>>;
  ensureCollectionsConfiguredFn?: (params: {
    repoRoot: string;
    systemId: string;
  }) => void;
  getSystemConfigFn?: (params: {
    repoRoot: string;
    systemId: string;
  }) => ScriptSystemContext | null;
  runTokensCompileIfNeededFn?: (params: {
    repoRoot: string;
    system: ScriptSystemContext | null;
  }) => Record<string, unknown>;
  extractSingleNodeCandidateFn?: (
    payload: FigmaNodePayload,
    nodeId: string,
  ) => { node_id: string; name: string; kind: string; page_name: string | null } | null;
  parseBooleanOptionFn?: typeof parseBooleanOption;
  parseComponentKindFn?: typeof parseComponentKind;
  parseMainCaptureModeFn?: typeof parseMainCaptureMode;
  parsePositiveNumberFn?: typeof parsePositiveNumber;
  ensureSystemDocsScaffoldFn?: typeof ensureSystemDocsScaffold;
  buildSlugLookupFromRegistryFn?: typeof buildSlugLookupFromRegistry;
  buildSlugLookupFromSpecContentsFn?: typeof buildSlugLookupFromSpecContents;
  isKindAllowedFn?: typeof isKindAllowed;
  classifyTargetKindFn?: typeof classifyTargetKind;
  buildCaptureTargetsFn?: typeof buildCaptureTargets;
  createCaptureReportFn?: typeof createCaptureReport;
  executeCaptureBatchAndRefreshFn?: typeof executeCaptureBatchAndRefresh;
  runJsonCommandFn?: typeof runJsonCommand;
  extractComponentSpecFn?: (node: FigmaNode) => ExtractedComponentSpec | null;
  resolveSpecExhibitNodeIdsFn?: typeof resolveSpecExhibitNodeIds;
  resolveDocsPathsFn?: typeof resolveDocsPaths;
  renderEnrichedMarkdownSeedFn?: typeof renderEnrichedMarkdownSeed;
  injectSpecZonesFn?: typeof injectSpecZones;
  buildMarkdownSeedFn?: typeof buildMarkdownSeed;
  writeTextAtomicFn?: typeof writeTextAtomic;
  stderrWriteFn?: (message: string) => void;
  createPipelineContextFn?: typeof createPipelineContext;
  orchestrateTokenSyncFn?: typeof orchestrateTokenSync;
  configureFigmaContextFn?: typeof configureFigmaContext;
}

/**
 * Run capture from Figma URL.
 *
 * Main entry point for the capture-from-figma-url workflow.
 * Orchestrates token sync, Figma context resolution, target building,
 * batch execution, and registry refresh.
 *
 * @param args - Capture orchestration arguments.
 * @param deps - Optional dependency overrides for testing.
 * @returns Capture report.
 */
export async function runCaptureFromFigmaUrl(
  args: CaptureFromFigmaUrlArgs,
  deps: CaptureFromFigmaUrlDeps = {},
): Promise<Record<string, unknown>> {
  const {
    projectRoot = PROJECT_ROOT,
    resolveSystemContextSafeFn = resolveSystemContextSafe,
    parseFigmaFileUrlFn = parseFigmaFileUrl,
    fetchFigmaFileFn,
    fetchFigmaNodesFn,
    fetchFigmaImagesFn,
    buildFigmaComponentMapFn,
    buildFigmaNodeUrlFn = buildFigmaNodeUrl,
    bootstrapInputJsonFromFigmaVariablesFn,
    ensureCollectionsConfiguredFn,
    getSystemConfigFn,
    runTokensCompileIfNeededFn,
    extractSingleNodeCandidateFn = extractSingleNodeCandidate,
    parseBooleanOptionFn = parseBooleanOption,
    parseComponentKindFn = parseComponentKind,
    parseMainCaptureModeFn = parseMainCaptureMode,
    parsePositiveNumberFn = parsePositiveNumber,
    ensureSystemDocsScaffoldFn = ensureSystemDocsScaffold,
    buildSlugLookupFromRegistryFn = buildSlugLookupFromRegistry,
    buildSlugLookupFromSpecContentsFn = buildSlugLookupFromSpecContents,
    isKindAllowedFn = isKindAllowed,
    classifyTargetKindFn = classifyTargetKind,
    buildCaptureTargetsFn = buildCaptureTargets,
    createCaptureReportFn = createCaptureReport,
    executeCaptureBatchAndRefreshFn = executeCaptureBatchAndRefresh,
    runJsonCommandFn = runJsonCommand,
    extractComponentSpecFn = extractComponentSpec,
    resolveSpecExhibitNodeIdsFn = resolveSpecExhibitNodeIds,
    resolveDocsPathsFn = resolveDocsPaths,
    renderEnrichedMarkdownSeedFn = renderEnrichedMarkdownSeed,
    injectSpecZonesFn = injectSpecZones,
    buildMarkdownSeedFn = buildMarkdownSeed,
    writeTextAtomicFn = writeTextAtomic,
    stderrWriteFn = process.stderr.write.bind(process.stderr),
    createPipelineContextFn = createPipelineContext,
    orchestrateTokenSyncFn = orchestrateTokenSync,
    configureFigmaContextFn = configureFigmaContext,
  } = deps;

  const figmaUrl = String(args.url || '').trim();
  if (!figmaUrl) {
    throw new Error('Missing Figma URL. Provide --url <figma-url>.');
  }

  const figmaTokenRaw = String(args['figma-token'] || process.env.FIGMA_TOKEN || '').trim();
  if (!figmaTokenRaw) {
    throw new Error(
      'Missing Figma token. Provide --figma-token <token> or set FIGMA_TOKEN.',
    );
  }

  const context = createPipelineContextFn(args);
  const {
    repoRoot,
    figmaToken,
    system: ctx,
    paths,
    flags,
  } = context;

  const {
    docsRootDir,
    componentDocsDir,
    proofDir,
    proofImageDir,
    registryIndexPath,
    resolvedSpecRoot,
  } = paths;

  const {
    componentSlugOverride,
    componentKind,
    includeVariants,
    requireExistingDoc,
    continueOnError,
    refreshIndices,
    dryRun,
    injectDocSpecs,
    includeSpecExhibits,
    variantLimit,
    scale,
    format,
    agent,
    mainCaptureMode,
  } = flags;

  // Parse Figma URL descriptor
  const descriptor = parseFigmaFileUrlFn(figmaUrl);

  // Orchestrate token sync
  const { tokenBootstrap, tokenCompile } = await orchestrateTokenSyncFn({
    dryRun,
    projectRoot,
    systemId: ctx.id,
    fileKey: descriptor.fileKey,
    figmaToken,
    getSystemConfigFn,
    bootstrapInputJsonFromFigmaVariablesFn,
    ensureCollectionsConfiguredFn,
    runTokensCompileIfNeededFn,
  });

  // Configure Figma context
  const { ensureFilePayload, resolveContext } = configureFigmaContextFn({
    descriptor,
    figmaToken,
    fetchFigmaFileFn,
    fetchFigmaNodesFn,
    extractSingleNodeCandidateFn,
    buildFigmaComponentMapFn,
  });

  const { componentMap, singleNodeCandidate } = await resolveContext();

  // Ensure docs scaffold exists
  ensureSystemDocsScaffoldFn({ docsRootDir, componentDocsDir });

  // Create capture services
  const services = createCaptureServices({ context });
  const componentRows = services.readComponentRegistry();
  const slugByNodeFromRegistry = buildSlugLookupFromRegistryFn(componentRows);
  const specContents = services.readSpecContents();
  const slugByNodeFromSpecs = buildSlugLookupFromSpecContentsFn(specContents);

  const allComponents = Array.isArray(componentMap?.components) ? componentMap.components : [];

  const sourceCandidates: SourceCandidate[] = descriptor.nodeIdFromUrl
    ? [singleNodeCandidate].filter(Boolean) as SourceCandidate[]
    : allComponents.filter((component) =>
        isKindAllowedFn(classifyTargetKindFn(component.kind), componentKind),
      );

  const applySlugOverride = Boolean(componentSlugOverride && descriptor.nodeIdFromUrl);

  // Validate required Figma API dependencies before building targets
  if (!fetchFigmaNodesFn) {
    throw new Error('fetchFigmaNodesFn is required for Figma node fetching');
  }
  if (!fetchFigmaImagesFn) {
    throw new Error('fetchFigmaImagesFn is required for Figma image exporting');
  }

  // Build capture targets
  const { targets, skipped } = await buildCaptureTargetsFn({
    sourceCandidates,
    descriptor,
    ctx,
    docsRootOverride: paths.docsRootOverride,
    applySlugOverride,
    componentSlugOverride,
    slugByNodeFromRegistry,
    slugByNodeFromSpecs,
    requireExistingDoc,
    injectDocSpecs,
    includeSpecExhibits,
    figmaToken,
    repoRoot: projectRoot,
    ensureFilePayload,
    fetchFigmaNodes: fetchFigmaNodesFn,
    fetchFigmaImages: fetchFigmaImagesFn,
    extractComponentSpec: extractComponentSpecFn,
    resolveSpecExhibitNodeIds: resolveSpecExhibitNodeIdsFn,
    resolveDocsPaths: resolveDocsPathsFn,
    buildFigmaNodeUrl: buildFigmaNodeUrlFn,
    classifyTargetKind: classifyTargetKindFn,
    renderEnrichedMarkdownSeed: renderEnrichedMarkdownSeedFn,
    injectSpecZones: injectSpecZonesFn,
    buildMarkdownSeed: buildMarkdownSeedFn,
    writeTextAtomic: writeTextAtomicFn,
    stderrWrite: stderrWriteFn,
    markdownExistsFn: services.markdownExists,
    specExistsFn: services.specExists,
    readMarkdownContentFn: services.readMarkdownContent,
  });

  // Create capture report
  const report = createCaptureReportFn({
    dryRun,
    descriptor,
    requested: {
      component_kind: componentKind,
      include_variants: includeVariants,
      variant_limit: variantLimit,
      scale,
      format,
      require_existing_doc: requireExistingDoc,
      main_capture_mode: mainCaptureMode,
      inject_doc_specs: injectDocSpecs,
      include_spec_exhibits: includeSpecExhibits,
    },
    tokenBootstrap,
    tokenCompile,
    sourceCandidates,
    targets,
    skipped,
    repoRoot: projectRoot,
  });

  if (dryRun) {
    return report;
  }

  // Execute batch and refresh
  return executeCaptureBatchAndRefreshFn({
    report,
    targets,
    projectRoot,
    systemId: ctx.id,
    runJsonCommandFn,
    continueOnError,
    figmaToken,
    format,
    scale,
    proofDir,
    proofImageDir,
    includeVariants,
    variantLimit,
    agent,
    mainCaptureMode,
    refreshIndices,
  });
}
