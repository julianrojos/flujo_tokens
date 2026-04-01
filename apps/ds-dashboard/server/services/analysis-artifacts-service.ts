/**
 * Analysis Artifacts Service
 *
 * Provides analysis utilities for naming debt and WCAG pairs.
 * Migrated from apps/ds-dashboard/server/services/analysis-artifacts-service.mjs
 */

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

export interface ComputeNamingDebtReportFromDataDeps {
  analyzeNamingDebtFn?: (args: {
    tokenRegistry: unknown;
    tokenUsageIndex: unknown | null;
    tokenGraph: unknown | null;
    config: unknown | null;
  }) => Promise<unknown>;
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

export async function computeNamingDebtReportFromData(
  args: {
    tokenRegistry: unknown;
    tokenUsageIndex: unknown | null;
    tokenGraph: unknown | null;
    config: unknown | null;
  },
  deps: ComputeNamingDebtReportFromDataDeps = {}
): Promise<NamingDebtReport> {
  const analyzeNamingDebtFn =
    deps.analyzeNamingDebtFn ||
    (await import('../../src/lib/naming-debt.ts')).analyzeNamingDebt;
  return (await analyzeNamingDebtFn({
    tokenRegistry: args.tokenRegistry,
    tokenUsageIndex: args.tokenUsageIndex,
    tokenGraph: args.tokenGraph,
    config: args.config,
  })) as NamingDebtReport;
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
    typeof args.maxOutputBytes === 'number' &&
    Number.isFinite(args.maxOutputBytes) &&
    args.maxOutputBytes > 0
      ? Math.floor(args.maxOutputBytes)
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
        message: 'Command returned invalid JSON.',
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
