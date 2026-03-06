import type { CaptureFigmaErrorDetail } from "@/lib/api";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toCaptureFigmaErrorDetail(raw: unknown): CaptureFigmaErrorDetail | null {
  const value = toRecord(raw);
  if (!value) return null;
  return {
    type: toNonEmptyString(value.type) || undefined,
    message: toNonEmptyString(value.message) || undefined,
    endpoint: toNonEmptyString(value.endpoint) || undefined,
    fileKey: toNonEmptyString(value.fileKey) || undefined,
    status:
      typeof value.status === "number" && Number.isFinite(value.status)
        ? value.status
        : undefined,
    code: toNonEmptyString(value.code) || undefined,
    details: toNonEmptyString(value.details) || undefined,
    retryAfterSeconds:
      typeof value.retryAfterSeconds === "number" && Number.isFinite(value.retryAfterSeconds)
        ? value.retryAfterSeconds
        : undefined,
  };
}

export function toCapturePipelinePhase(raw: unknown): string {
  const phase = toNonEmptyString(raw).toLowerCase();
  if (!phase) return "";
  if (!/^[a-z0-9_]+$/.test(phase)) return "";
  return phase;
}

export function extractCaptureFigmaErrorDetail(payload: unknown): CaptureFigmaErrorDetail | null {
  const root = toRecord(payload);
  if (!root) return null;
  const job = toRecord(root.job);
  const result = toRecord(job?.result);
  const resultPayload = toRecord(result?.payload);
  return (
    toCaptureFigmaErrorDetail(resultPayload?.figma_error) ||
    toCaptureFigmaErrorDetail(root.figma_error)
  );
}

export function extractCapturePipelinePhase(payload: unknown): string {
  const root = toRecord(payload);
  if (!root) return "";
  const job = toRecord(root.job);
  const result = toRecord(job?.result);
  const resultPayload = toRecord(result?.payload);
  return (
    toCapturePipelinePhase(resultPayload?.pipeline_phase) ||
    toCapturePipelinePhase(root.pipeline_phase)
  );
}

export function formatCaptureFigmaErrorMessage(detail: CaptureFigmaErrorDetail | null): string {
  if (!detail) return "";
  const status = detail.status;
  const fileKey = detail.fileKey ? ` (${detail.fileKey})` : "";
  if (status === 404) {
    return `Figma API returned 404 for file key${fileKey}. The file key may be wrong or the token cannot access this file.`;
  }
  if (status === 403) {
    return `Figma API returned 403 for file key${fileKey}. The token is valid but does not have read access to this file.`;
  }
  return detail.message || "";
}

export function toPipelinePhaseFromError(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  if (!("pipeline_phase" in error)) return "";
  return toCapturePipelinePhase((error as { pipeline_phase?: unknown }).pipeline_phase);
}

export function extractPhaseAwareCaptureFigmaError(error: unknown): CaptureFigmaErrorDetail | null {
  if (!error || typeof error !== "object") return null;
  if (!("figma_error" in error)) return null;
  return toCaptureFigmaErrorDetail((error as { figma_error?: unknown }).figma_error);
}

export function buildPhaseAwareError(args: {
  message: string;
  pipelinePhase?: string;
  figmaError?: CaptureFigmaErrorDetail | null;
}): Error {
  const error = new Error(args.message);
  const phase = toCapturePipelinePhase(args.pipelinePhase);
  if (phase) {
    (error as Error & { pipeline_phase?: string }).pipeline_phase = phase;
  }
  if (args.figmaError) {
    (error as Error & { figma_error?: CaptureFigmaErrorDetail }).figma_error = args.figmaError;
  }
  return error;
}

