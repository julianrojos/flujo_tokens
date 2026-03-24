import { fetchFigmaFile, fetchFigmaLocalVariables, fetchFigmaFileComponents, FigmaApiError } from '../../../../tooling/src/utils/figma-api.js';
import { fetchFigmaLocalVariablesViaMcp, type FigmaVariablesResponse } from '../../../../tooling/src/services/figma-mcp-variables.js';
import { getTokenUsageDirect, type TokenUsageEntry } from './figma-direct-bridge-service.js';

// Types for Figma API responses (using imported types)
interface FigmaNode {
  id: string;
  name: string;
  type: string;
  componentId?: string;
  boundVariables?: Record<string, { id: string; type: string } | Array<{ id: string; type: string }> | null | undefined>;
  children?: FigmaNode[];
}

interface FigmaFile {
  name: string;
  lastModified: string;
  document: FigmaNode;
  components?: Record<string, { key: string; name: string }>;
}

// DS catalog types
export interface DsComponentCatalog {
  key: string;
  name: string;
  id: string;
}

export interface DsVariableCatalog {
  key: string;
  id: string;
  name: string;
  type: string;
  collectionId: string;
}

export interface DsCatalog {
  components: Map<string, DsComponentCatalog>;  // key -> component
  variables: Map<string, DsVariableCatalog>;    // key -> variable
  variableIdToKey: Map<string, string>;         // id -> key (fallback)
}

// Consumer scan results
export interface ComponentInstance {
  componentKey: string;
  componentName: string;
  nodeIds: string[];
}

export interface VariableBinding {
  variableKey: string;
  variableId: string;
  variableName: string;
  variableType: string;
  nodeIds: string[];
}

export interface ConsumerScanResult {
  componentInstances: ComponentInstance[];
  variableBindings: VariableBinding[];
  warnings: Array<{
    code: string;
    message: string;
    nodeId?: string;
  }>;
}

/**
 * Keep a bounded sample of node IDs per usage entry to avoid large payloads.
 */
const MAX_CAPTURED_NODE_IDS_PER_ENTRY = 200;
/**
 * Emit unmatched-component diagnostics only when unresolved instances are significant.
 */
const UNMATCHED_COMPONENT_WARNING_THRESHOLD = 5;
/**
 * Cap stored unmatched component IDs while still tracking full unresolved count.
 */
const MAX_UNMATCHED_COMPONENT_IDS_SAMPLE = 100;
/**
 * Avoid costly MCP scans for tiny unresolved counts in mixed resolution scenarios.
 */
const MCP_FALLBACK_MIN_UNRESOLVED_BINDINGS = 5;

