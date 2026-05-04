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
  fetchFigmaFileComponents,
  fetchFigmaImages,
  fetchFigmaNodes,
} from './figma-api.js';
import {
  resolveSystemContextSafe,
  PROJECT_ROOT,
} from '../utils/system-context.js';
import {
  bootstrapFigmaTokensToDatabase,
  getSystemConfig,
} from './capture-system-bootstrap.js';
import { orchestrateTokenSync } from './capture-token-orchestrator.js';
import { configureFigmaContext } from './capture-figma-context.js';
import {
  extractComponentSpec,
} from '../utils/figma-node-spec-extractor.js';
import { runJsonCommand } from '../utils/exec.js';
import {
  parseBooleanOption,
  parseComponentKind,
  parseMainCaptureMode,
  parsePositiveNumber,
} from './capture-options.js';
import { createPipelineContext } from './pipeline-context.js';
import { resolveDocsPaths } from './capture-path-resolver.js';
import {
  buildSlugLookupFromRegistry,
} from './capture-targets.js';
import { createCaptureServices } from './capture-services.js';
import {
  classifyTargetKind,
  extractSingleNodeCandidate,
  isKindAllowed,
  resolveSpecExhibitNodeIds,
} from './figma-component-discovery.js';
import { buildCaptureTargets } from './capture-target-builder.js';
import { createCaptureReport } from './capture-report.js';
import { executeCaptureBatchAndRefresh } from './capture-batch-execution.js';
import { computeContentFingerprint } from '../../../apps/ds-dashboard/server/services/figma-diff-service.js';
import type {
  FigmaDescriptor,
  CaptureContext,
  SourceCandidate,
  CaptureTargetKind,
} from './capture-target-builder.js';
import type { PipelineContext } from './pipeline-context.js';
import type { ParsedFigmaFileUrl } from './figma-component-map.js';
import type { ExtractedComponentSpec } from '../types/spec.js';
import type { CaptureTarget } from '../types/capture-targets.js';

interface ComponentMapShape {
  pages?: Array<{
    name?: unknown;
    children?: Array<{ id?: unknown; nodeId?: unknown }>;
  }>;
  components?: Array<{
    id?: unknown;
    nodeId?: unknown;
    type?: unknown;
  }>;
  componentSets?: Array<{
    id?: unknown;
    nodeId?: unknown;
    type?: unknown;
  }>;
  tree_contains?: Array<{
    parent_node_id?: unknown;
    child_node_id?: unknown;
  }>;
}

type CapturePipelinePhase =
  | 'validate_input'
  | 'parse_descriptor'
  | 'token_sync'
  | 'resolve_context'
  | 'build_targets'
  | 'capture_batch'
  | 'dry_run';

function throwWithPipelinePhase(
  error: unknown,
  phase: CapturePipelinePhase,
): never {
  if (error instanceof Error) {
    const enriched = error as Error & { pipeline_phase?: string };
    if (!enriched.pipeline_phase) {
      enriched.pipeline_phase = phase;
    }
    throw enriched;
  }
  const wrapped = new Error(String(error));
  (wrapped as Error & { pipeline_phase?: string }).pipeline_phase = phase;
  throw wrapped;
}

function buildPageNameByNodeId(
  componentMap: ComponentMapShape | null,
): Map<string, string> {
  const pageNameByNodeId = new Map<string, string>();
  const pages = Array.isArray(componentMap?.pages) ? componentMap.pages : [];
  for (const page of pages) {
    const pageName = String(page?.name || '').trim();
    if (!pageName) continue;
    const children = Array.isArray(page?.children) ? page.children : [];
    for (const child of children) {
      const nodeId = String(child?.id || child?.nodeId || '').trim();
      if (!nodeId || pageNameByNodeId.has(nodeId)) continue;
      pageNameByNodeId.set(nodeId, pageName);
    }
  }
  return pageNameByNodeId;
}

