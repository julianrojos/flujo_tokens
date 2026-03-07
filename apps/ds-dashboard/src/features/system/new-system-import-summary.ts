import type { CaptureFigmaScreenshotResult } from "@/lib/api";

export interface ImportSuccessSummary {
  elementsImported: number;
  elementsTotal: number;
  variablesImported: number;
  variablesTotal: number;
}

export function buildImportSuccessSummary(
  captureResult: Pick<
    CaptureFigmaScreenshotResult,
    "targets_total" | "targets" | "captured" | "tokens_bootstrap"
  >,
): ImportSuccessSummary {
  const elementsTotal = captureResult.targets_total ?? captureResult.targets?.length ?? 0;
  const elementsImported = captureResult.captured?.length ?? 0;
  const variablesImported = captureResult.tokens_bootstrap?.tokens_written ?? 0;
  const variablesTotal =
    captureResult.tokens_bootstrap?.tokens_total ??
    captureResult.tokens_bootstrap?.tokens_written ??
    0;

  return {
    elementsImported,
    elementsTotal,
    variablesImported,
    variablesTotal,
  };
}

export function formatImportSuccessNotice(summary: ImportSuccessSummary): {
  elementsLine: string;
  variablesLine: string;
} {
  return {
    elementsLine: `Design system successfully imported: ${summary.elementsImported} elements out of ${summary.elementsTotal} total elements imported.`,
    variablesLine: `${summary.variablesImported} variables out of ${summary.variablesTotal} total variables imported.`,
  };
}
