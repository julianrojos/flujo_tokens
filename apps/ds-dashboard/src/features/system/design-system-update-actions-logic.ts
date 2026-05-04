import {
  buildCaptureFromFigmaPayload,
  type CaptureFigmaScreenshotPayload,
} from "@/lib/figma-capture-payload";

export interface BuildUpdateComponentsPayloadArgs {
  figmaUrl: string;
  figmaToken?: string;
}

export interface BuildUpdateVariablesPayloadArgs {
  figmaUrl?: string;
  figmaToken?: string;
}

function stripNodeIdFromFigmaUrl(rawUrl: string): string {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    for (const key of ["node-id", "node_id", "nodeId"]) {
      url.searchParams.delete(key);
    }
    const rawHash = String(url.hash || "").replace(/^#/, "");
    if (rawHash) {
      const hashParams = new URLSearchParams(rawHash.replace(/^[/?]+/, ""));
      for (const key of ["node-id", "node_id", "nodeId"]) {
        hashParams.delete(key);
      }
      url.hash = hashParams.toString() ? `#${hashParams.toString()}` : "";
    }
    return url.toString();
  } catch {
    return value;
  }
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
      figmaUrl: stripNodeIdFromFigmaUrl(figmaUrl),
      figmaToken: args.figmaToken,
      includeVariants: false,
      variantLimit: 6,
      requireExistingDoc: true,
      continueOnError: true,
      dryRun: false,
      mainCaptureMode: "rest",
      componentKind: "all",
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
