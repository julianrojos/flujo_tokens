import type { CaptureFigmaScreenshotResult } from "@/lib/api";

export interface ImportSuccessSummary {
  elementsImported: number;
  elementsTotal: number;
  elementsTotalIsLowerBound?: boolean;
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
  const collectionsCount = bootstrapAttempted
    ? captureResult.tokens_bootstrap?.collections?.length ?? 0
    : null;
  const collectionsImported = collectionsCount;
  const collectionsTotal = collectionsCount;
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
  customPropertiesLine: string;
} {
  const collectionsLine = formatImportedLine(
    "Collections",
    summary.collectionsImported,
    summary.collectionsTotal,
    "token bootstrap not attempted",
  );
  const variablesLine = formatImportedLine(
    "Variables",
    summary.variablesImported,
    summary.variablesTotal,
    "token bootstrap not attempted",
  );

  return {
    elementsLine: formatComponentsLine(summary),
    collectionsLine,
    variablesLine,
    customPropertiesLine: formatCustomPropertiesLine(),
  };
}

function formatImportedLine(
  label: string,
  imported: number | null,
  total: number | null,
  fallbackReason: string,
): string {
  if (imported === null && total === null) {
    return `${label}: n/a (${fallbackReason}).`;
  }
  if (total === null) {
    return `${label}: ${imported ?? 0} imported.`;
  }
  return `${label}: ${imported ?? 0} downloaded out of ${total} detected.`;
}

export function formatComponentsLine(summary: Pick<ImportSuccessSummary, "elementsImported" | "elementsTotal" | "elementsTotalIsLowerBound">): string {
  const detectedLabel = summary.elementsTotalIsLowerBound
    ? `at least ${summary.elementsTotal}`
    : `${summary.elementsTotal}`;
  return `Components: ${summary.elementsImported} imported out of ${detectedLabel} detected.`;
}

function formatCustomPropertiesLine(): string {
  return "Custom properties: n/a (compile step removed).";
}
