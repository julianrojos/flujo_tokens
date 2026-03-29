/**
 * figma-token-sync.mjs
 *
 * Shared module for importing Figma local variables into design-token JSON files
 * and optionally compiling them to CSS custom properties.
 *
 * Extracted from ds-capture-from-figma-url.mjs so it can be used by:
 * - ds-capture-from-figma-url.mjs (existing — bootstrap on first capture)
 * - ds-tokens-from-figma.mjs     (new — standalone re-sync at any time)
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { fetchFigmaLocalVariables } from "./figma-api.mjs";
import { stripDiacritics } from "./strip-diacritics.mjs";

// ─── File helpers ─────────────────────────────────────────────────────────────

export function hasInputJsonFiles(repoRoot, inputDir) {
  const resolvedDir = path.resolve(repoRoot, inputDir || "");
  if (!fs.existsSync(resolvedDir)) return false;
  return fs
    .readdirSync(resolvedDir, { withFileTypes: true })
    .some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"));
}

export function sanitizeCollectionFileStem(rawName, fallback = "imported") {
  const normalized = stripDiacritics(String(rawName || "").trim())
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || (fallback || "imported").toLowerCase();
}

function writeTextAtomic(filePath, text) {
  const tempPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tempPath, text, "utf8");
  fs.renameSync(tempPath, filePath);
}

function backupInputJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = `${filePath}.bak`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTokenNodeShape(value) {
  return (
    isPlainObject(value) &&
    Object.prototype.hasOwnProperty.call(value, "$value")
  );
}

// ─── Figma variable normalization ─────────────────────────────────────────────

export function normalizeVariableCollections(rawCollections) {
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

export function normalizeVariablesList(rawVariables) {
  if (Array.isArray(rawVariables)) return rawVariables;
  if (rawVariables && typeof rawVariables === "object") {
    return Object.values(rawVariables);
  }
  return [];
}

export function pickAllModeValues(variableRecord, collectionRecord) {
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

export function buildTokenNodeFromFigmaVariable(variableRecord, rawValue) {
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
  if (resolvedType === "dimension" && typeof normalizedValue !== "number") return null;
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

export function assignTokenAtPath(targetRoot, pathSegments, tokenNode) {
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

// ─── Deep merge for --merge mode ──────────────────────────────────────────────

export function mergeTokenTrees(base, incoming) {
  if (!base || typeof base !== "object") return incoming;
  if (!incoming || typeof incoming !== "object") return base;
  // Token/group shape collisions must replace, not merge, to avoid invalid DTCG nodes.
  if (isTokenNodeShape(base) || isTokenNodeShape(incoming)) {
    return incoming;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeTokenTrees(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Build files map from Figma variables payload ────────────────────────────

export function buildFilesMapFromVariables(meta) {
  const collectionsIndex = normalizeVariableCollections(meta?.variableCollections);
  const variableRecords = normalizeVariablesList(meta?.variables);
  const filesMap = new Map();
  let tokenCount = 0;

  for (const variableRecord of variableRecords) {
    if (!variableRecord || typeof variableRecord !== "object") continue;
    const variableName = String(variableRecord.name || "").trim();
    if (!variableName) continue;

    const collectionId = String(variableRecord.variableCollectionId || "").trim();
    const collectionRecord = collectionsIndex.get(collectionId) || null;
    const collectionName =
      String(collectionRecord?.name || "Imported").trim() || "Imported";
    const collectionFileStem = sanitizeCollectionFileStem(collectionName, "imported");

    const modeValues = pickAllModeValues(variableRecord, collectionRecord);
    if (modeValues.size === 0) continue;

    for (const [modeName, modeValue] of modeValues) {
      const tokenNode = buildTokenNodeFromFigmaVariable(variableRecord, modeValue);
      if (!tokenNode) continue;

      // Single mode → use collection name; multiple modes → append mode name
      const fileKey =
        modeValues.size === 1
          ? collectionFileStem
          : `${collectionFileStem}-${sanitizeCollectionFileStem(modeName, "default")}`;

      if (!filesMap.has(fileKey)) {
        filesMap.set(fileKey, {
          description:
            modeValues.size === 1
              ? collectionName
              : `${collectionName} (${modeName})`,
          data: {},
        });
      }

      const target = filesMap.get(fileKey);
      const pathSegments = variableName
        .split("/")
        .map((segment) => {
          const trimmed = String(segment || "").trim();
          // Normalize diacritics in the entire path segment
          return stripDiacritics(trimmed);
        })
        .filter(Boolean);
      if (pathSegments.length === 0) continue;
      const assigned = assignTokenAtPath(target.data, pathSegments, tokenNode);
      if (!assigned) continue;
      tokenCount += 1;
    }
  }

  return { filesMap, tokenCount };
}

// ─── Main sync function ───────────────────────────────────────────────────────

/**
 * Sync Figma local variables to input JSON files.
 *
 * @param {object} opts
 * @param {string}  opts.repoRoot
 * @param {object}  opts.system          - System config entry resolved from SQLite
 * @param {string}  opts.fileKey         - Figma file key
 * @param {string}  opts.figmaToken      - Figma PAT
 * @param {boolean} [opts.force=false]   - Overwrite existing input JSONs
 * @param {boolean} [opts.merge=false]   - Deep-merge instead of overwrite (requires force)
 * @param {boolean} [opts.dryRun=false]  - Preview only, no writes
 * @returns {Promise<object>}
 */
