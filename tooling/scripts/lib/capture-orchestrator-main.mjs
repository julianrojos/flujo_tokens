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
import {
  buildMarkdownSeed,
  ensureSystemDocsScaffold,
  writeTextAtomic,
} from "./capture-doc-scaffold.mjs";
import { resolveDocsPaths } from "./capture-path-resolver.mjs";
import {
  buildSlugLookupFromRegistry,
  buildSlugLookupFromSpecs,
  readComponentRegistry,
} from "./capture-targets.mjs";
import {
  classifyTargetKind,
  extractSingleNodeCandidate,
  isKindAllowed,
  resolveSpecExhibitNodeIds,
} from "./figma-component-discovery.mjs";
import { injectExtractedSpecSectionsIntoMarkdown } from "./capture-markdown-sections.mjs";
import { runCaptureBatch } from "./capture-orchestrator.mjs";
import { buildCaptureTargets } from "./capture-target-builder.mjs";
import { createCaptureReport } from "./capture-report.mjs";

function runNodeScriptJson({ repoRoot, scriptPath, scriptArgs, runJsonCommandFn }) {
  const scriptArgsList = Array.isArray(scriptArgs) ? [...scriptArgs] : [];
  const displayArgs = [...scriptArgsList];
  const tokenArgIndex = displayArgs.indexOf("--figma-token");
  if (tokenArgIndex >= 0 && tokenArgIndex + 1 < displayArgs.length) {
    displayArgs[tokenArgIndex + 1] = "***redacted***";
  }

  const result = runJsonCommandFn(process.execPath, [scriptPath, ...scriptArgsList], {
    cwd: repoRoot,
    displayArgs: [path.relative(repoRoot, scriptPath), ...displayArgs],
  });
  return result.data;
}

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
    readComponentRegistryFn = readComponentRegistry,
    buildSlugLookupFromRegistryFn = buildSlugLookupFromRegistry,
    buildSlugLookupFromSpecsFn = buildSlugLookupFromSpecs,
    isKindAllowedFn = isKindAllowed,
    classifyTargetKindFn = classifyTargetKind,
    buildCaptureTargetsFn = buildCaptureTargets,
    createCaptureReportFn = createCaptureReport,
    runCaptureBatchFn = runCaptureBatch,
    runJsonCommandFn = runJsonCommand,
    extractComponentSpecFn = extractComponentSpec,
    resolveSpecExhibitNodeIdsFn = resolveSpecExhibitNodeIds,
    resolveDocsPathsFn = resolveDocsPaths,
    renderEnrichedMarkdownSeedFn = renderEnrichedMarkdownSeed,
    injectExtractedSpecSectionsIntoMarkdownFn = injectExtractedSpecSectionsIntoMarkdown,
    buildMarkdownSeedFn = buildMarkdownSeed,
    writeTextAtomicFn = writeTextAtomic,
    stderrWriteFn = (message) => process.stderr.write(message),
  } = deps;

  const figmaUrl = String(args.url || "").trim();
  if (!figmaUrl) {
    throw new Error("Missing Figma URL. Provide --url <figma-url>.");
  }

  const figmaToken = String(args["figma-token"] || process.env.FIGMA_TOKEN || "").trim();
  if (!figmaToken) {
    throw new Error("Missing Figma token. Provide --figma-token <token> or set FIGMA_TOKEN.");
  }

  const ctx = resolveSystemContextSafeFn({ system: args.system });
  const docsRootOverride = args["docs-root"] ? String(args["docs-root"]).trim() : null;
  const rawSlug = String(args["component-slug"] || "").trim().toLowerCase();
  const componentSlugOverride = rawSlug.replace(/[\\/]/g, "-").replace(/\.\./g, "");
  if (rawSlug && componentSlugOverride !== rawSlug) {
    console.warn(`[capture] Sanitized component-slug: "${rawSlug}" → "${componentSlugOverride}"`);
  }

  const componentKind = parseComponentKindFn(args["component-kind"]);
  const includeVariants = parseBooleanOptionFn(args["include-variants"], "--include-variants", true);
  const requireExistingDoc = parseBooleanOptionFn(args["require-existing-doc"], "--require-existing-doc", true);
  const continueOnError = parseBooleanOptionFn(args["continue-on-error"], "--continue-on-error", true);
  const refreshIndices = parseBooleanOptionFn(args["refresh-indices"], "--refresh-indices", true);
  const dryRun = parseBooleanOptionFn(args["dry-run"], "--dry-run", false);
  const injectDocSpecs = parseBooleanOptionFn(args["inject-doc-specs"], "--inject-doc-specs", false);
  const includeSpecExhibits = parseBooleanOptionFn(
    args["include-spec-exhibits"],
    "--include-spec-exhibits",
    true,
  );
  const variantLimit = Math.floor(parsePositiveNumberFn(args["variant-limit"], "--variant-limit", 6));
  const scale = parsePositiveNumberFn(args.scale, "--scale", 2);
  const format = String(args.format || "png").trim().toLowerCase();
  const agent = String(args.agent || "auto").trim();
  const mainCaptureMode = parseMainCaptureModeFn(args["main-capture-mode"]);
  const proofDir = path.resolve(args["proof-dir"] || path.join(ctx.paths.generated, "visual-proofs"));
  const proofImageDir = path.resolve(
    args["proof-image-dir"] || path.join(ctx.paths.generated, "visual-proofs", "images"),
  );

  const descriptor = parseFigmaFileUrlFn(figmaUrl);
  let tokenBootstrap = {
    attempted: false,
    created: false,
    reason: dryRun ? "skipped-dry-run" : "not-run",
  };
  let tokenCompile = {
    attempted: false,
    compiled: false,
    reason: dryRun ? "skipped-dry-run" : "not-run",
  };

  if (!dryRun) {
    let systemConfig = getSystemConfigFn({ repoRoot: projectRoot, systemId: ctx.id });
    tokenBootstrap = await bootstrapInputJsonFromFigmaVariablesFn({
      repoRoot: projectRoot,
      system: systemConfig,
      fileKey: descriptor.fileKey,
      figmaToken,
    });
    ensureCollectionsConfiguredFn({ repoRoot: projectRoot, systemId: ctx.id });
    systemConfig = getSystemConfigFn({ repoRoot: projectRoot, systemId: ctx.id });
    tokenCompile = runTokensCompileIfNeededFn({
      repoRoot: projectRoot,
      system: systemConfig,
    });
  }

  let componentMap = null;
  let singleNodeCandidate = null;
  let filePayload = null;
  const ensureFilePayload = async () => {
    if (filePayload) return filePayload;
    filePayload = await fetchFigmaFileFn({
      fileKey: descriptor.fileKey,
      token: figmaToken,
    });
    return filePayload;
  };

  if (descriptor.nodeIdFromUrl) {
    try {
      const nodePayload = await fetchFigmaNodesFn({
        fileKey: descriptor.fileKey,
        nodeIds: [descriptor.nodeIdFromUrl],
        token: figmaToken,
        depth: 1,
      });
      singleNodeCandidate = extractSingleNodeCandidateFn(nodePayload, descriptor.nodeIdFromUrl);
    } catch {
      singleNodeCandidate = {
        node_id: descriptor.nodeIdFromUrl,
        name: descriptor.nodeIdFromUrl,
        kind: "unknown",
        page_name: null,
      };
    }
  } else {
    filePayload = await ensureFilePayload();
    componentMap = buildFigmaComponentMapFn({
      filePayload,
      fileDescriptor: descriptor,
      includeInstances: true,
    });
  }

  const docsRootInput = docsRootOverride || ctx.paths.docs;
  const docsRootResolved = path.resolve(docsRootInput);
  const docsRootDir =
    path.basename(docsRootResolved) === "components"
      ? path.dirname(docsRootResolved)
      : docsRootResolved;
  const componentDocsDir =
    path.basename(docsRootResolved) === "components"
      ? docsRootResolved
      : path.join(docsRootResolved, "components");
  ensureSystemDocsScaffoldFn({ docsRootDir, componentDocsDir });

  const componentRegistryPath = path.join(docsRootDir, "_generated", "component-registry.json");
  const specDir = path.resolve(path.join(docsRootDir, "_spec", "components"));

  const componentRows = readComponentRegistryFn(componentRegistryPath);
  const slugByNodeFromRegistry = buildSlugLookupFromRegistryFn(componentRows);
  const slugByNodeFromSpecs = buildSlugLookupFromSpecsFn(specDir);

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
    docsRootOverride,
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
    injectExtractedSpecSectionsIntoMarkdown: injectExtractedSpecSectionsIntoMarkdownFn,
    buildMarkdownSeed: buildMarkdownSeedFn,
    writeTextAtomic: writeTextAtomicFn,
    stderrWrite: stderrWriteFn,
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

  const captureBatch = runCaptureBatchFn({
    targets,
    repoRoot: projectRoot,
    captureScriptPath,
    runScriptJson: (params) =>
      runNodeScriptJson({
        ...params,
        runJsonCommandFn,
      }),
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
  });
  report.captured = captureBatch.captured;
  report.failed = captureBatch.failed;

  if (refreshIndices) {
    const refreshArgs = ["--system", args.system || ctx.id];
    const refreshResult = runNodeScriptJson({
      repoRoot: projectRoot,
      scriptPath: registryRefreshScriptPath,
      scriptArgs: refreshArgs,
      runJsonCommandFn,
    });
    report.indices_refreshed = Boolean(refreshResult?.ok);
    report.registry_refresh = refreshResult;
  }

  report.ok = report.captured.length > 0 && report.failed.length === 0;
  return report;
}
