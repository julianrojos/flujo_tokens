#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import {
  buildFigmaComponentMap,
  buildFigmaNodeUrl,
  parseFigmaFileUrl,
} from "./lib/figma-component-map.mjs";
import {
  fetchFigmaFile,
  fetchFigmaImages,
  fetchFigmaNodes,
} from "./lib/figma-api.mjs";
import {
  componentNameToSnakeCase,
  componentNameToDisplayName,
} from "./lib/component-name.mjs";
import { resolveSystemContextSafe, PROJECT_ROOT } from "./lib/system-context.mjs";
import { createDesignSystemRepository } from "./lib/system-repository.mjs";
import {
  extractComponentSpec,
  buildEnrichedMarkdownSections,
  renderEnrichedMarkdownSeed,
} from "./lib/figma-node-spec-extractor.mjs";
import {
  hasInputJsonFiles,
  syncFigmaTokensToInput,
  runTokensCompile,
} from "./lib/figma-token-sync.mjs";
import { runJsonCommand } from "./lib/exec.mjs";

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


function parseBooleanOption(rawValue, optionName, fallback = false) {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

function parsePositiveNumber(rawValue, optionName, fallback) {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a positive number.`,
    );
  }
  return parsed;
}

function parseComponentKind(rawValue) {
  const normalized = String(rawValue || "component_set")
    .trim()
    .toLowerCase();
  if (
    normalized === "component_set" ||
    normalized === "component" ||
    normalized === "all"
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid --component-kind value: ${rawValue}. Allowed: component_set, component, all.`,
  );
}

function parseMainCaptureMode(rawValue) {
  const normalized = String(rawValue || "rest")
    .trim()
    .toLowerCase();
  if (normalized === "auto" || normalized === "agent" || normalized === "rest") {
    return normalized;
  }
  throw new Error(
    `Invalid --main-capture-mode value: ${rawValue}. Allowed: auto, agent, rest.`,
  );
}

function normalizeNameToSlug(rawName) {
  const normalized = componentNameToSnakeCase(String(rawName || "").trim());
  return normalized || "";
}

function readComponentRegistry(componentRegistryPath) {
  if (!fs.existsSync(componentRegistryPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(componentRegistryPath, "utf8"));
    return Array.isArray(parsed?.components) ? parsed.components : [];
  } catch {
    return [];
  }
}

function buildSlugLookupFromRegistry(componentRows) {
  const byNodeId = new Map();
  for (const row of componentRows) {
    const slug = String(row?.slug || "").trim();
    const nodeId = String(row?.figma?.component_set_node_id || "").trim();
    if (!slug || !nodeId) continue;
    if (!byNodeId.has(nodeId)) byNodeId.set(nodeId, slug);
  }
  return byNodeId;
}

function buildSlugLookupFromSpecs(specDir) {
  const byNodeId = new Map();
  if (!fs.existsSync(specDir)) return byNodeId;
  const entries = fs.readdirSync(specDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".yml") || entry.name === "_template.yml") {
      continue;
    }
    const filePath = path.join(specDir, entry.name);
    const slug = path.basename(entry.name, ".yml");
    const raw = fs.readFileSync(filePath, "utf8");
    const match = raw.match(/^\s*component_set_node_id:\s*["']?([0-9]+:[0-9]+)["']?\s*$/m);
    if (!match || !match[1]) continue;
    const nodeId = String(match[1]).trim();
    if (!byNodeId.has(nodeId)) byNodeId.set(nodeId, slug);
  }
  return byNodeId;
}

function classifyTargetKind(kindValue) {
  const normalized = String(kindValue || "").trim().toLowerCase();
  if (normalized === "component_set") return "component_set";
  if (normalized === "component") return "component";
  return "unknown";
}

function isKindAllowed(kind, requestedKind) {
  if (requestedKind === "all") return kind !== "unknown";
  return kind === requestedKind;
}

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

function classifyNodeTypeToKind(nodeType) {
  const normalized = String(nodeType || "").trim().toUpperCase();
  if (normalized === "COMPONENT_SET") return "component_set";
  if (normalized === "COMPONENT") return "component";
  if (normalized === "FRAME" || normalized === "GROUP") return "frame";
  if (normalized === "INSTANCE") return "instance";
  return "unknown";
}

