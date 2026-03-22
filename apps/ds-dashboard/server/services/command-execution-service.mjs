import { detectKnownNonZeroFailure, buildNonZeroExitSummary } from "./command-execution-shared.mjs";

export function createCommandExecutionService(config) {
  const { runSpawnWithCapture, maxOutputBytes, summarizePayloadFailure } = config;

  async function runQueuedSpawnCommand(args) {
    const result = await runSpawnWithCapture({
      cwd: args.cwd,
      command: args.command,
      commandArgs: args.commandArgs,
      env: args.commandEnv,
      parseJsonStdout: args.parseJsonStdout === true,
      maxOutputBytes,
      onSpawn: args.registerProcess,
      onStdoutChunk: (text) => args.emitChunk("stdout", text),
      onStderrChunk: (text) => args.emitChunk("stderr", text),
    });

    if (result.spawnError) {
      return {
        ok: false,
        code: 1,
        summary: result.spawnError || `Unable to start command: ${args.commandLabel}`,
        payload: {
          ok: false,
          command: args.commandLabel,
          message: result.spawnError,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    }

    const exitCode = result.exitCode;
    if (args.parseJsonStdout) {
      const rawStdout = result.stdout;
      if (result.jsonParseError) {
        return {
          ok: false,
          code: exitCode,
          summary: "Command returned invalid JSON.",
          payload: {
            ok: false,
            command: args.commandLabel,
            message: "Command returned invalid JSON.",
            stdout: rawStdout,
            stderr: result.stderr,
            parse_error: result.jsonParseError,
            code: exitCode,
          },
        };
      }

      const parsed = result.parsedJson;
      if (exitCode !== 0 && args.allowNonZeroJson) {
        const payload =
          parsed && typeof parsed === "object"
            ? {
                ...parsed,
                ok: false,
                exit_code: exitCode,
                stderr: result.stderr || undefined,
              }
            : {
                ok: false,
                exit_code: exitCode,
                stderr: result.stderr || undefined,
              };
        return {
          ok: false,
          code: exitCode,
          summary:
            typeof summarizePayloadFailure === "function"
              ? summarizePayloadFailure(payload, exitCode)
              : `Failed with code ${exitCode}`,
          payload,
        };
      }

      if (exitCode !== 0) {
        return {
          ok: false,
          code: exitCode,
          summary: `Failed with code ${exitCode}`,
          payload: {
            ok: false,
            command: args.commandLabel,
            code: exitCode,
            stdout: rawStdout,
            stderr: result.stderr,
          },
        };
      }

      const payload = parsed && typeof parsed === "object" ? parsed : {};
      // All fields from runner stdout JSON are passed through (including source_used, source_attempts, etc.)
      const ok = payload.ok !== false;
      return {
        ok,
        code: ok ? 0 : 1,
        summary:
          ok
            ? String(payload.message ?? args.successSummary ?? "Completed successfully.")
            : typeof summarizePayloadFailure === "function"
              ? summarizePayloadFailure(payload, 1)
              : "Unknown error",
        payload,
      };
    }

    if (exitCode !== 0) {
      const knownFailure = detectKnownNonZeroFailure(args, result);
      return {
        ok: false,
        code: exitCode,
        summary: buildNonZeroExitSummary({
          knownFailure,
          exitCode,
          stderr: result.stderr,
        }),
        payload: {
          ok: false,
          command: args.commandLabel,
          code: exitCode,
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

    return {
      ok: true,
      code: 0,
      summary: args.successSummary || "Completed successfully.",
      payload: {
        ok: true,
        command: args.commandLabel,
        output: result.stdout,
      },
    };
  }

  return {
    runQueuedSpawnCommand,
  };
}