function isLikelyFigmaVariableKey(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

/**
 * Decide whether live MCP token-usage fallback is worth running.
 * We trigger it when unresolved bindings exist and static catalogs are insufficient,
 * to avoid expensive plugin scans on every sync.
 *
 * Triggers when ANY of these conditions are met:
 * - No variables bound yet (variableBindingsCount === 0)
 * - DS catalog is empty (dsCatalogVariableCount === 0)
 * - Unresolved bindings significantly exceed resolved ones (>50% ratio)
 */
function shouldAttemptMcpVariableFallback(args: {
  unresolvedBoundVariableCount: number;
  variableBindingsCount: number;
  dsCatalogVariableCount: number;
}): boolean {
  const { unresolvedBoundVariableCount, variableBindingsCount, dsCatalogVariableCount } = args;
  if (unresolvedBoundVariableCount <= 0) return false;

  // Trigger if no bindings or empty catalog
  if (variableBindingsCount === 0 || dsCatalogVariableCount === 0) return true;

  // Trigger if unresolved bindings significantly exceed resolved ones (>50% ratio)
  if (unresolvedBoundVariableCount < MCP_FALLBACK_MIN_UNRESOLVED_BINDINGS) return false;
  const unresolvedRatio = unresolvedBoundVariableCount / variableBindingsCount;
  return unresolvedRatio > 0.5;
}

async function fetchConsumerBoundVariableUsageViaMcp(
  fileKey: string,
): Promise<TokenUsageEntry[] | null> {
  try {
    const result = await getTokenUsageDirect(fileKey, {
      force: true,
      maxNodes: 15000,
    });
    return Array.isArray(result.usage) ? result.usage : [];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[scanConsumerFile] MCP token usage fallback failed: ${detail}`);
    return null;
  }
}

export interface FileMetadata {
  name: string;
  lastModified: string;
}

function createCodedError(
  code: string,
  message: string,
  options?: { cause?: unknown },
): Error & { code: string } {
  const error = new Error(message, options);
  return Object.assign(error, { code });
}

function buildConsumerVariablesWarning(error: unknown): { code: string; message: string } {
  const detail = error instanceof Error ? error.message : String(error);
  const normalized = detail.toLowerCase();

  // Check for 403 status code first (canonical check)
  if (error instanceof FigmaApiError && error.status === 403) {
    return {
      code: 'deps.consumer.variables_forbidden',
      message:
        'Variable usage skipped due to Figma API permissions; component sync completed.',
    };
  }

  if (normalized.includes('file_variables:read')) {
    return {
      code: 'deps.consumer.variables_scope_missing',
      message:
        'Variable usage skipped. The current Figma token is missing the `file_variables:read` scope; component sync completed.',
    };
  }

  // Fallback to string check for non-typed errors
  if (normalized.includes('403')) {
    return {
      code: 'deps.consumer.variables_forbidden',
      message:
        'Variable usage skipped due to Figma API permissions; component sync completed.',
    };
  }

  return {
    code: 'deps.consumer.variables_unavailable',
    message: `Variable usage skipped. Continuing with component sync (${detail})`,
  };
}

/**
 * Fetch minimal file metadata (name and lastModified) for change detection
 */
export async function fetchConsumerFileMetadata(
  fileKey: string,
  token: string,
  signal?: AbortSignal
): Promise<FileMetadata> {
  try {
    if (signal?.aborted) throw new Error('Operation aborted');
    const response = await fetchFigmaFile({ fileKey, token, depth: 1 });
    return {
      name: response.name,
      lastModified: response.lastModified,
    };
  } catch (error) {
    if (error instanceof FigmaApiError) {
      throw error;
    }
    throw createCodedError(
      'deps.consumer.metadata_fetch_failed',
      `Failed to fetch file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    );
  }
}

/**
 * Build a DS catalog from a DS file (components and variables)
 */
