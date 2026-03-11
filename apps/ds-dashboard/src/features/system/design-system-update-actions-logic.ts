import type { LogLine } from "@/features/ops/hooks/use-operation-runner";

export type TokensSource = "auto" | "mcp" | "rest";

/**
 * Checks if a failed operation was caused by an MCP instance mismatch.
 * This decoupled helper prevents the UI from relying on hardcoded backend error strings.
 *
 * @param status - The current status of the operation ("idle", "running", "success", "error")
 * @param summary - The short summary string of the result
 * @param logLines - The array of log lines emitted during the operation
 * @returns boolean - True if the error is an MCP mismatch, false otherwise
 */
export function isMcpMismatchError(
  status: string,
  summary: string,
  logLines: LogLine[]
): boolean {
  if (status !== "error") return false;

  const searchText = String(summary || "").toLowerCase();

  // Condition 1: The error explicitly says so in the summary
  if (searchText.includes("mcp.instance_mismatch")) {
    return true;
  }

  // Condition 2: Search in logs if something failed due to desynchronized instance
  const hasMismatchInLogs = logLines.some(
    (line) =>
      line.kind === "stderr" &&
      String(line.text || "").toLowerCase().includes("mcp.instance_mismatch")
  );

  return hasMismatchInLogs;
}

export interface BuildUpdateComponentsPayloadArgs {
  figmaUrl: string;
  figmaToken?: string;
}

export interface BuildUpdateVariablesPayloadArgs {
  figmaUrl?: string;
  figmaToken?: string;
  tokensSource: TokensSource;
}

export function buildUpdateComponentsPayload(
  args: BuildUpdateComponentsPayloadArgs,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const figmaUrl = String(args.figmaUrl || "").trim();
  if (!figmaUrl) {
    return {
      ok: false,
      error: "Figma URL is required to update components.",
    };
  }

  const payload: Record<string, unknown> = {
    figmaUrl,
    includeVariants: true,
    variantLimit: 6,
    requireExistingDoc: true,
    continueOnError: true,
    refreshIndices: true,
    dryRun: false,
    injectDocSpecs: false,
    mainCaptureMode: "rest",
    componentKind: "component_set",
    tokensSource: "auto",
  };

  const token = String(args.figmaToken || "").trim();
  if (token) payload.figmaToken = token;

  return { ok: true, payload };
}

export function buildUpdateVariablesPayload(
  args: BuildUpdateVariablesPayloadArgs,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    dryRun: false,
    force: true,
    merge: true,
    compile: true,
    tokensSource: args.tokensSource,
  };

  const figmaUrl = String(args.figmaUrl || "").trim();
  if (figmaUrl) payload.url = figmaUrl;

  const token = String(args.figmaToken || "").trim();
  if (token) payload.figmaToken = token;

  return payload;
}

export function resolveUpdateButtonLabel(args: {
  type: "components" | "variables";
  isRunning: boolean;
}): string {
  if (args.isRunning) return "Updating...";
  return args.type === "components" ? "Update components" : "Update variables";
}

