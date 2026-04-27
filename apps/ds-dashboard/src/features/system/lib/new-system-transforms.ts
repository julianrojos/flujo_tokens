/**
 * Pure utility functions for new-system feature.
 * No React hooks, no JSX — pure transformations only.
 */

import type { ApiErrorDisplay } from "@/lib/api-error-ux";
import type { CaptureFigmaErrorDetail, CaptureFigmaProgress } from "@/lib/api";
import type { ImportSuccessSummary } from "@/features/system/new-system-import-summary";
import {
  extractCaptureFigmaErrorDetail,
  extractCapturePipelinePhase,
  extractPhaseAwareCaptureFigmaError,
  formatCaptureFigmaErrorMessage,
  toPipelinePhaseFromError,
} from "@/features/system/new-system-import-errors";
import { ApiError } from "@/lib/api";

/**
 * Convert a raw name to a system ID (kebab-case, lowercase, max 64 chars)
 */
export function toSystemId(rawName: string): string {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Extract Figma file ID from a Figma URL
 */
export function extractFigmaFileIdFromUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === "file" || segments[i] === "design") {
        return segments[i + 1] || "";
      }
    }
  } catch {
    return "";
  }

  return "";
}

/**
 * Convert a Figma URL to a document-wide URL (remove node-id and hash)
 */
export function toDocumentWideFigmaUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    parsed.searchParams.delete("node-id");
    parsed.searchParams.delete("node_id");
    parsed.searchParams.delete("nodeId");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

/**
 * Safe type guard to convert unknown to Record<string, unknown>
 */
export function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Convert unknown to trimmed non-empty string
 */
export function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Check if a capture result has no targets
 */
export function hasNoCaptureTargets(result: {
  ok?: boolean;
  targets_total?: number;
  targets?: unknown[];
  captured?: unknown[];
  report?: {
    targets_total?: number;
    targets?: unknown[];
  } | null;
}): boolean {
  if (result.ok === false) return false;
  const reportTargetsTotal =
    result.report && typeof result.report === "object"
      ? result.report.targets_total
      : undefined;
  const reportTargetsLength =
    result.report && typeof result.report === "object" && Array.isArray(result.report.targets)
      ? result.report.targets.length
      : undefined;
  const targetsCount =
    result.targets_total ??
    result.targets?.length ??
    reportTargetsTotal ??
    reportTargetsLength ??
    0;
  const capturedCount = result.captured?.length ?? 0;
  return targetsCount === 0 && capturedCount === 0;
}

/**
 * Check if a capture message is low-signal (generic error)
 */
export function isLowSignalCaptureMessage(rawValue: unknown): boolean {
  const value = toNonEmptyString(rawValue).toLowerCase();
  if (!value) return true;
  if (value === "unknown error." || value === "unknown queue error.") return true;
  if (/^failed with code \d+$/i.test(value)) return true;
  if (/^queued operation finished with status '?(error|cancelled)'?\.?$/i.test(value)) return true;
  if (value === "the import job finished without a detailed result payload.") return true;
  return false;
}

/**
 * Pick the highest-signal failure message from candidates
 */
export function pickCaptureFailureMessage(candidates: unknown[]): string {
  const messages = candidates
    .map((candidate) => toNonEmptyString(candidate))
    .filter(Boolean);
  if (messages.length === 0) return "";
  const highSignal = messages.find((message) => !isLowSignalCaptureMessage(message));
  return highSignal || messages[0] || "";
}

/**
 * Format pipeline phase label for display
 */
export function formatPipelinePhaseLabel(phase: string): string {
  return phase.replace(/_/g, " ");
}

/**
 * Format pipeline phase as an error message
 */
export function formatPipelinePhaseMessage(phase: string): string {
  if (!phase) return "";
  return `Import failed during '${formatPipelinePhaseLabel(phase)}' phase.`;
}

/**
 * Get a hint message based on pipeline phase
 */
