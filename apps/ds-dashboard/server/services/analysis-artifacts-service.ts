/**
 * Analysis Artifacts Service
 *
 * Provides shared git-ref validation and node-JSON command helpers.
 */

import { runSpawnWithCapture, type RunSpawnWithCaptureResult } from '../lib/spawn-runner.ts';

const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2MB

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
