/**
 * Figma Direct Bridge Service
 *
 * Provides direct WebSocket communication with Figma plugin for
 * fetching variables, styles, and design system kit.
 */

import type { FigmaVariablesResponse } from '../../../../tooling/src/utils/figma.ts';
import type { DesignSystemKitResult } from '../../../../tooling/src/services/figma-mcp-variables.ts';
import type {
  BatchCreateVariablesParams as BridgeBatchCreateVariablesParams,
  BatchCreateVariablesResult as BridgeBatchCreateVariablesResult,
  BatchUpdateVariablesParams as BridgeBatchUpdateVariablesParams,
  BatchUpdateVariablesResult as BridgeBatchUpdateVariablesResult,
  ExportTokensParams as BridgeExportTokensParams,
  ExportTokensResult as BridgeExportTokensResult,
  GetTokenUsageParams as BridgeGetTokenUsageParams,
  GetTokenUsageResult as BridgeGetTokenUsageResult,
  SearchVariablesParams as BridgeSearchVariablesParams,
  SearchVariablesResult as BridgeSearchVariablesResult,
  GetNodesByIdParams as BridgeGetNodesByIdParams,
  GetNodesByIdResult as BridgeGetNodesByIdResult,
  SyncTokensApplyParams as BridgeSyncTokensApplyParams,
  SyncTokensApplyResult as BridgeSyncTokensApplyResult,
  SyncTokensPlanParams as BridgeSyncTokensPlanParams,
  SyncTokensPlanResult as BridgeSyncTokensPlanResult,
  TokenDiff as BridgeTokenDiff,
  TokenExportFormat as BridgeTokenExportFormat,
  TokenUsageEntry as BridgeTokenUsageEntry,
  // P2: Components & Token Bindings
  SearchComponentsParams,
  SearchComponentsResult,
  GetComponentSpecParams,
  GetComponentSpecResult,
  GetComponentImageParams,
  GetComponentImageResult,
  AuditTokenCoverageParams,
  AuditTokenCoverageResult,
  BindVariableParams,
  BindVariableResult,
  UnbindVariableParams,
  UnbindVariableResult,
  ApplyTokensParams,
  ApplyTokensResult,
} from '../../../figma-plugin/src/bridge/protocol.ts';
import { getPluginConnectionManager } from './plugin-connection-manager.ts';
import { getSharedResponseCache } from './response-cache.ts';

export interface GetVariablesDataResult {
  success: boolean;
  timestamp: number;
  fileKey: string | null;
  variables: VariableData[];
  variableCollections: VariableCollectionData[];
}

export interface VariableData {
  id: string;
  name: string;
  key: string;
  resolvedType: string;
  valuesByMode: Record<string, unknown>;
  variableCollectionId: string;
  scopes: string[];
  description: string;
  hiddenFromPublishing: boolean;
}

export interface VariableCollectionData {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
}

export interface GetStylesResult {
  success: boolean;
  timestamp: number;
  fileKey: string | null;
  styles: StyleData[];
}

export interface StyleData {
  id: string;
  name: string;
  styleType: string;
  description: string;
  key?: string;
}

const DIRECT_REQUEST_TIMEOUT_MS = 60_000;

export interface DirectRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Cache TTL for variables and design system kit (5 minutes).
 * Primary invalidation is via DOCUMENT_CHANGE events.
 */
const VARIABLES_CACHE_TTL_MS = 5 * 60 * 1000;
const DS_KIT_CACHE_TTL_MS = 5 * 60 * 1000;

function resolveFileKey(fileKey?: string | null): string | null {
  if (typeof fileKey === 'string' && fileKey.trim()) {
    return fileKey.trim();
  }
  return null;
}

function isNoSocketForFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return String(message).toLowerCase().includes('ws.request.no_socket_for_file');
}

/**
 * Route request by file key when available, with a strict fallback for
 * single-connection draft files (fileKey null in plugin runtime).
 */
async function requestDirectWithFileKeyFallback<T>(
  method: string,
  params: unknown,
  fileKey?: string | null,
  options: DirectRequestOptions = {},
): Promise<T> {
  const manager = getPluginConnectionManager();
  const requestedFileKey = resolveFileKey(fileKey);
  const timeoutMs = options.timeoutMs ?? DIRECT_REQUEST_TIMEOUT_MS;

  try {
    return await manager.requestForFileKey<T>(
      requestedFileKey,
      method,
      params as Record<string, unknown>,
      timeoutMs,
      options.signal
    );
  } catch (error) {
    if (!isNoSocketForFileError(error)) {
      throw error;
    }

    const debugInfo = manager.getDebugInfo();
    const canFallbackToSingleUnkeyedSocket =
      debugInfo.connectionCount === 1 && debugInfo.activeFileKeys.length === 0;

    if (!canFallbackToSingleUnkeyedSocket) {
      throw error;
    }

    console.warn(
      `[DirectBridge] No socket found for fileKey=${requestedFileKey}. ` +
      'Falling back to single unkeyed plugin connection.'
    );

    return await manager.requestForFileKey<T>(
      null,
      method,
      params as Record<string, unknown>,
      timeoutMs,
      options.signal
    );
  }
}