function buildVariantCountByNodeId(
  componentMap: ComponentMapShape | null,
): Map<string, number> {
  const nodeTypeByNodeId = new Map<string, string>();
  const registerNode = (
    node: {
      id?: unknown;
      nodeId?: unknown;
      type?: unknown;
    },
    fallbackType: 'component' | 'component_set',
  ) => {
    const nodeId = String(node?.id || node?.nodeId || '').trim();
    if (!nodeId) return;
    const type = String(node?.type || '').trim().toLowerCase() || fallbackType;
    nodeTypeByNodeId.set(nodeId, type);
  };

  const components = Array.isArray(componentMap?.components)
    ? componentMap.components
    : [];
  const componentSets = Array.isArray(componentMap?.componentSets)
    ? componentMap.componentSets
    : [];
  const relations = Array.isArray(componentMap?.tree_contains)
    ? componentMap.tree_contains
    : [];

  for (const component of components) {
    registerNode(component, 'component');
  }
  for (const componentSet of componentSets) {
    registerNode(componentSet, 'component_set');
  }

  const childrenByParent = new Map<string, Set<string>>();
  for (const relation of relations) {
    const parentNodeId = String(relation?.parent_node_id || '').trim();
    const childNodeId = String(relation?.child_node_id || '').trim();
    if (!parentNodeId || !childNodeId) continue;
    const childSet = childrenByParent.get(parentNodeId) ?? new Set<string>();
    childSet.add(childNodeId);
    childrenByParent.set(parentNodeId, childSet);
  }

  const variantCountByNodeId = new Map<string, number>();
  for (const componentSet of componentSets) {
    const nodeId = String(componentSet?.id || componentSet?.nodeId || '').trim();
    if (!nodeId) continue;
    const childNodeIds = Array.from(childrenByParent.get(nodeId) ?? []);
    const variantCount = childNodeIds.filter(
      (childNodeId) => nodeTypeByNodeId.get(childNodeId) === 'component',
    ).length;
    variantCountByNodeId.set(nodeId, variantCount);
  }

  return variantCountByNodeId;
}

function resolveCandidateVariantCount(
  candidate: SourceCandidate,
  componentMap: ComponentMapShape | null,
  variantCountByNodeId: Map<string, number>,
): number {
  const explicitVariantCount = [
    candidate.variant_count,
    candidate.variantCount,
    candidate.variants_count,
    candidate.variantsCount,
  ].find((value) => Number.isFinite(Number(value)));
  if (explicitVariantCount !== undefined) {
    return Math.max(0, Math.floor(Number(explicitVariantCount)));
  }

  if (Array.isArray(candidate.variants)) {
    return candidate.variants.length;
  }

  const nodeId = String(candidate.node_id || '').trim();
  if (!nodeId) {
    return 0;
  }

  const candidateType = String(candidate.type || candidate.kind || '').trim().toLowerCase();
  if (candidateType === 'component_set') {
    const resolved = variantCountByNodeId.get(nodeId);
    return typeof resolved === 'number' ? resolved : 0;
  }

  if (candidateType === 'component') {
    return 0;
  }

  const componentSetCandidate = Array.isArray(componentMap?.componentSets)
    ? componentMap.componentSets.find(
        (item) => String(item?.id || item?.nodeId || '').trim() === nodeId,
      )
    : null;
  if (componentSetCandidate) {
    const resolved = variantCountByNodeId.get(nodeId);
    return typeof resolved === 'number' ? resolved : 0;
  }

  const componentCandidate = Array.isArray(componentMap?.components)
    ? componentMap.components.find(
        (item) => String(item?.id || item?.nodeId || '').trim() === nodeId,
      )
    : null;
  if (componentCandidate) {
    return 0;
  }

  return 0;
}

function attachContentFingerprints(
  sourceCandidates: SourceCandidate[],
  componentMap: ComponentMapShape | null,
): SourceCandidate[] {
  const pageNameByNodeId = buildPageNameByNodeId(componentMap);
  const variantCountByNodeId = buildVariantCountByNodeId(componentMap);
  return sourceCandidates.map((candidate) => {
    const nodeId = String(candidate.node_id || '').trim();
    const pageName =
      String(candidate.page_name || pageNameByNodeId.get(nodeId) || '').trim() ||
      undefined;
    const type = String(candidate.type || candidate.kind || '').trim() || 'unknown';
    const variantCount = resolveCandidateVariantCount(
      candidate,
      componentMap,
      variantCountByNodeId,
    );
    const contentFingerprint = computeContentFingerprint({
      name: String(candidate.name || '').trim(),
      type,
      pageName,
      variantCount,
    });
    return {
      ...candidate,
      page_name: pageName,
      variantCount,
      contentFingerprint,
    };
  });
}