export async function buildDsCatalog(
  dsFileKey: string,
  token: string,
  signal?: AbortSignal
): Promise<DsCatalog> {
  try {
    if (signal?.aborted) throw new Error('Operation aborted');
    // Fetch file data
    // depth=1 is enough — we only need the file metadata and components/componentSets
    const fileResponse = await fetchFigmaFile({ fileKey: dsFileKey, token, depth: 1 });

    // Build component catalog via /files/:key/components (more reliable than fileResponse.components,
    // which can be empty for library files on non-Enterprise plans).
    const components = new Map<string, DsComponentCatalog>();
    try {
      const componentsResponse = await fetchFigmaFileComponents({ fileKey: dsFileKey, token });
      for (const comp of componentsResponse.meta?.components ?? []) {
        const key = String(comp.key || '').trim();
        if (!key) continue;
        components.set(key, {
          key,
          name: comp.name,
          id: comp.node_id,
        });
      }
    } catch (componentsError) {
      const detail = componentsError instanceof Error ? componentsError.message : String(componentsError);
      console.warn(`[buildDsCatalog] Component fetch failed (non-fatal): ${detail}`);
      // Fallback: use components from the file response if the dedicated endpoint fails.
      for (const [componentId, component] of Object.entries(fileResponse.components || {})) {
        const comp = component as { key: string; name: string };
        const key = String(comp.key || '').trim();
        if (!key) continue;
        components.set(key, { key, name: comp.name, id: componentId });
      }
    }

    // Fetch variables: MCP-first with REST fallback.
    // Non-fatal: if both sources are unavailable (no Enterprise plan + no MCP),
    // we proceed with an empty variable catalog and rely on the MCP fallback
    // during scanConsumerFile instead.
    const variables = new Map<string, DsVariableCatalog>();
    const variableIdToKey = new Map<string, string>();

    try {
      const variablesResponse = await fetchVariablesForDsFile(dsFileKey, token, signal);
      if (variablesResponse.meta?.variableCollections && variablesResponse.meta?.variables) {
        for (const variable of Object.values(variablesResponse.meta.variables)) {
          const variableKey = String((variable as Record<string, unknown>).key || '').trim();
          if (!variableKey) continue;
          variables.set(variableKey, {
            key: variableKey,
            id: variable.id,
            name: variable.name,
            type: variable.resolvedType,
            collectionId: variable.variableCollectionId,
          });
          variableIdToKey.set(variable.id, variableKey);
        }
      }
    } catch (varError) {
      const detail = varError instanceof Error ? varError.message : String(varError);
      console.warn(`[buildDsCatalog] Variable fetch failed (non-fatal): ${detail}`);
    }

    return {
      components,
      variables,
      variableIdToKey,
    };
  } catch (error) {
    if (error instanceof FigmaApiError) {
      throw error;
    }
    throw createCodedError(
      'deps.consumer.catalog_build_failed',
      `Failed to build DS catalog: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    );
  }
}

/**
 * Fetch variables for a file: MCP-first with REST fallback.
 */
async function fetchVariablesForFile(
  fileKey: string,
  token: string,
  signal?: AbortSignal,
  options?: { contextLabel?: string },
): Promise<FigmaVariablesResponse> {
  const fileUrl = `https://www.figma.com/design/${fileKey}`;
  const contextLabel = options?.contextLabel || 'figma-file';
  if (signal?.aborted) {
    throw createCodedError('deps.consumer.variables_fetch_aborted', 'Operation aborted');
  }

  // Try MCP first
  try {
    return await fetchFigmaLocalVariablesViaMcp({ fileUrl });
  } catch (mcpError) {
    // MCP failed. Fallback to REST where possible.
    const mcpErrorMsg = mcpError instanceof Error ? mcpError.message : String(mcpError);
    console.warn(`[${contextLabel}] MCP variables fetch failed: ${mcpErrorMsg}. Attempting REST fallback...`);
    if (signal?.aborted) {
      throw createCodedError('deps.consumer.variables_fetch_aborted', 'Operation aborted', {
        cause: mcpError,
      });
    }

    // Fallback to REST if token is available
    if (token && String(token).trim()) {
      try {
        return await fetchFigmaLocalVariables({ fileKey, token });
      } catch (restError) {
        // Both MCP and REST failed
        const restErrorMsg = restError instanceof Error ? restError.message : String(restError);
        console.warn(`[${contextLabel}] REST variables fetch failed: ${restErrorMsg}`);
        throw createCodedError(
          'deps.consumer.variables_fetch_failed',
          'Variables unavailable: MCP plugin not connected and REST fallback failed',
          { cause: restError },
        );
      }
    } else {
      // No token for REST fallback
      throw createCodedError(
        'deps.consumer.variables_fetch_failed',
        'Variables unavailable: MCP plugin not connected and no REST token available',
        { cause: mcpError },
      );
    }
  }
}

/**
 * Fetch variables for DS file: MCP-first with REST fallback
 */
async function fetchVariablesForDsFile(
  dsFileKey: string,
  token: string,
  signal?: AbortSignal,
): Promise<FigmaVariablesResponse> {
  return fetchVariablesForFile(dsFileKey, token, signal, { contextLabel: 'buildDsCatalog' });
}

/**
 * Scan a consumer file for DS component instances and variable bindings
 */
export async function scanConsumerFile(
  fileKey: string,
  token: string,
  dsCatalog: DsCatalog,
  signal?: AbortSignal
): Promise<ConsumerScanResult> {
  try {
    if (signal?.aborted) throw new Error('Operation aborted');
    // Fetch full file tree
    const fileResponse = await fetchFigmaFile({ fileKey, token });
    let consumerVariablesResponse: FigmaVariablesResponse | null = null;
    const componentInstances = new Map<string, ComponentInstance>();
    const variableBindings = new Map<string, VariableBinding>();
    let totalBoundVariableCount = 0;
    let unresolvedBoundVariableCount = 0;
    const warnings: Array<{ code: string; message: string; nodeId?: string }> = [];

    try {
      consumerVariablesResponse = await fetchVariablesForFile(fileKey, token, signal, {
        contextLabel: 'scanConsumerFile',
      });
    } catch (error) {
      warnings.push(buildConsumerVariablesWarning(error));
    }

    // Build component ID to key mapping for this file.
    // fileResponse.components may be empty on non-Enterprise plans for library-only files.
    // Consumer files typically don't publish components — they consume from DS libraries.
    // We rely on dsComponentIdToKey (DS catalog) for matching imported component instances.
    const fileComponentIdToKey = new Map<string, string>();
    if (fileResponse.components && Object.keys(fileResponse.components).length > 0) {
      for (const [componentId, component] of Object.entries(fileResponse.components)) {
        const comp = component as { key: string; name: string };
        fileComponentIdToKey.set(componentId, comp.key);
      }
    }
    // Note: No fallback to /files/:key/components here — that endpoint returns components
    // published by the file itself, not imported library components. For consumer files,
    // dsComponentIdToKey (built from DS catalog) is the primary matching mechanism.

    // Build DS component ID -> key mapping.
    // Consumer files that only consume external libraries may not expose local
    // `fileResponse.components`, but node.componentId can still reference the DS component ID.
    const dsComponentIdToKey = new Map<string, string>();
    for (const [componentKey, dsComponent] of dsCatalog.components.entries()) {
      const componentId = String(dsComponent.id || '').trim();
      if (!componentId) continue;
      dsComponentIdToKey.set(componentId, componentKey);
    }

    // Build consumer variable ID -> key mapping
    const consumerVariableIdToKey = new Map<string, string>();
    if (consumerVariablesResponse?.meta?.variables) {
      for (const variable of Object.values(consumerVariablesResponse.meta.variables)) {
        const variableKey = String((variable as Record<string, unknown>).key || '').trim();
        if (!variableKey) continue;
        consumerVariableIdToKey.set(variable.id, variableKey);
      }
    }

    // Build DS variable name -> key lookup for cases where IDs differ but names still match.
    // Only keep unambiguous names to avoid accidental mis-mapping.
    const dsVariableNameToKey = new Map<string, string>();
    for (const [key, variable] of dsCatalog.variables.entries()) {
      const name = String(variable.name || '').trim().toLowerCase();
      if (!name) continue;
      if (!dsVariableNameToKey.has(name)) {
        dsVariableNameToKey.set(name, key);
      } else if (dsVariableNameToKey.get(name) !== key) {
        dsVariableNameToKey.set(name, '');
      }
    }

    // Recursive scan function
    function normalizeBindings(
      value: { id: string; type: string } | Array<{ id: string; type: string }> | null | undefined
    ): Array<{ id: string; type: string }> {
      if (!value) {
        return [];
      }
      return Array.isArray(value) ? value : [value];
    }

    // Diagnostic counters (#1 observability)
    let matchedViaFileKey = 0;
    let matchedViaDsId = 0;
    const unmatchedComponentIds = new Set<string>();
    let unmatchedComponentIdsTotal = 0;

    function scanNode(node: FigmaNode): void {
      // Check for component instances
      if (node.componentId) {
        const normalizedComponentId = String(node.componentId || '').trim();
        const viaFile = fileComponentIdToKey.get(normalizedComponentId);
        const viaDsId = viaFile ? undefined : dsComponentIdToKey.get(normalizedComponentId);
        const componentKey = viaFile || viaDsId;
        if (componentKey && dsCatalog.components.has(componentKey)) {
          if (viaFile) matchedViaFileKey++;
          else matchedViaDsId++;
          const dsComponent = dsCatalog.components.get(componentKey)!;
          if (!componentInstances.has(componentKey)) {
            componentInstances.set(componentKey, {
              componentKey,
              componentName: dsComponent.name,
              nodeIds: [],
            });
          }
          const instance = componentInstances.get(componentKey)!;
          if (instance.nodeIds.length < MAX_CAPTURED_NODE_IDS_PER_ENTRY) {
            instance.nodeIds.push(node.id);
          }
        } else if (normalizedComponentId) {
          unmatchedComponentIdsTotal += 1;
          if (unmatchedComponentIds.size < MAX_UNMATCHED_COMPONENT_IDS_SAMPLE) {
            unmatchedComponentIds.add(normalizedComponentId);
          }
        }
      }

      // Check for variable bindings
      if (node.boundVariables) {
        for (const [, bindings] of Object.entries(node.boundVariables)) {
          for (const binding of normalizeBindings(bindings)) {
            totalBoundVariableCount += 1;
            const variableId = binding.id;
            const variableKey =
              consumerVariableIdToKey.get(variableId) ||
              dsCatalog.variableIdToKey.get(variableId) ||
              '';

            if (variableKey && dsCatalog.variables.has(variableKey)) {
              const dsVariable = dsCatalog.variables.get(variableKey)!;
              if (!variableBindings.has(variableKey)) {
                variableBindings.set(variableKey, {
                  variableKey,
                  variableId,
                  variableName: dsVariable.name,
                  variableType: dsVariable.type,
                  nodeIds: [],
                });
              }
              const variableBinding = variableBindings.get(variableKey)!;
              if (variableBinding.nodeIds.length < MAX_CAPTURED_NODE_IDS_PER_ENTRY) {
                variableBinding.nodeIds.push(node.id);
              }
            } else {
              unresolvedBoundVariableCount += 1;
            }
            // Non-DS variables are expected (consumer-local variables) — no warning needed.
          }
        }
      }

      // Recursively scan children
      if (node.children) {
        for (const child of node.children) {
          scanNode(child);
        }
      }
    }

    // Start scanning from document root
    scanNode(fileResponse.document);

    // Fallback: query live MCP token usage when we have unresolved variable bindings and
    // the REST/local catalogs are insufficient to resolve them.
    if (shouldAttemptMcpVariableFallback({
      unresolvedBoundVariableCount,
      variableBindingsCount: variableBindings.size,
      dsCatalogVariableCount: dsCatalog.variables.size,
    })) {
      const mcpUsage = await fetchConsumerBoundVariableUsageViaMcp(fileKey);
      if (mcpUsage && mcpUsage.length > 0) {
        let fallbackAddedCount = 0;
        for (const entry of mcpUsage) {
          const variableId = String(entry.variableId || '').trim();
          const variableName = String(entry.variableName || '').trim();
          const byIdKey =
            consumerVariableIdToKey.get(variableId) ||
            dsCatalog.variableIdToKey.get(variableId) ||
            '';
          const byNameKey = variableName ? dsVariableNameToKey.get(variableName.toLowerCase()) || '' : '';
          // When catalog is empty (token lacks file_variables:read scope), trust the
          // plugin-resolved key directly — it comes from getVariableByIdAsync which
          // resolves library variables that the REST API silently omits.
          // Guardrail: only accept keys that look like valid Figma variable keys
          // (40-char hex, the format used by Figma's global keys).
          const rawPluginKey = dsCatalog.variables.size === 0
            ? String(entry.variableKey || '').trim()
            : '';
          const byPluginKey = rawPluginKey && isLikelyFigmaVariableKey(rawPluginKey)
            ? rawPluginKey
            : '';
          const variableKey = byIdKey || byNameKey || byPluginKey;
          if (!variableKey) continue;

          const dsVariable = dsCatalog.variables.get(variableKey) ?? (
            byPluginKey ? {
              key: byPluginKey,
              id: variableId,
              name: variableName || `unknown (${variableId})`,
              type: String(entry.variableType || 'UNKNOWN'),
              collectionId: '',
            } : null
          );
          if (!dsVariable) continue;

          const existing = variableBindings.get(variableKey);
          if (!existing) {
            variableBindings.set(variableKey, {
              variableKey,
              variableId: variableId || dsVariable.id,
              variableName: dsVariable.name,
              variableType: dsVariable.type,
              nodeIds: Array.isArray(entry.nodeIds)
                ? entry.nodeIds.slice(0, MAX_CAPTURED_NODE_IDS_PER_ENTRY)
                : [],
            });
            fallbackAddedCount += 1;
            continue;
          }

          const mergedNodeIds = new Set<string>(existing.nodeIds);
          for (const nodeId of entry.nodeIds || []) {
            const normalized = String(nodeId || '').trim();
            if (normalized) mergedNodeIds.add(normalized);
          }
          existing.nodeIds = Array.from(mergedNodeIds).slice(0, MAX_CAPTURED_NODE_IDS_PER_ENTRY);
        }

        if (fallbackAddedCount > 0) {
          warnings.push({
            code: 'deps.consumer.variables_mcp_token_usage_fallback',
            message: 'Variable usage enriched from live MCP bound-variable scan.',
          });
        }
      }
    }

    // (#1) Diagnostic warning: empty scan result
    if (componentInstances.size === 0 && variableBindings.size === 0) {
      warnings.push({
        code: 'deps.consumer.empty_scan_result',
        message: [
          'Scan completed with 0 components and 0 variables.',
          `dsCatalog: ${dsCatalog.components.size} components, ${dsCatalog.variables.size} variables.`,
          `fileComponentIdToKey: ${fileComponentIdToKey.size} entries.`,
          `dsComponentIdToKey: ${dsComponentIdToKey.size} entries.`,
          `Bound variables scanned: ${totalBoundVariableCount}.`,
          `Unresolved boundVariable count: ${unresolvedBoundVariableCount}.`,
          unmatchedComponentIdsTotal > 0
            ? `Unmatched componentIds (sample): ${[...unmatchedComponentIds].slice(0, 5).join(', ')}.`
            : 'No component instances found in document tree.',
        ].join(' '),
      });
    } else if (unmatchedComponentIdsTotal >= UNMATCHED_COMPONENT_WARNING_THRESHOLD) {
      // Non-empty scan but some instances were unresolved — log for diagnostics
      warnings.push({
        code: 'deps.consumer.unmatched_component_ids',
        message: `${unmatchedComponentIdsTotal} instance(s) with unresolved componentId (matched: ${matchedViaFileKey} via fileKey, ${matchedViaDsId} via dsId). Sample: ${[...unmatchedComponentIds].slice(0, 5).join(', ')}.`,
      });
    }

    // Convert Maps to arrays and limit sample node IDs
    const result: ConsumerScanResult = {
      componentInstances: Array.from(componentInstances.values()).map(instance => ({
        ...instance,
        nodeIds: instance.nodeIds.slice(0, 20),
      })),
      variableBindings: Array.from(variableBindings.values())
        .map(binding => ({
          ...binding,
          nodeIds: binding.nodeIds.slice(0, 20),
        })),
      warnings,
    };

    return result;
  } catch (error) {
    if (error instanceof FigmaApiError) {
      throw error;
    }
    throw createCodedError(
      'deps.consumer.scan_failed',
      `Failed to scan consumer file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    );
  }
}
