import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

import { runSpawnWithCapture } from "./spawn-runner.mjs";

const COMPONENT_SLUG_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
export const MAX_COMPONENT_SPEC_BYTES = 100_000;

export function sanitizeComponentSlug(raw) {
  const slug = String(raw || "").trim().toLowerCase();
  if (!COMPONENT_SLUG_RE.test(slug)) return null;
  return slug;
}

export async function resolveComponentSpecTarget(
  { repoRoot, componentRegistryPath, slug },
  deps = {},
) {
  const readFileFn = deps.readFileFn || fs.readFile;
  const resolveRepoFilePathFn = deps.resolveRepoFilePathFn;
  if (typeof resolveRepoFilePathFn !== "function") {
    throw new Error("resolveRepoFilePathFn is required");
  }

  const registryRaw = await readFileFn(componentRegistryPath, "utf8");
  const registry = JSON.parse(registryRaw);
  const component = (registry.components ?? []).find(
    (candidate) => String(candidate.slug ?? "").trim().toLowerCase() === slug,
  );
  if (!component) {
    return { ok: false, message: `Component '${slug}' not found.` };
  }

  const specRelPath = String(component?.paths?.spec ?? "").trim();
  if (!specRelPath) {
    return { ok: false, message: `Component '${slug}' does not define a spec path.` };
  }

  const specAbsPath = resolveRepoFilePathFn(repoRoot, specRelPath);
  if (!specAbsPath) {
    return { ok: false, message: `Spec path for '${slug}' is outside repository root.` };
  }

  return {
    ok: true,
    component,
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
    tokenRegistryPath,
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
  const tokenRegistry = await loadTokenRegistryFn(tokenRegistryPath);

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
    tokenRegistryPath,
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
  const tokenRegistry = await loadTokenRegistryFn(tokenRegistryPath);
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