export async function fetchVariablesDirect(fileKey?: string | null): Promise<FigmaVariablesResponse> {
  const resolvedFileKey = resolveFileKey(fileKey);

  // Try cache first if we have a valid fileKey
  if (resolvedFileKey) {
    const cache = getSharedResponseCache();
    const cached = cache.get<FigmaVariablesResponse>(resolvedFileKey, 'variables');
    if (cached) {
      return cached;
    }
  }

  const result = await requestDirectWithFileKeyFallback<GetVariablesDataResult>(
    'GET_VARIABLES_DATA',
    {},
    fileKey
  );

  const response: FigmaVariablesResponse = {
    meta: normalizeVariablesMeta(result),
  };

  // Store in cache if we have a valid fileKey
  if (resolvedFileKey) {
    const cache = getSharedResponseCache();
    cache.set(resolvedFileKey, 'variables', response, VARIABLES_CACHE_TTL_MS);
  }

  return response;
}

export async function fetchStylesDirect(fileKey?: string | null): Promise<GetStylesResult> {
  return await requestDirectWithFileKeyFallback<GetStylesResult>(
    'GET_LOCAL_STYLES',
    {},
    fileKey
  );
}

/**
 * Timeout for fetchDesignSystemKitDirect global operation (ms)
 * This is a watchdog timeout - individual requests have their own timeouts,
 * but this prevents the allSettled from hanging if something goes wrong.
 */
const DESIGN_SYSTEM_KIT_TIMEOUT_MS = 90_000; // 90 seconds

export interface DesignSystemKitQueryOptions {
  /**
   * Legacy compatibility alias from previous MCP contract.
   * Accepted values (e.g. summary/full/compact) are currently treated as no-op in direct mode.
   */
  format?: string;
  /**
   * Optional section filter for compatibility and payload control.
   * Supported values: tokens, styles.
   */
  include?: string[];
}

