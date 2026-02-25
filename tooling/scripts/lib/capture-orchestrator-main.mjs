import path from "node:path";

import {
  buildFigmaComponentMap,
  buildFigmaNodeUrl,
  parseFigmaFileUrl,
} from "./figma-component-map.mjs";
import {
  fetchFigmaFile,
  fetchFigmaImages,
  fetchFigmaNodes,
} from "./figma-api.mjs";
import { resolveSystemContextSafe, PROJECT_ROOT } from "./system-context.mjs";
import {
  bootstrapInputJsonFromFigmaVariables,
  ensureCollectionsConfigured,
  getSystemConfig,
  runTokensCompileIfNeeded,
} from "./capture-system-bootstrap.mjs";
import { orchestrateTokenSync } from "./capture-token-orchestrator.mjs";
import { configureFigmaContext } from "./capture-figma-context.mjs";
import {
  extractComponentSpec,
  renderEnrichedMarkdownSeed,
} from "./figma-node-spec-extractor.mjs";
import { runJsonCommand } from "./exec.mjs";
import {
  parseBooleanOption,
  parseComponentKind,
  parseMainCaptureMode,
  parsePositiveNumber,
} from "./capture-options.mjs";
import { createPipelineContext } from "./pipeline-context.mjs";
import {
  buildMarkdownSeed,
  ensureSystemDocsScaffold,
  writeTextAtomic,
} from "./capture-doc-scaffold.mjs";
import { resolveDocsPaths } from "./capture-path-resolver.mjs";
import {
  buildSlugLookupFromRegistry,
  buildSlugLookupFromSpecContents,
} from "./capture-targets.mjs";
import { createCaptureServices } from "./capture-services.mjs";
import {
  classifyTargetKind,
  extractSingleNodeCandidate,
  isKindAllowed,
  resolveSpecExhibitNodeIds,
} from "./figma-component-discovery.mjs";
import { injectSpecZones } from "./spec-to-markdown-injector.mjs";
import { buildCaptureTargets } from "./capture-target-builder.mjs";
import { createCaptureReport } from "./capture-report.mjs";
import { executeCaptureBatchAndRefresh } from "./capture-batch-execution.mjs";



export async function runCaptureFromFigmaUrl(args, deps = {}) {
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
    writeTextAtomic: writeTextAtomicFn,
    stderrWrite: stderrWriteFn,
    createPipelineContext: createPipelineContextFn = createPipelineContext,
    orchestrateTokenSyncFn = orchestrateTokenSync,
    configureFigmaContextFn = configureFigmaContext,
  } = deps;

  const figmaUrl = String(args.url || "").trim();
  if (!figmaUrl) {
    throw new Error("Missing Figma URL. Provide --url <figma-url>.");
  }

  const figmaTokenRaw = String(args["figma-token"] || process.env.FIGMA_TOKEN || "").trim();
  if (!figmaTokenRaw) {
    throw new Error("Missing Figma token. Provide --figma-token <token> or set FIGMA_TOKEN.");
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

  const descriptor = parseFigmaFileUrlFn(figmaUrl);
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
    descriptor,
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
  const sourceCandidates = descriptor.nodeIdFromUrl
    ? [singleNodeCandidate].filter(Boolean)
    : allComponents.filter((component) =>
        isKindAllowedFn(classifyTargetKindFn(component.kind), componentKind),
      );
  const applySlugOverride = Boolean(componentSlugOverride && descriptor.nodeIdFromUrl);

  const captureScriptPath = path.join(projectRoot, "tooling", "scripts", "ds-capture-visual-proof.mjs");
  const registryRefreshScriptPath = path.join(projectRoot, "tooling", "scripts", "ds-registry-refresh.mjs");

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
