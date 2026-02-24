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
