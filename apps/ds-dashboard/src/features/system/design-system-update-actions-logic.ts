export type TokensSource = "auto" | "mcp" | "rest";

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

