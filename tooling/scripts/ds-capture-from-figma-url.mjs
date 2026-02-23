#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import {
  buildFigmaComponentMap,
  buildFigmaNodeUrl,
  parseFigmaFileUrl,
} from "./lib/figma-component-map.mjs";
import {
  fetchFigmaFile,
  fetchFigmaLocalVariables,
  fetchFigmaNodes,
} from "./lib/figma-api.mjs";
import {
  componentNameToSnakeCase,
  componentNameToDisplayName,
} from "./lib/component-name.mjs";
import { resolveSystemContextSafe, PROJECT_ROOT } from "./lib/system-context.mjs";

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

function inferSingleNodeCandidates({ componentMap, nodeId }) {
  const components = Array.isArray(componentMap?.components)
    ? componentMap.components
    : [];
  const byId = new Map(
    components.map((component) => [String(component.node_id || ""), component]),
  );
  const direct = byId.get(nodeId);
  if (!direct) return [];

  const directKind = classifyTargetKind(direct.kind);
  if (directKind === "component_set") return [direct];

  const ancestorIds = Array.isArray(direct.ancestor_component_node_ids)
    ? direct.ancestor_component_node_ids
    : [];
  for (let index = ancestorIds.length - 1; index >= 0; index -= 1) {
    const ancestor = byId.get(String(ancestorIds[index] || ""));
    if (!ancestor) continue;
    if (classifyTargetKind(ancestor.kind) === "component_set") {
      return [ancestor];
    }
  }

  return [direct];
}

