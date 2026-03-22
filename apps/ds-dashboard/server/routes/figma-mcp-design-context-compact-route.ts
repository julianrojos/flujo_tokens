/**
 * Figma MCP Design Context Compact Route
 *
 * Read-only endpoint to fetch a compact, token-efficient design context payload.
 *
 * Endpoint:
 *   GET /api/figma-mcp/design-context-compact
 *
 * Query params:
 *   fileUrl?: string - Figma file URL to disambiguate multi-file sessions
 *   nodeId?: string - Explicit node ID target (falls back to first selected node)
 *   modeId?: string - Preferred variable mode when resolving token values
 *
 * Auth:
 *   Allowed from loopback addresses or with trusted internal token.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';

import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import {
  resolveFileKeyFromManager,
  isFileKeySuccess,
  type FileKeyResult,
} from '../lib/filekey-utils.ts';
import {
  fetchVariablesDirect,
  getNodesByIdDirect,
  getComponentSpecDirect,
} from '../services/figma-direct-bridge-service.ts';
import {
  getPluginConnectionManager,
  type SelectionBufferEntry,
} from '../services/plugin-connection-manager.ts';

type VariablesResult = Awaited<ReturnType<typeof fetchVariablesDirect>>;
type NodesByIdResult = Awaited<ReturnType<typeof getNodesByIdDirect>>;
type ComponentSpecResult = Awaited<ReturnType<typeof getComponentSpecDirect>>;

interface CompactNodeSummary {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
}

interface CompactComponentSummary {
  nodeId: string;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  description: string | null;
  props: Array<{ name: string; type: string }>;
  states: string[];
  variantAxes: Array<{ name: string; values: string[] }>;
  tokenBindingCount: number;
}

interface CompactTokenItem {
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
}

interface CompactSelectionSummary {
  count: number;
  page: string | null;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    width: number | null;
    height: number | null;
  }>;
}

interface DesignContextCompactResponse {
  ok: true;
  fileKey: string | null;
  targetNodeId: string | null;
  selection: CompactSelectionSummary;
  node: CompactNodeSummary | null;
  component: CompactComponentSummary | null;
  tokens: {
    requestedModeId: string | null;
    count: number;
    missingCount: number;
    modeFallbackCount: number;
    items: CompactTokenItem[];
  };
  warnings: string[];
}

export interface FigmaMcpDesignContextCompactRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  resolveFileKeyFromManagerFn?: (
    fileUrl: string | undefined,
    errorCodes?: Parameters<typeof resolveFileKeyFromManager>[1],
  ) => FileKeyResult;
  fetchVariablesDirectFn?: typeof fetchVariablesDirect;
  getNodesByIdDirectFn?: typeof getNodesByIdDirect;
  getComponentSpecDirectFn?: typeof getComponentSpecDirect;
  getSelectionFn?: (fileKey?: string | null) => SelectionBufferEntry | null;
}

function normalizeInternalToken(value: string | undefined): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isAuthorized(
  c: Context,
  internalToken: string | undefined,
  getConnInfoFn: (c: Context) => ConnInfo,
): boolean {
  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address ?? '').trim();
  if (remoteAddress && isLoopbackAddress(remoteAddress)) return true;
  const trustedToken = normalizeInternalToken(internalToken);
  if (!trustedToken) return false;
  const received = normalizeInternalToken(c.req.header('x-ds-dashboard-internal-token'));
  return Boolean(received) && received === trustedToken;
}

function isVariableAliasValue(value: unknown): value is { type: 'VARIABLE_ALIAS'; id: string } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.type === 'VARIABLE_ALIAS' && typeof record.id === 'string';
}

function asCompactSelection(selection: SelectionBufferEntry | null): CompactSelectionSummary {
  if (!selection) {
    return { count: 0, page: null, nodes: [] };
  }
  return {
    count: selection.count,
    page: selection.page,
    nodes: (selection.nodes ?? []).map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      width: typeof node.width === 'number' ? node.width : null,
      height: typeof node.height === 'number' ? node.height : null,
    })),
  };
}

function pickModeValue(
  valuesByMode: Record<string, unknown>,
  requestedModeId: string | undefined,
): { modeId: string | null; value: unknown; usedFallback: boolean } {
  if (
    requestedModeId &&
    Object.prototype.hasOwnProperty.call(valuesByMode, requestedModeId)
  ) {
    return {
      modeId: requestedModeId,
      value: valuesByMode[requestedModeId],
      usedFallback: false,
    };
  }

  const firstModeId = Object.keys(valuesByMode)[0];
  if (!firstModeId) {
    return { modeId: null, value: null, usedFallback: Boolean(requestedModeId) };
  }

  return {
    modeId: firstModeId,
    value: valuesByMode[firstModeId],
    usedFallback: Boolean(requestedModeId) && requestedModeId !== firstModeId,
  };
}

function collectTokenIds(spec: ComponentSpecResult): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (value: unknown): void => {
    if (typeof value !== 'string' || !value || seen.has(value)) return;
    seen.add(value);
    ordered.push(value);
  };

  for (const binding of spec.tokenBindings ?? []) {
    push(binding.variableId);
  }

  for (const variant of spec.variants ?? []) {
    for (const token of variant.layerTokens ?? []) {
      push(token.variableId);
    }
  }

  return ordered;
}

function toCompactNode(
  nodesResult: NodesByIdResult,
  targetNodeId: string,
): CompactNodeSummary | null {
  const node = nodesResult.nodes[targetNodeId];
  if (!node) return null;
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    parentId: node.parentId,
    x: typeof node.x === 'number' ? node.x : null,
    y: typeof node.y === 'number' ? node.y : null,
    width: typeof node.width === 'number' ? node.width : null,
    height: typeof node.height === 'number' ? node.height : null,
  };
}

function toCompactComponent(spec: ComponentSpecResult): CompactComponentSummary {
  return {
    nodeId: spec.nodeId,
    name: spec.name,
    type: spec.type,
    description: spec.description,
    props: (spec.props ?? []).map((prop) => ({ name: prop.name, type: prop.type })),
    states: spec.states ?? [],
    variantAxes: spec.variantAxes ?? [],
    tokenBindingCount: collectTokenIds(spec).length,
  };
}

function isNonComponentSpecError(message: string): boolean {
  return message.includes('Node must be COMPONENT or COMPONENT_SET');
}

function isNoSocketError(message: string): boolean {
  return message.includes('ws.request.no_socket_for_file');
}

function createDeps(
  deps: FigmaMcpDesignContextCompactRouteDeps,
): Required<FigmaMcpDesignContextCompactRouteDeps> {
  const manager = getPluginConnectionManager();
  return {
    getConnInfoFn: deps.getConnInfoFn ?? getConnInfo,
    internalToken:
      deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN ?? '',
    resolveFileKeyFromManagerFn:
      deps.resolveFileKeyFromManagerFn ?? resolveFileKeyFromManager,
    fetchVariablesDirectFn: deps.fetchVariablesDirectFn ?? fetchVariablesDirect,
    getNodesByIdDirectFn: deps.getNodesByIdDirectFn ?? getNodesByIdDirect,
    getComponentSpecDirectFn: deps.getComponentSpecDirectFn ?? getComponentSpecDirect,
    getSelectionFn: deps.getSelectionFn ?? ((fileKey) => manager.getSelection(fileKey)),
  };
}

/**
 * GET /api/figma-mcp/design-context-compact
 */