export function getPipelinePhaseHint(phase: string): string | null {
  if (phase === "token_sync") {
    return "The import failed while syncing Figma variables. Components and tokens were not generated.";
  }
  if (phase === "resolve_context" || phase === "parse_descriptor") {
    return "The import failed before component capture started. Check Figma URL, file key and access permissions.";
  }
  if (phase === "build_targets") {
    return "The import failed while resolving capturable components from the Figma file.";
  }
  if (phase === "capture_batch") {
    return "The import failed during screenshot/component capture execution.";
  }
  return null;
}

/**
 * Extract capture failure message from a job payload
 */
export function extractCaptureFailureFromPayload(payload: unknown): string {
  const root = toRecord(payload);
  if (!root) return "";

  const job = toRecord(root.job);
  const result = toRecord(job?.result);
  const resultPayload = toRecord(result?.payload);
  const sync = toRecord(resultPayload?.sync);
  const failed = Array.isArray(resultPayload?.failed) ? resultPayload.failed : [];
  const firstFailed = failed.length > 0 ? toRecord(failed[0]) : null;
  const events = Array.isArray(root.events) ? root.events : [];
  const figmaErrorDetail = extractCaptureFigmaErrorDetail(payload);
  const pipelinePhase = extractCapturePipelinePhase(payload);

  let lastErrorEventMessage = "";
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = toRecord(events[index]);
    if (!event) continue;
    const eventType = toNonEmptyString(event.type).toLowerCase();
    if (eventType === "error") {
      lastErrorEventMessage = toNonEmptyString(event.message);
      if (lastErrorEventMessage) break;
    }
    if (eventType === "end") {
      const eventStatus = toNonEmptyString(event.status).toLowerCase();
      if (eventStatus === "error" || eventStatus === "cancelled") {
        lastErrorEventMessage = toNonEmptyString(event.summary);
        if (lastErrorEventMessage) break;
      }
    }
  }

  return pickCaptureFailureMessage([
    formatCaptureFigmaErrorMessage(figmaErrorDetail),
    resultPayload?.error,
    resultPayload?.message,
    resultPayload?.stderr,
    firstFailed?.error,
    sync?.error,
    sync?.reason,
    sync?.stderr,
    lastErrorEventMessage,
    result?.summary,
    formatPipelinePhaseMessage(pipelinePhase),
  ]);
}

/**
 * Get a hint message for import errors based on status and message
 */
export function getImportErrorHint(
  message: string,
  figmaError: CaptureFigmaErrorDetail | null,
  pipelinePhase: string,
): string | null {
  const phaseHint = getPipelinePhaseHint(pipelinePhase);
  if (phaseHint) return phaseHint;

  const status = figmaError?.status;
  if (status === 404) {
    return "Figma returned 404 for this file key. Verify the URL/file key and that the token can access that file.";
  }
  if (status === 403) {
    return "Figma returned 403. The token is valid but does not have permission to read this file.";
  }
  const normalized = message.toLowerCase();
  if (normalized.includes("figma api error 404")) {
    return "Figma returned 404. Check that the file key is correct and the token has access to that file.";
  }
  if (normalized.includes("figma api error 403")) {
    return "Figma returned 403. The token is valid but it does not have permission to read this file.";
  }
  if (normalized.includes("validation.invalid_figma_host")) {
    return "The URL host is not valid for Figma. Use a figma.com design/file URL.";
  }
  return null;
}

/**
 * Normalize a reason string (trim + lowercase)
 */
