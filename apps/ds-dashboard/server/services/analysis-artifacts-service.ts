/**
 * Analysis Artifacts Service
 *
 * Provides analysis utilities for naming debt and WCAG pairs.
 * Migrated from apps/ds-dashboard/server/services/analysis-artifacts-service.mjs
 */

import fs from 'node:fs/promises';
import { runSpawnWithCapture, type RunSpawnWithCaptureResult } from '../lib/spawn-runner.ts';

const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2MB

export interface WcagPair {
  foreground: string;
  background: string;
  level: 'AA' | 'AAA';
  textSize: 'normal' | 'large';
}

export interface WcagPairsPayload {
  pairs: Array<Partial<WcagPair>>;
}

export interface NamingDebtReport {
  tokenRegistry: unknown;
  tokenUsageIndex: unknown | null;
  tokenGraph: unknown | null;
  config: unknown | null;
}

export interface ComputeNamingDebtReportDeps {
  readFileFn?: (filePath: string, encoding: string) => Promise<string>;
  analyzeNamingDebtFn?: (args: {
    tokenRegistry: unknown;
    tokenUsageIndex: unknown | null;
    tokenGraph: unknown | null;
    config: unknown | null;
  }) => Promise<NamingDebtReport>;
}

export interface RunNodeJsonCommandOnceOptions {
  cwd: string;
  command: string;
  commandArgs: string[];
  commandLabel: string;
  maxOutputBytes?: number;
}

export interface RunNodeJsonCommandOnceDeps {
  runSpawnWithCaptureFn?: (options: any) => Promise<RunSpawnWithCaptureResult>;
}

export interface RunNodeJsonCommandOnceResult {
  ok: boolean;
  statusCode?: number;
  payload?: unknown;
}

/**
 * Validate a git ref string for safety.
 */
export function validateGitRef(raw: unknown): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (value.length > 140) return null;
  if (value.includes(':')) return null;
  if (/\s/.test(value)) return null;
  if (!/^[A-Za-z0-9._/~^-]+$/.test(value)) return null;
  return value;
}

/**
 * Normalize and sanitize WCAG pairs payload.
 */
export function normalizeImpactWcagPairs(raw: unknown): WcagPair[] {
  const list =
    raw && typeof raw === 'object' && Array.isArray((raw as WcagPairsPayload).pairs)
      ? (raw as WcagPairsPayload).pairs
      : [];

  const pairs: WcagPair[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const foreground = String((item as any).foreground ?? '').trim();
    const background = String((item as any).background ?? '').trim();
    if (!foreground || !background) continue;
    const level = String((item as any).level ?? 'AA').trim().toUpperCase() === 'AAA' ? 'AAA' : 'AA';
    const textSize =
      String((item as any).textSize ?? 'normal').trim().toLowerCase() === 'large'
        ? 'large'
        : 'normal';
    pairs.push({ foreground, background, level, textSize });
  }
  return pairs;
}

/**
 * Compute naming debt report from artifact files.
 */
export async function computeNamingDebtReport(
  args: {
    tokenRegistryPath: string;
    tokenUsageIndexPath: string;
    tokenGraphVizPath: string;
    namingDebtConfigPath: string;
  },
  deps: ComputeNamingDebtReportDeps = {}
): Promise<NamingDebtReport> {
  const readFileFn = deps.readFileFn || fs.readFile;
  const analyzeNamingDebtFn =
    deps.analyzeNamingDebtFn ||
    (await import('../../src/lib/naming-debt.ts')).analyzeNamingDebt;

  const [tokenRegistryRaw, tokenUsageRaw, tokenGraphRaw, namingConfigRaw] = await Promise.all([
    readFileFn(args.tokenRegistryPath, 'utf8'),
    readFileFn(args.tokenUsageIndexPath, 'utf8').catch(() => 'null'),
    readFileFn(args.tokenGraphVizPath, 'utf8').catch(() => 'null'),
    readFileFn(args.namingDebtConfigPath, 'utf8').catch(() => 'null'),
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

/**
 * Run a node command once and parse JSON output.
 */
export async function runNodeJsonCommandOnce(
  args: RunNodeJsonCommandOnceOptions,
  deps: RunNodeJsonCommandOnceDeps = {}
): Promise<RunNodeJsonCommandOnceResult> {
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
        message: result.stderr || `Exit code ${result.exitCode}`,
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
        message: result.jsonParseError,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  }

  return {
    ok: true,
    statusCode: 200,
    payload: result.parsedJson,
  };
}
