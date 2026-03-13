/**
 * Figma Direct Bridge Service
 *
 * Provides direct WebSocket communication with Figma plugin for
 * fetching variables, styles, and design system kit.
 */

import type { FigmaVariablesResponse } from '../../../../tooling/src/utils/figma.ts';
import type { DesignSystemKitResult } from '../../../../tooling/src/services/figma-mcp-variables.ts';
import { getPluginConnectionManager } from './plugin-connection-manager.ts';

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
  params: Record<string, unknown>,
  fileKey?: string | null
): Promise<T> {
  const manager = getPluginConnectionManager();
  const requestedFileKey = resolveFileKey(fileKey);

  try {
    return await manager.requestForFileKey<T>(
      requestedFileKey,
      method,
      params,
      DIRECT_REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    if (!requestedFileKey || !isNoSocketForFileError(error)) {
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
      params,
      DIRECT_REQUEST_TIMEOUT_MS
    );
  }
}

export async function fetchVariablesDirect(fileKey?: string | null): Promise<FigmaVariablesResponse> {
  const result = await requestDirectWithFileKeyFallback<GetVariablesDataResult>(
    'GET_VARIABLES_DATA',
    {},
    fileKey
  );

  return {
    meta: normalizeVariablesMeta(result),
  };
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
    setTimeout(() => {
      reject(new Error(`Design system kit fetch timeout after ${DESIGN_SYSTEM_KIT_TIMEOUT_MS}ms`));
    }, DESIGN_SYSTEM_KIT_TIMEOUT_MS);
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

  return {
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

function normalizeKitStyles(result: GetStylesResult): DesignSystemKitResult['styles'] {
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
