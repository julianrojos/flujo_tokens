import type { ComponentRegistry } from "@/types/component-registry";
import type { ComponentUsageIndex } from "@/types/component-usage-index";
import type { TokenRegistry } from "@/types/token-registry";
import type { TokenCollectionTreeIndex } from "@/types/token-tree";
import type { TokenUsageIndex } from "@/types/token-usage-index";
import type { TokenGraphQueryDirection, TokenGraphQueryResult, TokenGraphViz } from "@/types/token-graph";
import type { TokenHealthReport } from "@/types/token-health";
import type { ComponentsHealthReport } from "@/types/components-health";
import type { ImpactReport } from "@/types/impact";
import type { NamingDebtReport } from "@/types/naming-debt";
import type {
  CaptureHealthSnapshotResult,
  HealthHistoryBucket,
  HealthHistoryRange,
  HealthHistoryReport,
} from "@/types/health-history";
import type {
  ComponentSpecPatchEditorialResponse,
  ComponentSpecRestoreResponse,
  ComponentSpecSaveResponse,
  ComponentSpecValidateResponse,
} from "@/types/spec-editor";
import type {
  DsConsumer,
  SyncResult,
  FileReport,
  ComponentUsageReport,
  VariableUsageReport,
  SimulationResult,
  DsSyncRun,
  SyncRunsResponse,
} from "@/types/consumers";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api-errors";
import { normalizeEnvRef } from "@/lib/env-ref";
import { resolveDsFileKeyFromConfig } from "@/lib/design-system-keys";

let activeSystemId: string | null = null;
export function getActiveSystemId() {
  return activeSystemId || localStorage.getItem("ds-system-id") || "";
}
export function setActiveSystemId(id: string) {
  activeSystemId = id;
  localStorage.setItem("ds-system-id", id);
}

/**
 * Get the figmaFileId (dsFileKey) for the active design system.
 * This is used to scope all consumer/dependency API calls.
 * @returns The figmaFileId or null if not configured
 */
export async function getDsFileKey(): Promise<string | null> {
  const systemId = getActiveSystemId();
  if (!systemId) return null;

  try {
    const config = await fetchDesignSystemsConfig();
    return resolveDsFileKeyFromConfig(config, systemId);
  } catch {
    return null;
  }
}

export interface ApiErrorEnvelope {
  ok?: boolean;
  message?: string;
  requestId?: string;
  context?: Record<string, unknown>;
  error?: {
    code?: ApiErrorCode;
    userMessage?: string;
    recoverable?: boolean;
    context?: Record<string, unknown>;
    requestId?: string;
  };
}

export class ApiError extends Error {
  status: number;
  statusText: string;
  code: ApiErrorCode;
  recoverable: boolean;
  requestId: string | null;
  context: Record<string, unknown> | null;
  payload: unknown;

  constructor(args: {
    status: number;
    statusText: string;
    code: ApiErrorCode;
    userMessage: string;
    recoverable: boolean;
    requestId?: string | null;
    context?: Record<string, unknown> | null;
    payload?: unknown;
  }) {
    super(args.userMessage);
    this.name = "ApiError";
    this.status = args.status;
    this.statusText = args.statusText;
    this.code = args.code;
    this.recoverable = args.recoverable;
    this.requestId = args.requestId ?? null;
    this.context = args.context ?? null;
    this.payload = args.payload;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function buildApiError(response: Response): Promise<ApiError> {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  let payload: unknown = null;
  let bodyText = "";

  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      bodyText = await response.text().catch(() => "");
    }
  } else {
    bodyText = await response.text().catch(() => "");
    if (bodyText.trim()) {
      try {
        payload = JSON.parse(bodyText);
      } catch {
        // non-JSON response body
      }
    }
  }

  const envelope = toRecord(payload);
  const structured = toRecord(envelope?.error);
  const structuredMessage = toNonEmptyString(structured?.userMessage);
  const topLevelMessage = toNonEmptyString(envelope?.message);
  const textMessage = bodyText.trim();
  const fallbackMessage = `${response.status} ${response.statusText}`.trim() || "Request failed.";
  const userMessage = structuredMessage || topLevelMessage || textMessage || fallbackMessage;

  const structuredCode = toNonEmptyString(structured?.code);
  const code = (structuredCode || `http.${response.status}`) as ApiErrorCode;

  const recoverable =
    typeof structured?.recoverable === "boolean"
      ? structured.recoverable
      : response.status >= 500 || response.status === 429;

  const requestId =
    toNonEmptyString(structured?.requestId) ||
    toNonEmptyString(envelope?.requestId) ||
    null;

  const context =
    toRecord(structured?.context) ||
    toRecord(envelope?.context) ||
    null;

  return new ApiError({
    status: response.status,
    statusText: response.statusText,
    code,
    userMessage,
    recoverable,
    requestId,
    context,
    payload,
  });
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const systemId = getActiveSystemId();
  const extraHeaders = init?.headers
    ? Object.fromEntries(new Headers(init.headers).entries())
    : {};
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(systemId ? { "x-ds-system": systemId } : {}),
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    throw await buildApiError(response);
  }

  return (await response.json()) as T;
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return getJson<T>(url, init);
}

export function fetchComponentRegistry() {
  return getJson<ComponentRegistry>("/api/component-registry");
}

export interface CreateDesignSystemPayload {
  id: string;
  name: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  inputDir?: string;
  outputDir?: string;
  docsDir?: string;
  collections?: string[];
  compileVariablesOnCapture?: boolean;
  makeDefault?: boolean;
}

export interface CreateDesignSystemResponse {
  ok: boolean;
  system: {
    id: string;
    name: string;
  };
  config: {
    systems: Array<{ id: string; name: string }>;
    defaultSystem: string;
  };
}

export interface DesignSystemConfigEntry {
  id: string;
  name: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  inputDir?: string;
  outputDir?: string;
  docsDir?: string;
  collections?: string[];
  compileVariablesOnCapture?: boolean;
}

export interface DesignSystemsConfigResponse {
  systems: DesignSystemConfigEntry[];
  defaultSystem: string;
}

export interface MutateDesignSystemResponse {
  ok: boolean;
  system?: {
    id: string;
    name: string;
  };
  config: {
    systems: Array<{ id: string; name: string }>;
    defaultSystem: string;
  };
  deletedConsumersCount?: number;
  deletedConsumerNames?: string[];
}