export function normalizeReason(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Map tokens bootstrap reason to human-readable message
 */
export function mapTokensBootstrapReason(reason: string): string {
  const normalized = normalizeReason(reason);
  if (normalized === "variables-empty") {
    return "No Figma local variables were found in this file.";
  }
  if (normalized === "figma-file-key-missing") {
    return "Figma file key could not be resolved for token bootstrap.";
  }
  if (normalized === "system-missing") {
    return "System configuration could not be resolved for token bootstrap.";
  }
  if (normalized === "fetch-failed") {
    return "Fetching Figma variables failed.";
  }
  return reason ? `Unknown reason: ${reason}` : "No bootstrap reason was provided.";
}

/**
 * Get a hint for tokens bootstrap error
 */
export function getTokensBootstrapErrorHint(errorMessage: string): string | null {
  const normalized = String(errorMessage || "").toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("file_variables:read")) {
    return "REST variables scope is not available. Keep tokens source on direct plugin connection and verify plugin connection before retrying.";
  }
  if (normalized.includes("mcp server reports no figma connection")) {
    return "Direct plugin connection could not connect to Figma. Open the Figma plugin and run 'Test connection' before retrying.";
  }
  return null;
}

/**
 * Get the error message from a capture error
 */
export function getCaptureErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const figmaErrorMessage = formatCaptureFigmaErrorMessage(
      extractCaptureFigmaErrorDetail(error.payload),
    );
    const payloadMessage = extractCaptureFailureFromPayload(error.payload);
    return figmaErrorMessage || payloadMessage || error.message || "Unknown API error";
  }

  if (!(error instanceof Error)) return String(error);
  const message = error.message || "Unknown error";
  const match = message.match(/:\s*(\{[\s\S]+\})\s*$/);
  if (!match) return message;
  try {
    const parsed = JSON.parse(match[1]) as {
      error?: string;
      message?: string;
      failed?: Array<{ error?: string }>;
    };
    return (
      parsed.error ||
      parsed.message ||
      parsed.failed?.[0]?.error ||
      message
    );
  } catch {
    return message;
  }
}

/**
 * Safely stringify a value for error details
 */
export function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Get detailed error information for capture errors
 */
export function getCaptureErrorDetails(error: unknown): string {
  if (error instanceof ApiError) {
    const payloadCause = extractCaptureFailureFromPayload(error.payload);
    const figmaErrorDetail = extractCaptureFigmaErrorDetail(error.payload);
    const pipelinePhase = extractCapturePipelinePhase(error.payload);
    const lines = [
      `message: ${error.message || "Unknown API error"}`,
      `status: ${error.status} ${error.statusText}`,
      `code: ${error.code}`,
      `recoverable: ${error.recoverable ? "yes" : "no"}`,
    ];
    if (payloadCause) {
      lines.push(`derivedCause: ${payloadCause}`);
    }
    if (pipelinePhase) {
      lines.push(`pipelinePhase: ${pipelinePhase}`);
    }
    if (figmaErrorDetail) {
      lines.push(`figmaError:\n${stringifySafe(figmaErrorDetail)}`);
    }
    if (error.requestId) {
      lines.push(`requestId: ${error.requestId}`);
    }
    if (error.context) {
      lines.push(`context:\n${stringifySafe(error.context)}`);
    }
    if (error.payload) {
      lines.push(`payload:\n${stringifySafe(error.payload)}`);
    }
    return lines.join("\n\n");
  }

  if (error instanceof Error) {
    const lines = [error.message || "Unknown error"];
    const figmaError = extractPhaseAwareCaptureFigmaError(error);
    const pipelinePhase = toPipelinePhaseFromError(error);
    if (pipelinePhase) lines.push(`pipelinePhase: ${pipelinePhase}`);
    if (figmaError) lines.push(`figmaError:\n${stringifySafe(figmaError)}`);
    if (error.stack) lines.push(error.stack);
    return lines.join("\n\n");
  }

  if (typeof error === "string") return error;
  return stringifySafe(error);
}

/**
 * Create an inline error display object
 */
export function makeInlineErrorDisplay(args: {
  title: string;
  message: string;
  action?: string;
  retryable?: boolean;
}): ApiErrorDisplay {
  return {
    title: args.title,
    message: args.message,
    reason: null,
    action: args.action ?? null,
    code: null,
    requestId: null,
    retryable: args.retryable ?? false,
  };
}
