import fs from "node:fs/promises";

import { runSpawnWithCapture } from "./spawn-runner.mjs";

const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2MB

export function validateGitRef(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.length > 140) return null;
  if (value.includes(":")) return null;
  if (/\s/.test(value)) return null;
  if (!/^[A-Za-z0-9._/~^-]+$/.test(value)) return null;
  return value;
}

export function normalizeImpactWcagPairs(raw) {
  const list =
    raw && typeof raw === "object" && Array.isArray(raw.pairs)
      ? raw.pairs
      : [];

  const pairs = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const foreground = String(item.foreground ?? "").trim();
    const background = String(item.background ?? "").trim();
    if (!foreground || !background) continue;
    const level = String(item.level ?? "AA").trim().toUpperCase() === "AAA" ? "AAA" : "AA";
    const textSize =
      String(item.textSize ?? "normal").trim().toLowerCase() === "large"
        ? "large"
        : "normal";
    pairs.push({ foreground, background, level, textSize });
  }
  return pairs;
}

export async function computeNamingDebtReport(args, deps = {}) {
  const readFileFn = deps.readFileFn || fs.readFile;
  const analyzeNamingDebtFn =
    deps.analyzeNamingDebtFn ||
    (await import("../../src/lib/naming-debt.ts")).analyzeNamingDebt;

  const [tokenRegistryRaw, tokenUsageRaw, tokenGraphRaw, namingConfigRaw] = await Promise.all([
    readFileFn(args.tokenRegistryPath, "utf8"),
    readFileFn(args.tokenUsageIndexPath, "utf8").catch(() => "null"),
    readFileFn(args.tokenGraphVizPath, "utf8").catch(() => "null"),
    readFileFn(args.namingDebtConfigPath, "utf8").catch(() => "null"),
  ]);

  const tokenRegistry = JSON.parse(tokenRegistryRaw);
  const tokenUsageIndex = tokenUsageRaw ? JSON.parse(tokenUsageRaw) : null;
  const tokenGraph = tokenGraphRaw ? JSON.parse(tokenGraphRaw) : null;
  const config = namingConfigRaw ? JSON.parse(namingConfigRaw) : null;

  return analyzeNamingDebtFn({
    tokenRegistry,
    tokenUsageIndex,
    tokenGraph,
    config: config || undefined,
  });
}

export async function runNodeJsonCommandOnce(args, deps = {}) {
  const runSpawnWithCaptureFn = deps.runSpawnWithCaptureFn || runSpawnWithCapture;
  const maxOutputBytes =
    Number.isFinite(args.maxOutputBytes) && args.maxOutputBytes > 0
      ? Number(args.maxOutputBytes)
      : DEFAULT_MAX_OUTPUT_BYTES;

  const result = await runSpawnWithCaptureFn({
    cwd: args.cwd,
    command: args.command,
    commandArgs: args.commandArgs,
    parseJsonStdout: true,
    maxOutputBytes,
  });

  if (result.spawnError) {
    return {
      ok: false,
      statusCode: 500,
      payload: {
        ok: false,
        command: args.commandLabel,
        message: result.spawnError,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  }

  if (result.exitCode !== 0) {
    return {
      ok: false,
      statusCode: 500,
      payload: {
        ok: false,
        command: args.commandLabel,
        code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  }

  if (result.jsonParseError) {
    return {
      ok: false,
      statusCode: 500,
      payload: {
        ok: false,
        command: args.commandLabel,
        message: "Command returned invalid JSON.",
        stdout: result.stdout,
        stderr: result.stderr,
        parse_error: result.jsonParseError,
      },
    };
  }

  return {
    ok: true,
    statusCode: 200,
    payload: result.parsedJson,
  };
}