export function createDesignSystem(args: CreateDesignSystemPayload) {
  const payload = {
    ...args,
    figmaApiToken:
      args.figmaApiToken !== undefined
        ? normalizeEnvRef(args.figmaApiToken) || undefined
        : undefined,
  };
  return getJson<CreateDesignSystemResponse>("/api/design-systems", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function fetchDesignSystemsConfig() {
  return getJson<DesignSystemsConfigResponse>("/api/design-systems");
}

export function updateDesignSystem(id: string, args: Partial<CreateDesignSystemPayload>) {
  const payload = {
    ...args,
    figmaApiToken:
      args.figmaApiToken !== undefined
        ? normalizeEnvRef(args.figmaApiToken) || undefined
        : undefined,
  };
  return getJson<MutateDesignSystemResponse>(`/api/design-systems/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function deleteDesignSystem(id: string) {
  return getJson<MutateDesignSystemResponse>(`/api/design-systems/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export interface DeletePreviewResponse {
  ok: boolean;
  data: {
    system: {
      id: string;
      name: string;
    };
    consumers: Array<{
      id: string;
      name: string;
      fileKey: string;
      lastSyncedAt?: string;
    }>;
    totalConsumerCount: number;
    counts: {
      syncRuns: number;
      componentUsage: number;
      variableUsage: number;
      parentVariableUsage: number;
    };
  };
}

export function fetchDeletePreview(id: string) {
  return getJson<DeletePreviewResponse>(`/api/design-systems/${encodeURIComponent(id)}/delete-preview`);
}

export function fetchComponentUsageIndex() {
  return getJson<ComponentUsageIndex>("/api/component-usage-index");
}

export function fetchTokenRegistry() {
  return getJson<TokenRegistry>("/api/token-registry");
}

export function fetchTokenCollectionTrees() {
  return getJson<TokenCollectionTreeIndex>("/api/token-collection-trees");
}

export function fetchTokenUsageIndex() {
  return getJson<TokenUsageIndex>("/api/token-usage-index");
}

export function fetchTokenGraph() {
  return getJson<TokenGraphViz>("/api/token-graph");
}

export function fetchTokenGraphQuery(args: {
  tokenPath: string;
  direction?: TokenGraphQueryDirection;
  depth?: number;
}) {
  const params = new URLSearchParams({ token: args.tokenPath });
  if (args.direction) params.set("direction", args.direction);
  if (typeof args.depth === "number" && Number.isFinite(args.depth)) {
    params.set("depth", String(args.depth));
  }
  return getJson<TokenGraphQueryResult>(`/api/token-graph-query?${params.toString()}`);
}

export function fetchTokenHealth() {
  return getJson<TokenHealthReport>("/api/token-health");
}

export function fetchNamingDebt(args?: { refresh?: boolean }) {
  const params = new URLSearchParams();
  if (args?.refresh) params.set("refresh", "true");
  const suffix = params.size ? `?${params.toString()}` : "";
  return getJson<NamingDebtReport>(`/api/naming-debt${suffix}`);
}

export function fetchComponentsHealth() {
  return getJson<ComponentsHealthReport>("/api/components-health");
}

export function fetchHealthHistory(args?: {
  range?: HealthHistoryRange;
  bucket?: HealthHistoryBucket;
}) {
  const params = new URLSearchParams();
  if (args?.range) params.set("range", args.range);
  if (args?.bucket) params.set("bucket", args.bucket);
  const suffix = params.size ? `?${params.toString()}` : "";
  return getJson<HealthHistoryReport>(`/api/health-history${suffix}`);
}

export interface OperationHistoryEvent {
  id: string;
  timestamp: string;
  eventType: string;
  operation: string;
  system: string;
  status: string;
  durationMs: number | null;
  requestId: string | null;
  jobId: string | null;
  sourceEventId: string | null;
  inputHash: string | null;
  outputHash: string | null;
  result: {
    ok: boolean;
    code: number | string | null;
    summary: string | null;
  };
}

export interface OperationsHistoryResponse {
  ok: boolean;
  events: OperationHistoryEvent[];
  filters: {
    systemId: string | null;
    operation: string | null;
    status: string | null;
    from: string | null;
    to: string | null;
    limit: number;
  };
  summary: {
    returned: number;
    scannedRows: number;
    scannedFiles: number;
  };
}

export function fetchOperationsHistory(args?: {
  systemId?: string;
  operation?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  all?: boolean;
}) {
  const params = new URLSearchParams();
  if (args?.systemId) params.set("system", args.systemId);
  if (args?.operation) params.set("operation", args.operation);
  if (args?.status) params.set("status", args.status);
  if (args?.from) params.set("from", args.from);
  if (args?.to) params.set("to", args.to);
  if (typeof args?.limit === "number" && Number.isFinite(args.limit)) {
    params.set("limit", String(Math.max(1, Math.floor(args.limit))));
  }
  if (args?.all === true) params.set("all", "true");
  const suffix = params.size ? `?${params.toString()}` : "";
  return getJson<OperationsHistoryResponse>(`/api/operations/history${suffix}`);
}

export interface OperationRegressionSignal {
  kind: "duration" | "failure_rate";
  severity: "medium" | "high";
  message: string;
  metrics: Record<string, number | null>;
}

export interface OperationRegression {
  operation: string;
  system: string | null;
  latestTimestamp: string | null;
  latestStatus: string | null;
  severity: "medium" | "high";
  signals: OperationRegressionSignal[];
  samples: {
    total: number;
    terminal: number;
    recentDuration: number;
    baselineDuration: number;
    recentFailure: number;
    baselineFailure: number;
  };
}

export interface OperationsRegressionsResponse {
  ok: boolean;
  generatedAt: string;
  regressions: OperationRegression[];
  filters: {
    systemId: string | null;
    limit: number;
    minSamples: number;
  };
  summary: {
    operationsAnalyzed: number;
    regressionsDetected: number;
    scannedRows: number;
    scannedFiles: number;
  };
}

export function fetchOperationsRegressions(args?: {
  systemId?: string;
  limit?: number;
  minSamples?: number;
  all?: boolean;
}) {
  const params = new URLSearchParams();
  if (args?.systemId) params.set("system", args.systemId);
  if (typeof args?.limit === "number" && Number.isFinite(args.limit)) {
    params.set("limit", String(Math.max(1, Math.floor(args.limit))));
  }
  if (typeof args?.minSamples === "number" && Number.isFinite(args.minSamples)) {
    params.set("minSamples", String(Math.max(1, Math.floor(args.minSamples))));
  }
  if (args?.all === true) params.set("all", "true");
  const suffix = params.size ? `?${params.toString()}` : "";
  return getJson<OperationsRegressionsResponse>(`/api/operations/regressions${suffix}`);
}

export interface ReplayOperationResponse {
  ok: boolean;
  accepted: boolean;
  jobId: string;
  requestId: string | null;
  status: string;
  statusUrl: string;
  streamUrl: string;
  replay?: {
    sourceEventId: string;
    sourceOperation: string;
    sourceSystem: string | null;
    targetSystem: string;
  };
}

export function replayOperationEvent(eventId: string, args?: { systemId?: string }) {
  const payload = args?.systemId ? { systemId: args.systemId } : {};
  return getJson<ReplayOperationResponse>(`/api/operations/replay/${encodeURIComponent(eventId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function fetchImpact(args: {
  tokenPath: string;
  newValue?: string | null;
  depth?: number;
}) {
  const params = new URLSearchParams({ tokenPath: args.tokenPath });
  if (args.newValue) params.set("newValue", args.newValue);
  if (typeof args.depth === "number" && Number.isFinite(args.depth)) {
    params.set("depth", String(args.depth));
  }
  return getJson<ImpactReport>(`/api/impact?${params.toString()}`);
}

export interface ComponentSpecPayload {
  ok: boolean;
  slug: string;
  path: string;
  exists: boolean;
  raw: string;
  rawHash: string | null;
  parsed: unknown;
  parseError?: string | null;
}

export function fetchComponentSpec(slug: string) {
  return getJson<ComponentSpecPayload>(
    `/api/component-spec/${encodeURIComponent(slug)}`,
  );
}

export function validateComponentSpecInput(args: { slug: string; raw: string }) {
  return getJson<ComponentSpecValidateResponse>(
    `/api/component-spec/${encodeURIComponent(args.slug)}/validate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: args.raw }),
    },
  );
}

export function saveComponentSpec(args: {
  slug: string;
  raw: string;
  expectedHash?: string | null;
  refreshRegistry?: boolean;
  confirmRiskyChanges?: boolean;
}) {
  return getJson<ComponentSpecSaveResponse>(
    `/api/component-spec/${encodeURIComponent(args.slug)}/save`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: args.raw,
        expectedHash: args.expectedHash ?? null,
        refreshRegistry: args.refreshRegistry !== false,
        confirmRiskyChanges: args.confirmRiskyChanges === true,
      }),
    },
  );
}

