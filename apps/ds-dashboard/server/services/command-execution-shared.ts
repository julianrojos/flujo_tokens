/**
 * Command Execution - Shared Utilities
 *
 * Shared logic between command-execution-service.ts implementations
 * to prevent duplication and drift.
 */

/**
 * Known failure information for non-zero command exits.
 */
export interface KnownFailureInfo {
  errorCode: string;
  summary: string;
  context?: Record<string, string>;
}

/**
 * Arguments for detecting known non-zero failures.
 */
export interface DetectKnownNonZeroFailureArgs {
  command: string;
  commandArgs?: string[];
}

/**
 * Result from command execution for failure detection.
 */
export interface DetectKnownNonZeroFailureResult {
  stderr?: string | null;
}

/**
 * Options for building non-zero exit summary.
 */
export interface BuildNonZeroExitSummaryOptions {
  knownFailure: KnownFailureInfo | null;
  exitCode: number;
  stderr?: string | null;
}

/**
 * Detect known non-zero exit code failures.
 *
 * Identifies specific failure patterns to provide better error messages.
 * Currently supports:
 * - Missing npm scripts
 *
 * @param args - Command arguments
 * @param result - Command execution result
 * @returns Known failure info or null if not a recognized pattern
 */
export function detectKnownNonZeroFailure(
  args: DetectKnownNonZeroFailureArgs,
  result: DetectKnownNonZeroFailureResult,
): KnownFailureInfo | null {
  const command = String(args?.command || "").trim().toLowerCase();
  const firstArg = String(args?.commandArgs?.[0] || "").trim().toLowerCase();

  // Only handle "npm run" commands
  if (command !== "npm" || firstArg !== "run") return null;

  const stderr = String(result?.stderr || "");
  const match = /missing script:\s*"?([^"\n]+)"?/i.exec(stderr);
  if (!match) return null;

  const scriptName = String(match[1] || "").trim();
  const summary = scriptName
    ? `Missing npm script '${scriptName}'.`
    : "Missing npm script.";

  return {
    errorCode: "script.missing_npm_script",
    summary,
    context: scriptName ? { script: scriptName } : undefined,
  };
}

/**
 * Build summary message for non-zero exit code.
 *
 * Uses known failure summary if available, otherwise falls back to
 * stderr output or generic exit code message.
 *
 * @param options - Summary building options
 * @returns Summary message string
 */
export function buildNonZeroExitSummary(options: BuildNonZeroExitSummaryOptions): string {
  const { knownFailure, exitCode, stderr } = options;

  if (knownFailure?.summary) {
    return knownFailure.summary;
  }

  if (stderr && typeof stderr === "string" && stderr.trim()) {
    return stderr.trim();
  }

  return `Failed with code ${exitCode}`;
}
