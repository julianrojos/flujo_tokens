import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

import { runSpawnWithCapture } from "../lib/spawn-runner.mjs";
import { CAPTURE_KEYS, EDITORIAL_KEYS } from "../lib/spec-keys.mjs";

const COMPONENT_SLUG_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
export const MAX_COMPONENT_SPEC_BYTES = 100_000;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const EDITORIAL_OBJECT_REQUIRED_KEYS = Object.freeze({
  summary: ["purpose", "when_to_use", "when_not_to_use"],
  accessibility: ["role", "focus", "hit_area", "labeling"],
  content_guidelines: ["rules"],
  best_practices: ["do", "dont"],
});

function escapeRegex(rawValue) {
  return String(rawValue || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toInlineMarkdown(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeBlockMarkdown(value, fallback = "- TBD") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function replaceMarkdownPurposeBullet(markdown, replacementValue) {
  const purposeLineRegex = /^([ \t]*)-\s*Purpose:\s*(.*)$/im;
  const match = purposeLineRegex.exec(markdown);
  if (!match) {
    return {
      found: false,
      changed: false,
      content: markdown,
    };
  }

  const lineStart = match.index;
  const indentSpaces = String(match[1] || "").length;
  let lineEnd = markdown.indexOf("\n", lineStart);
  if (lineEnd === -1) lineEnd = markdown.length;

  // Consume indented continuation lines (`- Purpose:` block-style markdown list item).
  let blockEnd = lineEnd;
  let cursor = lineEnd < markdown.length ? lineEnd + 1 : markdown.length;
  while (cursor < markdown.length) {
    let nextLineEnd = markdown.indexOf("\n", cursor);
    if (nextLineEnd === -1) nextLineEnd = markdown.length;
    const line = markdown.slice(cursor, nextLineEnd);
    const trimmed = line.trim();
    const leadingSpaces = (line.match(/^\s*/) || [""])[0].length;
    const isContinuationLine = trimmed.length > 0 && leadingSpaces > indentSpaces;
    if (!isContinuationLine) break;
    blockEnd = nextLineEnd;
    cursor = nextLineEnd < markdown.length ? nextLineEnd + 1 : markdown.length;
  }

  const purpose = toInlineMarkdown(replacementValue) || "TBD";
  const replacementLine = `${match[1] || ""}- Purpose: ${purpose}`;
  const before = markdown.slice(0, lineStart);
  const after = markdown.slice(blockEnd);
  const nextContent = `${before}${replacementLine}${after}`;

  return {
    found: true,
    changed: nextContent !== markdown,
    content: nextContent,
  };
}

function replaceMarkdownH3Section(markdown, heading, replacementBody) {
  const headingRegex = new RegExp(`^###\\s+${escapeRegex(heading)}\\s*$`, "im");
  const match = headingRegex.exec(markdown);
  if (!match) return { found: false, changed: false, content: markdown };

  const headingStart = match.index;
  const headingLineEnd = markdown.indexOf("\n", headingStart);
  const hasTrailingNewline = headingLineEnd >= 0;
  const headingLine = hasTrailingNewline
    ? markdown.slice(headingStart, headingLineEnd + 1)
    : `${markdown.slice(headingStart)}\n`;
  const bodyStart = hasTrailingNewline ? headingLineEnd + 1 : markdown.length;
  const tail = markdown.slice(bodyStart);
  const nextHeadingMatch = /^(###|##)\s+[^\n]+\s*$/m.exec(tail);
  const sectionEnd =
    nextHeadingMatch && Number.isFinite(nextHeadingMatch.index)
      ? bodyStart + nextHeadingMatch.index
      : markdown.length;

  const before = markdown.slice(0, headingStart);
  const after = markdown.slice(sectionEnd).replace(/^\n*/, "\n");
  const replacement = `${headingLine}\n${normalizeBlockMarkdown(replacementBody)}\n\n`;
  const nextContent = `${before}${replacement}${after}`;

  return { found: true, changed: nextContent !== markdown, content: nextContent };
}

function syncSummaryIntoMarkdown(rawMarkdown, summary) {
  let next = String(rawMarkdown || "");
  let changed = false;
  const sections = {
    purpose: false,
    whenToUse: false,
    whenNotToUse: false,
  };

  const purpose = replaceMarkdownPurposeBullet(next, summary?.purpose);
  if (purpose.found) sections.purpose = true;
  if (purpose.changed) {
    changed = true;
  }
  next = purpose.content;

  const whenToUse = replaceMarkdownH3Section(
    next,
    "When to use",
    normalizeBlockMarkdown(summary?.when_to_use),
  );
  if (whenToUse.found) sections.whenToUse = true;
  if (whenToUse.changed) {
    changed = true;
  }
  next = whenToUse.content;

  const whenNotToUse = replaceMarkdownH3Section(
    next,
    "When not to use",
    normalizeBlockMarkdown(summary?.when_not_to_use),
  );
  if (whenNotToUse.found) sections.whenNotToUse = true;
  if (whenNotToUse.changed) {
    changed = true;
  }
  next = whenNotToUse.content;
  const normalizedNext = `${next.trimEnd()}\n`;
  if (normalizedNext !== next) {
    changed = true;
  }
  next = normalizedNext;

  return {
    changed,
    content: next,
    sections,
  };
}

function assertEditorialReplacementContract(fields) {
  for (const [key, value] of Object.entries(fields)) {
    const requiredKeys = EDITORIAL_OBJECT_REQUIRED_KEYS[key];
    if (requiredKeys) {
      if (!isPlainObject(value)) {
        const error = new Error(
          `Field '${key}' must be a complete object replacement including: ${requiredKeys.join(", ")}`,
        );
        error.statusCode = 400;
        throw error;
      }
      const missing = requiredKeys.filter((requiredKey) => !(requiredKey in value));
      if (missing.length > 0) {
        const error = new Error(
          `Field '${key}' must include all required keys for full replacement: ${missing.join(", ")}`,
        );
        error.statusCode = 400;
        throw error;
      }
      continue;
    }

    if (key === "token_mapping") {
      if (value !== null && !isPlainObject(value)) {
        const error = new Error("Field 'token_mapping' must be an object or null.");
        error.statusCode = 400;
        throw error;
      }
      continue;
    }

    if (key === "qa" || key === "related_components") {
      if (!Array.isArray(value)) {
        const error = new Error(`Field '${key}' must be an array.`);
        error.statusCode = 400;
        throw error;
      }
      continue;
    }

    if (key === "status" && typeof value !== "string") {
      const error = new Error("Field 'status' must be a string.");
      error.statusCode = 400;
      throw error;
    }
  }
}

export function sanitizeComponentSlug(raw) {
  const slug = String(raw || "").trim().toLowerCase();
  if (!COMPONENT_SLUG_RE.test(slug)) return null;
  return slug;
}

export async function resolveComponentSpecTarget(
  { repoRoot, docsDir, slug },
  deps = {},
) {
  const resolveRepoFilePathFn = deps.resolveRepoFilePathFn;
  if (typeof resolveRepoFilePathFn !== "function") {
    throw new Error("resolveRepoFilePathFn is required");
  }
  const normalizedDocsDir = String(docsDir || "").trim();
  if (!normalizedDocsDir) {
    return { ok: false, message: "System docs directory is not configured." };
  }
  const specRelPath = path.join(path.relative(repoRoot, normalizedDocsDir), "_spec", "components", `${slug}.yml`);

  const specAbsPath = resolveRepoFilePathFn(repoRoot, specRelPath);
  if (!specAbsPath) {
    return { ok: false, message: `Spec path for '${slug}' is outside repository root.` };
  }

  const docRelPath = path.join(path.relative(repoRoot, normalizedDocsDir), "components", `${slug}.md`);
  return {
    ok: true,
    component: {
      slug,
      paths: {
        spec: specRelPath,
        doc: docRelPath,
      },
    },
    specRelPath,
    specAbsPath,
  };
}

export function parseYamlSafely(raw) {
  try {
    const parsed = yaml.load(raw);
    return {
      parsed: parsed ?? null,
      parseError: null,
    };
  } catch (error) {
    return {
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildSpecValidationPayload(args, deps = {}) {
  const validateComponentSpecFn = deps.validateComponentSpecFn;
  const buildSpecDiffFn = deps.buildSpecDiffFn;
  const sha256TextFn = deps.sha256TextFn;
  if (typeof validateComponentSpecFn !== "function") {
    throw new Error("validateComponentSpecFn is required");
  }
  if (typeof buildSpecDiffFn !== "function") {
    throw new Error("buildSpecDiffFn is required");
  }
  if (typeof sha256TextFn !== "function") {
    throw new Error("sha256TextFn is required");
  }

  const parsedCandidate = parseYamlSafely(args.raw);
  if (!parsedCandidate.parsed) {
    return {
      ok: true,
      slug: args.slug,
      path: args.path,
      rawHash: null,
      parsed: null,
      validation: {
        valid: false,
        blockingIssueCount: 1,
        warningCount: 0,
        issues: [
          {
            severity: "error",
            code: "SPEC_YAML_PARSE_ERROR",
            path: "$",
            message: parsedCandidate.parseError || "Unable to parse YAML.",
            requiresConfirmation: false,
          },
        ],
      },
      diff: [],
    };
  }

  const validation = validateComponentSpecFn(parsedCandidate.parsed, {
    tokenRegistry: args.tokenRegistry,
    previousSpec: args.baselineParsed,
  });
  const diff = buildSpecDiffFn(args.baselineParsed, parsedCandidate.parsed);

  return {
    ok: true,
    slug: args.slug,
    path: args.path,
    rawHash: sha256TextFn(args.raw),
    parsed: parsedCandidate.parsed,
    validation,
    diff,
  };
}

export async function runCommandCapture(args, deps = {}) {
  const runSpawnWithCaptureFn = deps.runSpawnWithCaptureFn || runSpawnWithCapture;
  const result = await runSpawnWithCaptureFn({
    cwd: args.cwd,
    command: args.command,
    commandArgs: args.commandArgs,
  });
  return {
    ok: !result.spawnError && result.exitCode === 0,
    code: result.exitCode,
    stdout: result.stdout,
    stderr: [result.stderr, result.spawnError].filter(Boolean).join("\n").trim(),
  };
}

export async function readTextFileIfExists(filePath, deps = {}) {
  const readFileFn = deps.readFileFn || fs.readFile;
  try {
    const raw = await readFileFn(filePath, "utf8");
    return { exists: true, raw };
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code || "") : "";
    if (code === "ENOENT") {
      return { exists: false, raw: "" };
    }
    throw error;
  }
}

export async function loadTokenRegistry(filePath, deps = {}) {
  const readFileFn = deps.readFileFn || fs.readFile;
  if (!filePath) return null;
  const raw = await readFileFn(filePath, "utf8").catch(() => "");
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function persistSpecWithBackup(args, deps = {}) {
  const {
    specAbsPath,
    specBackupsDirPath,
    slug,
    currentRaw,
    currentExists,
    nextRaw,
  } = args;
  const mkdirFn = deps.mkdirFn || fs.mkdir;
  const writeFileFn = deps.writeFileFn || fs.writeFile;
  const renameFn = deps.renameFn || fs.rename;
  const nowFn = deps.nowFn || (() => new Date());
  const nowMsFn = deps.nowMsFn || (() => Date.now());

  await mkdirFn(path.dirname(specAbsPath), { recursive: true });
  await mkdirFn(specBackupsDirPath, { recursive: true });
  const timestamp = nowFn().toISOString().replace(/[:.]/g, "-");
  const backupTimestampPath = path.join(specBackupsDirPath, `${slug}.${timestamp}.yml`);
  const backupLatestPath = path.join(specBackupsDirPath, `${slug}.last.yml`);
  const backupContent = currentExists ? currentRaw : "";
  await writeFileFn(backupTimestampPath, backupContent, "utf8");
  await writeFileFn(backupLatestPath, backupContent, "utf8");

  const tempPath = `${specAbsPath}.tmp-${nowMsFn()}`;
  await writeFileFn(tempPath, nextRaw, "utf8");
  await renameFn(tempPath, specAbsPath);

  return { backupTimestampPath, backupLatestPath };
}

export async function readLatestSpecBackup(args, deps = {}) {
  const { specBackupsDirPath, slug } = args;
  const statFn = deps.statFn || fs.stat;
  const readFileFn = deps.readFileFn || fs.readFile;

  const backupLatestPath = path.join(specBackupsDirPath, `${slug}.last.yml`);
  const backupExists = await statFn(backupLatestPath)
    .then((stat) => stat.isFile())
    .catch(() => false);
  if (!backupExists) {
    return {
      exists: false,
      backupLatestPath,
      raw: "",
    };
  }

  const raw = await readFileFn(backupLatestPath, "utf8");
  return {
    exists: true,
    backupLatestPath,
    raw,
  };
}

export async function restoreSpecFromRaw(args, deps = {}) {
  const { specAbsPath, raw } = args;
  const mkdirFn = deps.mkdirFn || fs.mkdir;
  const writeFileFn = deps.writeFileFn || fs.writeFile;
  const renameFn = deps.renameFn || fs.rename;
  const nowMsFn = deps.nowMsFn || (() => Date.now());

  await mkdirFn(path.dirname(specAbsPath), { recursive: true });
  const tempPath = `${specAbsPath}.tmp-restore-${nowMsFn()}`;
  await writeFileFn(tempPath, raw, "utf8");
  await renameFn(tempPath, specAbsPath);
}

export async function restoreComponentSpecFromLatestBackup(args, deps = {}) {
  const {
    slug,
    specRelPath,
    specAbsPath,
    repoRoot,
    specBackupsDirPath,
    refreshRegistryAfterRestore,
    sha256TextFn,
  } = args;
  const readLatestSpecBackupFn = deps.readLatestSpecBackupFn || readLatestSpecBackup;
  const restoreSpecFromRawFn = deps.restoreSpecFromRawFn || restoreSpecFromRaw;
  const runCommandCaptureFn = deps.runCommandCaptureFn || runCommandCapture;

  const latestBackup = await readLatestSpecBackupFn({
    specBackupsDirPath,
    slug,
  });
  if (!latestBackup.exists) {
    return {
      ok: false,
      slug,
      path: specRelPath,
      restoredFrom: null,
      rawHash: null,
      message: "No backup file found for this component.",
    };
  }

  const backupRaw = latestBackup.raw;
  if (!backupRaw.trim()) {
    return {
      ok: false,
      slug,
      path: specRelPath,
      restoredFrom: path.relative(repoRoot, latestBackup.backupLatestPath),
      rawHash: null,
      message: "Backup exists but is empty; restore skipped.",
    };
  }

  await restoreSpecFromRawFn({
    specAbsPath,
    raw: backupRaw,
  });

  let refreshed = false;
  let refreshOutput = "";
  if (refreshRegistryAfterRestore) {
    const refresh = await runCommandCaptureFn({
      cwd: repoRoot,
      command: "npm",
      commandArgs: ["run", "ds:registry:refresh"],
    });
    refreshed = refresh.ok;
    refreshOutput = [refresh.stdout, refresh.stderr].filter(Boolean).join("\n").trim();
  }

  return {
    ok: true,
    slug,
    path: specRelPath,
    restoredFrom: path.relative(repoRoot, latestBackup.backupLatestPath),
    rawHash: sha256TextFn(backupRaw),
    refreshed,
    refreshOutput,
    message: "Spec restored from latest backup.",
  };
}

function buildIssue(code, message) {
  return {
    severity: "error",
    code,
    path: "$",
    message,
  };
}

function buildRawValidationFailurePayload({ mode, slug, path: specRelPath, code, message }) {
  const payload = {
    ok: mode === "validate",
    slug,
    path: specRelPath,
    rawHash: null,
    parsed: null,
    validation: {
      valid: false,
      blockingIssueCount: 1,
      warningCount: 0,
      issues: [buildIssue(code, message)],
    },
    diff: [],
  };
  if (mode === "save") {
    payload.backupPath = null;
    payload.message = message;
  }
  return payload;
}

export async function validateComponentSpecRaw(args, deps = {}) {
  const {
    slug,
    path: specRelPath,
    raw,
    specAbsPath,
    maxBytes = MAX_COMPONENT_SPEC_BYTES,
  } = args;
  const {
    validateComponentSpecFn,
    buildSpecDiffFn,
    sha256TextFn,
    readTextFileIfExistsFn = readTextFileIfExists,
    parseYamlSafelyFn = parseYamlSafely,
    loadTokenRegistryFn = loadTokenRegistry,
    buildSpecValidationPayloadFn = buildSpecValidationPayload,
  } = deps;

  if (!raw.trim()) {
    return buildRawValidationFailurePayload({
      mode: "validate",
      slug,
      path: specRelPath,
      code: "SPEC_EMPTY",
      message: "Spec content cannot be empty.",
    });
  }

  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return buildRawValidationFailurePayload({
      mode: "validate",
      slug,
      path: specRelPath,
      code: "SPEC_TOO_LARGE",
      message: `Spec exceeds ${maxBytes} bytes.`,
    });
  }

  const currentLoaded = await readTextFileIfExistsFn(specAbsPath);
  const currentRaw = currentLoaded.raw;
  const baselineParsed = parseYamlSafelyFn(currentRaw).parsed;
  const tokenRegistry = await loadTokenRegistryFn();

  return buildSpecValidationPayloadFn(
    {
      slug,
      path: specRelPath,
      raw,
      baselineParsed,
      tokenRegistry,
    },
    {
      validateComponentSpecFn,
      buildSpecDiffFn,
      sha256TextFn,
    },
  );
}

export async function saveComponentSpecRaw(args, deps = {}) {
  const {
    slug,
    path: specRelPath,
    raw,
    specAbsPath,
    specBackupsDirPath,
    repoRoot,
    expectedHash,
    confirmRiskyChanges,
    refreshRegistryAfterSave,
    maxBytes = MAX_COMPONENT_SPEC_BYTES,
  } = args;
  const {
    validateComponentSpecFn,
    buildSpecDiffFn,
    sha256TextFn,
    readTextFileIfExistsFn = readTextFileIfExists,
    parseYamlSafelyFn = parseYamlSafely,
    loadTokenRegistryFn = loadTokenRegistry,
    buildSpecValidationPayloadFn = buildSpecValidationPayload,
    persistSpecWithBackupFn = persistSpecWithBackup,
    runCommandCaptureFn = runCommandCapture,
  } = deps;

  if (!raw.trim()) {
    return buildRawValidationFailurePayload({
      mode: "save",
      slug,
      path: specRelPath,
      code: "SPEC_EMPTY",
      message: "Spec content cannot be empty.",
    });
  }

  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return buildRawValidationFailurePayload({
      mode: "save",
      slug,
      path: specRelPath,
      code: "SPEC_TOO_LARGE",
      message: `Spec exceeds ${maxBytes} bytes.`,
    });
  }

  const currentLoaded = await readTextFileIfExistsFn(specAbsPath);
  const currentRaw = currentLoaded.raw;
  const currentExists = currentLoaded.exists;
  const currentHash = currentExists ? sha256TextFn(currentRaw) : null;

  if (expectedHash && expectedHash !== currentHash) {
    return {
      ok: false,
      slug,
      path: specRelPath,
      rawHash: currentHash,
      backupPath: null,
      parsed: null,
      validation: {
        valid: false,
        blockingIssueCount: 1,
        warningCount: 0,
        issues: [
          buildIssue(
            "SPEC_CONFLICT",
            "Spec file changed on disk since you opened the editor. Reload to merge latest content.",
          ),
        ],
      },
      diff: [],
      message: "Spec file changed on disk; reload before saving.",
    };
  }

  const baselineParsed = parseYamlSafelyFn(currentRaw).parsed;
  const tokenRegistry = await loadTokenRegistryFn();
  const validationPayload = buildSpecValidationPayloadFn(
    {
      slug,
      path: specRelPath,
      raw,
      baselineParsed,
      tokenRegistry,
    },
    {
      validateComponentSpecFn,
      buildSpecDiffFn,
      sha256TextFn,
    },
  );

  if (!validationPayload.validation.valid) {
    return {
      ok: false,
      slug,
      path: specRelPath,
      rawHash: currentHash,
      backupPath: null,
      parsed: validationPayload.parsed,
      validation: validationPayload.validation,
      diff: validationPayload.diff,
      message: "Spec has validation errors.",
    };
  }

  const requiresConfirmation = validationPayload.validation.issues.some(
    (issue) => issue.requiresConfirmation === true,
  );
  if (requiresConfirmation && !confirmRiskyChanges) {
    return {
      ok: false,
      slug,
      path: specRelPath,
      rawHash: currentHash,
      backupPath: null,
      parsed: validationPayload.parsed,
      validation: validationPayload.validation,
      diff: validationPayload.diff,
      requiresConfirmation: true,
      message: "This change includes risky fields and requires explicit confirmation.",
    };
  }

  const persisted = await persistSpecWithBackupFn({
    specAbsPath,
    specBackupsDirPath,
    slug,
    currentRaw,
    currentExists,
    nextRaw: raw,
  });

  let refreshed = false;
  let refreshOutput = "";
  if (refreshRegistryAfterSave) {
    const refresh = await runCommandCaptureFn({
      cwd: repoRoot,
      command: "npm",
      commandArgs: ["run", "ds:registry:refresh"],
    });
    refreshed = refresh.ok;
    refreshOutput = [refresh.stdout, refresh.stderr].filter(Boolean).join("\n").trim();
    if (!refresh.ok) {
      return {
        ok: false,
        slug,
        path: specRelPath,
        rawHash: sha256TextFn(raw),
        backupPath: path.relative(repoRoot, persisted.backupLatestPath),
        parsed: validationPayload.parsed,
        validation: validationPayload.validation,
        diff: validationPayload.diff,
        refreshed,
        refreshOutput,
        message: "Spec saved, but registry refresh failed.",
      };
    }
  }

  return {
    ok: true,
    slug,
    path: specRelPath,
    rawHash: sha256TextFn(raw),
    backupPath: path.relative(repoRoot, persisted.backupLatestPath),
    parsed: validationPayload.parsed,
    validation: validationPayload.validation,
    diff: validationPayload.diff,
    refreshed,
    refreshOutput,
    message: "Spec saved successfully.",
  };
}

/**
 * Save editorial fields only.
 *
 * Contract:
 * - Each key in `body.fields` replaces the entire existing top-level editorial value.
 * - Callers must provide full object values for nested fields (no partial nested patches).
 */
export async function saveEditorialSpecFields(args, deps = {}) {
  const {
    slug,
    path: specRelPath,
    body,
    specAbsPath,
    markdownAbsPath = null,
    markdownRelPath = null,
    specBackupsDirPath,
    repoRoot,
  } = args;
  const {
    sha256TextFn,
    readTextFileIfExistsFn = readTextFileIfExists,
    parseYamlSafelyFn = parseYamlSafely,
    persistSpecWithBackupFn = persistSpecWithBackup,
    writeFileFn = fs.writeFile,
  } = deps;

  if (typeof sha256TextFn !== "function") {
    throw new Error("sha256TextFn is required");
  }

  const rawFields = body?.fields;
  if (!isPlainObject(rawFields)) {
    const error = new Error("fields must be a JSON object.");
    error.statusCode = 400;
    throw error;
  }

  const fields = rawFields;
  const incomingKeys = Object.keys(fields);
  const forbiddenCaptureKeys = incomingKeys.filter((key) => CAPTURE_KEYS.includes(key));
  if (forbiddenCaptureKeys.length > 0) {
    const error = new Error(
      `Cannot overwrite capture keys via editorial PATCH: ${forbiddenCaptureKeys.join(", ")}`,
    );
    error.statusCode = 400;
    throw error;
  }

  const unknownKeys = incomingKeys.filter((key) => !EDITORIAL_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    const error = new Error(
      `Unknown editorial keys: ${unknownKeys.join(", ")}. Allowed: ${EDITORIAL_KEYS.join(", ")}`,
    );
    error.statusCode = 400;
    throw error;
  }
  assertEditorialReplacementContract(fields);

  const expectedHashRaw = body?.expectedHash;
  const expectedHash =
    expectedHashRaw === null || expectedHashRaw === undefined
      ? null
      : String(expectedHashRaw).trim() || null;

  const currentLoaded = await readTextFileIfExistsFn(specAbsPath);
  const currentRaw = currentLoaded.raw;
  const currentExists = currentLoaded.exists;
  const currentHash = currentExists ? sha256TextFn(currentRaw) : null;
  if (expectedHash && expectedHash !== currentHash) {
    const error = new Error("Spec file changed on disk; reload before saving editorial fields.");
    error.statusCode = 409;
    throw error;
  }

  const currentParsed = parseYamlSafelyFn(currentRaw);
  if (currentParsed.parseError) {
    const error = new Error(`Spec YAML parse error: ${currentParsed.parseError}`);
    error.statusCode = 422;
    throw error;
  }

  const existing = isPlainObject(currentParsed.parsed) ? currentParsed.parsed : {};
  const nextSpec = { ...existing };
  for (const [key, value] of Object.entries(fields)) {
    nextSpec[key] = value;
  }

  const nextRaw = yaml.dump(nextSpec, { lineWidth: -1 });
  const persisted = await persistSpecWithBackupFn({
    specAbsPath,
    specBackupsDirPath,
    slug,
    currentRaw,
    currentExists,
    nextRaw,
  });

  let markdownSynced = false;
  let markdownSyncError = null;
  let markdownSectionsFound = null;
  if (incomingKeys.includes("summary")) {
    try {
      if (!markdownAbsPath) {
        markdownSynced = false;
        markdownSyncError = "No markdown path configured for this component.";
      } else {
        const markdownLoaded = await readTextFileIfExistsFn(markdownAbsPath);
        if (!markdownLoaded.exists) {
          markdownSynced = false;
          markdownSyncError = "Markdown file does not exist yet.";
        } else {
          const summaryValue = isPlainObject(nextSpec.summary) ? nextSpec.summary : {};
          const syncResult = syncSummaryIntoMarkdown(markdownLoaded.raw, summaryValue);
          const sections = syncResult.sections;
          const requiredSectionFlags = [
            ["purpose", Boolean(sections.purpose)],
            ["when_to_use", Boolean(sections.whenToUse)],
            ["when_not_to_use", Boolean(sections.whenNotToUse)],
          ];
          const missingSections = requiredSectionFlags
            .filter(([, found]) => !found)
            .map(([key]) => key);
          if (missingSections.length > 0) {
            markdownSynced = false;
            markdownSyncError = `Markdown summary sync incomplete. Missing sections: ${missingSections.join(", ")}.`;
            markdownSectionsFound = sections;
          } else {
            if (syncResult.changed) {
              await writeFileFn(markdownAbsPath, syncResult.content, "utf8");
            }
            markdownSynced = true;
            markdownSyncError = null;
            markdownSectionsFound = sections;
          }
        }
      }
    } catch (error) {
      markdownSyncError = error instanceof Error ? error.message : String(error);
    }
  }

  let message = "Editorial fields saved successfully.";
  if (incomingKeys.includes("summary")) {
    if (markdownSynced) {
      message = "Editorial fields and markdown updated successfully.";
    } else if (markdownSyncError) {
      message = `Editorial fields saved successfully, but markdown sync failed: ${markdownSyncError}`;
    }
  }

  return {
    ok: true,
    slug,
    path: specRelPath,
    rawHash: sha256TextFn(nextRaw),
    backupPath: path.relative(repoRoot, persisted.backupLatestPath),
    savedKeys: incomingKeys,
    markdownPath: markdownRelPath,
    markdownSynced,
    markdownSyncError,
    markdownSectionsFound,
    message,
  };
}