function extractSingleNodeCandidate(nodePayload, nodeId) {
  const nodes = nodePayload && typeof nodePayload === "object" ? nodePayload.nodes : null;
  const entry = nodes && typeof nodes === "object" ? nodes[nodeId] : null;
  const doc = entry && typeof entry === "object" ? entry.document : null;
  const safeName =
    doc && typeof doc === "object" && doc.name
      ? String(doc.name).trim()
      : nodeId;
  const safeType =
    doc && typeof doc === "object" && doc.type
      ? String(doc.type).trim()
      : "";

  return {
    node_id: nodeId,
    name: safeName || nodeId,
    kind: classifyNodeTypeToKind(safeType),
    page_name: null,
  };
}

function resolveDocsPaths({ ctx, docsRootOverride, slug }) {
  const docsRoot = docsRootOverride || ctx.paths.docs;
  const docsRootResolved = path.resolve(docsRoot);
  
  // If we have ctx, we can use its paths, but if the user overrode docsRoot,
  // we still need to derive the relative structure.
  const componentDocsDir =
    path.basename(docsRootResolved) === "components"
      ? docsRootResolved
      : path.join(docsRootResolved, "components");
      
  const docsRootDir =
    path.basename(docsRootResolved) === "components"
      ? path.dirname(docsRootResolved)
      : docsRootResolved;

  return {
    docsRootDir,
    componentDocsDir,
    markdownPath: path.join(componentDocsDir, `${slug}.md`),
    specPath: path.join(docsRootDir, "_spec", "components", `${slug}.yml`),
  };
}

function writeTextAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function escapeRegex(rawValue) {
  return String(rawValue || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceH2Section(markdown, heading, replacementBody) {
  const normalizedBody = String(replacementBody || "").trimEnd();
  const headingRegex = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m");
  const headingMatch = headingRegex.exec(markdown);
  if (!headingMatch) {
    return { changed: false, content: markdown };
  }

  const sectionStart = headingMatch.index;
  const headingLineEnd = markdown.indexOf("\n", sectionStart);
  const hasTrailingNewline = headingLineEnd >= 0;
  const headingLine = hasTrailingNewline
    ? markdown.slice(sectionStart, headingLineEnd + 1)
    : `${markdown.slice(sectionStart)}\n`;

  const bodyStart = hasTrailingNewline ? headingLineEnd + 1 : markdown.length;
  const tail = markdown.slice(bodyStart);
  const nextHeadingMatch = /^##\s+[^\n]+\s*$/m.exec(tail);
  const sectionEnd =
    nextHeadingMatch && Number.isFinite(nextHeadingMatch.index)
      ? bodyStart + nextHeadingMatch.index
      : markdown.length;

  const before = markdown.slice(0, sectionStart);
  const after = markdown.slice(sectionEnd).replace(/^\n*/, "\n");
  const replacement = `${headingLine}\n${normalizedBody}\n\n`;
  const next = `${before}${replacement}${after}`;
  return { changed: next !== markdown, content: next };
}

function injectExtractedSpecSectionsIntoMarkdown(markdown, spec, exhibits = null) {
  if (!spec || typeof spec !== "object") {
    return { changed: false, content: markdown };
  }

  const sections = buildEnrichedMarkdownSections(spec);
  const anatomyBody = appendSpecExhibit(
    sections.anatomy,
    "Anatomy",
    exhibits?.anatomy || null,
  );
  const componentApiBody = appendSpecExhibit(
    sections.componentApi,
    "Properties",
    exhibits?.properties || null,
  );
  const visualSpecsBody = appendSpecExhibit(
    sections.visualSpecifications,
    "Layout and spacing",
    exhibits?.layout || null,
  );
  let current = markdown;
  let changed = false;

  const anatomyResult = replaceH2Section(current, "Anatomy", anatomyBody);
  current = anatomyResult.content;
  changed = changed || anatomyResult.changed;

  const apiResult = replaceH2Section(current, "Component API", componentApiBody);
  current = apiResult.content;
  changed = changed || apiResult.changed;

  const visualResult = replaceH2Section(
    current,
    "Visual Specifications",
    visualSpecsBody,
  );
  current = visualResult.content;
  changed = changed || visualResult.changed;

  return { changed, content: current };
}

function normalizeNodeName(rawValue) {
  return String(rawValue || "").trim().toLowerCase();
}

function buildFigmaTreeIndex(documentRoot) {
  const byId = new Map();

  function visit(node, parentId = null, canvasId = null) {
    if (!node || typeof node !== "object") return;
    const nodeId = String(node.id || "").trim();
    if (!nodeId) return;
    const type = String(node.type || "").trim().toUpperCase();
    const currentCanvasId = type === "CANVAS" ? nodeId : canvasId;
    byId.set(nodeId, { node, parentId, canvasId: currentCanvasId });
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      visit(child, nodeId, currentCanvasId);
    }
  }

  visit(documentRoot, null, null);
  return byId;
}

function findDescendantFrameByName(rootNode, targetName) {
  if (!rootNode || typeof rootNode !== "object") return null;
  const queue = [rootNode];
  const expected = normalizeNodeName(targetName);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    const type = String(current.type || "").trim().toUpperCase();
    if (type === "FRAME" && normalizeNodeName(current.name) === expected) {
      return current;
    }
    const children = Array.isArray(current.children) ? current.children : [];
    for (const child of children) queue.push(child);
  }

  return null;
}

