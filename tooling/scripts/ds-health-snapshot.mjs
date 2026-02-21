#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { DOCS_ROOT, PROJECT_ROOT, resolveProjectPath } from "./lib/paths.mjs";

const DEFAULT_TOKEN_HEALTH_PATH = path.join(DOCS_ROOT, "_generated", "token-health.json");
const DEFAULT_COMPONENTS_HEALTH_PATH = path.join(
  DOCS_ROOT,
  "_generated",
  "components-health.json",
);
const DEFAULT_TOKEN_USAGE_INDEX_PATH = path.join(
  DOCS_ROOT,
  "_generated",
  "token-usage-index.json",
);
const DEFAULT_OUT_PATH = path.join(DOCS_ROOT, "_generated", "health-history.json");
const DEFAULT_RETENTION_DAYS = 120;

const USAGE = {
  command: "npm run ds:health-snapshot [-- --dry-run true]",
  description:
    "Capture a historical health snapshot (breaking/WCAG/coverage/unresolved) into docs/_generated/health-history.json.",
  options: [
    {
      name: "--token-health <path>",
      description: "Token health JSON input path.",
      defaultValue: "docs/_generated/token-health.json",
    },
    {
      name: "--components-health <path>",
      description: "Components health JSON input path.",
      defaultValue: "docs/_generated/components-health.json",
    },
    {
      name: "--token-usage-index <path>",
      description: "Token usage index JSON input path.",
      defaultValue: "docs/_generated/token-usage-index.json",
    },
    {
      name: "--before-ref <git-ref>",
      description: "Git ref used to compute breaking token changes via ds-token-diff.",
      defaultValue: "HEAD~1",
    },
    {
      name: "--retention-days <number>",
      description: "Drop snapshots older than this number of days.",
      defaultValue: String(DEFAULT_RETENTION_DAYS),
    },
    {
      name: "--skip-diff <true|false>",
      description: "Skip token diff execution (breaking_changes will be null).",
      defaultValue: "false",
    },
    {
      name: "--allow-duplicate-day <true|false>",
      description: "Allow multiple snapshots per day with identical signature.",
      defaultValue: "false",
    },
    {
      name: "--out <path>",
      description: "Output health history JSON path.",
      defaultValue: "docs/_generated/health-history.json",
    },
    {
      name: "--format <json|text>",
      description: "Stdout format.",
      defaultValue: "json",
    },
    {
      name: "--dry-run <true|false>",
      description: "Compute and report without writing output file.",
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

function parseIntegerOption(rawValue, optionName, fallback, minValue) {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${optionName} value: ${rawValue}. Expected a number.`);
  }
  return Math.max(minValue, Math.floor(parsed));
}

function resolveSafePath(rawPath, label) {
  const resolved = path.resolve(String(rawPath || "").trim());
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep)
    ? PROJECT_ROOT
    : `${PROJECT_ROOT}${path.sep}`;
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error(`${label} must be inside project root (${PROJECT_ROOT}). Received: ${resolved}`);
  }
  return resolved;
}

function readJsonRequired(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${label} (${filePath}): ${reason}`);
  }
}

function readJsonOptional(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function writeTextFileIfChanged(filePath, content, dryRun) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  const changed = current !== content;
  let written = false;

  if (changed && !dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    let tempCreated = false;
    try {
      fs.writeFileSync(tempPath, content, "utf8");
      tempCreated = true;
      fs.renameSync(tempPath, filePath);
      written = true;
    } finally {
      if (tempCreated && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }

  return { changed, written };
}

function toProjectRelative(filePath) {
  const relative = path.relative(PROJECT_ROOT, path.resolve(filePath)).split(path.sep).join("/");
  return relative.startsWith("..") ? path.resolve(filePath) : relative;
}

function formatDateBucket(isoTimestamp) {
  const date = new Date(String(isoTimestamp || ""));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseBreakingChangesFromTokenDiff(beforeRef) {
  const scriptPath = resolveProjectPath("tooling", "scripts", "ds-token-diff.mjs");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--before-ref", beforeRef, "--format", "json"],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    return {
      breakingChanges: null,
      fingerprint: null,
      warning:
        result.stderr?.trim() ||
        result.stdout?.trim() ||
        `Token diff failed with exit code ${String(result.status ?? "unknown")}`,
    };
  }

  const raw = String(result.stdout || "").trim();
  if (!raw) {
    return {
      breakingChanges: null,
      fingerprint: null,
      warning: "Token diff returned empty output.",
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const breakingChanges = Number(parsed?.summary?.breaking_changes);
    return {
      breakingChanges: Number.isFinite(breakingChanges) ? breakingChanges : null,
      fingerprint: String(parsed?.fingerprint || ""),
      warning: null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      breakingChanges: null,
      fingerprint: null,
      warning: `Token diff JSON parse failed: ${reason}`,
    };
  }
}

function normalizeHistory(raw) {
  const snapshots = Array.isArray(raw?.snapshots) ? raw.snapshots : [];
  const normalized = snapshots
    .filter((snapshot) => snapshot && typeof snapshot === "object")
    .filter((snapshot) => {
      const timestamp = String(snapshot.captured_at || "");
      return Boolean(timestamp);
    })
    .map((snapshot) => ({
      captured_at: String(snapshot.captured_at),
      metrics: {
        breaking_changes:
          snapshot?.metrics?.breaking_changes === null
            ? null
            : Number(snapshot?.metrics?.breaking_changes || 0),
        wcag_failures_total: Number(snapshot?.metrics?.wcag_failures_total || 0),
        coverage_avg: Number(snapshot?.metrics?.coverage_avg || 0),
        unresolved_total: Number(snapshot?.metrics?.unresolved_total || 0),
        unused_tokens_total: Number(snapshot?.metrics?.unused_tokens_total || 0),
        needs_review_total: Number(snapshot?.metrics?.needs_review_total || 0),
      },
      fingerprints: {
        token_health: String(snapshot?.fingerprints?.token_health || ""),
        components_health: String(snapshot?.fingerprints?.components_health || ""),
        token_usage: String(snapshot?.fingerprints?.token_usage || ""),
        token_diff: String(snapshot?.fingerprints?.token_diff || ""),
        signature_sha256: String(snapshot?.fingerprints?.signature_sha256 || ""),
      },
      meta: {
        before_ref: String(snapshot?.meta?.before_ref || "HEAD~1"),
      },
    }))
    .sort((left, right) => left.captured_at.localeCompare(right.captured_at));

  return {
    schema_version: 1,
    snapshots: normalized,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const format = String(args.format || "json").trim().toLowerCase();
  if (format !== "json" && format !== "text") {
    throw new Error(`Invalid --format value: ${format}. Allowed: json, text.`);
  }

  const dryRun = parseBooleanOption(args["dry-run"], "--dry-run", false);
  const skipDiff = parseBooleanOption(args["skip-diff"], "--skip-diff", false);
  const allowDuplicateDay = parseBooleanOption(
    args["allow-duplicate-day"],
    "--allow-duplicate-day",
    false,
  );
  const retentionDays = parseIntegerOption(
    args["retention-days"],
    "--retention-days",
    DEFAULT_RETENTION_DAYS,
    1,
  );
  const beforeRef = String(args["before-ref"] || "HEAD~1").trim();
  if (!beforeRef) {
    throw new Error("Invalid --before-ref value.");
  }

  const tokenHealthPath = resolveSafePath(
    args["token-health"] || DEFAULT_TOKEN_HEALTH_PATH,
    "--token-health",
  );
  const componentsHealthPath = resolveSafePath(
    args["components-health"] || DEFAULT_COMPONENTS_HEALTH_PATH,
    "--components-health",
  );
  const tokenUsageIndexPath = resolveSafePath(
    args["token-usage-index"] || DEFAULT_TOKEN_USAGE_INDEX_PATH,
    "--token-usage-index",
  );
  const outPath = resolveSafePath(args.out || DEFAULT_OUT_PATH, "--out");

  const tokenHealth = readJsonRequired(tokenHealthPath, "token health");
  const componentsHealth = readJsonRequired(componentsHealthPath, "components health");
  const tokenUsageIndex = readJsonRequired(tokenUsageIndexPath, "token usage index");
  const existingHistory = normalizeHistory(readJsonOptional(outPath));

  const nowIso = new Date().toISOString();
  const diffResult = skipDiff
    ? {
        breakingChanges: null,
        fingerprint: "",
        warning: "Token diff skipped (--skip-diff true).",
      }
    : parseBreakingChangesFromTokenDiff(beforeRef);

  const snapshot = {
    captured_at: nowIso,
    metrics: {
      breaking_changes: diffResult.breakingChanges,
      wcag_failures_total: Number(tokenHealth?.summary?.wcag_failures_total || 0),
      coverage_avg: Number(componentsHealth?.summary?.average_coverage_percent || 0),
      unresolved_total: Number(tokenUsageIndex?.summary?.unresolved_total || 0),
      unused_tokens_total: Number(tokenHealth?.summary?.unused_tokens_total || 0),
      needs_review_total: Number(componentsHealth?.summary?.needs_review || 0),
    },
    fingerprints: {
      token_health: String(tokenHealth?.fingerprint_sha256 || ""),
      components_health: String(componentsHealth?.fingerprint_sha256 || ""),
      token_usage: String(tokenUsageIndex?.fingerprint || ""),
      token_diff: String(diffResult.fingerprint || ""),
      signature_sha256: "",
    },
    meta: {
      before_ref: beforeRef,
    },
  };

  snapshot.fingerprints.signature_sha256 = sha256(
    stableSerialize({
      metrics: snapshot.metrics,
      fingerprints: {
        token_health: snapshot.fingerprints.token_health,
        components_health: snapshot.fingerprints.components_health,
        token_usage: snapshot.fingerprints.token_usage,
        token_diff: snapshot.fingerprints.token_diff,
      },
      before_ref: beforeRef,
    }),
  );

  const lastSnapshot = existingHistory.snapshots[existingHistory.snapshots.length - 1] || null;
  const sameDay =
    lastSnapshot &&
    formatDateBucket(lastSnapshot.captured_at) === formatDateBucket(snapshot.captured_at);
  const sameSignature =
    lastSnapshot &&
    String(lastSnapshot.fingerprints?.signature_sha256 || "") ===
      snapshot.fingerprints.signature_sha256;

  const shouldAppend = allowDuplicateDay || !(sameDay && sameSignature);
  const snapshots = shouldAppend
    ? [...existingHistory.snapshots, snapshot]
    : existingHistory.snapshots.slice();

  const cutoffEpoch = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const prunedSnapshots = snapshots.filter((item) => {
    const epoch = new Date(item.captured_at).getTime();
    return Number.isFinite(epoch) && epoch >= cutoffEpoch;
  });
  const prunedCount = snapshots.length - prunedSnapshots.length;

  const historyOutput = {
    ok: true,
    schema_version: 1,
    generated_at: nowIso,
    retention_days: retentionDays,
    snapshots: prunedSnapshots,
    summary: {
      snapshots_total: prunedSnapshots.length,
      latest_at:
        prunedSnapshots.length > 0 ? prunedSnapshots[prunedSnapshots.length - 1].captured_at : null,
    },
  };

  const content = `${JSON.stringify(historyOutput, null, 2)}\n`;
  const writeResult = writeTextFileIfChanged(outPath, content, dryRun);

  const output = {
    ok: true,
    dry_run: dryRun,
    out_json: toProjectRelative(outPath),
    appended: shouldAppend,
    deduplicated_same_day: !shouldAppend,
    pruned_old_snapshots: prunedCount,
    snapshots_total: prunedSnapshots.length,
    changed: writeResult.changed,
    written: writeResult.written,
    snapshot,
    warnings: diffResult.warning ? [diffResult.warning] : [],
  };

  if (format === "text") {
    const lines = [
      `Health snapshot: ${shouldAppend ? "appended" : "deduplicated"}`,
      `Output: ${output.out_json}${dryRun ? " (dry-run)" : ""}`,
      `Snapshots total: ${output.snapshots_total}`,
      `Changed: ${output.changed ? "yes" : "no"} | Written: ${output.written ? "yes" : "no"}`,
      `Metrics: breaking=${String(snapshot.metrics.breaking_changes)} wcag=${snapshot.metrics.wcag_failures_total} coverage=${snapshot.metrics.coverage_avg} unresolved=${snapshot.metrics.unresolved_total}`,
    ];
    if (diffResult.warning) lines.push(`Warning: ${diffResult.warning}`);
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
