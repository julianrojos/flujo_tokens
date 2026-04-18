import type { CaptureFigmaScreenshotArgs } from "@/lib/api";

export type CaptureFigmaScreenshotPayload = CaptureFigmaScreenshotArgs &
  Record<string, unknown>;

export interface BuildUpdateComponentsPayloadArgs {
  figmaUrl: string;
  figmaToken?: string;
}

export interface BuildCaptureFromFigmaPayloadArgs {
  figmaUrl: string;
  figmaToken?: string;
  includeVariants?: boolean;
  variantLimit?: number;
  requireExistingDoc?: boolean;
  continueOnError?: boolean;
  refreshIndices?: boolean;
  dryRun?: boolean;
  mainCaptureMode?: NonNullable<CaptureFigmaScreenshotArgs["mainCaptureMode"]>;
  componentKind?: NonNullable<CaptureFigmaScreenshotArgs["componentKind"]>;
  tokensSource?: NonNullable<CaptureFigmaScreenshotArgs["tokensSource"]>;
  injectDocSpecs?: boolean;
}

export interface BuildUpdateVariablesPayloadArgs {
  figmaUrl?: string;
  figmaToken?: string;
}

export function buildCaptureFromFigmaPayload(
  args: BuildCaptureFromFigmaPayloadArgs,
): CaptureFigmaScreenshotPayload {
  const figmaUrl = String(args.figmaUrl || "").trim();
  if (!figmaUrl) {
    throw new Error("Figma URL is required to capture from Figma.");
  }

  const payload: CaptureFigmaScreenshotPayload = {
    figmaUrl,
    includeVariants: args.includeVariants ?? false,
    variantLimit: args.variantLimit ?? 6,
    requireExistingDoc: args.requireExistingDoc ?? false,
    continueOnError: args.continueOnError ?? true,
    refreshIndices: args.refreshIndices ?? false,
    dryRun: args.dryRun ?? false,
    mainCaptureMode: args.mainCaptureMode ?? "rest",
    componentKind: args.componentKind ?? "component_set",
    tokensSource: args.tokensSource ?? "mcp",
    injectDocSpecs: args.injectDocSpecs ?? false,
  };

  const token = String(args.figmaToken || "").trim();
  if (token) payload.figmaToken = token;

  return payload;
}

export function buildUpdateComponentsPayload(
  args: BuildUpdateComponentsPayloadArgs,
): { ok: true; payload: CaptureFigmaScreenshotPayload } | { ok: false; error: string } {
  const figmaUrl = String(args.figmaUrl || "").trim();
  if (!figmaUrl) {
    return {
      ok: false,
      error: "Figma URL is required to update components.",
    };
  }

  return {
    ok: true,
    payload: buildCaptureFromFigmaPayload({
      figmaUrl,
      figmaToken: args.figmaToken,
      includeVariants: false,
      variantLimit: 6,
      requireExistingDoc: true,
      continueOnError: true,
      refreshIndices: true,
      dryRun: false,
      mainCaptureMode: "rest",
      componentKind: "component_set",
      tokensSource: "mcp",
      injectDocSpecs: false,
    }),
  };
}

export function buildUpdateVariablesPayload(
  args: BuildUpdateVariablesPayloadArgs,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    dryRun: false,
    force: true,
    merge: true,
    compile: true,
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