export function restoreComponentSpecBackup(args: {
  slug: string;
  refreshRegistry?: boolean;
}) {
  return getJson<ComponentSpecRestoreResponse>(
    `/api/component-spec/${encodeURIComponent(args.slug)}/restore-backup`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshRegistry: args.refreshRegistry !== false,
      }),
    },
  );
}

export function patchEditorialSpec(args: {
  slug: string;
  expectedHash?: string | null;
  fields: Record<string, unknown>;
}) {
  const timeoutMs = 15_000;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  return getJson<ComponentSpecPatchEditorialResponse>(
    `/api/component-spec/${encodeURIComponent(args.slug)}/editorial`,
    {
      method: "PATCH",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedHash: args.expectedHash ?? null,
        fields: args.fields,
      }),
    },
  )
    .catch((error) => {
      const isAbortError =
        (typeof DOMException !== "undefined" &&
          error instanceof DOMException &&
          error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");
      if (!isAbortError) throw error;
      throw new ApiError({
        status: 408,
        statusText: "Request Timeout",
        code: "http.408" as ApiErrorCode,
        userMessage:
          "Saving summary timed out. The API may be busy; retry in a few seconds.",
        recoverable: true,
        context: {
          timeoutMs,
          endpoint: "/api/component-spec/:slug/editorial",
        },
      });
    })
    .finally(() => {
      globalThis.clearTimeout(timeoutId);
    });
}

const DEFAULT_QUEUE_POLL_INTERVAL_MS = 900;
const DEFAULT_QUEUE_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const QUEUE_ERROR_CODE_MISSING_NPM_SCRIPT = "script.missing_npm_script";

type QueuedRefreshAcceptedPayload = {
  ok?: boolean;
  jobId?: string;
  statusUrl?: string;
  output?: string;
  stderr?: string;
};

type QueueWaitOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  onPoll?: (payload: Record<string, unknown>) => void;
};

function isLowSignalQueueSummary(rawValue: unknown): boolean {
  const value = toNonEmptyString(rawValue).toLowerCase();
  if (!value) return true;
  if (value === "unknown error." || value === "unknown queue error.") return true;
  if (/^failed with code \d+$/i.test(value)) return true;
  if (/^queued operation finished with status '?(error|cancelled)'?\.?$/i.test(value)) return true;
  return false;
}

function pickQueueFailureSummary(candidates: unknown[], fallback: string): string {
  const normalized = candidates
    .map((candidate) => toNonEmptyString(candidate))
    .filter(Boolean);
  if (normalized.length === 0) return fallback;
  const highSignal = normalized.find((candidate) => !isLowSignalQueueSummary(candidate));
  return highSignal || normalized[0] || fallback;
}

function findQueuePayloadFailureSummary(
  payload: Record<string, unknown>,
  status: string,
): string {
  const fallback = `Queued operation finished with status '${status}'.`;
  const job = toRecord(payload.job);
  const result = toRecord(job?.result);
  const resultPayload = toRecord(result?.payload);
  const sync = toRecord(resultPayload?.sync);
  const registryRefresh = toRecord(resultPayload?.registry_refresh);
  const figmaError = toRecord(resultPayload?.figma_error);
  const figmaErrorMessage = toNonEmptyString(figmaError?.message);
  const figmaErrorStatus =
    typeof figmaError?.status === "number"
      ? String(figmaError.status)
      : toNonEmptyString(figmaError?.status);
  const figmaErrorEndpoint = toNonEmptyString(figmaError?.endpoint);
  const figmaErrorSummary =
    figmaErrorMessage ||
    (figmaErrorStatus ? `Figma API error ${figmaErrorStatus}` : "") ||
    (figmaErrorEndpoint ? `Figma request failed: ${figmaErrorEndpoint}` : "");
  const pipelinePhase = toNonEmptyString(resultPayload?.pipeline_phase).toLowerCase();
  const failed = Array.isArray(resultPayload?.failed) ? resultPayload.failed : [];
  const firstFailed = failed.length > 0 ? toRecord(failed[0]) : null;
  const events = Array.isArray(payload.events) ? payload.events : [];

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
      const endStatus = toNonEmptyString(event.status).toLowerCase();
      if (endStatus === "error" || endStatus === "cancelled") {
        lastErrorEventMessage = toNonEmptyString(event.summary);
        if (lastErrorEventMessage) break;
      }
    }
  }

  return pickQueueFailureSummary(
    [
      figmaErrorSummary,
      pipelinePhase ? `Failed during '${pipelinePhase}' phase.` : "",
      resultPayload?.error,
      resultPayload?.message,
      resultPayload?.stderr,
      firstFailed?.error,
      sync?.error,
      sync?.reason,
      sync?.stderr,
      registryRefresh?.stderr,
      lastErrorEventMessage,
      result?.summary,
    ],
    fallback,
  );
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
}

function toQueuedStatusUrl(payload: QueuedRefreshAcceptedPayload): string {
  const jobId = toNonEmptyString(payload.jobId);
  const statusUrl = toNonEmptyString(payload.statusUrl);
  if (statusUrl) return statusUrl;
  if (jobId) return `/api/jobs/${encodeURIComponent(jobId)}`;
  return "";
}

function hasQueuePayloadErrorCode(error: ApiError, code: string): boolean {
  const payload = toRecord(error.payload);
  const job = toRecord(payload?.job);
  const result = toRecord(job?.result);
  const resultPayload = toRecord(result?.payload);
  return toNonEmptyString(resultPayload?.error_code) === code;
}

