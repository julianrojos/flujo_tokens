import type { ComponentCatalog } from '@/types/component-catalog';
import type { ComponentUsageIndex } from '@/types/component-usage-index';
import type { TokenCatalog } from '@/types/token-catalog';
import type { TokenCollectionTreeIndex } from '@/types/token-tree';
import type { TokenUsageIndex } from '@/types/token-usage-index';
import type {
  TokenGraphQueryDirection,
  TokenGraphQueryResult,
  TokenGraphViz,
} from '@/types/token-graph';
import type { TokenHealthReport } from '@/types/token-health';
import type {
  CaptureHealthSnapshotResult,
  HealthHistoryBucket,
  HealthHistoryRange,
  HealthHistoryReport,
} from '@/types/health-history';
import type { ComponentSpecPatchEditorialResponse } from '@/types/spec-editor';
import type {
  DsConsumer,
  SyncResult,
  FileReport,
  ComponentUsageReport,
  VariableUsageReport,
  SimulationResult,
  DsSyncRun,
  SyncRunsResponse,
} from '@/types/consumers';
import { API_ERROR_CODES, type ApiErrorCode } from '@/lib/api-errors';
import { normalizeEnvRef } from '@/lib/env-ref';
import { resolveDsFileKeyFromConfig } from '@/lib/design-system-keys';
import { bumpEditDocsStorageEpoch } from '@/lib/edit-docs-storage-namespace';

let activeSystemId: string | null = null;
export function getActiveSystemId() {
  return activeSystemId || localStorage.getItem('ds-system-id') || '';
}
export function setActiveSystemId(id: string) {
  activeSystemId = id;
  localStorage.setItem('ds-system-id', id);
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
    this.name = 'ApiError';
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
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function buildApiError(response: Response): Promise<ApiError> {
  const contentType = String(
    response.headers.get('content-type') || '',
  ).toLowerCase();
  let payload: unknown = null;
  let bodyText = '';

  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      bodyText = await response.text().catch(() => '');
    }
  } else {
    bodyText = await response.text().catch(() => '');
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
  const fallbackMessage =
    `${response.status} ${response.statusText}`.trim() || 'Request failed.';
  const userMessage =
    structuredMessage || topLevelMessage || textMessage || fallbackMessage;

  const structuredCode = toNonEmptyString(structured?.code);
  const code = (structuredCode || `http.${response.status}`) as ApiErrorCode;

  const recoverable =
    typeof structured?.recoverable === 'boolean'
      ? structured.recoverable
      : response.status >= 500 || response.status === 429;

  const requestId =
    toNonEmptyString(structured?.requestId) ||
    toNonEmptyString(envelope?.requestId) ||
    null;

  const context =
    toRecord(structured?.context) || toRecord(envelope?.context) || null;

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
      Accept: 'application/json',
      ...(systemId ? { 'x-ds-system': systemId } : {}),
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    throw await buildApiError(response);
  }

  return (await response.json()) as T;
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  return getJson<T>(url, init);
}

export function fetchComponentCatalog(systemId?: string) {
  return getJson<ComponentCatalog>('/api/component-catalog', {
    headers: systemId ? { 'x-ds-system': systemId } : undefined,
  });
}