export async function syncFigmaTokensToInput({
  repoRoot,
  system,
  fileKey,
  figmaToken,
  force = false,
  merge = false,
  dryRun = false,
}) {
  if (!system) {
    return { attempted: false, reason: "system-missing" };
  }
  if (!fileKey) {
    return { attempted: false, reason: "figma-file-key-missing" };
  }

  const inputDirValue = String(system.inputDir || system?.paths?.input || "").trim();
  if (!inputDirValue) {
    return { attempted: false, reason: "system-input-dir-missing" };
  }

  const existingJsonFiles = hasInputJsonFiles(repoRoot, inputDirValue);
  if (existingJsonFiles && !force) {
    return { attempted: false, reason: "input-json-exists", hint: "Use --force true to re-sync." };
  }

  // Fetch variables from Figma
  let variablesPayload;
  try {
    variablesPayload = await fetchFigmaLocalVariables({ fileKey, token: figmaToken });
  } catch (error) {
    return {
      attempted: true,
      reason: "fetch-failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const meta =
    variablesPayload && typeof variablesPayload === "object"
      ? variablesPayload.meta || variablesPayload
      : null;

  const { filesMap, tokenCount } = buildFilesMapFromVariables(meta);

  if (filesMap.size === 0 || tokenCount === 0) {
    return { attempted: true, reason: "variables-empty" };
  }

  const inputDir = path.resolve(repoRoot, inputDirValue);

  // Build preview / dry-run result
  const plannedFiles = Array.from(filesMap.keys()).map((stem) =>
    path.relative(repoRoot, path.join(inputDir, `${stem}.json`)),
  );

  if (dryRun) {
    return {
      attempted: true,
      dryRun: true,
      force,
      merge,
      files_planned: plannedFiles.length,
      tokens_planned: tokenCount,
      files: plannedFiles,
      collections: Array.from(filesMap.values()).map((f) => f.description),
    };
  }

  // Write files
  fs.mkdirSync(inputDir, { recursive: true });
  const writtenFiles = [];
  const backedUpFiles = [];

  for (const [fileStem, payload] of filesMap.entries()) {
    const filePath = path.join(inputDir, `${fileStem}.json`);

    // Backup before overwrite
    if (force && fs.existsSync(filePath)) {
      const backupPath = backupInputJson(filePath);
      if (backupPath) backedUpFiles.push(path.relative(repoRoot, backupPath));
    }

    let finalData = payload.data;

    // Merge mode: deep-merge incoming over existing
    if (merge && fs.existsSync(filePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
        // Strip $description from merge base, re-add payload.description after
        const { $description: _desc, ...existingData } = existing;
        finalData = mergeTokenTrees(existingData, payload.data);
      } catch {
        // If existing file is unparseable, fall through to full overwrite
      }
    }

    const jsonPayload = {
      $description: payload.description,
      ...finalData,
    };
    writeTextAtomic(filePath, `${JSON.stringify(jsonPayload, null, 2)}\n`);
    writtenFiles.push(path.relative(repoRoot, filePath));
  }

  return {
    attempted: true,
    dryRun: false,
    force,
    merge,
    files_written: writtenFiles.length,
    tokens_written: tokenCount,
    files: writtenFiles,
    backed_up: backedUpFiles,
  };
}

// ─── Compile step ─────────────────────────────────────────────────────────────

/**
 * Run ds-tokens-sync.mjs to compile input JSON → CSS custom properties.
 *
 * @param {object} opts
 * @param {string}  opts.repoRoot
 * @param {object}  opts.system
 * @returns {object}
 */
export function runTokensCompile({ repoRoot, system }) {
  if (!system) return { attempted: false, reason: "system-missing" };

  const inputDirValue = String(system.inputDir || system?.paths?.input || "").trim();
  if (!inputDirValue) {
    return { attempted: false, reason: "system-input-dir-missing" };
  }
  const inputDir = path.resolve(repoRoot, inputDirValue);
  const outputDir = path.resolve(repoRoot, String(system.outputDir || system?.paths?.output || ""));
  const docsDir = path.resolve(repoRoot, String(system.docsDir || system?.paths?.docs || ""));
  const tokenRegistryPath = path.join(docsDir, "_generated", "token-registry.json");

  if (!hasInputJsonFiles(repoRoot, inputDirValue)) {
    return { attempted: false, reason: "input-json-missing" };
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
    outputs: {
      primitives: path.relative(repoRoot, path.join(outputDir, "primitives.css")),
      tokens: path.relative(repoRoot, path.join(outputDir, "tokens.css")),
      registry: path.relative(repoRoot, tokenRegistryPath),
    },
    output: stdout,
  };
}