export async function handleGetDesignContextCompact(
  c: Context,
  deps: FigmaMcpDesignContextCompactRouteDeps = {},
): Promise<Response> {
  const resolvedDeps = createDeps(deps);

  if (
    !isAuthorized(
      c,
      resolvedDeps.internalToken || undefined,
      resolvedDeps.getConnInfoFn,
    )
  ) {
    return c.json(
      {
        ok: false,
        code: 'context_compact.forbidden_remote',
        message: 'Endpoint only accessible from loopback or with internal token.',
      },
      403,
    );
  }

  const fileUrl = c.req.query('fileUrl') ?? undefined;
  const requestedNodeId = String(c.req.query('nodeId') ?? '').trim() || undefined;
  const requestedModeId = String(c.req.query('modeId') ?? '').trim() || undefined;

  const fileKeyResult = resolvedDeps.resolveFileKeyFromManagerFn(fileUrl, {
    ambiguous: 'context_compact.ambiguous_file_key',
    noSocket: 'context_compact.no_socket',
    ambiguousMessage:
      'Multiple plugin connections for different files detected. Provide a fileUrl to disambiguate.',
    noSocketMessage:
      'No plugin connection available. Open the Figma plugin and keep it connected.',
  });

  if (!isFileKeySuccess(fileKeyResult)) {
    return c.json(fileKeyResult, 200);
  }

  const fileKey = fileKeyResult.fileKey;
  const warnings: string[] = [];

  const selection = resolvedDeps.getSelectionFn(fileKey);
  const compactSelection = asCompactSelection(selection);

  const targetNodeId = requestedNodeId ?? compactSelection.nodes[0]?.id ?? null;
  if (!requestedNodeId && !targetNodeId) {
    warnings.push('No node selected. Pass nodeId or select a node in Figma.');
  }

  try {
    const variablesResult = await resolvedDeps.fetchVariablesDirectFn(fileKey);

    if (!targetNodeId) {
      const emptyResponse: DesignContextCompactResponse = {
        ok: true,
        fileKey,
        targetNodeId: null,
        selection: compactSelection,
        node: null,
        component: null,
        tokens: {
          requestedModeId: requestedModeId ?? null,
          count: 0,
          missingCount: 0,
          modeFallbackCount: 0,
          items: [],
        },
        warnings,
      };
      return c.json(emptyResponse, 200);
    }

    const nodesById = await resolvedDeps.getNodesByIdDirectFn(fileKey, {
      nodeIds: [targetNodeId],
      depth: 'compact',
    });
    const compactNode = toCompactNode(nodesById, targetNodeId);

    if (!compactNode) {
      return c.json(
        {
          ok: false,
          code: 'context_compact.node_not_found',
          message: `Node not found: ${targetNodeId}`,
        },
        404,
      );
    }

    let componentSpec: ComponentSpecResult | null = null;
    try {
      componentSpec = await resolvedDeps.getComponentSpecDirectFn(fileKey, {
        nodeId: targetNodeId,
        depth: 1,
        compact: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isNonComponentSpecError(message)) {
        warnings.push(`Component spec unavailable: ${message}`);
      }
    }

    const tokenIds = componentSpec ? collectTokenIds(componentSpec) : [];
    if (!componentSpec) {
      warnings.push('Token extraction is component-scoped for this endpoint.');
    }

    const variablesById = variablesResult.meta.variables ?? {};
    const collectionsById = variablesResult.meta.variableCollections ?? {};
    const tokenItems: CompactTokenItem[] = [];
    let missingCount = 0;
    let modeFallbackCount = 0;

    for (const tokenId of tokenIds) {
      const variable = variablesById[tokenId];
      if (!variable) {
        missingCount += 1;
        continue;
      }

      const collection = collectionsById[variable.variableCollectionId];
      const mode = pickModeValue(variable.valuesByMode ?? {}, requestedModeId);
      if (mode.usedFallback) {
        modeFallbackCount += 1;
      }

      const alias = isVariableAliasValue(mode.value);
      const modeName =
        mode.modeId && collection?.modes
          ? collection.modes.find((item) => item.modeId === mode.modeId)?.name ?? null
          : null;

      tokenItems.push({
        id: variable.id,
        name: variable.name,
        resolvedType: variable.resolvedType,
        collectionId: variable.variableCollectionId,
        collectionName: collection?.name ?? null,
        modeId: mode.modeId,
        modeName,
        value: mode.value,
        isAlias: alias,
        aliasToVariableId: alias ? mode.value.id : null,
      });
    }

    const response: DesignContextCompactResponse = {
      ok: true,
      fileKey,
      targetNodeId,
      selection: compactSelection,
      node: compactNode,
      component: componentSpec ? toCompactComponent(componentSpec) : null,
      tokens: {
        requestedModeId: requestedModeId ?? null,
        count: tokenItems.length,
        missingCount,
        modeFallbackCount,
        items: tokenItems,
      },
      warnings,
    };

    return c.json(response, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isNoSocketError(message)) {
      return c.json(
        {
          ok: false,
          code: 'context_compact.no_socket',
          message: 'No plugin connection available. Open the Figma plugin and ensure it is connected.',
        },
        200,
      );
    }

    return c.json(
      {
        ok: false,
        code: 'context_compact.direct_failed',
        message,
      },
      200,
    );
  }
}

export function registerFigmaMcpDesignContextCompactRoute(
  app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpDesignContextCompactRouteDeps = {},
): void {
  app.get('/api/figma-mcp/design-context-compact', (c) =>
    handleGetDesignContextCompact(c, deps),
  );
}
