#!/usr/bin/env node

import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import {
  buildFigmaComponentMap,
  buildFigmaNodeUrl,
  parseFigmaFileUrl,
} from "./lib/figma-component-map.mjs";
import {
  fetchFigmaFile,
  fetchFigmaNodes,
} from "./lib/figma-api.mjs";
import { resolveSystemContextSafe, PROJECT_ROOT } from "./lib/system-context.mjs";
import {
  bootstrapInputJsonFromFigmaVariables,
  ensureCollectionsConfigured,
  getSystemConfig,
  runTokensCompileIfNeeded,
} from "./lib/capture-system-bootstrap.mjs";
import {
  extractComponentSpec,
  renderEnrichedMarkdownSeed,
} from "./lib/figma-node-spec-extractor.mjs";
import { runJsonCommand } from "./lib/exec.mjs";
import {
  parseBooleanOption,
  parseComponentKind,
  parseMainCaptureMode,
  parsePositiveNumber,
} from "./lib/capture-options.mjs";
import {
  buildMarkdownSeed,
  ensureSystemDocsScaffold,
  writeTextAtomic,
} from "./lib/capture-doc-scaffold.mjs";
import { resolveDocsPaths } from "./lib/capture-path-resolver.mjs";
import {
  buildSlugLookupFromRegistry,
  buildSlugLookupFromSpecs,
  readComponentRegistry,
} from "./lib/capture-targets.mjs";
import {
  classifyTargetKind,
  extractSingleNodeCandidate,
  isKindAllowed,
  resolveSpecExhibitNodeIds,
} from "./lib/figma-component-discovery.mjs";
import { injectExtractedSpecSectionsIntoMarkdown } from "./lib/capture-markdown-sections.mjs";
import { runCaptureBatch } from "./lib/capture-orchestrator.mjs";
import { buildCaptureTargets } from "./lib/capture-target-builder.mjs";
import { createCaptureReport } from "./lib/capture-report.mjs";