export interface CancelQueueJobResult {
  ok: boolean;
  job?: Record<string, unknown>;
}

export async function cancelQueueJob(jobId: string): Promise<CancelQueueJobResult> {
  const trimmedJobId = toNonEmptyString(jobId);
  if (!trimmedJobId) {
    throw new ApiError({
      status: 400,
      statusText: "Bad Request",
      code: "validation.missing_required_fields" as ApiErrorCode,
      userMessage: "Job id is required to cancel a queued operation.",
      recoverable: true,
      context: { field: "jobId" },
    });
  }
  return requestJson<CancelQueueJobResult>(`/api/jobs/${encodeURIComponent(trimmedJobId)}`, {
    method: "DELETE",
  });
}

async function waitForQueuedJob(
  statusUrl: string,
  options: QueueWaitOptions = {},
): Promise<Record<string, unknown>> {
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs,
    DEFAULT_QUEUE_WAIT_TIMEOUT_MS,
  );
  const pollIntervalMs = normalizePositiveInteger(
    options.pollIntervalMs,
    DEFAULT_QUEUE_POLL_INTERVAL_MS,
  );
  let cursor = 0;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const separator = statusUrl.includes("?") ? "&" : "?";
    let payload: Record<string, unknown>;
    try {
      payload = await requestJson<Record<string, unknown>>(
        `${statusUrl}${separator}since=${cursor}`,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.recoverable &&
        (error.status >= 500 || error.status === 429)
      ) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, pollIntervalMs);
        });
        continue;
      }
      throw error;
    }

    try {
      options.onPoll?.(payload);
    } catch {
      // ignore UI-only polling callback errors
    }

    const nextCursor = Number(payload.nextCursor);
    if (Number.isFinite(nextCursor) && nextCursor > cursor) {
      cursor = nextCursor;
    }

    const job = toRecord(payload.job);
    const status = toNonEmptyString(job?.status).toLowerCase();
    if (status === "success") return payload;
    if (status === "error" || status === "cancelled") {
      const summary = findQueuePayloadFailureSummary(payload, status);
      throw new ApiError({
        status: 409,
        statusText: "Conflict",
        code: "queue.job_failed_or_cancelled" as ApiErrorCode,
        userMessage: summary,
        recoverable: true,
        context: {
          status,
          statusUrl,
          jobId: toNonEmptyString(job?.id) || null,
        },
        payload,
      });
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, pollIntervalMs);
    });
  }

  throw new ApiError({
    status: 408,
    statusText: "Request Timeout",
    code: "queue.stream_timeout" as ApiErrorCode,
    userMessage: "Timeout waiting for queued operation.",
    recoverable: true,
    context: {
      statusUrl,
      timeoutMs,
    },
  });
}

async function runQueuedRefresh(
  endpoint: string,
  options: QueueWaitOptions = {},
  init?: Omit<RequestInit, "method">,
) {
  const accepted = await getJson<QueuedRefreshAcceptedPayload>(endpoint, {
    ...(init || {}),
    method: "POST",
  });

  const statusUrl = toQueuedStatusUrl(accepted);
  if (!statusUrl) {
    return {
      ok: accepted.ok !== false,
      output: toNonEmptyString(accepted.output) || undefined,
      stderr: toNonEmptyString(accepted.stderr) || undefined,
    };
  }

  const finalState = await waitForQueuedJob(statusUrl, options);
  const job = toRecord(finalState.job);
  const result = toRecord(job?.result);
  const payload = toRecord(result?.payload);

  if (payload) {
    return {
      ok: payload.ok !== false,
      output: toNonEmptyString(payload.output) || undefined,
      stderr: toNonEmptyString(payload.stderr) || undefined,
    };
  }

  return {
    ok: true,
    output: undefined,
    stderr: undefined,
  };
}

export async function refreshRegistry(options?: QueueWaitOptions) {
  return runQueuedRefresh("/api/refresh-registry", options);
}

export async function refreshTokenUsageIndex(options?: QueueWaitOptions) {
  return runQueuedRefresh("/api/refresh-token-usage-index", options);
}

export async function refreshTokenGraph(options?: QueueWaitOptions) {
  return runQueuedRefresh("/api/refresh-token-graph", options);
}

export async function refreshTokenHealth(options?: QueueWaitOptions) {
  return runQueuedRefresh("/api/refresh-token-health", options);
}

export async function refreshComponentsHealth(options?: QueueWaitOptions) {
  return runQueuedRefresh("/api/refresh-components-health", options);
}

export async function regenerateComponentMarkdown(
  args: { slug: string; specFile?: string | null },
  options?: QueueWaitOptions,
) {
  const endpoint = "/api/run/ds:component-doc";
  const requestInit = {
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      component: args.slug,
      componentName: args.slug,
      componentSlug: args.slug,
      specFile: args.specFile ?? null,
      spec_file: args.specFile ?? null,
    }),
  } as const;

  try {
    return await runQueuedRefresh(endpoint, options, requestInit);
  } catch (error) {
    const argsRequiredError =
      error instanceof ApiError &&
      error.code === API_ERROR_CODES.VALIDATION_COMPONENT_DOC_ARGS_REQUIRED;
    const missingScriptError =
      error instanceof ApiError &&
      error.code === API_ERROR_CODES.QUEUE_JOB_FAILED_OR_CANCELLED &&
      hasQueuePayloadErrorCode(error, QUEUE_ERROR_CODE_MISSING_NPM_SCRIPT);
    if (!argsRequiredError && !missingScriptError) {
      throw error;
    }
    const pipelineEndpoint = "/api/run/ds:pipeline";
    return runQueuedRefresh(
      pipelineEndpoint,
      options,
      {
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          component: args.slug,
          onlyStep: "markdown",
          fromStep: "markdown",
        }),
      },
    );
  }
}

export function restartApiServer() {
  return getJson<{
    ok: boolean;
    mode?: string;
    restartCommand?: string;
    message?: string;
    requestId?: string;
  }>("/api/admin/restart-api", {
    method: "POST",
  });
}

export async function refreshNamingDebt() {
  return getJson<{
    ok: boolean;
    generatedAt: string;
    totalViolations: number;
    overallScore: number;
  }>("/api/refresh-naming-debt", { method: "POST" });
}

export async function captureHealthSnapshot(args?: {
  beforeRef?: string;
  retentionDays?: number;
  skipDiff?: boolean;
}) {
  return getJson<CaptureHealthSnapshotResult>("/api/capture-health-snapshot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args || {}),
  });
}

export interface FilePayload {
  ok: boolean;
  file: string;
  truncated?: boolean;
  content: string;
}

export interface FileSnippetPayload {
  ok: boolean;
  file: string;
  line: number;
  startLine: number;
  endLine: number;
  matchedBy: "line" | "query";
  snippet: string;
}

