import type { CaptureFigmaScreenshotResult } from "@/lib/api";

export interface ImportSuccessSummary {
  elementsImported: number;
  elementsTotal: number;
  collectionsImported: number | null;
  collectionsTotal: number | null;
  variablesImported: number | null;
  variablesTotal: number | null;
}

export function buildImportSuccessSummary(
  captureResult: Pick<
    CaptureFigmaScreenshotResult,
    "targets_total" | "targets" | "captured" | "tokens_bootstrap"
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

  return {
    elementsImported,
    elementsTotal,
    collectionsImported,
    collectionsTotal,
    variablesImported,
    variablesTotal,
  };
}

export function formatImportSuccessNotice(summary: ImportSuccessSummary): {
  elementsLine: string;
  collectionsLine: string;
  variablesLine: string;
} {
  const collectionsLine =
    summary.collectionsImported === null || summary.collectionsTotal === null
      ? "Collections: n/a (token bootstrap not attempted)."
      : `Collections: ${summary.collectionsImported} downloaded out of ${summary.collectionsTotal} detected.`;
  const variablesLine =
    summary.variablesImported === null || summary.variablesTotal === null
      ? "Variables: n/a (token bootstrap not attempted)."
      : `Variables: ${summary.variablesImported} downloaded out of ${summary.variablesTotal} detected.`;

  return {
    elementsLine: `Components: ${summary.elementsImported} imported out of ${summary.elementsTotal} detected.`,
    collectionsLine,
    variablesLine,
  };
}
