/**
 * Command Execution Service
 *
 * Executes commands with output capture and structured result handling.
 * Migrated from apps/ds-dashboard/server/lib/command-execution-service.mjs
 */

import type { ChildProcess } from 'node:child_process';

import { runSpawnWithCapture, type RunSpawnWithCaptureResult } from './spawn-runner.ts';
import { detectKnownNonZeroFailure, buildNonZeroExitSummary } from './command-execution-shared.ts';

export interface CommandExecutionOptions {
  cwd: string;
  command: string;
  commandArgs: string[];
  commandEnv?: Record<string, string>;
  commandLabel: string;
  emitChunk: (stream: 'stdout' | 'stderr', chunk: string) => void;
  registerProcess?: (process: ChildProcess) => void;
  parseJsonStdout?: boolean;
  allowNonZeroJson?: boolean;
  maxOutputBytes?: number;
}

export interface CommandExecutionResult {
  ok: boolean;
  code: number;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface CreateCommandExecutionServiceOptions {
  runSpawnWithCapture: (options: any) => Promise<RunSpawnWithCaptureResult>;
  maxOutputBytes: number;
  summarizePayloadFailure: (payload: Record<string, unknown> | null, code: number) => string;
}

/**
 * Create command execution service.
 */
export function createCommandExecutionService(options: CreateCommandExecutionServiceOptions) {
  const { runSpawnWithCapture: runSpawnWithCaptureFn, maxOutputBytes, summarizePayloadFailure } = options;

  /**
   * Run a spawn command with structured result handling.
   */
  async function runQueuedSpawnCommand(cmdOptions: CommandExecutionOptions): Promise<CommandExecutionResult> {
    const {
      cwd,
      command,
      commandArgs,
      commandEnv,
      commandLabel,
      emitChunk,
      registerProcess,
      parseJsonStdout = false,
      allowNonZeroJson = false,
    } = cmdOptions;

    const result = await runSpawnWithCaptureFn({
      cwd,
      command,
      commandArgs,
      env: commandEnv,
      parseJsonStdout,
      maxOutputBytes,
      onSpawn: registerProcess,
      onStdoutChunk: (chunk: string) => emitChunk('stdout', chunk),
      onStderrChunk: (chunk: string) => emitChunk('stderr', chunk),
    });

    // Spawn error
    if (result.spawnError) {
      return {
        ok: false,
        code: 1,
        summary: result.spawnError,
        payload: {
          ok: false,
          command: commandLabel,
          message: result.spawnError,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    }

    // JSON parse error (check before exit code to allow allowNonZeroJson to work)
    if (parseJsonStdout && result.jsonParseError) {
      return {
        ok: false,
        code: result.exitCode,
        summary: 'Command returned invalid JSON.',
        payload: {
          ok: false,
          command: commandLabel,
          message: 'Command returned invalid JSON.',
          code: result.exitCode,
          parse_error: result.jsonParseError,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    }

    // Process JSON result (including allowNonZeroJson handling)
    if (parseJsonStdout && result.parsedJson) {
      const parsed = result.parsedJson as Record<string, unknown>;
      const ok = parsed.ok !== false;

      // allowNonZeroJson: treat non-zero exit codes as structured failures from JSON
      if (allowNonZeroJson && result.exitCode !== 0) {
        return {
          ok: false,
          code: result.exitCode,
          summary: summarizePayloadFailure(parsed, result.exitCode),
          payload: {
            ok: false,
            command: commandLabel,
            exit_code: result.exitCode,
            ...parsed,
          },
        };
      }

      // Normal JSON result with ok=false
      if (!ok) {
        return {
          ok: false,
          code: 1,
          summary: summarizePayloadFailure(parsed, result.exitCode),
          payload: {
            ok: false,
            command: commandLabel,
            exit_code: result.exitCode,
            ...parsed,
          },
        };
      }

      // Success with JSON
      return {
        ok: true,
        code: 0,
        summary: 'Success',
        payload: {
          ok: true,
          command: commandLabel,
          exit_code: result.exitCode,
          ...parsed,
        },
      };
    }

    // Non-zero exit code (plain command, no JSON parsing)
    if (result.exitCode !== 0) {
      const knownFailure = detectKnownNonZeroFailure(
        {
          command,
          commandArgs,
        },
        {
          stderr: result.stderr,
        },
      );
      return {
        ok: false,
        code: result.exitCode,
        summary: buildNonZeroExitSummary({
          knownFailure,
          exitCode: result.exitCode,
          stderr: result.stderr,
        }),
        payload: {
          ok: false,
          command: commandLabel,
          exit_code: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          ...(knownFailure
            ? {
                error_code: knownFailure.errorCode,
                error: knownFailure.summary,
                error_context: knownFailure.context || undefined,
              }
            : {}),
        },
      };
    }

    // Plain command success
    return {
      ok: true,
      code: 0,
      summary: 'Success',
      payload: {
        ok: true,
        command: commandLabel,
        exit_code: result.exitCode,
        output: result.stdout,
        stderr: result.stderr,
      },
    };
  }

  return {
    runQueuedSpawnCommand,
  };
}
