/**
 * Spawn Runner
 *
 * Executes child processes with output capture and limits.
 * Migrated from apps/ds-dashboard/server/lib/spawn-runner.mjs
 */

import { spawn, type ChildProcess } from 'node:child_process';

export interface RunSpawnWithCaptureOptions {
  command: string;
  commandArgs?: string[];
  env?: Record<string, string>;
  cwd?: string;
  parseJsonStdout?: boolean;
  maxOutputBytes?: number;
  onSpawn?: (child: ChildProcess) => void;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}

export interface RunSpawnWithCaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  parsedJson: Record<string, unknown> | null;
  jsonParseError: string | null;
  spawnError: string | null;
}

/**
 * Append chunk to buffer with size limit.
 */
function appendWithLimit(buffer: string, chunk: string, maxBytes: number): string {
  if (!Number.isFinite(maxBytes)) return buffer + chunk;
  if (maxBytes <= 0) return buffer;
  if (buffer.length >= maxBytes) return buffer;
  const remaining = maxBytes - buffer.length;
  return buffer + chunk.slice(0, remaining);
}

/**
 * Run a spawn command with captured output.
 */
export async function runSpawnWithCapture(options: RunSpawnWithCaptureOptions): Promise<RunSpawnWithCaptureResult> {
  return await new Promise((resolve) => {
    const child = spawn(options.command, options.commandArgs || [], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      shell: false,
    });
    if (typeof options.onSpawn === 'function') options.onSpawn(child);

    const maxOutputBytes = Number.isFinite(options.maxOutputBytes as number)
      ? Number(options.maxOutputBytes)
      : Number.POSITIVE_INFINITY;

    let settled = false;
    let stdout = '';
    let stderr = '';

    const finish = (payload: RunSpawnWithCaptureResult) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      const text = String(chunk);
      stdout = appendWithLimit(stdout, text, maxOutputBytes);
      if (typeof options.onStdoutChunk === 'function') options.onStdoutChunk(text);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = String(chunk);
      stderr = appendWithLimit(stderr, text, maxOutputBytes);
      if (typeof options.onStderrChunk === 'function') options.onStderrChunk(text);
    });

    child.on('error', (error: Error) => {
      const message = error instanceof Error ? error.message : String(error);
      finish({
        exitCode: 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        parsedJson: null,
        jsonParseError: null,
        spawnError: message || 'Unknown process spawn error.',
      });
    });

    child.on('close', (code: number | null) => {
      const exitCode = typeof code === 'number' ? code : 1;
      const trimmedStdout = stdout.trim();
      const trimmedStderr = stderr.trim();
      const parseJsonStdout = options.parseJsonStdout === true;

      if (!parseJsonStdout) {
        finish({
          exitCode,
          stdout: trimmedStdout,
          stderr: trimmedStderr,
          parsedJson: null,
          jsonParseError: null,
          spawnError: null,
        });
        return;
      }

      try {
        const parsedJson = trimmedStdout ? JSON.parse(trimmedStdout) : {};
        finish({
          exitCode,
          stdout: trimmedStdout,
          stderr: trimmedStderr,
          parsedJson,
          jsonParseError: null,
          spawnError: null,
        });
      } catch (error) {
        finish({
          exitCode,
          stdout: trimmedStdout,
          stderr: trimmedStderr,
          parsedJson: null,
          jsonParseError: error instanceof Error ? error.message : String(error),
          spawnError: null,
        });
      }
    });
  });
}