const USAGE = {
  command:
    'npm run ds:capture-from-url -- --url "https://www.figma.com/design/<fileKey>/<slug>?node-id=123-456"',
  description:
    "Capture visual proof from a Figma URL (single component node or full document) and update matching component markdown detail pages.",
  options: [
    {
      name: "--url <figma-url>",
      description: "Figma file/design URL with or without node-id.",
      required: true,
    },
    {
      name: "--figma-token <token>",
      description:
        "Figma PAT for REST image export and document traversal. Falls back to FIGMA_TOKEN env var.",
    },
    {
      name: "--docs-root <path>",
      description: "Docs root or docs/components directory.",
      defaultValue: "docs/components",
    },
    {
      name: "--proof-dir <path>",
      description: "Visual proof JSON output directory.",
      defaultValue: "docs/_generated/visual-proofs",
    },
    {
      name: "--proof-image-dir <path>",
      description: "Visual proof images output directory.",
      defaultValue: "docs/_generated/visual-proofs/images",
    },
    {
      name: "--component-slug <slug>",
      description:
        "Optional explicit component slug (useful when node-id cannot be mapped deterministically).",
    },
    {
      name: "--component-kind <component_set|component|all>",
      description:
        "Component node kinds processed for document URLs. `component_set` is recommended.",
      defaultValue: "component_set",
    },
    {
      name: "--require-existing-doc <true|false>",
      description:
        "Only capture for components that already have markdown docs.",
      defaultValue: "true",
    },
    {
      name: "--include-variants <true|false>",
      description: "Capture one screenshot per variant when possible.",
      defaultValue: "true",
    },
    {
      name: "--variant-limit <number>",
      description: "Max variants captured per component.",
      defaultValue: "6",
    },
    {
      name: "--format <png|jpg|svg|pdf>",
      description: "Export format for screenshots.",
      defaultValue: "png",
    },
    {
      name: "--scale <number>",
      description: "Export scale for screenshots.",
      defaultValue: "2",
    },
    {
      name: "--main-capture-mode <auto|agent|rest>",
      description: "Main screenshot capture mode passed to ds-capture-visual-proof.",
      defaultValue: "rest",
    },
    {
      name: "--agent <codex|claude|gemini|auto>",
      description: "Agent backend for agent-based capture mode.",
      defaultValue: "auto",
    },
    {
      name: "--continue-on-error <true|false>",
      description: "Continue batch captures when one component fails.",
      defaultValue: "true",
    },
    {
      name: "--refresh-indices <true|false>",
      description:
        "Refresh component registry + overview once after batch capture.",
      defaultValue: "true",
    },
    {
      name: "--dry-run <true|false>",
      description: "Resolve targets and report without writing changes.",
      defaultValue: "false",
    },
    {
      name: "--inject-doc-specs <true|false>",
      description:
        "When markdown exists, refresh Anatomy, Component API and Visual Specifications from the source Figma node.",
      defaultValue: "false",
    },
    {
      name: "--include-spec-exhibits <true|false>",
      description:
        "Append Specs screenshots (Anatomy, Properties, Layout and spacing) to injected documentation sections when available.",
      defaultValue: "true",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};


function runNodeScriptJson({ repoRoot, scriptPath, scriptArgs }) {
  const scriptArgsList = Array.isArray(scriptArgs) ? [...scriptArgs] : [];
  const displayArgs = [...scriptArgsList];
  const tokenArgIndex = displayArgs.indexOf("--figma-token");
  if (tokenArgIndex >= 0 && tokenArgIndex + 1 < displayArgs.length) {
    displayArgs[tokenArgIndex + 1] = "***redacted***";
  }

  const result = runJsonCommand(process.execPath, [scriptPath, ...scriptArgsList], {
    cwd: repoRoot,
    displayArgs: [path.relative(repoRoot, scriptPath), ...displayArgs],
  });
  return result.data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const figmaUrl = String(args.url || "").trim();
  if (!figmaUrl) {
    printUsage(USAGE, { stream: "stderr", exitCode: 1 });
  }

  const figmaToken = String(args["figma-token"] || process.env.FIGMA_TOKEN || "").trim();
  if (!figmaToken) {
    throw new Error(
      "Missing Figma token. Provide --figma-token <token> or set FIGMA_TOKEN.",
    );
  }

  const ctx = resolveSystemContextSafe({ system: args.system });
  const docsRootOverride = args["docs-root"] ? String(args["docs-root"]).trim() : null;
  const rawSlug = String(args["component-slug"] || "")
    .trim()
    .toLowerCase();
  // Reject slugs with path traversal characters
  const componentSlugOverride = rawSlug.replace(/[/\\]/g, "-").replace(/\.\./g, "");
  if (rawSlug && componentSlugOverride !== rawSlug) {
    console.warn(
      `[capture] Sanitized component-slug: "${rawSlug}" → "${componentSlugOverride}"`,
    );
  }
  const componentKind = parseComponentKind(args["component-kind"]);
  const includeVariants = parseBooleanOption(
    args["include-variants"],
    "--include-variants",
    true,
  );
  const requireExistingDoc = parseBooleanOption(
    args["require-existing-doc"],
    "--require-existing-doc",
    true,
  );
  const continueOnError = parseBooleanOption(
    args["continue-on-error"],
    "--continue-on-error",
    true,
  );
  const refreshIndices = parseBooleanOption(
    args["refresh-indices"],
    "--refresh-indices",
    true,
  );
  const dryRun = parseBooleanOption(args["dry-run"], "--dry-run", false);
  const injectDocSpecs = parseBooleanOption(
    args["inject-doc-specs"],
    "--inject-doc-specs",
    false,
  );
  const includeSpecExhibits = parseBooleanOption(
    args["include-spec-exhibits"],
    "--include-spec-exhibits",
    true,
  );
  const variantLimit = Math.floor(
    parsePositiveNumber(args["variant-limit"], "--variant-limit", 6),
  );
  const scale = parsePositiveNumber(args.scale, "--scale", 2);
  const format = String(args.format || "png").trim().toLowerCase();
  const agent = String(args.agent || "auto").trim();
  const mainCaptureMode = parseMainCaptureMode(args["main-capture-mode"]);
  const proofDir = path.resolve(
    args["proof-dir"] || path.join(ctx.paths.generated, "visual-proofs"),
  );
  const proofImageDir = path.resolve(
    args["proof-image-dir"] ||
      path.join(ctx.paths.generated, "visual-proofs", "images"),
  );

  const descriptor = parseFigmaFileUrl(figmaUrl);
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
    let systemConfig = getSystemConfig({ repoRoot: PROJECT_ROOT, systemId: ctx.id });
    tokenBootstrap = await bootstrapInputJsonFromFigmaVariables({
      repoRoot: PROJECT_ROOT,
      system: systemConfig,
      fileKey: descriptor.fileKey,
      figmaToken,
    });
    ensureCollectionsConfigured({ repoRoot: PROJECT_ROOT, systemId: ctx.id });
    systemConfig = getSystemConfig({ repoRoot: PROJECT_ROOT, systemId: ctx.id });
    tokenCompile = runTokensCompileIfNeeded({
      repoRoot: PROJECT_ROOT,
      system: systemConfig,
    });
  }

  let componentMap = null;
  let singleNodeCandidate = null;
  let filePayload = null;
  const ensureFilePayload = async () => {
    if (filePayload) return filePayload;
    filePayload = await fetchFigmaFile({
      fileKey: descriptor.fileKey,
      token: figmaToken,
    });
    return filePayload;
  };

  if (descriptor.nodeIdFromUrl) {
    try {
      const nodePayload = await fetchFigmaNodes({
        fileKey: descriptor.fileKey,
        nodeIds: [descriptor.nodeIdFromUrl],
        token: figmaToken,
        depth: 1,
      });
      singleNodeCandidate = extractSingleNodeCandidate(
        nodePayload,
        descriptor.nodeIdFromUrl,
      );
    } catch {
      // Fall back to raw node id even if metadata fetch fails.
      singleNodeCandidate = {
        node_id: descriptor.nodeIdFromUrl,
        name: descriptor.nodeIdFromUrl,
        kind: "unknown",
        page_name: null,
      };
    }
  } else {
    filePayload = await ensureFilePayload();
    componentMap = buildFigmaComponentMap({
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
  ensureSystemDocsScaffold({ docsRootDir, componentDocsDir });
  const componentRegistryPath = path.join(
    docsRootDir,
    "_generated",
    "component-registry.json",
  );
  const specDir = path.resolve(path.join(docsRootDir, "_spec", "components"));

  const componentRows = readComponentRegistry(componentRegistryPath);
  const slugByNodeFromRegistry = buildSlugLookupFromRegistry(componentRows);
  const slugByNodeFromSpecs = buildSlugLookupFromSpecs(specDir);

  const allComponents = Array.isArray(componentMap?.components)
    ? componentMap.components
    : [];
  const sourceCandidates = descriptor.nodeIdFromUrl
    ? [singleNodeCandidate].filter(Boolean)
    : allComponents.filter((component) =>
        isKindAllowed(classifyTargetKind(component.kind), componentKind),
      );
  const applySlugOverride = Boolean(
    componentSlugOverride && descriptor.nodeIdFromUrl,
  );

  const captureScriptPath = path.join(
    PROJECT_ROOT,
    "tooling",
    "scripts",
    "ds-capture-visual-proof.mjs",
  );
  const registryRefreshScriptPath = path.join(
    PROJECT_ROOT,
    "tooling",
    "scripts",
    "ds-registry-refresh.mjs",
  );

  const { targets, skipped } = await buildCaptureTargets({
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
    repoRoot: PROJECT_ROOT,
    ensureFilePayload,
    fetchFigmaNodes,
    fetchFigmaImages,
    extractComponentSpec,
    resolveSpecExhibitNodeIds,
    resolveDocsPaths,
    buildFigmaNodeUrl,
    classifyTargetKind,
    renderEnrichedMarkdownSeed,
    injectExtractedSpecSectionsIntoMarkdown,
    buildMarkdownSeed,
    writeTextAtomic,
  });

  const report = createCaptureReport({
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
    repoRoot: PROJECT_ROOT,
  });

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const captureBatch = runCaptureBatch({
    targets,
    repoRoot: PROJECT_ROOT,
    captureScriptPath,
    runScriptJson: runNodeScriptJson,
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
      repoRoot: PROJECT_ROOT,
      scriptPath: registryRefreshScriptPath,
      scriptArgs: refreshArgs,
    });
    report.indices_refreshed = Boolean(refreshResult?.ok);
    report.registry_refresh = refreshResult;
  }

  report.ok = report.captured.length > 0 && report.failed.length === 0;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