function findDescendantFrameByPattern(rootNode, pattern) {
  if (!rootNode || typeof rootNode !== "object") return null;
  const queue = [rootNode];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    const type = String(current.type || "").trim().toUpperCase();
    const name = String(current.name || "").trim();
    if (type === "FRAME" && pattern.test(name)) {
      return current;
    }
    const children = Array.isArray(current.children) ? current.children : [];
    for (const child of children) queue.push(child);
  }

  return null;
}

function pickSectionExhibitNode(sectionNode, primaryPattern, fallbackPattern) {
  if (!sectionNode || typeof sectionNode !== "object") return null;
  const directChildren = Array.isArray(sectionNode.children)
    ? sectionNode.children
    : [];

  for (const child of directChildren) {
    const type = String(child?.type || "").trim().toUpperCase();
    const name = String(child?.name || "").trim();
    if (type === "FRAME" && primaryPattern.test(name)) return child;
  }

  const fallback = findDescendantFrameByPattern(sectionNode, primaryPattern);
  if (fallback) return fallback;

  if (fallbackPattern) {
    const secondary = findDescendantFrameByPattern(sectionNode, fallbackPattern);
    if (secondary) return secondary;
  }

  for (const child of directChildren) {
    const type = String(child?.type || "").trim().toUpperCase();
    const name = normalizeNodeName(child?.name);
    if (type !== "FRAME") continue;
    if (name === "title") continue;
    return child;
  }

  return null;
}

function resolveSpecExhibitNodeIds({ figmaFilePayload, targetNodeId }) {
  if (!figmaFilePayload?.document || !targetNodeId) {
    return null;
  }
  const index = buildFigmaTreeIndex(figmaFilePayload.document);
  const targetEntry = index.get(String(targetNodeId || "").trim());
  if (!targetEntry?.canvasId) return null;
  const canvasEntry = index.get(targetEntry.canvasId);
  if (!canvasEntry?.node) return null;
  const canvasNode = canvasEntry.node;
  const canvasChildren = Array.isArray(canvasNode.children) ? canvasNode.children : [];

  const specsFrame =
    canvasChildren.find(
      (child) =>
        String(child?.type || "").trim().toUpperCase() === "FRAME" &&
        normalizeNodeName(child?.name) === "specs",
    ) ||
    canvasChildren.find(
      (child) =>
        String(child?.type || "").trim().toUpperCase() === "FRAME" &&
        /spec/i.test(String(child?.name || "")),
    );

  if (!specsFrame || typeof specsFrame !== "object") return null;

  const specificationRoot =
    findDescendantFrameByName(specsFrame, "Specification") || specsFrame;
  const anatomySection = findDescendantFrameByName(specificationRoot, "Anatomy");
  const propertiesSection = findDescendantFrameByName(specificationRoot, "Properties");
  const layoutSection = findDescendantFrameByName(
    specificationRoot,
    "Layout and spacing",
  );

  const anatomyExhibit = pickSectionExhibitNode(anatomySection, /exhibit/i, null);
  const propertiesExhibit = pickSectionExhibitNode(
    propertiesSection,
    /exhibits?/i,
    /state/i,
  );
  const layoutExhibit = pickSectionExhibitNode(
    layoutSection,
    /selected node/i,
    /exhibit/i,
  );

  const specsNodeId = String(specsFrame.id || "").trim();
  const anatomyNodeId = String(anatomyExhibit?.id || "").trim();
  const propertiesNodeId = String(propertiesExhibit?.id || "").trim();
  const layoutNodeId = String(layoutExhibit?.id || "").trim();

  if (!specsNodeId && !anatomyNodeId && !propertiesNodeId && !layoutNodeId) {
    return null;
  }

  return {
    specsNodeId: specsNodeId || null,
    anatomyNodeId: anatomyNodeId || null,
    propertiesNodeId: propertiesNodeId || null,
    layoutNodeId: layoutNodeId || null,
  };
}

