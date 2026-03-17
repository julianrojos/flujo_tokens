import type { CaptureFigmaScreenshotResult } from "@/lib/api";

export interface ImportSuccessSummary {
  elementsImported: number;
  elementsTotal: number;
  collectionsImported: number | null;
  collectionsTotal: number | null;
  variablesImported: number | null;
  variablesTotal: number | null;
  tokensCompiled: boolean | null;
  compileReason: string | null;
}

export function buildImportSuccessSummary(
  captureResult: Pick<
    CaptureFigmaScreenshotResult,
    "targets_total" | "targets" | "captured" | "tokens_bootstrap" | "tokens_compile"
  >,
): ImportSuccessSummary {
  const elementsTotal = captureResult.targets_total ?? captureResult.targets?.length ?? 0;
  const elementsImported = captureResult.captured?.length ?? 0;
  const bootstrapAttempted = captureResult.tokens_bootstrap?.attempted === true;
  const collectionsImported = bootstrapAttempted
    ? captureResult.tokens_bootstrap?.files_written ?? 0
    : null;
  const collectionsFromPayload = captureResult.tokens_bootstrap?.collections;
  const collectionsFromPayloadCount = Array.isArray(collectionsFromPayload)
    ? collectionsFromPayload.length
    : null;
  const collectionsTotal = bootstrapAttempted
    ? (collectionsFromPayloadCount && collectionsFromPayloadCount > 0
      ? collectionsFromPayloadCount
      : captureResult.tokens_bootstrap?.files_written ?? 0)
    : null;
  const variablesImported = bootstrapAttempted
    ? captureResult.tokens_bootstrap?.tokens_written ?? 0
    : null;
  const variablesTotal = bootstrapAttempted
    ? captureResult.tokens_bootstrap?.tokens_total ??
    captureResult.tokens_bootstrap?.tokens_written ??
    0
    : null;

  const hasTokensCompile = captureResult.tokens_compile !== undefined;
  const tokensCompiled = hasTokensCompile
    ? captureResult.tokens_compile?.compiled === true
    : null;
  const compileReason = captureResult.tokens_compile?.reason ?? null;

  return {
    elementsImported,
    elementsTotal,
    collectionsImported,
    collectionsTotal,
    variablesImported,
    variablesTotal,
    tokensCompiled,
    compileReason,
  };
}

export function formatImportSuccessNotice(summary: ImportSuccessSummary): {
  elementsLine: string;
  collectionsLine: string;
  variablesLine: string;
  customPropertiesLine: string;
} {
  const collectionsLine =
    summary.collectionsImported === null || summary.collectionsTotal === null
      ? "Collections: n/a (token bootstrap not attempted)."
      : `Collections: ${summary.collectionsImported} downloaded out of ${summary.collectionsTotal} detected.`;
  const variablesLine =
    summary.variablesImported === null || summary.variablesTotal === null
      ? "Variables: n/a (token bootstrap not attempted)."
      : `Variables: ${summary.variablesImported} downloaded out of ${summary.variablesTotal} detected.`;

  const customPropertiesLine = formatCustomPropertiesLine(
    summary.tokensCompiled,
    summary.compileReason,
  );

  return {
    elementsLine: `Components: ${summary.elementsImported} imported out of ${summary.elementsTotal} detected.`,
    collectionsLine,
    variablesLine,
    customPropertiesLine,
  };
}

function formatCustomPropertiesLine(
  tokensCompiled: boolean | null,
  compileReason: string | null,
): string {
  // Check reason first - it may be present even when tokensCompiled is null
  const reason = compileReason?.toLowerCase() ?? "";
  if (reason === "disabled-by-config") {
    return "Custom properties: Skipped (disabled by system configuration).";
  }
  if (reason === "input-json-missing") {
    return "Custom properties: Skipped (no input token files available).";
  }
  if (reason === "system-input-dir-missing" || reason === "system-missing") {
    return "Custom properties: Skipped (system configuration incomplete).";
  }
  if (reason === "compile-failed") {
    return "Custom properties: Failed (see logs or run tokens sync in Operations).";
  }
  if (tokensCompiled === true) {
    return "Custom properties: Compiled successfully.";
  }
  if (tokensCompiled === false && compileReason) {
    return `Custom properties: Failed (${compileReason}).`;
  }
  if (tokensCompiled === null) {
    return "Custom properties: n/a (compile not attempted).";
  }
  return "Custom properties: Failed (unknown reason).";
}