export interface CaptureFigmaScreenshotArgs {
  figmaUrl: string;
  figmaToken?: string;
  tokensSource?: "auto" | "mcp" | "rest";
  componentSlug?: string;
  includeVariants?: boolean;
  variantLimit?: number;
  requireExistingDoc?: boolean;
  continueOnError?: boolean;
  refreshIndices?: boolean;
  dryRun?: boolean;
  scale?: number;
  format?: string;
  mainCaptureMode?: "auto" | "agent" | "rest";
  componentKind?: "component_set" | "component" | "all";
  injectDocSpecs?: boolean;
}

export interface TokensBootstrapResult {
  attempted?: boolean;
  created?: boolean;
  reason?: string;
  files_written?: number;
  collections?: string[];
  tokens_written?: number;
  tokens_total?: number;
  files?: string[];
  error?: string;
}

export interface TokensCompileResult {
  attempted?: boolean;
  compiled?: boolean;
  reason?: string;
  stderr?: string;
  output?: string;
}

export interface CaptureFigmaErrorDetail {
  type?: string;
  message?: string;
  endpoint?: string;
  fileKey?: string;
  status?: number;
  code?: string;
  details?: string;
  retryAfterSeconds?: number | null;
}

export interface CaptureFigmaScreenshotResult {
  ok: boolean;
  jobId?: string;
  pipeline_phase?: string;
  dryRun?: boolean;
  source?: {
    figma_url?: string;
    file_key?: string;
    node_id_from_url?: string | null;
  };
  requested?: {
    component_kind?: string;
    include_variants?: boolean;
    variant_limit?: number;
    scale?: number;
    format?: string;
    require_existing_doc?: boolean;
    main_capture_mode?: string;
  };
  total_candidates?: number;
  targets_total?: number;
  targets?: Array<{
    slug: string;
    node_id: string;
    kind?: string;
    page_name?: string | null;
    markdown_path: string;
    spec_path?: string;
    spec_exists?: boolean;
    figma_url?: string;
  }>;
  captured?: Array<{
    slug: string;
    node_id: string;
    markdown_path: string;
    proof_file_path?: string | null;
    screenshot_url?: string | null;
    local_image_path?: string | null;
    variants_count?: number;
  }>;
  failed?: Array<{
    slug: string;
    node_id: string;
    markdown_path: string;
    error: string;
  }>;
  skipped?: Array<Record<string, unknown>>;
  indices_refreshed?: boolean;
  registry_refresh?: {
    ok?: boolean;
    output?: string;
    stderr?: string;
  };
  tokens_bootstrap?: TokensBootstrapResult;
  tokens_compile?: TokensCompileResult;
  figma_error?: CaptureFigmaErrorDetail;
  error?: string;
  message?: string;
  stderr?: string;
}

export interface CaptureFigmaProgress {
  jobId?: string;
  status: "queued" | "running" | "success" | "error" | "cancelled";
  completed: number;
  total: number;
  remaining: number;
  currentSlug?: string;
  message?: string;
}

export interface FigmaMcpPingResult {
  ok: boolean;
  connected: boolean;
  code?: string;
  message?: string;
  collectionsDetected?: number;
  variablesDetected?: number;
  /** True if the plugin connected successfully at any point this session. */
  everConnected?: boolean;
  /** 
   * Diagnostic details for disconnection (additive field for better UX).
   * Preserves backward compatibility - existing consumers ignore this field.
   */
  details?: {
    /** Reason for disconnection: no_plugin_session | reachable_but_no_session */
    reason?: 'no_plugin_session' | 'reachable_but_no_session';
  };
}

export interface FigmaMcpHeartbeatResult {
  ok: boolean;
  alive?: boolean;
  ageMs?: number | null;
  lastSeenAt?: number | null;
  sourceFileKey?: string | null;
  sourceDocName?: string | null;
  pluginVersion?: string | null;
  pluginBuild?: string | null;
}

export interface FigmaMcpReconnectResult {
  ok: boolean;
  reconnected?: boolean;
  closedConnections?: number;
  siblingCleanup?: string;
  message?: string;
  code?: string;
}

export interface FigmaMcpDesignContextCompactSelectionNode {
  id: string;
  name: string;
  type: string;
  width: number | null;
  height: number | null;
}

export interface FigmaMcpDesignContextCompactResponse {
  ok: boolean;
  code?: string;
  message?: string;
  fileKey?: string | null;
  targetNodeId?: string | null;
  selection?: {
    count: number;
    page: string | null;
    nodes: FigmaMcpDesignContextCompactSelectionNode[];
  };
  node?: {
    id: string;
    name: string;
    type: string;
    parentId: string | null;
    x: number | null;
    y: number | null;
    width: number | null;
    height: number | null;
  } | null;
  component?: {
    nodeId: string;
    name: string;
    type: "COMPONENT" | "COMPONENT_SET";
    description: string | null;
    props: Array<{ name: string; type: string }>;
    states: string[];
    variantAxes: Array<{ name: string; values: string[] }>;
    tokenBindingCount: number;
  } | null;
  tokens?: {
    requestedModeId: string | null;
    count: number;
    missingCount: number;
    modeFallbackCount: number;
    items: Array<{
      id: string;
      name: string;
      resolvedType: string;
      collectionId: string;
      collectionName: string | null;
      modeId: string | null;
      modeName: string | null;
      value: unknown;
      isAlias: boolean;
      aliasToVariableId: string | null;
    }>;
  };
  warnings?: string[];
}


interface FigmaMcpCapabilitiesResponse extends McpCapabilitiesPayload {
  ok?: boolean;
  tools?: string[];
  toolsDiscoveryError?: string;
  mcp?: {
    connected?: boolean;
    code?: string;
    message?: string;
  };
}