/**
 * Dependencies for runCaptureFromFigmaUrl.
 */
export interface RunCaptureFromFigmaUrlDeps {
  projectRoot?: string;
  resolveSystemContextSafeFn?: typeof resolveSystemContextSafe;
  parseFigmaFileUrlFn?: typeof parseFigmaFileUrl;
  fetchFigmaFileFn?: typeof fetchFigmaFile;
  fetchFigmaFileComponentsFn?: typeof fetchFigmaFileComponents;
  fetchFigmaNodesFn?: typeof fetchFigmaNodes;
  fetchFigmaImagesFn?: typeof fetchFigmaImages;
  buildFigmaComponentMapFn?: typeof buildFigmaComponentMap;
  buildFigmaNodeUrlFn?: typeof buildFigmaNodeUrl;
  bootstrapFigmaTokensToDatabaseFn?: typeof bootstrapFigmaTokensToDatabase;
  getSystemConfigFn?: typeof getSystemConfig;
  extractSingleNodeCandidateFn?: typeof extractSingleNodeCandidate;
  parseBooleanOptionFn?: typeof parseBooleanOption;
  parseComponentKindFn?: typeof parseComponentKind;
  parseMainCaptureModeFn?: typeof parseMainCaptureMode;
  parsePositiveNumberFn?: typeof parsePositiveNumber;
  buildSlugLookupFromRegistryFn?: typeof buildSlugLookupFromRegistry;
  isKindAllowedFn?: typeof isKindAllowed;
  classifyTargetKindFn?: typeof classifyTargetKind;
  buildCaptureTargetsFn?: typeof buildCaptureTargets;
  createCaptureReportFn?: typeof createCaptureReport;
  executeCaptureBatchAndRefreshFn?: typeof executeCaptureBatchAndRefresh;
  runJsonCommandFn?: typeof runJsonCommand;
  extractComponentSpecFn?: typeof extractComponentSpec;
  resolveSpecExhibitNodeIdsFn?: typeof resolveSpecExhibitNodeIds;
  resolveDocsPathsFn?: typeof resolveDocsPaths;
  stderrWrite?: (data: string) => void;
  createPipelineContext?: typeof createPipelineContext;
  createCaptureServicesFn?: typeof createCaptureServices;
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
    fetchFigmaFileComponentsFn = fetchFigmaFileComponents,
    fetchFigmaNodesFn = fetchFigmaNodes,
    fetchFigmaImagesFn = fetchFigmaImages,
    buildFigmaComponentMapFn = buildFigmaComponentMap,
    buildFigmaNodeUrlFn = buildFigmaNodeUrl,
    bootstrapFigmaTokensToDatabaseFn = bootstrapFigmaTokensToDatabase,
    getSystemConfigFn = getSystemConfig,
    extractSingleNodeCandidateFn = extractSingleNodeCandidate,
    parseBooleanOptionFn = parseBooleanOption,
    parseComponentKindFn = parseComponentKind,
    parseMainCaptureModeFn = parseMainCaptureMode,
    parsePositiveNumberFn = parsePositiveNumber,
    buildSlugLookupFromRegistryFn = buildSlugLookupFromRegistry,
    isKindAllowedFn = isKindAllowed,
    classifyTargetKindFn = classifyTargetKind,
    buildCaptureTargetsFn = buildCaptureTargets,
    createCaptureReportFn = createCaptureReport,
    executeCaptureBatchAndRefreshFn = executeCaptureBatchAndRefresh,
    runJsonCommandFn = runJsonCommand,
    extractComponentSpecFn = extractComponentSpec,
    resolveSpecExhibitNodeIdsFn = resolveSpecExhibitNodeIds,
    resolveDocsPathsFn = resolveDocsPaths,
    stderrWrite: stderrWriteFn = process.stderr.write.bind(process.stderr),
    createPipelineContext: createPipelineContextFn = createPipelineContext,
    createCaptureServicesFn = createCaptureServices,
    orchestrateTokenSyncFn = orchestrateTokenSync,
    configureFigmaContextFn = configureFigmaContext,
  } = deps;

  const figmaUrl = String(args.url || '').trim();
  let phase: CapturePipelinePhase = 'validate_input';
  if (!figmaUrl) {
    throwWithPipelinePhase(
      new Error('Missing Figma URL. Provide --url <figma-url>.'),
      phase,
    );
  }

  const figmaTokenRaw = String(
    args['figma-token'] || process.env.FIGMA_TOKEN || '',
  ).trim();
  if (!figmaTokenRaw) {
    throwWithPipelinePhase(
      new Error(
        'Missing Figma token. Provide --figma-token <token> or set FIGMA_TOKEN.',
      ),
      phase,
    );
  }

  const context: PipelineContext = await createPipelineContextFn(args);
  const { repoRoot, figmaToken, system: ctx, paths, flags } = context;

  const {
    docsRootDir,
    proofDir,
    proofImageDir,
    resolvedSpecRoot,
  } = paths;

  const {
    componentSlugOverride,
    componentKind,
    includeVariants,
    continueOnError,
    dryRun,
    includeSpecExhibits,
    variantLimit,
    scale,
    format,
    agent,
    mainCaptureMode,
    skipDbPersistence,
  } = flags;

  phase = 'parse_descriptor';
  let descriptor: ParsedFigmaFileUrl;
  try {
    descriptor = parseFigmaFileUrlFn(figmaUrl);
  } catch (error) {
    throwWithPipelinePhase(error, phase);
  }
  const descriptorWithSource: FigmaDescriptor & { nodeIdFromUrl?: string } = {
    ...descriptor,
    sourceUrl: descriptor.figmaUrl,
    nodeIdFromUrl: descriptor.rootNodeId || undefined,
  };
  phase = 'token_sync';
  let tokenBootstrap: unknown;
  try {
    const tokenSync = await orchestrateTokenSyncFn({
      dryRun,
      projectRoot,
      systemId: ctx.id,
      fileKey: descriptor.fileKey,
      figmaToken,
      figmaUrl: descriptor.figmaUrl,
      tokensSource: flags.tokensSource,
      getSystemConfigFn,
      bootstrapFigmaTokensToDatabaseFn,
    });
    tokenBootstrap = tokenSync.tokenBootstrap;
  } catch (error) {
    throwWithPipelinePhase(error, phase);
  }

  const { ensureFilePayload, resolveContext } = configureFigmaContextFn({
    descriptor: descriptorWithSource,
    figmaToken,
    fetchFigmaFileFn,
    fetchFigmaNodesFn,
    extractSingleNodeCandidateFn,
    buildFigmaComponentMapFn,
  });

  phase = 'resolve_context';
  let componentMap: Awaited<ReturnType<typeof resolveContext>>['componentMap'];
  let singleNodeCandidate: Awaited<
    ReturnType<typeof resolveContext>
  >['singleNodeCandidate'];
  try {
    const resolved = await resolveContext();
    componentMap = resolved.componentMap;
    singleNodeCandidate = resolved.singleNodeCandidate;
  } catch (error) {
    throwWithPipelinePhase(error, phase);
  }

  phase = 'build_targets';
  let services: ReturnType<typeof createCaptureServices>;
  let componentRows: Awaited<ReturnType<ReturnType<typeof createCaptureServices>['readComponentRegistry']>>;
  let slugByNodeFromRegistry: ReturnType<typeof buildSlugLookupFromRegistryFn>;
  try {
    services = createCaptureServicesFn({ context });
    componentRows = await services.readComponentRegistry();
    slugByNodeFromRegistry = buildSlugLookupFromRegistryFn(componentRows);
  } catch (error) {
    throwWithPipelinePhase(error, phase);
  }

  const allComponents = Array.isArray(componentMap?.components)
    ? componentMap.components
    : [];
  const allComponentSets = Array.isArray(componentMap?.componentSets)
    ? componentMap.componentSets
    : [];
  const treeContains = componentMap?.tree_contains;
  const nestedComponentNodeIds = new Set(
    Array.isArray(treeContains)
      ? treeContains.map((relation) => String(relation?.child_node_id || '').trim())
      : [],
  );
  const rootComponents = allComponents.filter((component) => {
    const nodeId = String(component.id || '').trim();
    return nodeId.length > 0 && !nestedComponentNodeIds.has(nodeId);
  });
  const allSourceItems = [...rootComponents, ...allComponentSets];
  const hasNodeIdFromUrl = Boolean(descriptor.rootNodeId);

  // Build source candidates from components
  let sourceCandidates: SourceCandidate[];
  if (hasNodeIdFromUrl) {
    // Single node mode
    sourceCandidates = [singleNodeCandidate].filter(
      Boolean,
    ) as SourceCandidate[];
  } else if (componentKind && componentKind !== 'all') {
    // Filter by requested component kind
    sourceCandidates = allSourceItems
      .filter((component) => {
        const kind = classifyTargetKindFn(component.type);
        return isKindAllowedFn(kind, componentKind);
      })
      .map(
        (component): SourceCandidate => ({
          node_id: component.id,
          name: component.name,
          kind: component.type,
          type: component.type,
        }),
      );
  } else {
    // All components and component sets mode
    sourceCandidates = allSourceItems.map(
      (component): SourceCandidate => ({
        node_id: component.id,
        name: component.name,
        kind: component.type,
        type: component.type,
      }),
    );
  }

  if (sourceCandidates.length > 1) {
    const deduped = new Map<string, SourceCandidate>();
    for (const candidate of sourceCandidates) {
      const nodeId = String(candidate.node_id || '').trim();
      if (!nodeId || deduped.has(nodeId)) continue;
      deduped.set(nodeId, candidate);
    }
    sourceCandidates = Array.from(deduped.values());
  }

  const allowFallbackSources =
    !componentKind || componentKind === 'all';

  if (allowFallbackSources && !hasNodeIdFromUrl && sourceCandidates.length === 0) {
    try {
      const componentsResponse = await fetchFigmaFileComponentsFn({
        fileKey: descriptor.fileKey,
        token: figmaToken,
      });
      const publishedComponents = Array.isArray(componentsResponse?.meta?.components)
        ? componentsResponse.meta.components
        : [];
      sourceCandidates = publishedComponents.map(
        (component): SourceCandidate => ({
          node_id: String(component.node_id || '').trim(),
          name: String(component.name || '').trim(),
          kind: 'component',
          type: 'component',
          componentSetId: String(component.componentSetId || '').trim() || undefined,
        }),
      ).filter((candidate) => String(candidate.node_id || '').trim());
    } catch (error) {
      throwWithPipelinePhase(error, phase);
    }
  }

  if (allowFallbackSources && !hasNodeIdFromUrl) {
    // Registry candidates are merged only after a live Figma node preflight.
    // This keeps the fallback available when discovery is empty, while
    // dropping stale component_set IDs that no longer resolve in Figma.
    const registryCandidates = componentRows
      .map(
        (row): SourceCandidate => ({
          node_id: String(
            (row as { figma?: { component_set_node_id?: string | null } })
              .figma?.component_set_node_id || '',
          ).trim(),
          name: String((row as { slug?: string }).slug || '').trim(),
          kind: 'component_set',
          type: 'component_set',
        }),
      )
      .filter((candidate) => {
        const nodeId = String(candidate.node_id || '').trim();
        return nodeId.length > 0;
      });

    if (registryCandidates.length > 0) {
      let existingRegistryNodeIds = new Set<string>();
      try {
        const registryNodeIds = Array.from(
          new Set(
            registryCandidates
              .map((candidate) => String(candidate.node_id || '').trim())
              .filter((nodeId) => nodeId.length > 0),
          ),
        );
        const registryNodePayload = await fetchFigmaNodesFn({
          fileKey: descriptor.fileKey,
          nodeIds: registryNodeIds,
          token: figmaToken,
        });
        existingRegistryNodeIds = new Set(
          Object.entries(registryNodePayload?.nodes || {})
            .filter(([, node]) => Boolean((node as { document?: unknown } | undefined)?.document))
            .map(([nodeId]) => String(nodeId || '').trim())
            .filter((nodeId) => nodeId.length > 0),
        );
      } catch (error) {
        console.warn(
          `[runCaptureFromFigmaUrl] Registry node preflight failed; skipping persisted registry candidates: ${error instanceof Error ? error.message : String(error)}`,
        );
        existingRegistryNodeIds = new Set();
      }

      const filteredRegistryCandidates = registryCandidates.filter((candidate) => {
        const nodeId = String(candidate.node_id || '').trim();
        return nodeId.length > 0 && existingRegistryNodeIds.has(nodeId);
      });

      if (filteredRegistryCandidates.length > 0) {
        const merged = new Map<string, SourceCandidate>();
        for (const candidate of [...sourceCandidates, ...filteredRegistryCandidates]) {
          const nodeId = String(candidate.node_id || '').trim();
          if (!nodeId || merged.has(nodeId)) continue;
          merged.set(nodeId, candidate);
        }
        sourceCandidates = Array.from(merged.values());
      }
    }
  }
  sourceCandidates = attachContentFingerprints(sourceCandidates, componentMap);
  const applySlugOverride = Boolean(componentSlugOverride && hasNodeIdFromUrl);

  const captureScriptPath = path.join(
    projectRoot,
    'tooling',
    'src',
    'runners',
    'capture-visual-proof-runner.ts',
  );

  let targets: CaptureTarget[];
  let skipped: unknown[];
  try {
    const targetBuild = await buildCaptureTargetsFn({
      sourceCandidates,
      descriptor: descriptorWithSource,
      ctx: ctx as unknown as CaptureContext | Record<string, unknown>,
      docsRootOverride: paths.docsRootOverride ?? undefined,
      applySlugOverride,
      componentSlugOverride,
      slugByNodeFromRegistry,
      includeSpecExhibits,
      figmaToken,
      ensureFilePayload,
      fetchFigmaNodes: fetchFigmaNodesFn,
      fetchFigmaImages: fetchFigmaImagesFn as unknown as (options: {
        fileKey: string;
        nodeIds: string[];
        token: string;
        format?: string;
        scale?: number;
      }) => Promise<{ images?: Record<string, string> }>,
      extractComponentSpec: extractComponentSpecFn as unknown as (
        node: unknown,
      ) => import('./capture-target-builder.js').ExtractedComponentSpec,
      resolveSpecExhibitNodeIds:
        resolveSpecExhibitNodeIdsFn as unknown as (options: {
          figmaFilePayload: unknown;
          targetNodeId: string;
        }) => {
          specsNodeId?: string;
          anatomyNodeId?: string;
          propertiesNodeId?: string;
          layoutNodeId?: string;
        } | null,
      buildFigmaNodeUrl: buildFigmaNodeUrlFn as unknown as (
        descriptor: FigmaDescriptor | Record<string, unknown>,
        nodeId: string,
      ) => string,
      classifyTargetKind: classifyTargetKindFn as unknown as (
        kind?: string | null,
      ) => CaptureTargetKind,
      stderrWrite: stderrWriteFn,
      specExistsFn: services.specExists,
    });
    targets = targetBuild.targets as CaptureTarget[];
    skipped = targetBuild.skipped as unknown[];
  } catch (error) {
    throwWithPipelinePhase(error, phase);
  }

  const report = createCaptureReportFn({
    dryRun,
    descriptor: {
      sourceUrl:
        descriptorWithSource.sourceUrl || descriptorWithSource.figmaUrl || '',
      fileKey: descriptorWithSource.fileKey,
      nodeIdFromUrl: descriptor.rootNodeId || undefined,
    },
    requested: {
      component_kind: componentKind ?? undefined,
      include_variants: includeVariants,
      variant_limit: variantLimit,
      scale,
      format,
      main_capture_mode: mainCaptureMode,
      include_spec_exhibits: includeSpecExhibits,
    },
    tokenBootstrap,
    sourceCandidates,
    targets,
    skipped,
  });

  if (dryRun) {
    phase = 'dry_run';
    return {
      ok: true,
      report: report as unknown as Record<string, unknown>,
    } as RunCaptureFromFigmaUrlResult;
  }

  phase = 'capture_batch';
  let batchResult: Record<string, unknown>;
  try {
    batchResult = executeCaptureBatchAndRefreshFn({
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
      skipDbPersistence,
    });
  } catch (error) {
    throwWithPipelinePhase(error, phase);
  }

  return batchResult as unknown as RunCaptureFromFigmaUrlResult;
}