function runNodeScriptJson({ repoRoot, scriptPath, scriptArgs }) {
  const safeArgs = Array.isArray(scriptArgs) ? [...scriptArgs] : [];
  const tokenArgIndex = safeArgs.indexOf("--figma-token");
  if (tokenArgIndex >= 0 && tokenArgIndex + 1 < safeArgs.length) {
    safeArgs[tokenArgIndex + 1] = "***redacted***";
  }

  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: repoRoot,
    stdio: "pipe",
    env: process.env,
  });

  const stdout = result.stdout ? String(result.stdout) : "";
  const stderr = result.stderr ? String(result.stderr) : "";

  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `Command failed (${result.status ?? 1}): node ${path.relative(
        repoRoot,
        scriptPath,
      )} ${safeArgs.join(" ")}\n${stderr || stdout}`.trim(),
    );
  }

  try {
    // Strip non-JSON lines (e.g. stray console.log) before parsing
    const jsonStart = stdout.indexOf("{");
    const jsonEnd = stdout.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0 || jsonEnd <= jsonStart) {
      throw new Error("No JSON object found in output");
    }
    return JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
  } catch (error) {
    throw new Error(
      `Command returned invalid JSON.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\nParse error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
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

function readDesignSystemsConfig(repoRoot) {
  const configPath = path.join(repoRoot, "tooling", "config", "design-systems.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    return {
      configPath,
      config: JSON.parse(fs.readFileSync(configPath, "utf8")),
    };
  } catch {
    return null;
  }
}

function writeDesignSystemsConfigAtomic(configPath, config) {
  const tmpPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, configPath);
}

function ensureCollectionsConfigured({ repoRoot, systemId }) {
  if (!systemId || systemId === "_legacy") return;
  const loaded = readDesignSystemsConfig(repoRoot);
  if (!loaded) return;
  const { configPath, config } = loaded;
  if (!config || typeof config !== "object" || !Array.isArray(config.systems)) return;

  const targetIndex = config.systems.findIndex((item) => String(item?.id || "").trim() === systemId);
  if (targetIndex < 0) return;
  const target = config.systems[targetIndex];
  if (Array.isArray(target.collections) && target.collections.length > 0) return;

  const inferred = inferCollectionsFromInputDir(repoRoot, target.inputDir);
  const collections = inferred.length > 0 ? inferred : ["Primitives", "Typography", "Semantic", "Components", "A11y"];
  target.collections = collections;
  config.systems[targetIndex] = target;
  writeDesignSystemsConfigAtomic(configPath, config);
}

function getSystemConfig({ repoRoot, systemId }) {
  if (!systemId || systemId === "_legacy") return null;
  const loaded = readDesignSystemsConfig(repoRoot);
  if (!loaded) return null;
  const system = Array.isArray(loaded.config?.systems)
    ? loaded.config.systems.find((item) => String(item?.id || "").trim() === systemId)
    : null;
  return system || null;
}

function hasInputJsonFiles(repoRoot, inputDir) {
  const resolvedDir = path.resolve(repoRoot, inputDir || "");
  if (!fs.existsSync(resolvedDir)) return false;
  return fs
    .readdirSync(resolvedDir, { withFileTypes: true })
    .some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"));
}

function sanitizeCollectionFileStem(rawName, fallback = "Imported") {
  const normalized = String(rawName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback.toLowerCase();
}

function normalizeFigmaResolvedType(rawType) {
  const type = String(rawType || "").trim().toUpperCase();
  if (type === "COLOR") return "color";
  if (type === "FLOAT") return "dimension";
  if (type === "STRING") return "string";
  if (type === "BOOLEAN") return "boolean";
  return "string";
}

function toHexByte(value) {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  const byte = Math.round(clamped * 255);
  return byte.toString(16).padStart(2, "0");
}

function figmaColorToHex(colorValue) {
  if (!colorValue || typeof colorValue !== "object") return null;
  const r = toHexByte(colorValue.r);
  const g = toHexByte(colorValue.g);
  const b = toHexByte(colorValue.b);
  const a = toHexByte(
    colorValue.a === undefined || colorValue.a === null ? 1 : colorValue.a,
  );
  if (a === "ff") return `#${r}${g}${b}`;
  return `#${r}${g}${b}${a}`;
}

function normalizeVariableCollections(rawCollections) {
  const index = new Map();
  if (Array.isArray(rawCollections)) {
    for (const entry of rawCollections) {
      const id = String(entry?.id || "").trim();
      if (!id) continue;
      index.set(id, entry);
    }
    return index;
  }
  if (rawCollections && typeof rawCollections === "object") {
    for (const entry of Object.values(rawCollections)) {
      const id = String(entry?.id || "").trim();
      if (!id) continue;
      index.set(id, entry);
    }
  }
  return index;
}

function normalizeVariablesList(rawVariables) {
  if (Array.isArray(rawVariables)) return rawVariables;
  if (rawVariables && typeof rawVariables === "object") {
    return Object.values(rawVariables);
  }
  return [];
}

function pickAllModeValues(variableRecord, collectionRecord) {
  const valuesByMode =
    variableRecord && typeof variableRecord.valuesByMode === "object"
      ? variableRecord.valuesByMode
      : {};
  const results = new Map();

  if (Array.isArray(collectionRecord?.modes)) {
    for (const mode of collectionRecord.modes) {
      const modeId = String(mode?.modeId || "").trim();
      const modeName = String(mode?.name || modeId).trim();
      if (!modeId) continue;
      if (Object.prototype.hasOwnProperty.call(valuesByMode, modeId)) {
        const val = valuesByMode[modeId];
        if (val !== undefined && val !== null) {
          results.set(modeName, val);
        }
      }
    }
  }

  if (results.size === 0) {
    for (const [modeId, val] of Object.entries(valuesByMode)) {
      if (val !== undefined && val !== null) {
        results.set(modeId, val);
      }
    }
  }

  return results;
}

function buildTokenNodeFromFigmaVariable(variableRecord, rawValue) {
  const resolvedType = normalizeFigmaResolvedType(variableRecord?.resolvedType);
  let normalizedValue = rawValue;
  if (resolvedType === "color") {
    if (
      rawValue &&
      typeof rawValue === "object" &&
      String(rawValue.type || "").trim().toUpperCase() === "VARIABLE_ALIAS"
    ) {
      normalizedValue = {
        type: "VARIABLE_ALIAS",
        id: String(rawValue.id || "").trim(),
      };
    } else {
      normalizedValue = figmaColorToHex(rawValue);
    }
  }

  if (
    normalizedValue &&
    typeof normalizedValue === "object" &&
    String(normalizedValue.type || "").trim().toUpperCase() === "VARIABLE_ALIAS"
  ) {
    const aliasId = String(normalizedValue.id || "").trim();
    if (!aliasId) return null;
    return {
      $id: String(variableRecord?.id || "").trim() || undefined,
      $value: { type: "VARIABLE_ALIAS", id: aliasId },
      $type: resolvedType,
    };
  }

  if (resolvedType === "color" && typeof normalizedValue !== "string") return null;
  if (resolvedType === "number" && typeof normalizedValue !== "number") return null;
  if (resolvedType === "string" && typeof normalizedValue !== "string") return null;
  if (resolvedType === "boolean" && typeof normalizedValue !== "boolean") return null;

  const tokenNode = {
    $value: normalizedValue,
    $type: resolvedType,
  };
  const tokenId = String(variableRecord?.id || "").trim();
  if (tokenId) {
    tokenNode.$id = tokenId;
  }
  return tokenNode;
}

function assignTokenAtPath(targetRoot, pathSegments, tokenNode) {
  if (!targetRoot || typeof targetRoot !== "object") return false;
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) return false;
  let cursor = targetRoot;
  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const part = String(pathSegments[index] || "").trim();
    if (!part) return false;
    const current = cursor[part];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  const leaf = String(pathSegments[pathSegments.length - 1] || "").trim();
  if (!leaf) return false;
  cursor[leaf] = tokenNode;
  return true;
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

  let variablesPayload;
  try {
    variablesPayload = await fetchFigmaLocalVariables({
      fileKey,
      token: figmaToken,
    });
  } catch (error) {
    return {
      attempted: true,
      created: false,
      reason: "fetch-failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const meta =
    variablesPayload && typeof variablesPayload === "object"
      ? variablesPayload.meta || variablesPayload
      : null;
  const collectionsIndex = normalizeVariableCollections(meta?.variableCollections);
  const variableRecords = normalizeVariablesList(meta?.variables);
  if (variableRecords.length === 0) {
    return { attempted: true, created: false, reason: "variables-empty" };
  }

  const filesMap = new Map();
  let tokenCount = 0;

  for (const variableRecord of variableRecords) {
    if (!variableRecord || typeof variableRecord !== "object") continue;
    const variableName = String(variableRecord.name || "").trim();
    if (!variableName) continue;
    const collectionId = String(variableRecord.variableCollectionId || "").trim();
    const collectionRecord = collectionsIndex.get(collectionId) || null;
    const collectionName = String(collectionRecord?.name || "Imported").trim() || "Imported";
    const collectionFileStem = sanitizeCollectionFileStem(collectionName, "Imported");

    const modeValues = pickAllModeValues(variableRecord, collectionRecord);
    if (modeValues.size === 0) continue;

    for (const [modeName, modeValue] of modeValues) {
      const tokenNode = buildTokenNodeFromFigmaVariable(variableRecord, modeValue);
      if (!tokenNode) continue;

      // When only one mode, use the collection stem; otherwise append mode name
      const fileKey = modeValues.size === 1
        ? collectionFileStem
        : `${collectionFileStem}-${sanitizeCollectionFileStem(modeName, "Default")}`;

      if (!filesMap.has(fileKey)) {
        filesMap.set(fileKey, {
          description: modeValues.size === 1
            ? collectionName
            : `${collectionName} (${modeName})`,
          data: {},
        });
      }
      const target = filesMap.get(fileKey);
      const pathSegments = variableName
        .split("/")
        .map((segment) => String(segment || "").trim())
        .filter(Boolean);
      if (pathSegments.length === 0) continue;
      const assigned = assignTokenAtPath(target.data, pathSegments, tokenNode);
      if (!assigned) continue;
      tokenCount += 1;
    }
  }

  if (filesMap.size === 0 || tokenCount === 0) {
    return { attempted: true, created: false, reason: "no-token-nodes" };
  }

  const inputDir = path.resolve(repoRoot, String(system.inputDir || ""));
  fs.mkdirSync(inputDir, { recursive: true });

  const writtenFiles = [];
  for (const [fileStem, payload] of filesMap.entries()) {
    const filePath = path.join(inputDir, `${fileStem}.json`);
    const jsonPayload = {
      $description: payload.description,
      ...payload.data,
    };
    writeTextAtomic(filePath, `${JSON.stringify(jsonPayload, null, 2)}\n`);
    writtenFiles.push(path.relative(repoRoot, filePath));
  }

  return {
    attempted: true,
    created: true,
    reason: "bootstrapped",
    files_written: writtenFiles.length,
    tokens_written: tokenCount,
    files: writtenFiles,
  };
}

function runTokensCompileIfNeeded({ repoRoot, system }) {
  if (!system) return { attempted: false, compiled: false, reason: "system-missing" };
  const enabled = system.compileVariablesOnCapture !== false;
  if (!enabled) return { attempted: false, compiled: false, reason: "disabled-by-config" };

  const inputDir = path.resolve(repoRoot, String(system.inputDir || ""));
  const outputDir = path.resolve(repoRoot, String(system.outputDir || ""));
  const docsDir = path.resolve(repoRoot, String(system.docsDir || ""));
  const tokenRegistryPath = path.join(docsDir, "_generated", "token-registry.json");

  if (fs.existsSync(tokenRegistryPath)) {
    return { attempted: false, compiled: false, reason: "token-registry-exists" };
  }
  if (!hasInputJsonFiles(repoRoot, system.inputDir)) {
    return { attempted: false, compiled: false, reason: "input-json-missing" };
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(docsDir, "_generated"), { recursive: true });

  const args = [
    path.join(repoRoot, "tooling", "scripts", "ds-tokens-sync.mjs"),
    "--input",
    inputDir,
    "--output-primitives",
    path.join(outputDir, "primitives.css"),
    "--output-tokens",
    path.join(outputDir, "tokens.css"),
    "--registry-output",
    tokenRegistryPath,
    "--force",
    "true",
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "pipe",
    env: process.env,
  });
  const stdout = result.stdout ? String(result.stdout).trim() : "";
  const stderr = result.stderr ? String(result.stderr).trim() : "";
  if ((result.status ?? 1) !== 0) {
    return {
      attempted: true,
      compiled: false,
      reason: "compile-failed",
      stderr: stderr || stdout,
    };
  }

  return {
    attempted: true,
    compiled: true,
    reason: "compiled",
    output: stdout,
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
    const filePayload = await fetchFigmaFile({
      fileKey: descriptor.fileKey,
      token: figmaToken,
    });
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
        const seed = buildMarkdownSeed({
          slug: inferredSlug,
          candidateName: String(candidate.name || "").trim() || inferredSlug,
          nodeUrl,
          nodeId,
        });
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
