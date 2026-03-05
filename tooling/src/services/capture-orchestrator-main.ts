/**
 * Capture Orchestrator - Main Entry Point
 *
 * Orchestrates the complete capture pipeline from Figma URL to visual proof.
 */

import * as path from 'node:path';

import {
  buildFigmaComponentMap,
  buildFigmaNodeUrl,
  parseFigmaFileUrl,
} from './figma-component-map.js';
import {
  fetchFigmaFile,
  fetchFigmaImages,
  fetchFigmaNodes,
} from './figma-api.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import {
  bootstrapInputJsonFromFigmaVariables,
  ensureCollectionsConfigured,
  getSystemConfig,
  runTokensCompileIfNeeded,
} from './capture-system-bootstrap.js';
import { orchestrateTokenSync } from './capture-token-orchestrator.js';
import { configureFigmaContext } from './capture-figma-context.js';
import {
  extractComponentSpec,
  renderEnrichedMarkdownSeed,
} from '../utils/figma-node-spec-extractor.js';
import { runJsonCommand } from '../utils/exec.js';
import {
  parseBooleanOption,
  parseComponentKind,
  parseMainCaptureMode,
  parsePositiveNumber,
} from './capture-options.js';
import { createPipelineContext } from './pipeline-context.js';
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
import {
  classifyTargetKind,
  extractSingleNodeCandidate,
  isKindAllowed,
  resolveSpecExhibitNodeIds,
} from './figma-component-discovery.js';
import { injectSpecZones } from './spec-to-markdown-injector.js';
import { buildCaptureTargets } from './capture-target-builder.js';
import { createCaptureReport } from './capture-report.js';
import { executeCaptureBatchAndRefresh } from './capture-batch-execution.js';
import type { FigmaDescriptor, CaptureContext, SourceCandidate, CaptureTargetKind } from './capture-target-builder.js';
import type { PipelineContext } from './pipeline-context.js';
import type { ParsedFigmaFileUrl } from './figma-component-map.js';
import type { ExtractedComponentSpec } from '../types/spec.js';
import type { CaptureTarget } from '../types/capture-targets.js';

/**
 * Dependencies for runCaptureFromFigmaUrl.
 */
export interface RunCaptureFromFigmaUrlDeps {
  projectRoot?: string;
  resolveSystemContextSafeFn?: typeof resolveSystemContextSafe;
  parseFigmaFileUrlFn?: typeof parseFigmaFileUrl;
  fetchFigmaFileFn?: typeof fetchFigmaFile;
  fetchFigmaNodesFn?: typeof fetchFigmaNodes;
  fetchFigmaImagesFn?: typeof fetchFigmaImages;
  buildFigmaComponentMapFn?: typeof buildFigmaComponentMap;
  buildFigmaNodeUrlFn?: typeof buildFigmaNodeUrl;
  bootstrapInputJsonFromFigmaVariablesFn?: typeof bootstrapInputJsonFromFigmaVariables;
  ensureCollectionsConfiguredFn?: typeof ensureCollectionsConfigured;
  getSystemConfigFn?: typeof getSystemConfig;
  runTokensCompileIfNeededFn?: typeof runTokensCompileIfNeeded;
  extractSingleNodeCandidateFn?: typeof extractSingleNodeCandidate;
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
  extractComponentSpecFn?: typeof extractComponentSpec;
  resolveSpecExhibitNodeIdsFn?: typeof resolveSpecExhibitNodeIds;
  resolveDocsPathsFn?: typeof resolveDocsPaths;
  renderEnrichedMarkdownSeedFn?: typeof renderEnrichedMarkdownSeed;
  injectSpecZonesFn?: typeof injectSpecZones;
  buildMarkdownSeedFn?: typeof buildMarkdownSeed;
  writeTextAtomic?: typeof writeTextAtomic;
  stderrWrite?: (data: string) => void;
  createPipelineContext?: typeof createPipelineContext;
  orchestrateTokenSyncFn?: typeof orchestrateTokenSync;
  configureFigmaContextFn?: typeof configureFigmaContext;
}

/**
 * Result of running capture from Figma URL.
 */
export interface RunCaptureFromFigmaUrlResult {
  ok: boolean;
  report?: unknown;
  captured?: unknown[];
  failed?: unknown[];
  [key: string]: unknown;
}

/**
 * Main entry point for capture from Figma URL.
 */