export interface CreateDesignSystemPayload {
  id: string;
  name: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  collections?: string[];
  compileVariablesOnCapture?: boolean;
  makeDefault?: boolean;
  detectedComponentsCount?: number;
  importedComponentsCount?: number;
  pendingComponentsCount?: number;
  importedComponentNames?: string[];
  pendingComponentNames?: string[];
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
  collections?: string[];
  compileVariablesOnCapture?: boolean;
  detectedComponentsCount?: number;
  importedComponentsCount?: number;
  pendingComponentsCount?: number;
  importedComponentNames?: string[];
  pendingComponentNames?: string[];
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

export interface UpdateDesignSystemPayload {
  name?: string;
  appName?: string;
  compileVariablesOnCapture?: boolean;
  makeDefault?: boolean;
  detectedComponentsCount?: number;
  importedComponentsCount?: number;
  pendingComponentsCount?: number;
  importedComponentNames?: string[];
  pendingComponentNames?: string[];
}

export function createDesignSystem(args: CreateDesignSystemPayload) {
  const payload = {
    ...args,
    figmaApiToken:
      args.figmaApiToken !== undefined
        ? normalizeEnvRef(args.figmaApiToken) || undefined
        : undefined,
  };
  return getJson<CreateDesignSystemResponse>('/api/design-systems', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch all design systems config.
 * NOTE: There is no single-system endpoint (GET /api/design-systems/:id).
 * For per-system admin views, callers must filter the returned list by id.
 * This avoids backend changes in the tabs migration iteration.
 * Consider adding a dedicated single-system endpoint in a future iteration
 * if performance or clarity demands it.
 */
export function fetchDesignSystemsConfig() {
  return getJson<DesignSystemsConfigResponse>('/api/design-systems');
}

export function updateDesignSystem(
  id: string,
  args: UpdateDesignSystemPayload,
) {
  const payload = { ...args };
  return getJson<MutateDesignSystemResponse>(
    `/api/design-systems/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
}

export function deleteDesignSystem(id: string) {
  return getJson<MutateDesignSystemResponse>(
    `/api/design-systems/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  );
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
  return getJson<DeletePreviewResponse>(
    `/api/design-systems/${encodeURIComponent(id)}/delete-preview`,
  );
}

export function fetchComponentUsageIndex() {
  return getJson<ComponentUsageIndex>('/api/component-usage-index');
}

export function fetchTokenCatalog() {
  return getJson<TokenCatalog>('/api/token-catalog');
}

export function fetchTokenCollectionTrees() {
  return getJson<TokenCollectionTreeIndex>('/api/token-collection-trees');
}

export function fetchTokenUsageIndex(systemId?: string) {
  const normalizedSystemId = String(systemId || '').trim();
  return getJson<TokenUsageIndex>('/api/token-usage-index', {
    headers: normalizedSystemId
      ? { 'x-ds-system': normalizedSystemId }
      : undefined,
  });
}

export function fetchTokenGraph() {
  return getJson<TokenGraphViz>('/api/token-graph');
}

export function fetchTokenGraphQuery(args: {
  tokenPath: string;
  direction?: TokenGraphQueryDirection;
  depth?: number;
}) {
  const params = new URLSearchParams({ token: args.tokenPath });
  if (args.direction) params.set('direction', args.direction);
  if (typeof args.depth === 'number' && Number.isFinite(args.depth)) {
    params.set('depth', String(args.depth));
  }
  return getJson<TokenGraphQueryResult>(
    `/api/token-graph-query?${params.toString()}`,
  );
}

export function fetchTokenHealth(systemId?: string) {
  const normalizedSystemId = String(systemId || '').trim();
  return getJson<TokenHealthReport>('/api/token-health', {
    headers: normalizedSystemId ? { 'x-ds-system': normalizedSystemId } : undefined,
  });
}

export function fetchHealthHistory(args?: {
  systemId?: string;
  range?: HealthHistoryRange;
  bucket?: HealthHistoryBucket;
}) {
  const params = new URLSearchParams();
  if (args?.range) params.set('range', args.range);
  if (args?.bucket) params.set('bucket', args.bucket);
  const suffix = params.size ? `?${params.toString()}` : '';
  const normalizedSystemId = String(args?.systemId || '').trim();
  return getJson<HealthHistoryReport>(`/api/health-history${suffix}`, {
    headers: normalizedSystemId ? { 'x-ds-system': normalizedSystemId } : undefined,
  });
}

export interface ComponentSpecPayload {
  ok: boolean;
  slug: string;
  exists: boolean;
  spec: unknown;
  updatedAt: number | null;
  savedKeys?: string[];
  message?: string;
  markdownSynced?: boolean;
}

export function fetchComponentSpec(slug: string) {
  return getJson<ComponentSpecPayload>(
    `/api/component-spec/${encodeURIComponent(slug)}`,
  );
}

export function patchEditorialSpec(args: {
  slug: string;
  expectedUpdatedAt?: number | null;
  fields: Record<string, unknown>;
}): Promise<ComponentSpecPatchEditorialResponse> {
  const timeoutMs = 15_000;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  return getJson<ComponentSpecPayload>(
    `/api/component-spec/${encodeURIComponent(args.slug)}/editorial`,
    {
      method: 'PATCH',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expectedUpdatedAt: args.expectedUpdatedAt ?? null,
        fields: args.fields,
      }),
    },
  )
    .then((payload) => ({
      ok: Boolean(payload.ok),
      slug: payload.slug,
      exists: Boolean(payload.exists),
      updatedAt: payload.updatedAt,
      savedKeys: Array.isArray(payload.savedKeys)
        ? payload.savedKeys
        : Object.keys(args.fields),
      // DB-first flow no longer depends on markdown regeneration.
      markdownSynced: payload.markdownSynced ?? true,
      message: payload.message || 'Editorial fields saved successfully.',
    }))
    .catch((error) => {
      const isAbortError =
        (typeof DOMException !== 'undefined' &&
          error instanceof DOMException &&
          error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError');
      if (!isAbortError) throw error;
      throw new ApiError({
        status: 408,
        statusText: 'Request Timeout',
        code: 'http.408' as ApiErrorCode,
        userMessage:
          'Saving summary timed out. The API may be busy; retry in a few seconds.',
        recoverable: true,
        context: {
          timeoutMs,
          endpoint: '/api/component-spec/:slug/editorial',
        },
      });
    })
    .finally(() => {
      globalThis.clearTimeout(timeoutId);
    });
}

const DEFAULT_QUEUE_POLL_INTERVAL_MS = 900;
const DEFAULT_QUEUE_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const QUEUE_ERROR_CODE_MISSING_NPM_SCRIPT = 'script.missing_npm_script';

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
  if (value === 'unknown error.' || value === 'unknown queue error.')
    return true;
  if (/^failed with code \d+$/i.test(value)) return true;
  if (
    /^queued operation finished with status '?(error|cancelled)'?\.?$/i.test(
      value,
    )
  )
    return true;
  return false;
}

function pickQueueFailureSummary(
  candidates: unknown[],
  fallback: string,
): string {
  const normalized = candidates
    .map((candidate) => toNonEmptyString(candidate))
    .filter(Boolean);
  if (normalized.length === 0) return fallback;
  const highSignal = normalized.find(
    (candidate) => !isLowSignalQueueSummary(candidate),
  );
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
  const figmaError = toRecord(resultPayload?.figma_error);
  const figmaErrorMessage = toNonEmptyString(figmaError?.message);
  const figmaErrorStatus =
    typeof figmaError?.status === 'number'
      ? String(figmaError.status)
      : toNonEmptyString(figmaError?.status);
  const figmaErrorEndpoint = toNonEmptyString(figmaError?.endpoint);
  const figmaErrorSummary =
    figmaErrorMessage ||
    (figmaErrorStatus ? `Figma API error ${figmaErrorStatus}` : '') ||
    (figmaErrorEndpoint ? `Figma request failed: ${figmaErrorEndpoint}` : '');
  const pipelinePhase = toNonEmptyString(
    resultPayload?.pipeline_phase,
  ).toLowerCase();
  const failed = Array.isArray(resultPayload?.failed)
    ? resultPayload.failed
    : [];
  const firstFailed = failed.length > 0 ? toRecord(failed[0]) : null;
  const events = Array.isArray(payload.events) ? payload.events : [];

  let lastErrorEventMessage = '';
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = toRecord(events[index]);
    if (!event) continue;
    const eventType = toNonEmptyString(event.type).toLowerCase();
    if (eventType === 'error') {
      lastErrorEventMessage = toNonEmptyString(event.message);
      if (lastErrorEventMessage) break;
    }
    if (eventType === 'end') {
      const endStatus = toNonEmptyString(event.status).toLowerCase();
      if (endStatus === 'error' || endStatus === 'cancelled') {
        lastErrorEventMessage = toNonEmptyString(event.summary);
        if (lastErrorEventMessage) break;
      }
    }
  }

