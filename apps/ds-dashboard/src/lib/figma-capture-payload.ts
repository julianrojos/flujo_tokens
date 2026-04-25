import type { CaptureFigmaScreenshotArgs } from "@/lib/api";

export type CaptureFigmaScreenshotPayload = CaptureFigmaScreenshotArgs &
  Record<string, unknown>;

export interface BuildCaptureFromFigmaPayloadArgs {
  figmaUrl: string;
  figmaToken?: string;
  includeVariants?: boolean;
  variantLimit?: number;
  requireExistingDoc?: boolean;
  continueOnError?: boolean;
  dryRun?: boolean;
  mainCaptureMode?: NonNullable<CaptureFigmaScreenshotArgs["mainCaptureMode"]>;
  componentKind?: NonNullable<CaptureFigmaScreenshotArgs["componentKind"]>;
  tokensSource?: NonNullable<CaptureFigmaScreenshotArgs["tokensSource"]>;
  injectDocSpecs?: boolean;
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
