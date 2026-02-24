import fs from "node:fs";
import path from "node:path";

import { PROJECT_ROOT } from "./system-context.mjs";
import { createDesignSystemRepository } from "./system-repository.mjs";
import {
  hasInputJsonFiles,
  runTokensCompile,
  syncFigmaTokensToInput,
} from "./figma-token-sync.mjs";

export function toCollectionLabel(rawValue) {
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

export function inferCollectionsFromInputDir(repoRoot, inputDir) {
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

export function getSystemRepository(repoRoot) {
  const key = path.resolve(repoRoot || PROJECT_ROOT);
  if (!_systemRepositories.has(key)) {
    _systemRepositories.set(key, createDesignSystemRepository({ repoRoot: key }));
  }
  return _systemRepositories.get(key);
}

export function ensureCollectionsConfigured({ repoRoot, systemId }) {
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

export function getSystemConfig({ repoRoot, systemId }) {
  if (!systemId || systemId === "_legacy") return null;
  try {
    return getSystemRepository(repoRoot).getSystem(systemId).system || null;
  } catch {
    return null;
  }
}

export async function bootstrapInputJsonFromFigmaVariables({
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

export function runTokensCompileIfNeeded({ repoRoot, system }) {
  if (!system) return { attempted: false, compiled: false, reason: "system-missing" };
  const enabled = system.compileVariablesOnCapture !== false;
  if (!enabled) return { attempted: false, compiled: false, reason: "disabled-by-config" };

  const docsDir = path.resolve(repoRoot, String(system.docsDir || ""));
  const tokenRegistryPath = path.join(docsDir, "_generated", "token-registry.json");
  if (fs.existsSync(tokenRegistryPath)) {
    return { attempted: false, compiled: false, reason: "token-registry-exists" };
  }

  const compileResult = runTokensCompile({ repoRoot, system });
  return {
    attempted: compileResult.attempted,
    compiled: compileResult.compiled ?? false,
    reason: compileResult.reason,
    stderr: compileResult.stderr,
    output: compileResult.output,
  };
}