export async function runCaptureFromFigmaUrl(
  args: Record<string, unknown>,
  deps: RunCaptureFromFigmaUrlDeps = {},
): Promise<RunCaptureFromFigmaUrlResult> {
  const {
    projectRoot = PROJECT_ROOT,
    resolveSystemContextSafeFn = resolveSystemContextSafe,
    parseFigmaFileUrlFn = parseFigmaFileUrl,
    fetchFigmaFileFn = fetchFigmaFile,
    fetchFigmaNodesFn = fetchFigmaNodes,
    fetchFigmaImagesFn = fetchFigmaImages,
    buildFigmaComponentMapFn = buildFigmaComponentMap,
    buildFigmaNodeUrlFn = buildFigmaNodeUrl,
    bootstrapInputJsonFromFigmaVariablesFn = bootstrapInputJsonFromFigmaVariables,
    ensureCollectionsConfiguredFn = ensureCollectionsConfigured,
    getSystemConfigFn = getSystemConfig,
    runTokensCompileIfNeededFn = runTokensCompileIfNeeded,
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
    writeTextAtomic: writeTextAtomicFn = writeTextAtomic,
    stderrWrite: stderrWriteFn = process.stderr.write.bind(process.stderr),
    createPipelineContext: createPipelineContextFn = createPipelineContext,
    orchestrateTokenSyncFn = orchestrateTokenSync,
    configureFigmaContextFn = configureFigmaContext,
  } = deps;

  const figmaUrl = String(args.url || '').trim();
  if (!figmaUrl) {
    throw new Error('Missing Figma URL. Provide --url <figma-url>.');
  }

  const figmaTokenRaw = String(args['figma-token'] || process.env.FIGMA_TOKEN || '').trim();
  if (!figmaTokenRaw) {
    throw new Error('Missing Figma token. Provide --figma-token <token> or set FIGMA_TOKEN.');
  }

  const context: PipelineContext = createPipelineContextFn(args);
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

  const descriptor: ParsedFigmaFileUrl = parseFigmaFileUrlFn(figmaUrl);
  const descriptorWithSource: FigmaDescriptor & { nodeIdFromUrl?: string } = {
    ...descriptor,
    sourceUrl: descriptor.figmaUrl,
    nodeIdFromUrl: descriptor.rootNodeId || undefined,
  };
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

  const { ensureFilePayload, resolveContext } = configureFigmaContextFn({
    descriptor: descriptorWithSource,
    figmaToken,
    fetchFigmaFileFn,
    fetchFigmaNodesFn,
    extractSingleNodeCandidateFn,
    buildFigmaComponentMapFn,
  });

  const { componentMap, singleNodeCandidate } = await resolveContext();

  ensureSystemDocsScaffoldFn({ docsRootDir, componentDocsDir });

  const services = createCaptureServices({ context });
  const componentRows = services.readComponentRegistry();
  const slugByNodeFromRegistry = buildSlugLookupFromRegistryFn(componentRows);
  const specContents = services.readSpecContents();
  const slugByNodeFromSpecs = buildSlugLookupFromSpecContentsFn(specContents);

  const allComponents = Array.isArray(componentMap?.components) ? componentMap.components : [];
  const hasNodeIdFromUrl = Boolean(descriptor.rootNodeId);
  
  // Build source candidates from components
  let sourceCandidates: SourceCandidate[];
  if (hasNodeIdFromUrl) {
    // Single node mode
    sourceCandidates = [singleNodeCandidate].filter(Boolean) as SourceCandidate[];
  } else if (componentKind && componentKind !== 'all') {
    // Filter by requested component kind
    sourceCandidates = allComponents
      .filter((component) => {
        const kind = classifyTargetKindFn(component.type);
        return isKindAllowedFn(kind, componentKind);
      })
      .map((component): SourceCandidate => ({
        node_id: component.id,
        name: component.name,
        kind: component.type,
        type: component.type,
      }));
  } else {
    // All components mode
    sourceCandidates = allComponents.map((component): SourceCandidate => ({
      node_id: component.id,
      name: component.name,
      kind: component.type,
      type: component.type,
    }));
  }
  const applySlugOverride = Boolean(componentSlugOverride && hasNodeIdFromUrl);

  const captureScriptPath = path.join(projectRoot, 'tooling', 'scripts', 'ds-capture-visual-proof.mjs');
  const registryRefreshScriptPath = path.join(projectRoot, 'tooling', 'scripts', 'ds-registry-refresh.mjs');

  const { targets, skipped } = await buildCaptureTargetsFn({
    sourceCandidates,
    descriptor: descriptorWithSource,
    ctx: ctx as unknown as CaptureContext | Record<string, unknown>,
    docsRootOverride: paths.docsRootOverride ?? undefined,
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
    fetchFigmaImages: fetchFigmaImagesFn as unknown as (options: { fileKey: string; nodeIds: string[]; token: string; format?: string; scale?: number }) => Promise<{ images?: Record<string, string> }>,
    extractComponentSpec: extractComponentSpecFn as unknown as (node: unknown) => import('./capture-target-builder.js').ExtractedComponentSpec,
    resolveSpecExhibitNodeIds: resolveSpecExhibitNodeIdsFn as unknown as (options: { figmaFilePayload: unknown; targetNodeId: string }) => { specsNodeId?: string; anatomyNodeId?: string; propertiesNodeId?: string; layoutNodeId?: string } | null,
    buildFigmaNodeUrl: buildFigmaNodeUrlFn as unknown as (descriptor: FigmaDescriptor | Record<string, unknown>, nodeId: string) => string,
    classifyTargetKind: classifyTargetKindFn as unknown as (kind?: string | null) => CaptureTargetKind,
    renderEnrichedMarkdownSeed: renderEnrichedMarkdownSeedFn as unknown as (options: { slug: string; displayName: string; nodeUrl: string; nodeId: string; spec?: unknown }) => string,
    injectSpecZones: injectSpecZonesFn as unknown as (markdown: string, spec: unknown, slug: string) => string,
    writeTextAtomic: writeTextAtomicFn as unknown as (filePath: string, content: string) => Promise<void>,
    stderrWrite: stderrWriteFn,
    markdownExistsFn: services.markdownExists,
    specExistsFn: services.specExists,
    readMarkdownContentFn: services.readMarkdownContent,
  });

  const report = createCaptureReportFn({
    dryRun,
    descriptor: {
      sourceUrl: descriptorWithSource.sourceUrl || descriptorWithSource.figmaUrl || '',
      fileKey: descriptorWithSource.fileKey,
      nodeIdFromUrl: descriptor.rootNodeId || undefined,
    },
    requested: {
      component_kind: componentKind ?? undefined,
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
    return { ok: true, report: report as unknown as Record<string, unknown> } as RunCaptureFromFigmaUrlResult;
  }

  const batchResult = executeCaptureBatchAndRefreshFn({
    report: report as unknown as Record<string, unknown>,
    targets: targets as unknown as CaptureTarget[],
    projectRoot,
    systemId: ctx.id,
    docsRootDir,
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

  return batchResult as unknown as RunCaptureFromFigmaUrlResult;
}