  return pickQueueFailureSummary(
    [
      figmaErrorSummary,
      pipelinePhase ? `Failed during '${pipelinePhase}' phase.` : '',
      resultPayload?.error,
      resultPayload?.message,
      resultPayload?.stderr,
      firstFailed?.error,
      sync?.error,
      sync?.reason,
      sync?.stderr,
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
  return '';
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

export async function cancelQueueJob(
  jobId: string,
): Promise<CancelQueueJobResult> {
  const trimmedJobId = toNonEmptyString(jobId);
  if (!trimmedJobId) {
    throw new ApiError({
      status: 400,
      statusText: 'Bad Request',
      code: 'validation.missing_required_fields' as ApiErrorCode,
      userMessage: 'Job id is required to cancel a queued operation.',
      recoverable: true,
      context: { field: 'jobId' },
    });
  }
  return requestJson<CancelQueueJobResult>(
    `/api/jobs/${encodeURIComponent(trimmedJobId)}`,
    {
      method: 'DELETE',
    },
  );
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
    const separator = statusUrl.includes('?') ? '&' : '?';
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
    if (status === 'success') return payload;
    if (status === 'error' || status === 'cancelled') {
      const summary = findQueuePayloadFailureSummary(payload, status);
      throw new ApiError({
        status: 409,
        statusText: 'Conflict',
        code: 'queue.job_failed_or_cancelled' as ApiErrorCode,
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
    statusText: 'Request Timeout',
    code: 'queue.stream_timeout' as ApiErrorCode,
    userMessage: 'Timeout waiting for queued operation.',
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
  init?: Omit<RequestInit, 'method'>,
) {
  const accepted = await getJson<QueuedRefreshAcceptedPayload>(endpoint, {
    ...(init || {}),
    method: 'POST',
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

export async function refreshTokenUsageIndex(options?: QueueWaitOptions) {
  return runQueuedRefresh('/api/refresh-token-usage-index', options);
}

/**
 * Refresh token graph artifacts.
 * When `systemId` is provided we scope refresh via `x-ds-system`, which is
 * supported by the backend refresh route and consistent with other scoped APIs.
 */
export async function refreshTokenGraph(
  options?: QueueWaitOptions,
  systemId?: string,
) {
  const normalizedSystemId = String(systemId || '').trim();
  return runQueuedRefresh(
    '/api/refresh-token-graph',
    options,
    normalizedSystemId
      ? { headers: { 'x-ds-system': normalizedSystemId } }
      : undefined,
  );
}

export async function refreshTokenHealth(options?: QueueWaitOptions) {
  return runQueuedRefresh('/api/refresh-token-health', options);
}

export function restartApiServer() {
  return getJson<{
    ok: boolean;
    mode?: string;
    restartCommand?: string;
    message?: string;
    requestId?: string;
  }>('/api/admin/restart-api', {
    method: 'POST',
  });
}

export async function captureHealthSnapshot(args?: {
  systemId?: string;
  beforeRef?: string;
  retentionDays?: number;
  // DB-only mode keeps this flag for request compatibility, but does not compute token diff yet.
  skipDiff?: boolean;
}) {
  const normalizedSystemId = String(args?.systemId || '').trim();
  return getJson<CaptureHealthSnapshotResult>('/api/capture-health-snapshot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(normalizedSystemId ? { 'x-ds-system': normalizedSystemId } : {}),
    },
    body: JSON.stringify(
      args ? { ...args, systemId: undefined } : {},
    ),
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
  matchedBy: 'line' | 'query';
  snippet: string;
}

export interface CaptureFigmaScreenshotArgs {
  figmaUrl: string;
  figmaToken?: string;
  tokensSource?: 'auto' | 'mcp' | 'rest';
  componentSlug?: string;
  includeVariants?: boolean;
  variantLimit?: number;
  requireExistingDoc?: boolean;
  continueOnError?: boolean;
  refreshIndices?: boolean;
  dryRun?: boolean;
  scale?: number;
  format?: string;
  mainCaptureMode?: 'auto' | 'agent' | 'rest';
  componentKind?: 'component_set' | 'component' | 'all';
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
    doc_path: string;
    spec_path?: string;
    spec_exists?: boolean;
    figma_url?: string;
  }>;
  captured?: Array<{
    slug: string;
    node_id: string;
    doc_path: string;
    proof_file_path?: string | null;
    screenshot_url?: string | null;
    local_image_path?: string | null;
    variants_count?: number;
  }>;
  failed?: Array<{
    slug: string;
    node_id: string;
    doc_path: string;
    error: string;
  }>;
  skipped?: Array<Record<string, unknown>>;
  indices_refreshed?: boolean;
  tokens_bootstrap?: TokensBootstrapResult;
  tokens_compile?: TokensCompileResult;
  figma_error?: CaptureFigmaErrorDetail;
  error?: string;
  message?: string;
  stderr?: string;
}

export interface CaptureFigmaProgress {
  jobId?: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'cancelled';
  completed: number;
  total: number;
  remaining: number;
  currentSlug?: string;
  message?: string;
}

export interface SyncFigmaTokensArgs {
  url?: string;
  fileKey?: string;
  figmaToken?: string;
  tokensSource?: 'mcp';
  includeComponents?: boolean;
  dryRun?: boolean;
  selectedComponentNodeIds?: string[];
  /** When true, import fails if any imported component lacks a main screenshot. */
  requireComponentProofs?: boolean;
  /** When true, import fails if any component with variants lacks variant screenshots. */
  requireVariantProofsWhenPresent?: boolean;
}

export interface SyncFigmaTokensResult {
  ok: boolean;
  jobId?: string;
  tokens: number;
  tokenModeValues: number;
  aliases: number;
  components: number;
  componentsTruncated: boolean;
  usageRestored: number;
  usageDropped: number;
  dryRun: boolean;
  importMode?: 'full' | 'partial';
  selectedCount?: number;
  notSelectedCount?: number;
}

export interface ScanComponentsArgs {
  figmaUrl: string;
  figmaToken?: string;
  /** Page size (1..1000, default 500). */
  limit?: number;
  /** Page start index (default 0). */
  offset?: number;
  /** Optional session id to scope plugin-side pagination cache to a single scan flow. */
  scanSessionId?: string;
}

export interface ScanComponentEntry {
  nodeId: string;
  name: string;
  pageName: string;
}

export interface ScanComponentsResult {
  components: ScanComponentEntry[];
  truncated: boolean;
  limit: number;
  /** Total components matching filters before applying limit. */
  total: number;
  /** True when total is a lower-bound estimate due to guardrail. */
  totalIsEstimated: boolean;
  /** True when more results exist beyond this page. */
  hasMore: boolean;
  /** Offset for the next page, or null when no more pages. */
  nextOffset: number | null;
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
    type: 'COMPONENT' | 'COMPONENT_SET';
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
  transport?: {
    mode?: 'direct' | 'ws' | 'none';
    wsAlive?: boolean;
    heartbeatAlive?: boolean;
    livenessSource?: 'ws' | 'legacy' | 'hybrid' | 'none';
  };
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
    return await requestJson<FigmaMcpCapabilitiesResponse>(
      '/api/figma-mcp/capabilities',
      {
        method: 'GET',
        signal: controller.signal,
      },
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

interface McpTransportSignals {
  mode: 'direct' | 'ws' | 'none';
  wsAlive: boolean;
  heartbeatAlive: boolean;
}

function getMcpTransportSignals(
  payload: FigmaMcpCapabilitiesResponse,
): McpTransportSignals {
  return {
    mode: payload.transport?.mode ?? 'none',
    wsAlive: payload.transport?.wsAlive === true,
    heartbeatAlive: payload.transport?.heartbeatAlive === true,
  };
}

function isDirectTransportSessionUnavailable(
  signals: McpTransportSignals,
): boolean {
  return (
    signals.mode === 'direct' && !signals.wsAlive && signals.heartbeatAlive
  );
}

/**
 * Classify the reason for MCP disconnection based on capabilities payload.
 * Timeout cases are handled in pingFigmaMcp() catch (ApiError 408), so this
 * helper only classifies non-timeout disconnection states.
 */
function classifyPingDisconnectionReason(
  payload: FigmaMcpCapabilitiesResponse,
): 'no_plugin_session' | 'reachable_but_no_session' {
  const signals = getMcpTransportSignals(payload);
  if (isDirectTransportSessionUnavailable(signals)) {
    return 'reachable_but_no_session';
  }

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
  const signals = getMcpTransportSignals(payload);
  // In direct mode, a live WebSocket session is required for file-scoped operations
  // like component scan/spec. Heartbeat-only fallback should not be treated as connected.
  const connected =
    signals.mode === 'direct'
      ? signals.wsAlive
      : payload.mcp?.connected === true;
  if (connected) {
    return {
      ok: true,
      connected: true,
      code: 'mcp.connected',
      message: 'DS Graph connection is active.',
    };
  }

  // Classify disconnection reason for better UX
  const reason = classifyPingDisconnectionReason(payload);

  return {
    ok: false,
    connected: false,
    code: 'mcp.not_connected',
    message:
      (isDirectTransportSessionUnavailable(signals)
        ? 'Plugin heartbeat is active, but transport is not connected yet.'
        : payload.mcp?.message) ||
      (normalized.hasVariablesData
        ? 'DS Graph is reachable, but no active plugin session was found.'
        : 'No DS Graph plugin session is active. Open the Figma plugin and retry.'),
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
        (typeof DOMException !== 'undefined' &&
          error instanceof DOMException &&
          error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError');
      if (!isAbortError) throw error;
      throw new ApiError({
        status: 408,
        statusText: 'Request Timeout',
        code: 'http.408' as ApiErrorCode,
        userMessage:
          'DS Graph connectivity test timed out. Check that the Figma plugin is open and retry.',
        recoverable: true,
        context: {
          timeoutMs,
          endpoint: '/api/figma-mcp/capabilities',
        },
      });
    });
}

export async function getFigmaMcpHeartbeat(): Promise<FigmaMcpHeartbeatResult> {
  return requestJson<FigmaMcpHeartbeatResult>('/api/figma-mcp/heartbeat', {
    method: 'GET',
  });
}

export async function scanFigmaComponents(
  args: ScanComponentsArgs,
): Promise<ScanComponentsResult> {
  const rawLimit = Number(args.limit ?? 500);
  const requestedLimit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(Math.floor(rawLimit), 1000))
    : 500;
  const rawOffset = Number(args.offset ?? 0);
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.floor(rawOffset))
    : 0;
  const payload = await requestJson<Record<string, unknown>>(
    '/api/figma-mcp/search-components',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        figmaUrl: args.figmaUrl,
        figmaToken: args.figmaToken,
        limit: requestedLimit,
        offset,
        scanSessionId: args.scanSessionId,
        compact: true,
        includeVariants: false,
      }),
    },
  );

  const ok = payload.success === true || payload.ok === true;
  if (!ok) {
    const code = toNonEmptyString(payload.code);
    const msg =
      toNonEmptyString(payload.message) ||
      toNonEmptyString(payload.error) ||
      'Component scan failed';
    throw new Error(code ? `[${code}] ${msg}` : msg);
  }

  const components: ScanComponentEntry[] = Array.isArray(payload.components)
    ? payload.components
        .filter(
          (value): value is Record<string, unknown> =>
            value !== null &&
            typeof value === 'object' &&
            typeof (value as Record<string, unknown>).nodeId === 'string',
        )
        .map((entry) => ({
          nodeId: toNonEmptyString(entry.nodeId),
          name: toNonEmptyString(entry.name) || 'Unnamed',
          pageName: toNonEmptyString(entry.pageName) || 'Unknown',
        }))
        .filter((entry) => entry.nodeId.length > 0)
    : [];

  const rawNextOffset = Number(payload.nextOffset);
  const nextOffset = Number.isFinite(rawNextOffset)
    ? Math.max(0, Math.floor(rawNextOffset))
    : null;

  return {
    components,
    truncated: payload.truncated === true,
    limit: Number(payload.limit) || requestedLimit,
    total: Number(payload.total) || Number(payload.count) || components.length,
    totalIsEstimated: payload.totalIsEstimated === true,
    hasMore: payload.hasMore === true,
    nextOffset,
  };
}

export async function reconnectFigmaMcp(): Promise<FigmaMcpReconnectResult> {
  return requestJson<FigmaMcpReconnectResult>('/api/figma-mcp/reconnect', {
    method: 'POST',
    headers: {
      'x-ds-mcp-reconcile-confirm': 'true',
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
  if (fileUrl) params.set('fileUrl', fileUrl);
  if (nodeId) params.set('nodeId', nodeId);
  if (modeId) params.set('modeId', modeId);

  const query = params.size > 0 ? `?${params.toString()}` : '';
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
        method: 'GET',
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

function parseCaptureProgressSnapshot(
  raw: unknown,
): CaptureProgressSnapshot | null {
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
    if (!event || toNonEmptyString(event.type) !== 'chunk') continue;
    const text = typeof event.text === 'string' ? event.text : '';
    if (!text) continue;
    buffer += text;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const marker = '[capture-progress]';
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
  if (args.line) params.set('line', String(args.line));
  if (args.q) params.set('q', args.q);
  if (args.before !== undefined) params.set('before', String(args.before));
  if (args.after !== undefined) params.set('after', String(args.after));
  return getJson<FileSnippetPayload>(`/api/file-snippet?${params.toString()}`);
}

export async function captureFigmaScreenshot(
  args: CaptureFigmaScreenshotArgs,
  options?: {
    systemId?: string;
    onProgress?: (progress: CaptureFigmaProgress) => void;
  },
): Promise<CaptureFigmaScreenshotResult> {
  const accepted = await getJson<CaptureFigmaScreenshotResult>(
    '/api/capture-figma-screenshot',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.systemId ? { 'x-ds-system': options.systemId } : {}),
      },
      body: JSON.stringify(args),
    },
  );

  const statusUrl = toQueuedStatusUrl(accepted);
  if (!statusUrl) return accepted;

  const onProgress = options?.onProgress;
  const jobId =
    toNonEmptyString((accepted as { jobId?: unknown }).jobId) || undefined;
  let progressBuffer = '';
  let latestCompleted = 0;
  let latestTotal = 0;
  let latestSlug: string | undefined;

  onProgress?.({
    jobId,
    status: 'queued',
    completed: 0,
    total: 0,
    remaining: 0,
    message: 'Queued',
  });

  const finalState = await waitForQueuedJob(statusUrl, {
    onPoll: (payload) => {
      const job = toRecord(payload.job);
      const statusRaw = toNonEmptyString(job?.status).toLowerCase();
      const status: CaptureFigmaProgress['status'] =
        statusRaw === 'running'
          ? 'running'
          : statusRaw === 'success'
            ? 'success'
            : statusRaw === 'error'
              ? 'error'
              : statusRaw === 'cancelled'
                ? 'cancelled'
                : 'queued';

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
      status: typed.ok ? 'success' : 'error',
      completed,
      total,
      remaining: Math.max(0, total - completed),
      currentSlug: latestSlug,
    });
    return typed;
  }

  return accepted;
}

function toSyncFigmaTokensResult(
  value: unknown,
  fallbackJobId?: string,
): SyncFigmaTokensResult {
  const payload = toRecord(value) || {};
  const toNonNegativeInt = (input: unknown): number => {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  };
  const importModeRaw = toNonEmptyString(payload.importMode);
  return {
    ok: true,
    jobId: toNonEmptyString(payload.jobId) || fallbackJobId,
    tokens: toNonNegativeInt(payload.tokens),
    tokenModeValues: toNonNegativeInt(payload.tokenModeValues),
    aliases: toNonNegativeInt(payload.aliases),
    components: toNonNegativeInt(payload.components),
    componentsTruncated: payload.componentsTruncated === true,
    usageRestored: toNonNegativeInt(payload.usageRestored),
    usageDropped: toNonNegativeInt(payload.usageDropped),
    dryRun: payload.dryRun === true,
    importMode: importModeRaw === 'partial' ? 'partial' : 'full',
    selectedCount: toNonNegativeInt(payload.selectedCount),
    notSelectedCount: toNonNegativeInt(payload.notSelectedCount),
  };
}

export async function syncFigmaTokens(
  args: SyncFigmaTokensArgs,
  options?: {
    systemId?: string;
    onProgress?: (progress: CaptureFigmaProgress) => void;
  },
): Promise<SyncFigmaTokensResult> {
  const accepted = await getJson<QueuedRefreshAcceptedPayload>(
    '/api/sync-figma-tokens',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.systemId ? { 'x-ds-system': options.systemId } : {}),
      },
      body: JSON.stringify(args),
    },
  );

  const statusUrl = toQueuedStatusUrl(accepted);
  if (!statusUrl) {
    return toSyncFigmaTokensResult(accepted);
  }

  const onProgress = options?.onProgress;
  const acceptedJobId =
    toNonEmptyString((accepted as { jobId?: unknown }).jobId) || undefined;

  onProgress?.({
    jobId: acceptedJobId,
    status: 'queued',
    completed: 0,
    total: 0,
    remaining: 0,
    message: 'Queued',
  });

  const finalState = await waitForQueuedJob(statusUrl, {
    onPoll: (payload) => {
      const job = toRecord(payload.job);
      const statusRaw = toNonEmptyString(job?.status).toLowerCase();
      const status: CaptureFigmaProgress['status'] =
        statusRaw === 'running'
          ? 'running'
          : statusRaw === 'success'
            ? 'success'
            : statusRaw === 'error'
              ? 'error'
              : statusRaw === 'cancelled'
                ? 'cancelled'
                : 'queued';
      onProgress?.({
        jobId: toNonEmptyString(job?.id) || acceptedJobId,
        status,
        completed: 0,
        total: 0,
        remaining: 0,
      });
    },
  });

  const job = toRecord(finalState.job);
  const result = toRecord(job?.result);
  const payload = toRecord(result?.payload);
  const typed = toSyncFigmaTokensResult(
    payload || {},
    toNonEmptyString(job?.id) || acceptedJobId,
  );
  const scopeSystemId = String(
    options?.systemId || getActiveSystemId() || '',
  ).trim();
  if (scopeSystemId) {
    // Invalidate edit-docs localStorage scope after each successful sync/import for this system.
    bumpEditDocsStorageEpoch(scopeSystemId);
  }
  onProgress?.({
    jobId: typed.jobId,
    status: 'success',
    completed: typed.components,
    total: typed.components,
    remaining: 0,
  });
  return typed;
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
    status: (toNonEmptyString(row.status) as DsSyncRun['status']) || 'error',
    errorMessage:
      toNonEmptyString(row.errorMessage ?? row.error_message) || undefined,
    dsLastModified:
      toNonEmptyString(row.dsLastModified ?? row.ds_last_modified) || undefined,
    consumerLastModified:
      toNonEmptyString(
        row.consumerLastModified ?? row.consumer_last_modified,
      ) || undefined,
    componentCount: Number.isFinite(componentCount) ? componentCount : 0,
    variableCount: Number.isFinite(variableCount) ? variableCount : 0,
    warningCount: Number.isFinite(warningCount) ? warningCount : 0,
  };
}

function normalizeDsConsumerRecord(
  value: unknown,
): (DsConsumer & { latestSync?: DsSyncRun }) | null {
  const row = toRecord(value);
  if (!row) return null;
  const enabledRaw = row.enabled;
  const enabled =
    typeof enabledRaw === 'boolean'
      ? enabledRaw
      : typeof enabledRaw === 'number'
        ? enabledRaw !== 0
        : toNonEmptyString(enabledRaw) === '1' ||
          toNonEmptyString(enabledRaw).toLowerCase() === 'true';

  const latestSync = normalizeDsSyncRunRecord(
    row.latestSync ?? row.latest_sync,
  );

  return {
    id: toNonEmptyString(row.id),
    dsFileKey: toNonEmptyString(row.dsFileKey ?? row.ds_file_key),
    consumerFileKey: toNonEmptyString(
      row.consumerFileKey ?? row.consumer_file_key,
    ),
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
  return requestJson<{ ok: boolean; data: unknown }>(
    '/api/figma-mcp/dependencies/consumers',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  ).then((response) => {
    const normalized = normalizeDsConsumerRecord(response.data);
    if (!normalized) {
      warnInvalidConsumerPayload('addConsumer', response.data);
    }
    return {
      ok: response.ok,
      data: normalized || {
        id: '',
        dsFileKey: '',
        consumerFileKey: '',
        consumerName: '',
        enabled: true,
        createdAt: '',
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
        warnInvalidConsumerPayload('listConsumers', row);
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
      warnInvalidConsumerPayload('fetchConsumer', response.data);
    }
    return {
      ok: response.ok,
      data: normalized || {
        id: consumerId,
        dsFileKey: '',
        consumerFileKey: '',
        consumerName: '',
        enabled: true,
        createdAt: '',
      },
    } satisfies GetConsumerResponse;
  });
}

export function removeConsumer(consumerId: string) {
  return requestJson<RemoveConsumerResponse>(
    `/api/figma-mcp/dependencies/consumers/${encodeURIComponent(consumerId)}`,
    {
      method: 'DELETE',
    },
  );
}

export function updateConsumer(
  consumerId: string,
  payload: Partial<{ enabled: boolean }>,
) {
  return requestJson<{ ok: boolean; data: unknown }>(
    `/api/figma-mcp/dependencies/consumers/${encodeURIComponent(consumerId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  ).then((response) => {
    const normalized = normalizeDsConsumerRecord(response.data);
    if (!normalized) {
      warnInvalidConsumerPayload('updateConsumer', response.data);
    }
    return {
      ok: response.ok,
      data: normalized || {
        id: consumerId,
        dsFileKey: '',
        consumerFileKey: '',
        consumerName: '',
        enabled: payload.enabled ?? true,
        createdAt: '',
      },
    } satisfies UpdateConsumerResponse;
  });
}

export function syncConsumers(payload: SyncConsumersPayload) {
  return requestJson<SyncResult>('/api/figma-mcp/dependencies/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
  if (options?.staleOnly) params.set('stale', 'true');
  return getJson<ByFileReportResponse>(
    `/api/figma-mcp/dependencies/report/by-file?${params.toString()}`,
  );
}

export function fetchReportByComponent(
  dsFileKey: string,
  componentKey?: string,
) {
  const params = new URLSearchParams({ dsFileKey });
  if (componentKey) params.set('componentKey', componentKey);
  return getJson<ByComponentReportResponse>(
    `/api/figma-mcp/dependencies/report/by-component?${params.toString()}`,
  );
}

export function fetchReportByVariable(dsFileKey: string, variableKey?: string) {
  const params = new URLSearchParams({ dsFileKey });
  if (variableKey) params.set('variableKey', variableKey);
  return getJson<ByVariableReportResponse>(
    `/api/figma-mcp/dependencies/report/by-variable?${params.toString()}`,
  );
}

export function simulateVariableChange(payload: SimulateChangePayload) {
  return requestJson<SimulationResponse>(
    '/api/figma-mcp/dependencies/simulate-change',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
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
          console.warn(
            '[api:fetchConsumerSyncRuns] Invalid sync run payload shape',
            run,
          );
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
export function normalizeMcpCapabilities(
  payload: McpCapabilitiesPayload,
): NormalizedSupportFlags {
  // supportsV2 is always present in direct-only mode
  return {
    hasFileInfo: payload.supportsV2.hasFileInfo ?? false,
    hasComponent: payload.supportsV2.hasComponent ?? false,
    hasLocalStyles: payload.supportsV2.hasLocalStyles ?? false,
    hasVariablesData: payload.supportsV2.hasVariablesData ?? false,
    hasPortSwitch: payload.supportsV2.hasPortSwitch ?? false,
  };
}