async function fetchFigmaMcpCapabilities(
  timeoutMs: number,
): Promise<FigmaMcpCapabilitiesResponse> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await requestJson<FigmaMcpCapabilitiesResponse>("/api/figma-mcp/capabilities", {
      method: "GET",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/**
 * Classify the reason for MCP disconnection based on capabilities payload.
 * Timeout cases are handled in pingFigmaMcp() catch (ApiError 408), so this
 * helper only classifies non-timeout disconnection states.
 */
function classifyPingDisconnectionReason(
  payload: FigmaMcpCapabilitiesResponse,
): 'no_plugin_session' | 'reachable_but_no_session' {
  // Use mcp.code for accurate classification (payload.ok is always true for /capabilities)
  const mcpCode = payload.mcp?.code;

  // ws.not_connected means server can't reach plugin at all
  if (mcpCode === 'ws.not_connected') {
    return 'no_plugin_session';
  }

  // ws.disconnected with tools available means dashboard is reachable but plugin not connected
  if (mcpCode === 'ws.disconnected' && payload.ok === true) {
    return 'reachable_but_no_session';
  }

  // Default: no plugin session detected
  return 'no_plugin_session';
}

function toMcpPingResultFromCapabilities(
  payload: FigmaMcpCapabilitiesResponse,
): FigmaMcpPingResult {
  const normalized = normalizeMcpCapabilities(payload);
  const connected = payload.mcp?.connected === true;
  if (connected) {
    return {
      ok: true,
      connected: true,
      code: "mcp.connected",
      message: "DS Graph connection is active.",
    };
  }

  // Classify disconnection reason for better UX
  const reason = classifyPingDisconnectionReason(payload);

  return {
    ok: false,
    connected: false,
    code: "mcp.not_connected",
    message:
      payload.mcp?.message ||
      (normalized.hasVariablesData
        ? "DS Graph is reachable, but no active plugin session was found."
        : "No DS Graph plugin session is active. Open the Figma plugin and retry."),
    details: { reason },
  };
}


/**
 * Ping DS Graph to check connectivity.
 * Note: figmaUrl/figmaToken args are deprecated in direct-only mode.
 * @deprecated Use direct capabilities endpoint instead. This function is maintained for backward compatibility.
 */
export async function pingFigmaMcp(
  _args?: {
    figmaUrl?: string;
    figmaToken?: string;
  },
  options?: {
    timeoutMs?: number;
  },
): Promise<FigmaMcpPingResult> {
  const requestedTimeoutMs = Number(options?.timeoutMs);
  const timeoutMs =
    Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
      ? Math.floor(requestedTimeoutMs)
      : 35_000;
  void _args; // Suppress unused parameter warning
  return fetchFigmaMcpCapabilities(timeoutMs)
    .then((payload) => toMcpPingResultFromCapabilities(payload))
    .catch((error) => {
      const isAbortError =
        (typeof DOMException !== "undefined" &&
          error instanceof DOMException &&
          error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");
      if (!isAbortError) throw error;
      throw new ApiError({
        status: 408,
        statusText: "Request Timeout",
        code: "http.408" as ApiErrorCode,
        userMessage:
          "DS Graph connectivity test timed out. Check that the Figma plugin is open and retry.",
        recoverable: true,
        context: {
          timeoutMs,
          endpoint: "/api/figma-mcp/capabilities",
        },
      });
    });
}

export async function getFigmaMcpHeartbeat(): Promise<FigmaMcpHeartbeatResult> {
  return requestJson<FigmaMcpHeartbeatResult>("/api/figma-mcp/heartbeat", {
    method: "GET",
  });
}

export async function reconnectFigmaMcp(): Promise<FigmaMcpReconnectResult> {
  return requestJson<FigmaMcpReconnectResult>("/api/figma-mcp/reconnect", {
    method: "POST",
    headers: {
      "x-ds-mcp-reconcile-confirm": "true",
    },
  });
}

const DEFAULT_DESIGN_CONTEXT_TIMEOUT_MS = 20_000;

export async function getFigmaMcpDesignContextCompact(
  args?: {
    fileUrl?: string;
    nodeId?: string;
    modeId?: string;
  },
  options?: { timeoutMs?: number },
): Promise<FigmaMcpDesignContextCompactResponse> {
  const params = new URLSearchParams();
  const fileUrl = toNonEmptyString(args?.fileUrl);
  const nodeId = toNonEmptyString(args?.nodeId);
  const modeId = toNonEmptyString(args?.modeId);
  if (fileUrl) params.set("fileUrl", fileUrl);
  if (nodeId) params.set("nodeId", nodeId);
  if (modeId) params.set("modeId", modeId);

  const query = params.size > 0 ? `?${params.toString()}` : "";
  const timeoutMsRaw = Number(options?.timeoutMs);
  const timeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.floor(timeoutMsRaw)
      : DEFAULT_DESIGN_CONTEXT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await requestJson<FigmaMcpDesignContextCompactResponse>(
      `/api/figma-mcp/design-context-compact${query}`,
      {
        method: "GET",
        signal: controller.signal,
      },
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

type CaptureProgressSnapshot = {
  completed?: unknown;
  total?: unknown;
  remaining?: unknown;
  slug?: unknown;
  state?: unknown;
};

function toProgressInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function parseCaptureProgressSnapshot(raw: unknown): CaptureProgressSnapshot | null {
  const value = toRecord(raw);
  if (!value) return null;
  return {
    completed: value.completed,
    total: value.total,
    remaining: value.remaining,
    slug: value.slug,
    state: value.state,
  };
}

function parseCaptureProgressChunks(args: {
  events: unknown[];
  buffer: string;
}): {
  buffer: string;
  snapshots: CaptureProgressSnapshot[];
} {
  const { events } = args;
  let buffer = args.buffer;
  const snapshots: CaptureProgressSnapshot[] = [];

  for (const rawEvent of events) {
    const event = toRecord(rawEvent);
    if (!event || toNonEmptyString(event.type) !== "chunk") continue;
    const text = typeof event.text === "string" ? event.text : "";
    if (!text) continue;
    buffer += text;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const marker = "[capture-progress]";
      const markerIndex = line.indexOf(marker);
      if (markerIndex < 0) continue;
      const jsonPart = line.slice(markerIndex + marker.length).trim();
      if (!jsonPart) continue;
      try {
        const parsed = JSON.parse(jsonPart);
        const snapshot = parseCaptureProgressSnapshot(parsed);
        if (snapshot) snapshots.push(snapshot);
      } catch {
        // ignore malformed progress lines
      }
    }
  }

  return { buffer, snapshots };
}

export function fetchFile(filePath: string) {
  const params = new URLSearchParams({ path: filePath });
  return getJson<FilePayload>(`/api/file?${params.toString()}`);
}

export function fetchFileSnippet(args: {
  file: string;
  line?: number;
  q?: string;
  before?: number;
  after?: number;
}) {
  const params = new URLSearchParams({ file: args.file });
  if (args.line) params.set("line", String(args.line));
  if (args.q) params.set("q", args.q);
  if (args.before !== undefined) params.set("before", String(args.before));
  if (args.after !== undefined) params.set("after", String(args.after));
  return getJson<FileSnippetPayload>(`/api/file-snippet?${params.toString()}`);
}

export async function captureFigmaScreenshot(
  args: CaptureFigmaScreenshotArgs,
  options?: {
    systemId?: string;
    onProgress?: (progress: CaptureFigmaProgress) => void;
  },
): Promise<CaptureFigmaScreenshotResult> {
  const accepted = await getJson<CaptureFigmaScreenshotResult>("/api/capture-figma-screenshot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.systemId ? { "x-ds-system": options.systemId } : {}),
    },
    body: JSON.stringify(args),
  });

  const statusUrl = toQueuedStatusUrl(accepted);
  if (!statusUrl) return accepted;

  const onProgress = options?.onProgress;
  const jobId = toNonEmptyString((accepted as { jobId?: unknown }).jobId) || undefined;
  let progressBuffer = "";
  let latestCompleted = 0;
  let latestTotal = 0;
  let latestSlug: string | undefined;

  onProgress?.({
    jobId,
    status: "queued",
    completed: 0,
    total: 0,
    remaining: 0,
    message: "Queued",
  });

  const finalState = await waitForQueuedJob(statusUrl, {
    onPoll: (payload) => {
      const job = toRecord(payload.job);
      const statusRaw = toNonEmptyString(job?.status).toLowerCase();
      const status: CaptureFigmaProgress["status"] =
        statusRaw === "running"
          ? "running"
          : statusRaw === "success"
            ? "success"
            : statusRaw === "error"
              ? "error"
              : statusRaw === "cancelled"
                ? "cancelled"
                : "queued";

      const events = Array.isArray(payload.events) ? payload.events : [];
      const parsed = parseCaptureProgressChunks({
        events,
        buffer: progressBuffer,
      });
      progressBuffer = parsed.buffer;
      const lastSnapshot =
        parsed.snapshots.length > 0
          ? parsed.snapshots[parsed.snapshots.length - 1]
          : null;
      if (lastSnapshot) {
        latestCompleted = toProgressInt(lastSnapshot.completed);
        latestTotal = toProgressInt(lastSnapshot.total);
        latestSlug = toNonEmptyString(lastSnapshot.slug) || latestSlug;
      }

      const total = latestTotal;
      const completed = Math.min(latestCompleted, total || latestCompleted);
      const remaining = Math.max(0, (total || 0) - completed);

      onProgress?.({
        jobId,
        status,
        completed,
        total,
        remaining,
        currentSlug: latestSlug,
      });
    },
  });

  const job = toRecord(finalState.job);
  const result = toRecord(job?.result);
  const payload = toRecord(result?.payload);
  if (payload) {
    const typed = payload as unknown as CaptureFigmaScreenshotResult;
    const total =
      Number(typed.targets_total) ||
      (Array.isArray(typed.targets) ? typed.targets.length : latestTotal);
    const completed =
      Array.isArray(typed.captured) || Array.isArray(typed.failed)
        ? (typed.captured?.length || 0) + (typed.failed?.length || 0)
        : latestCompleted;
    onProgress?.({
      jobId,
      status: typed.ok ? "success" : "error",
      completed,
      total,
      remaining: Math.max(0, total - completed),
      currentSlug: latestSlug,
    });
    return typed;
  }

  return accepted;
}

// ============================================================================
// Consumer File Management (Cross-file Dependency Tracking)
// ============================================================================

export interface AddConsumerPayload {
  dsFileKey?: string;
  dsFileUrl?: string;
  consumerFileUrl?: string;
  consumerName: string;
  enabled?: boolean;
}

export interface AddConsumerResponse {
  ok: boolean;
  data: DsConsumer;
}

export interface ListConsumersResponse {
  ok: boolean;
  data: (DsConsumer & { latestSync?: DsSyncRun })[];
}

export interface GetConsumerResponse {
  ok: boolean;
  data: DsConsumer & { latestSync?: DsSyncRun };
}

export interface RemoveConsumerResponse {
  ok: boolean;
  data: { consumerId: string };
}

export interface UpdateConsumerResponse {
  ok: boolean;
  data: DsConsumer;
}

export interface SyncConsumersPayload {
  dsFileKey: string;
  consumerIds?: string[];
  force?: boolean;
  captureParentUsage?: boolean;
}

export interface ByFileReportResponse {
  ok: boolean;
  data: FileReport[];
}

export interface ByComponentReportResponse {
  ok: boolean;
  data: ComponentUsageReport[];
}

export interface ByVariableReportResponse {
  ok: boolean;
  data: VariableUsageReport[];
}

export interface SimulateChangePayload {
  dsFileKey: string;
  variableKey: string;
  proposedValue: unknown;
}

export interface SimulationResponse {
  ok: boolean;
  data: SimulationResult;
}

function normalizeDsSyncRunRecord(value: unknown): DsSyncRun | null {
  const row = toRecord(value);
  if (!row) return null;

  const durationRaw = row.durationMs ?? row.duration_ms;
  const componentCountRaw = row.componentCount ?? row.component_count;
  const variableCountRaw = row.variableCount ?? row.variable_count;
  const warningCountRaw = row.warningCount ?? row.warning_count;
  const durationMs = Number(durationRaw);
  const componentCount = Number(componentCountRaw);
  const variableCount = Number(variableCountRaw);
  const warningCount = Number(warningCountRaw);

  return {
    id: toNonEmptyString(row.id),
    consumerId: toNonEmptyString(row.consumerId ?? row.consumer_id),
    syncedAt: toNonEmptyString(row.syncedAt ?? row.synced_at),
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    status: (toNonEmptyString(row.status) as DsSyncRun["status"]) || "error",
    errorMessage: toNonEmptyString(row.errorMessage ?? row.error_message) || undefined,
    dsLastModified: toNonEmptyString(row.dsLastModified ?? row.ds_last_modified) || undefined,
    consumerLastModified:
      toNonEmptyString(row.consumerLastModified ?? row.consumer_last_modified) || undefined,
    componentCount: Number.isFinite(componentCount) ? componentCount : 0,
    variableCount: Number.isFinite(variableCount) ? variableCount : 0,
    warningCount: Number.isFinite(warningCount) ? warningCount : 0,
  };
}

function normalizeDsConsumerRecord(value: unknown): (DsConsumer & { latestSync?: DsSyncRun }) | null {
  const row = toRecord(value);
  if (!row) return null;
  const enabledRaw = row.enabled;
  const enabled =
    typeof enabledRaw === "boolean"
      ? enabledRaw
      : typeof enabledRaw === "number"
        ? enabledRaw !== 0
        : toNonEmptyString(enabledRaw) === "1" || toNonEmptyString(enabledRaw).toLowerCase() === "true";

  const latestSync = normalizeDsSyncRunRecord(row.latestSync ?? row.latest_sync);

  return {
    id: toNonEmptyString(row.id),
    dsFileKey: toNonEmptyString(row.dsFileKey ?? row.ds_file_key),
    consumerFileKey: toNonEmptyString(row.consumerFileKey ?? row.consumer_file_key),
    consumerName: toNonEmptyString(row.consumerName ?? row.consumer_name),
    enabled,
    createdAt: toNonEmptyString(row.createdAt ?? row.created_at),
    ...(latestSync ? { latestSync } : {}),
  };
}

function warnInvalidConsumerPayload(context: string, value: unknown): void {
  // Keep this lightweight and only emit when server payload is structurally invalid.
  console.warn(`[api:${context}] Invalid consumer payload shape`, value);
}

export function addConsumer(payload: AddConsumerPayload) {
  return requestJson<{ ok: boolean; data: unknown }>("/api/figma-mcp/dependencies/consumers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).then((response) => {
    const normalized = normalizeDsConsumerRecord(response.data);
    if (!normalized) {
      warnInvalidConsumerPayload("addConsumer", response.data);
    }
    return {
      ok: response.ok,
      data: normalized || {
        id: "",
        dsFileKey: "",
        consumerFileKey: "",
        consumerName: "",
        enabled: true,
        createdAt: "",
      },
    } satisfies AddConsumerResponse;
  });
}

export function listConsumers(dsFileKey: string) {
  const params = new URLSearchParams({ dsFileKey });
  return getJson<{ ok: boolean; data: unknown[] }>(
    `/api/figma-mcp/dependencies/consumers?${params.toString()}`,
  ).then((response) => {
    const rows = Array.isArray(response.data) ? response.data : [];
    const data = rows.flatMap((row) => {
      const normalized = normalizeDsConsumerRecord(row);
      if (!normalized || !normalized.id) {
        warnInvalidConsumerPayload("listConsumers", row);
        return [];
      }
      return [normalized];
    });
    return { ok: response.ok, data } satisfies ListConsumersResponse;
  });
}

export function fetchConsumer(consumerId: string) {
  return getJson<{ ok: boolean; data: unknown }>(
    `/api/figma-mcp/dependencies/consumers/${encodeURIComponent(consumerId)}`,
  ).then((response) => {
    const normalized = normalizeDsConsumerRecord(response.data);
    if (!normalized) {
      warnInvalidConsumerPayload("fetchConsumer", response.data);
    }
    return {
      ok: response.ok,
      data: normalized || {
        id: consumerId,
        dsFileKey: "",
        consumerFileKey: "",
        consumerName: "",
        enabled: true,
        createdAt: "",
      },
    } satisfies GetConsumerResponse;
  });
}

export function removeConsumer(consumerId: string) {
  return requestJson<RemoveConsumerResponse>(`/api/figma-mcp/dependencies/consumers/${encodeURIComponent(consumerId)}`, {
    method: "DELETE",
  });
}

export function updateConsumer(consumerId: string, payload: Partial<{ enabled: boolean }>) {
  return requestJson<{ ok: boolean; data: unknown }>(
    `/api/figma-mcp/dependencies/consumers/${encodeURIComponent(consumerId)}`,
    {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    },
  ).then((response) => {
    const normalized = normalizeDsConsumerRecord(response.data);
    if (!normalized) {
      warnInvalidConsumerPayload("updateConsumer", response.data);
    }
    return {
      ok: response.ok,
      data: normalized || {
        id: consumerId,
        dsFileKey: "",
        consumerFileKey: "",
        consumerName: "",
        enabled: payload.enabled ?? true,
        createdAt: "",
      },
    } satisfies UpdateConsumerResponse;
  });
}

export function syncConsumers(payload: SyncConsumersPayload) {
  return requestJson<SyncResult>("/api/figma-mcp/dependencies/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function fetchReportByFile(
  dsFileKey: string,
  options?: {
    staleOnly?: boolean;
  },
) {
  const params = new URLSearchParams({ dsFileKey });
  if (options?.staleOnly) params.set("stale", "true");
  return getJson<ByFileReportResponse>(`/api/figma-mcp/dependencies/report/by-file?${params.toString()}`);
}

export function fetchReportByComponent(dsFileKey: string, componentKey?: string) {
  const params = new URLSearchParams({ dsFileKey });
  if (componentKey) params.set("componentKey", componentKey);
  return getJson<ByComponentReportResponse>(`/api/figma-mcp/dependencies/report/by-component?${params.toString()}`);
}

export function fetchReportByVariable(dsFileKey: string, variableKey?: string) {
  const params = new URLSearchParams({ dsFileKey });
  if (variableKey) params.set("variableKey", variableKey);
  return getJson<ByVariableReportResponse>(`/api/figma-mcp/dependencies/report/by-variable?${params.toString()}`);
}

export function simulateVariableChange(payload: SimulateChangePayload) {
  return requestJson<SimulationResponse>("/api/figma-mcp/dependencies/simulate-change", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function fetchConsumerSyncRuns(consumerId: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  return getJson<{ ok: true; data: unknown[] }>(
    `/api/figma-mcp/dependencies/consumers/${encodeURIComponent(consumerId)}/runs?${params.toString()}`,
  ).then((response) => {
    const runs = Array.isArray(response.data) ? response.data : [];
    const data = runs
      .map((run, index) => {
        const normalized = normalizeDsSyncRunRecord(run);
        if (!normalized) {
          console.warn("[api:fetchConsumerSyncRuns] Invalid sync run payload shape", run);
          return null;
        }
        // Preserve fallback ID for compatibility
        if (!normalized.id) {
          return { ...normalized, id: `${consumerId}-${index}` };
        }
        return normalized;
      })
      .filter((run): run is DsSyncRun => run !== null && Boolean(run.id));

    return { ok: true as const, data };
  });
}

// ============================================================================
// MCP Capabilities Normalizer
// ============================================================================

/**
 * Normalized MCP capabilities support flags.
 * Provides a stable interface for consumers regardless of payload version.
 */
export interface NormalizedSupportFlags {
  /** Can retrieve file/document metadata (GET_FILE_INFO) */
  hasFileInfo: boolean;
  /** Can retrieve component details (GET_COMPONENT) */
  hasComponent: boolean;
  /** Can retrieve local styles (GET_LOCAL_STYLES) */
  hasLocalStyles: boolean;
  /** Can retrieve variables data (GET_VARIABLES_DATA) */
  hasVariablesData: boolean;
  /** Port switching capability (deprecated in direct-only mode) */
  hasPortSwitch: boolean;
}

/**
 * MCP Capabilities response shape (server payload).
 * Note: supportsV2 is always present in direct-only mode.
 * supports legacy is maintained for backward compatibility during transition.
 */
export interface McpCapabilitiesPayload {
  /** @deprecated Legacy flags maintained for backward compatibility. Use supportsV2 for clearer semantics. */
  supports?: {
    searchNodes?: boolean;
    getChildren?: boolean;
    searchStyles?: boolean;
    searchVariables?: boolean;
    portSwitch?: boolean;
  };
  /** V2 semantic capability flags (canonical, always present in direct-only mode) */
  supportsV2: {
    hasFileInfo: boolean;
    hasComponent: boolean;
    hasLocalStyles: boolean;
    hasVariablesData: boolean;
    hasPortSwitch: boolean;
  };
}

/**
 * Normalize MCP capabilities payload to stable support flags.
 * Prioritizes supportsV2 (canonical) with fallback to supports (legacy).
 *
 * @param payload - Raw capabilities payload from server
 * @returns Normalized support flags with safe defaults
 */
export function normalizeMcpCapabilities(payload: McpCapabilitiesPayload): NormalizedSupportFlags {
  // supportsV2 is always present in direct-only mode
  return {
    hasFileInfo: payload.supportsV2.hasFileInfo ?? false,
    hasComponent: payload.supportsV2.hasComponent ?? false,
    hasLocalStyles: payload.supportsV2.hasLocalStyles ?? false,
    hasVariablesData: payload.supportsV2.hasVariablesData ?? false,
    hasPortSwitch: payload.supportsV2.hasPortSwitch ?? false,
  };
}