function buildSpecExhibitMarkdown(label, exhibit) {
  const imageUrl = String(exhibit?.imageUrl || "").trim();
  const nodeId = String(exhibit?.nodeId || "").trim();
  if (!imageUrl && !nodeId) return "";
  const lines = [`### ${label} exhibit`];
  if (imageUrl) {
    lines.push("", `![${label} exhibit](${imageUrl})`);
  }
  if (nodeId) {
    lines.push("", `- Source node: \`${nodeId}\``);
  }
  return lines.join("\n");
}

function appendSpecExhibit(sectionBody, label, exhibit) {
  const normalized = String(sectionBody || "").trimEnd();
  const exhibitBlock = buildSpecExhibitMarkdown(label, exhibit);
  if (!exhibitBlock) return normalized;
  if (!normalized) return exhibitBlock;
  return `${normalized}\n\n${exhibitBlock}`;
}

function toCollectionLabel(rawValue) {
  return String(rawValue || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferCollectionsFromInputDir(repoRoot, inputDir) {
  const resolvedDir = path.resolve(repoRoot, inputDir || "");
  if (!fs.existsSync(resolvedDir)) return [];
  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
  return Array.from(
    new Set(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => toCollectionLabel(entry.name))
        .filter(Boolean),
    ),
  );
}

const _systemRepositories = new Map();

function getSystemRepository(repoRoot) {
  const key = path.resolve(repoRoot || PROJECT_ROOT);
  if (!_systemRepositories.has(key)) {
    _systemRepositories.set(key, createDesignSystemRepository({ repoRoot: key }));
  }
  return _systemRepositories.get(key);
}

function ensureCollectionsConfigured({ repoRoot, systemId }) {
  if (!systemId || systemId === "_legacy") return;
  const repository = getSystemRepository(repoRoot);
  const config = repository.getConfig();
  if (!config || typeof config !== "object" || !Array.isArray(config.systems)) return;

  const targetIndex = config.systems.findIndex((item) => String(item?.id || "").trim() === systemId);
  if (targetIndex < 0) return;
  const target = config.systems[targetIndex];
  if (Array.isArray(target.collections) && target.collections.length > 0) return;

  const inferred = inferCollectionsFromInputDir(repoRoot, target.inputDir);
  const collections = inferred.length > 0 ? inferred : ["Primitives", "Typography", "Semantic", "Components", "A11y"];
  target.collections = collections;
  config.systems[targetIndex] = target;
  repository.saveConfig(config);
}

function getSystemConfig({ repoRoot, systemId }) {
  if (!systemId || systemId === "_legacy") return null;
  try {
    return getSystemRepository(repoRoot).getSystem(systemId).system || null;
  } catch {
    return null;
  }
}



async function bootstrapInputJsonFromFigmaVariables({
  repoRoot,
  system,
  fileKey,
  figmaToken,
}) {
  if (!system) {
    return { attempted: false, created: false, reason: "system-missing" };
  }
  if (system.compileVariablesOnCapture === false) {
    return { attempted: false, created: false, reason: "disabled-by-config" };
  }
  const docsDir = path.resolve(repoRoot, String(system.docsDir || ""));
  const tokenRegistryPath = path.join(docsDir, "_generated", "token-registry.json");
  if (fs.existsSync(tokenRegistryPath)) {
    return { attempted: false, created: false, reason: "token-registry-exists" };
  }
  if (hasInputJsonFiles(repoRoot, system.inputDir)) {
    return { attempted: false, created: false, reason: "input-json-exists" };
  }
  if (!fileKey) {
    return { attempted: false, created: false, reason: "figma-file-key-missing" };
  }

  // Delegate to shared module (first-time bootstrap only, no force/merge)
  const syncResult = await syncFigmaTokensToInput({
    repoRoot,
    system,
    fileKey,
    figmaToken,
    force: false,
    merge: false,
    dryRun: false,
  });

  return {
    attempted: syncResult.attempted ?? true,
    created: (syncResult.files_written ?? 0) > 0,
    reason: syncResult.reason ?? "bootstrapped",
    files_written: syncResult.files_written ?? 0,
    tokens_written: syncResult.tokens_written ?? 0,
    files: syncResult.files ?? [],
    error: syncResult.error,
  };
}

function runTokensCompileIfNeeded({ repoRoot, system }) {
  if (!system) return { attempted: false, compiled: false, reason: "system-missing" };
  const enabled = system.compileVariablesOnCapture !== false;
  if (!enabled) return { attempted: false, compiled: false, reason: "disabled-by-config" };

  const docsDir = path.resolve(repoRoot, String(system.docsDir || ""));
  const tokenRegistryPath = path.join(docsDir, "_generated", "token-registry.json");
  if (fs.existsSync(tokenRegistryPath)) {
    return { attempted: false, compiled: false, reason: "token-registry-exists" };
  }

  // Delegate to shared module
  const compileResult = runTokensCompile({ repoRoot, system });
  return {
    attempted: compileResult.attempted,
    compiled: compileResult.compiled ?? false,
    reason: compileResult.reason,
    stderr: compileResult.stderr,
    output: compileResult.output,
  };
}


function buildOverviewSeed() {
  return `---
doc_type: overview
doc_status: draft
---

# Components Overview

## Component list

`;
}

function ensureSystemDocsScaffold({ docsRootDir, componentDocsDir }) {
  const specsDir = path.join(docsRootDir, "_spec", "components");
  const generatedDir = path.join(docsRootDir, "_generated");
  const overviewPath = path.join(componentDocsDir, "overview.md");

  fs.mkdirSync(componentDocsDir, { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });

  if (!fs.existsSync(overviewPath)) {
    writeTextAtomic(overviewPath, buildOverviewSeed());
  }

  return { specsDir, generatedDir, overviewPath };
}

function buildMarkdownSeed({ slug, candidateName, nodeUrl, nodeId }) {
  const displayName = componentNameToDisplayName(candidateName || slug) || "Component";
  return `---
doc_type: component
doc_status: draft
figma:
  file_url: ${nodeUrl || "TBD"}
  page: TBD
  component: ${displayName}
  component_set_node_id: ${nodeId || "TBD"}
  last_verified: TBD
---

# ${displayName}

Auto-generated placeholder created during Figma capture workflow.

## Overview

- Purpose: TBD
- Figma component set: ${nodeId || "TBD"}
- Variant properties: TBD
- Artwork source instance: Required hidden instance used to drive Anatomy, Properties, and Layout and spacing sections.

### Visual Proof

- Screenshot: TBD
- Source node: ${nodeId || "TBD"}
- Artifact: TBD

## Anatomy

1. **Container**: TBD
2. **Primary element**: TBD
`;
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

  const targets = [];
  const skipped = [];
  for (const candidate of sourceCandidates) {
    const nodeId = String(candidate.node_id || "").trim();
    if (!nodeId) continue;
    const inferredSlug =
      (applySlugOverride ? componentSlugOverride : "") ||
      slugByNodeFromRegistry.get(nodeId) ||
      slugByNodeFromSpecs.get(nodeId) ||
      normalizeNameToSlug(candidate.name);

    if (!inferredSlug) {
      skipped.push({
        node_id: nodeId,
        name: String(candidate.name || "").trim() || nodeId,
        reason: "slug-resolution-failed",
      });
      continue;
    }

    const resolvedPaths = resolveDocsPaths({
      ctx,
      docsRootOverride,
      slug: inferredSlug,
    });
    const nodeUrl = buildFigmaNodeUrl(descriptor, nodeId) || descriptor.sourceUrl;
    const markdownExists = fs.existsSync(resolvedPaths.markdownPath);
    let extractedNodeSpec = null;
    let specExhibits = null;
    const shouldExtractNodeSpec =
      !markdownExists || (markdownExists && injectDocSpecs);
    if (shouldExtractNodeSpec) {
      try {
        const fullNodePayload = await fetchFigmaNodes({
          fileKey: descriptor.fileKey,
          nodeIds: [nodeId],
          token: figmaToken,
        });
        const nodeEntry =
          fullNodePayload?.nodes?.[nodeId]?.document ?? null;
        if (nodeEntry) {
          extractedNodeSpec = extractComponentSpec(nodeEntry);
        }
      } catch (enrichError) {
        process.stderr.write(
          `[capture] Node extraction failed for ${nodeId}: ${
            enrichError instanceof Error ? enrichError.message : String(enrichError)
          }\n`,
        );
      }
    }

    if (shouldExtractNodeSpec && includeSpecExhibits) {
      try {
        const fileTree = await ensureFilePayload();
        const exhibitNodeIds = resolveSpecExhibitNodeIds({
          figmaFilePayload: fileTree,
          targetNodeId: nodeId,
        });
        if (exhibitNodeIds) {
          const exportNodeIds = Array.from(
            new Set(
              [
                exhibitNodeIds.anatomyNodeId,
                exhibitNodeIds.propertiesNodeId,
                exhibitNodeIds.layoutNodeId,
              ].filter(Boolean),
            ),
          );
          let imagesByNodeId = {};
          if (exportNodeIds.length > 0) {
            const imagesPayload = await fetchFigmaImages({
              fileKey: descriptor.fileKey,
              nodeIds: exportNodeIds,
              token: figmaToken,
              format: "png",
              scale: 2,
            });
            imagesByNodeId =
              imagesPayload?.images && typeof imagesPayload.images === "object"
                ? imagesPayload.images
                : {};
          }

          const mapExhibit = (sourceNodeId) => {
            const normalizedNodeId = String(sourceNodeId || "").trim();
            if (!normalizedNodeId) return null;
            const imageUrl = String(imagesByNodeId[normalizedNodeId] || "").trim();
            return {
              nodeId: normalizedNodeId,
              imageUrl: imageUrl || null,
            };
          };

          specExhibits = {
            specsNodeId: exhibitNodeIds.specsNodeId || null,
            anatomy: mapExhibit(exhibitNodeIds.anatomyNodeId),
            properties: mapExhibit(exhibitNodeIds.propertiesNodeId),
            layout: mapExhibit(exhibitNodeIds.layoutNodeId),
          };
        }
      } catch (exhibitError) {
        process.stderr.write(
          `[capture] Specs exhibit extraction failed for ${nodeId}: ${
            exhibitError instanceof Error ? exhibitError.message : String(exhibitError)
          }\n`,
        );
      }
    }

    if (requireExistingDoc && !markdownExists) {
      skipped.push({
        slug: inferredSlug,
        node_id: nodeId,
        name: String(candidate.name || "").trim() || inferredSlug,
        reason: "markdown-missing",
        markdown_path: path.relative(PROJECT_ROOT, resolvedPaths.markdownPath),
      });
      continue;
    }
    if (!requireExistingDoc && !markdownExists) {
      try {
        let seed;
        if (extractedNodeSpec) {
          seed = renderEnrichedMarkdownSeed({
            slug: inferredSlug,
            displayName:
              componentNameToDisplayName(
                String(candidate.name || "").trim(),
              ) || inferredSlug,
            nodeUrl,
            nodeId,
            spec: extractedNodeSpec,
          });
          const enrichedSeed = injectExtractedSpecSectionsIntoMarkdown(
            seed,
            extractedNodeSpec,
            specExhibits,
          );
          seed = enrichedSeed.content;
        }
        if (!seed) {
          seed = buildMarkdownSeed({
            slug: inferredSlug,
            candidateName: String(candidate.name || "").trim() || inferredSlug,
            nodeUrl,
            nodeId,
          });
        }
        writeTextAtomic(resolvedPaths.markdownPath, seed);
      } catch (error) {
        skipped.push({
          slug: inferredSlug,
          node_id: nodeId,
          name: String(candidate.name || "").trim() || inferredSlug,
          reason: "markdown-create-failed",
          markdown_path: path.relative(PROJECT_ROOT, resolvedPaths.markdownPath),
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }
    if (injectDocSpecs && markdownExists && extractedNodeSpec) {
      try {
        const currentMarkdown = fs.readFileSync(resolvedPaths.markdownPath, "utf8");
        const injection = injectExtractedSpecSectionsIntoMarkdown(
          currentMarkdown,
          extractedNodeSpec,
          specExhibits,
        );
        if (injection.changed) {
          writeTextAtomic(resolvedPaths.markdownPath, injection.content);
        }
      } catch (error) {
        skipped.push({
          slug: inferredSlug,
          node_id: nodeId,
          name: String(candidate.name || "").trim() || inferredSlug,
          reason: "markdown-enrich-failed",
          markdown_path: path.relative(PROJECT_ROOT, resolvedPaths.markdownPath),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const specExists = fs.existsSync(resolvedPaths.specPath);

    targets.push({
      slug: inferredSlug,
      nodeId,
      name: String(candidate.name || "").trim() || inferredSlug,
      kind: classifyTargetKind(candidate.kind),
      pageName: String(candidate.page_name || "").trim() || null,
      markdownPath: resolvedPaths.markdownPath,
      specPath: resolvedPaths.specPath,
      specExists,
      nodeUrl,
      specExhibits,
    });
  }

  const report = {
    ok: true,
    dryRun,
    source: {
      figma_url: descriptor.sourceUrl,
      file_key: descriptor.fileKey,
      node_id_from_url: descriptor.nodeIdFromUrl || null,
    },
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
    tokens_bootstrap: tokenBootstrap,
    tokens_compile: tokenCompile,
    total_candidates: sourceCandidates.length,
    targets_total: targets.length,
    targets: targets.map((target) => ({
      slug: target.slug,
      node_id: target.nodeId,
      kind: target.kind,
      page_name: target.pageName,
      markdown_path: path.relative(PROJECT_ROOT, target.markdownPath),
      spec_path: path.relative(PROJECT_ROOT, target.specPath),
      spec_exists: target.specExists,
      figma_url: target.nodeUrl,
      spec_exhibits: target.specExhibits
        ? {
            specs_node_id: target.specExhibits.specsNodeId || null,
            anatomy: target.specExhibits.anatomy || null,
            properties: target.specExhibits.properties || null,
            layout: target.specExhibits.layout || null,
          }
        : null,
    })),
    captured: [],
    failed: [],
    skipped,
    indices_refreshed: false,
  };

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  for (const target of targets) {
    const captureArgs = [
      "--markdown",
      target.markdownPath,
      "--component-set-id",
      target.nodeId,
      "--url",
      target.nodeUrl,
      "--figma-token",
      figmaToken,
      "--format",
      format,
      "--scale",
      String(scale),
      "--proof-dir",
      proofDir,
      "--proof-image-dir",
      proofImageDir,
      "--include-variants",
      includeVariants ? "true" : "false",
      "--variant-limit",
      String(variantLimit),
      "--agent",
      agent,
      "--main-capture-mode",
      mainCaptureMode,
      "--skip-index-sync",
      "true",
    ];

    if (target.specExists) {
      captureArgs.push("--spec-file", target.specPath);
    }

    try {
      const captureResult = runNodeScriptJson({
        repoRoot: PROJECT_ROOT,
        scriptPath: captureScriptPath,
        scriptArgs: captureArgs,
      });
      report.captured.push({
        slug: target.slug,
        node_id: target.nodeId,
        markdown_path: path.relative(PROJECT_ROOT, target.markdownPath),
        proof_file_path: captureResult.proofFilePath || null,
        screenshot_url: captureResult.screenshotUrl || null,
        local_image_path: captureResult.localImagePath || null,
        variants_count: Number(captureResult.variantsCount || 0),
      });
    } catch (error) {
      report.failed.push({
        slug: target.slug,
        node_id: target.nodeId,
        markdown_path: path.relative(PROJECT_ROOT, target.markdownPath),
        error: error instanceof Error ? error.message : String(error),
      });
      if (!continueOnError) {
        break;
      }
    }
  }

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