export async function fetchDesignSystemKitDirect(
  fileKey?: string | null,
  options: DesignSystemKitQueryOptions = {}
): Promise<DesignSystemKitResult> {
  const resolvedFileKey = resolveFileKey(fileKey);

  // Try cache first if we have a valid fileKey
  if (resolvedFileKey) {
    const cache = getSharedResponseCache();
    const cached = cache.get<DesignSystemKitResult>(resolvedFileKey, 'design-system-kit');
    if (cached) {
      return cached;
    }
  }

  const startedAt = Date.now();

  // Use Promise.allSettled for fault tolerance - styles may fail on older plugins
  // Wrap in timeout to prevent hanging if something goes wrong
  const allSettledPromise = Promise.allSettled([
    fetchVariablesDirect(fileKey),
    fetchStylesDirect(fileKey),
  ]);

  // Timeout promise that only rejects (never resolves) - use Promise<never> to avoid
  // contaminating the type inference of Promise.race
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Design system kit fetch timeout after ${DESIGN_SYSTEM_KIT_TIMEOUT_MS}ms`));
    }, DESIGN_SYSTEM_KIT_TIMEOUT_MS);
    timeoutId.unref?.();
  });

  const [variablesResult, stylesResult] = await Promise.race([allSettledPromise, timeoutPromise]);

  // Variables are required - if they fail, throw
  if (variablesResult.status === 'rejected') {
    console.error('[DirectBridge] fetchVariablesDirect failed:', variablesResult.reason);
    throw variablesResult.reason;
  }

  // Styles are optional - if they fail, log warning and return empty array
  let styles: GetStylesResult['styles'] = [];
  if (stylesResult.status === 'rejected') {
    console.warn('[DirectBridge] fetchStylesDirect failed (may be unsupported by plugin):', stylesResult.reason);
  } else {
    styles = stylesResult.value.styles ?? [];
  }

  const include = new Set((options.include ?? []).map((part) => part.trim().toLowerCase()).filter(Boolean));
  const includeTokens = include.size === 0 || include.has('tokens');
  const includeStyles = include.size === 0 || include.has('styles');

  const result: DesignSystemKitResult = {
    ok: true,
    ...(includeTokens
      ? {
        tokens: {
          variables: variablesResult.value.meta.variables,
          variableCollections: variablesResult.value.meta.variableCollections,
        },
      }
      : {}),
    ...(includeStyles ? { styles: normalizeKitStyles({ styles }) } : {}),
    elapsedMs: Date.now() - startedAt,
  };

  // Store in cache if we have a valid fileKey
  if (resolvedFileKey) {
    const cache = getSharedResponseCache();
    cache.set(resolvedFileKey, 'design-system-kit', result, DS_KIT_CACHE_TTL_MS);
  }

  return result;
}

export function normalizeVariablesMeta(result: GetVariablesDataResult): FigmaVariablesResponse['meta'] {
  const variables: FigmaVariablesResponse['meta']['variables'] = {};
  const variableCollections: FigmaVariablesResponse['meta']['variableCollections'] = {};

  for (const variable of result.variables ?? []) {
    variables[variable.id] = {
      id: variable.id,
      name: variable.name,
      variableCollectionId: variable.variableCollectionId,
      resolvedType: variable.resolvedType,
      valuesByMode: variable.valuesByMode,
      ...(typeof variable.key === 'string' ? { key: variable.key } : {}),
    };
  }

  for (const collection of result.variableCollections ?? []) {
    variableCollections[collection.id] = {
      id: collection.id,
      name: collection.name,
      modes: collection.modes,
    };
  }

  return { variables, variableCollections };
}

function normalizeKitStyles(result: { styles?: StyleData[] }): DesignSystemKitResult['styles'] {
  return (result.styles ?? []).map((style) => ({
    id: style.id,
    name: style.name,
    styleType: style.styleType,
    description: style.description,
    key: style.key,
  }));
}

export interface BridgeCapabilitiesDirectResult {
  ok: true;
  supportedMethods: string[];
  pluginVersion: string;
  pluginBuild: string;
  timestamp: number;
  elapsedMs: number;
}

/**
 * Fetch bridge capabilities directly via WebSocket.
 * Returns list of supported methods and plugin metadata.
 */
export async function fetchBridgeCapabilitiesDirect(): Promise<BridgeCapabilitiesDirectResult> {
  const startedAt = Date.now();
  const manager = getPluginConnectionManager();

  // Get capabilities from any active connection (doesn't require fileKey)
  const result = await manager.requestForFileKey<{
    supportedMethods: string[];
    pluginVersion: string;
    pluginBuild: string;
    timestamp: number;
  }>(
    null, // fileKey not needed for capabilities
    'GET_BRIDGE_CAPABILITIES',
    {},
    DIRECT_REQUEST_TIMEOUT_MS
  );

  return {
    ok: true,
    supportedMethods: result.supportedMethods,
    pluginVersion: result.pluginVersion,
    pluginBuild: result.pluginBuild,
    timestamp: result.timestamp,
    elapsedMs: Date.now() - startedAt,
  };
}

// ============================================================================
// P1: Enhanced Variables (Direct Bridge)
// ============================================================================

export type SearchVariablesParams = BridgeSearchVariablesParams;
export type SearchVariablesResult = BridgeSearchVariablesResult;

export async function searchVariablesDirect(
  fileKey: string | null,
  params: SearchVariablesParams
): Promise<SearchVariablesResult> {
  return await requestDirectWithFileKeyFallback<SearchVariablesResult>(
    'SEARCH_VARIABLES',
    params,
    fileKey
  );
}

export type GetNodesByIdParams = BridgeGetNodesByIdParams;
export type GetNodesByIdResult = BridgeGetNodesByIdResult;

export async function getNodesByIdDirect(
  fileKey: string | null,
  params: GetNodesByIdParams
): Promise<GetNodesByIdResult> {
  return await requestDirectWithFileKeyFallback<GetNodesByIdResult>(
    'GET_NODES_BY_ID',
    params,
    fileKey
  );
}

export type BatchCreateVariablesParams = BridgeBatchCreateVariablesParams;
export type BatchCreateVariablesResult = BridgeBatchCreateVariablesResult;

export async function batchCreateVariablesDirect(
  fileKey: string | null,
  params: BatchCreateVariablesParams
): Promise<BatchCreateVariablesResult> {
  return await requestDirectWithFileKeyFallback<BatchCreateVariablesResult>(
    'BATCH_CREATE_VARIABLES',
    params,
    fileKey
  );
}

export type BatchUpdateVariablesParams = BridgeBatchUpdateVariablesParams;
export type BatchUpdateVariablesResult = BridgeBatchUpdateVariablesResult;

export async function batchUpdateVariablesDirect(
  fileKey: string | null,
  params: BatchUpdateVariablesParams
): Promise<BatchUpdateVariablesResult> {
  return await requestDirectWithFileKeyFallback<BatchUpdateVariablesResult>(
    'BATCH_UPDATE_VARIABLES',
    params,
    fileKey
  );
}

export type TokenExportFormat = BridgeTokenExportFormat;
export type ExportTokensParams = BridgeExportTokensParams;
export type ExportTokensResult = BridgeExportTokensResult;

export async function exportTokensDirect(
  fileKey: string | null,
  params: ExportTokensParams
): Promise<ExportTokensResult> {
  return await requestDirectWithFileKeyFallback<ExportTokensResult>(
    'EXPORT_TOKENS',
    params,
    fileKey
  );
}

export type SyncTokensPlanParams = BridgeSyncTokensPlanParams;
export type TokenDiff = BridgeTokenDiff;
export type SyncTokensPlanResult = BridgeSyncTokensPlanResult;

export async function syncTokensPlanDirect(
  fileKey: string | null,
  params: SyncTokensPlanParams
): Promise<SyncTokensPlanResult> {
  return await requestDirectWithFileKeyFallback<SyncTokensPlanResult>(
    'SYNC_TOKENS_PLAN',
    params,
    fileKey
  );
}

export type SyncTokensApplyParams = BridgeSyncTokensApplyParams;
export type SyncTokensApplyResult = BridgeSyncTokensApplyResult;

export async function syncTokensApplyDirect(
  fileKey: string | null,
  params: SyncTokensApplyParams
): Promise<SyncTokensApplyResult> {
  return await requestDirectWithFileKeyFallback<SyncTokensApplyResult>(
    'SYNC_TOKENS_APPLY',
    params,
    fileKey
  );
}

export type GetTokenUsageParams = BridgeGetTokenUsageParams;
export type TokenUsageEntry = BridgeTokenUsageEntry;
export type GetTokenUsageResult = BridgeGetTokenUsageResult;

export async function getTokenUsageDirect(
  fileKey: string | null,
  params: GetTokenUsageParams,
  signal?: AbortSignal
): Promise<GetTokenUsageResult> {
  return await requestDirectWithFileKeyFallback<GetTokenUsageResult>(
    'GET_TOKEN_USAGE',
    params,
    fileKey,
    { signal }
  );
}

// ============================================================================
// P2: Components & Token Bindings (Direct Bridge)
// ============================================================================
// Intentionally no ResponseCache for SEARCH_COMPONENTS/GET_COMPONENT_SPEC in P2.
// Caching is deferred to the broader P0a cache pass to keep P2 scope focused.

export async function searchComponentsDirect(
  fileKey: string | null,
  params: SearchComponentsParams
): Promise<SearchComponentsResult> {
  // Keep this as a transparent pass-through to the plugin protocol:
  // pagination/session fields in params and result (offset/hasMore/nextOffset/scanSessionId)
  // are intentionally not remapped here.
  return await requestDirectWithFileKeyFallback<SearchComponentsResult>(
    'SEARCH_COMPONENTS',
    params,
    fileKey
  );
}

export async function getComponentSpecDirect(
  fileKey: string | null,
  params: GetComponentSpecParams
): Promise<GetComponentSpecResult> {
  return await requestDirectWithFileKeyFallback<GetComponentSpecResult>(
    'GET_COMPONENT_SPEC',
    params,
    fileKey
  );
}

export async function getComponentImageDirect(
  fileKey: string | null,
  params: GetComponentImageParams
): Promise<GetComponentImageResult> {
  return await requestDirectWithFileKeyFallback<GetComponentImageResult>(
    'GET_COMPONENT_IMAGE',
    params,
    fileKey
  );
}

export async function auditTokenCoverageDirect(
  fileKey: string | null,
  params: AuditTokenCoverageParams
): Promise<AuditTokenCoverageResult> {
  return await requestDirectWithFileKeyFallback<AuditTokenCoverageResult>(
    'AUDIT_COMPONENT_TOKEN_COVERAGE',
    params,
    fileKey
  );
}

export async function bindVariableDirect(
  fileKey: string | null,
  params: BindVariableParams
): Promise<BindVariableResult> {
  return await requestDirectWithFileKeyFallback<BindVariableResult>(
    'BIND_VARIABLE',
    params,
    fileKey
  );
}

export async function unbindVariableDirect(
  fileKey: string | null,
  params: UnbindVariableParams
): Promise<UnbindVariableResult> {
  return await requestDirectWithFileKeyFallback<UnbindVariableResult>(
    'UNBIND_VARIABLE',
    params,
    fileKey
  );
}

export async function applyTokensDirect(
  fileKey: string | null,
  params: ApplyTokensParams
): Promise<ApplyTokensResult> {
  return await requestDirectWithFileKeyFallback<ApplyTokensResult>(
    'APPLY_TOKENS_TO_COMPONENT',
    params,
    fileKey
  );
}
