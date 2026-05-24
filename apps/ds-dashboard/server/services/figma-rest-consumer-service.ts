import { fetchFigmaFile, fetchFigmaLocalVariables, fetchFigmaFileComponents, FigmaApiError } from '../../../../tooling/src/utils/figma-api.js';
import { fetchFigmaLocalVariablesViaMcp, type FigmaVariablesResponse } from '../../../../tooling/src/services/figma-mcp-variables.js';
import { getTokenUsageDirect, type TokenUsageEntry } from './figma-direct-bridge-service.js';
import type { SampleNodeRef } from '../../src/types/consumers.js';

// Types for Figma API responses (using imported types)
interface FigmaNode {
  id: string;
  name: string;
  type: string;
  componentId?: string;
  componentProperties?: Record<string, unknown>;
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
  setId?: string;
  setName?: string;
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
  sampleNodes: SampleNodeRef[];
}

export interface VariableBinding {
  variableKey: string;
  variableId: string;
  variableName: string;
  variableType: string;
  nodeIds: string[];
  sampleNodes: SampleNodeRef[];
  totalNodeCount: number;
}

type UsageScope = "page" | "local-component" | "nested-local-component";

interface ComponentRef {
  componentKey: string;
  componentName: string;
  nodeId: string;
}

interface UsageScopeSummary {
  page: number;
  localComponent: number;
  nestedLocalComponent: number;
}

export interface DirectParentUsageDetail {
  localComponentKey: string;
  localComponentName: string;
  parentComponentKey: string;
  parentComponentName: string;
  usageScope: UsageScope;
  usageCount: number;
  sampleNodeIds: string[];
}

export interface LocalComponentGraphEdge {
  parentComponentKey: string;
  parentComponentName: string;
  childComponentKey: string;
  childComponentName: string;
  usageCount: number;
  sampleNodeIds: string[];
}

export interface ComponentPropertyUsageDetail {
  nodeId: string;
  nodeName: string;
  componentKey: string;
  componentName: string;
  usageScope: UsageScope;
  localComponentKey?: string;
  localComponentName?: string;
  properties: Array<{
    name: string;
    value: string;
    valueType: string;
  }>;
}

export interface TokenBindingDetail {
  nodeId: string;
  nodeName: string;
  usageScope: UsageScope;
  localComponentKey?: string;
  localComponentName?: string;
  bindings: Array<{
    field: string;
    variableId: string;
    variableKey: string | null;
    variableName: string | null;
    variableType: string | null;
    status: "resolved" | "unresolved";
    resolvedTokenPath: string | null;
  }>;
}

export interface ConsumerUsageDetails {
  parentComponentUsages: DirectParentUsageDetail[];
  localComponentGraph: LocalComponentGraphEdge[];
  componentPropertyUsages: ComponentPropertyUsageDetail[];
  tokenBindingDetails: TokenBindingDetail[];
  usageShape: {
    components: UsageScopeSummary;
    tokens: UsageScopeSummary;
  };
}

export interface ConsumerScanResult {
  componentInstances: ComponentInstance[];
  variableBindings: VariableBinding[];
  warnings: Array<{
    code: string;
    message: string;
    nodeId?: string;
  }>;
  localComponentUsedCount: number | null;
  parentDerivedComponentCount: number | null;
  localVariableDefinedCount: number | null;
  localVariableUsedCount: number | null;
  usageDetails: ConsumerUsageDetails;
}

function buildComponentDisplayName(component: DsComponentCatalog): string {
  const componentName = String(component.name || '').trim();
  const setName = String(component.setName || '').trim();
  if (!componentName) return setName || '';
  if (!setName) return componentName;
  if (componentName.startsWith(`${setName}/`)) return componentName;
  return `${setName}/${componentName}`;
}

function getUsageScope(depth: number): UsageScope {
  if (depth <= 0) return "page";
  if (depth === 1) return "local-component";
  return "nested-local-component";
}

function serializeComponentPropertyValue(value: unknown): { value: string; valueType: string } {
  if (value === null) {
    return { value: "null", valueType: "null" };
  }
  if (value === undefined) {
    return { value: "undefined", valueType: "undefined" };
  }
  const valueType = Array.isArray(value) ? "array" : typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return { value: String(value), valueType };
  }
  try {
    return { value: JSON.stringify(value), valueType };
  } catch {
    return { value: String(value), valueType: "unknown" };
  }
}

function createEmptyUsageDetails(): ConsumerUsageDetails {
  return {
    parentComponentUsages: [],
    localComponentGraph: [],
    componentPropertyUsages: [],
    tokenBindingDetails: [],
    usageShape: {
      components: { page: 0, localComponent: 0, nestedLocalComponent: 0 },
      tokens: { page: 0, localComponent: 0, nestedLocalComponent: 0 },
    },
  };
}

function createSampleNodeRef(nodeId: string, pageName: string): SampleNodeRef {
  return {
    nodeId,
    pageName,
  };
}

/**
 * Keep a bounded sample of node IDs per usage entry to avoid large payloads.
 */
const MAX_CAPTURED_NODE_IDS_PER_ENTRY = 20;
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
  signal?: AbortSignal,
): Promise<TokenUsageEntry[] | null> {
  if (signal?.aborted) {
    return null;
  }
  try {
    const result = await getTokenUsageDirect(fileKey, {
      force: true,
      maxNodes: 15000,
    }, signal);
    return Array.isArray(result.usage) ? result.usage : [];
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
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

  if (normalized.includes('aborted')) {
    return {
      code: 'deps.consumer.variables_aborted',
      message: 'Variable usage skipped because the sync was aborted.',
    };
  }

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
    const response = await fetchFigmaFile({ fileKey, token, depth: 1, signal });
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
    const fileResponse = await fetchFigmaFile({ fileKey: dsFileKey, token, depth: 1, signal });

    // Build component catalog via /files/:key/components (more reliable than fileResponse.components,
    // which can be empty for library files on non-Enterprise plans, and ALWAYS empty when depth=1).
    // The /components endpoint returns `containing_frame.containingComponentSet` with the set name
    // and node ID — this is the source of truth for setId/setName.
    const components = new Map<string, DsComponentCatalog>();
    const componentSetNameById = new Map<string, string>();
    for (const [setId, set] of Object.entries(fileResponse.componentSets || {})) {
      const setName = String((set as Record<string, unknown>).name || '').trim();
      if (!setName) continue;
      componentSetNameById.set(setId, setName);
    }
    try {
      const componentsResponse = await fetchFigmaFileComponents({ fileKey: dsFileKey, token, signal });
      for (const comp of componentsResponse.meta?.components ?? []) {
        const key = String(comp.key || '').trim();
        if (!key) continue;
        // containingComponentSet is present when the component belongs to a component set (variant group).
        const containingSet = (comp as Record<string, unknown>).containing_frame as
          | { containingComponentSet?: { name?: string; nodeId?: string } }
          | undefined;
        const setIdFromContainingSet = String(containingSet?.containingComponentSet?.nodeId || '').trim();
        const setIdFromComponent = String((comp as Record<string, unknown>).componentSetId || '').trim();
        if (
          setIdFromContainingSet &&
          setIdFromComponent &&
          setIdFromContainingSet !== setIdFromComponent
        ) {
          console.warn(
            `[buildDsCatalog] Conflicting component set IDs for ${key}: containingComponentSet=${setIdFromContainingSet}, componentSetId=${setIdFromComponent}`,
          );
        }
        const setId = setIdFromContainingSet || setIdFromComponent;
        const setNameFromContainingSet = String(containingSet?.containingComponentSet?.name || '').trim();
        const setName = setNameFromContainingSet || (setId ? componentSetNameById.get(setId) : undefined);
        components.set(key, {
          key,
          name: String(comp.name || '').trim(),
          id: comp.node_id,
          setId: setId || undefined,
          setName: setName || undefined,
        });
      }
    } catch (componentsError) {
      const detail = componentsError instanceof Error ? componentsError.message : String(componentsError);
      console.warn(`[buildDsCatalog] Component fetch failed (non-fatal): ${detail}`);
      // Fallback: use components from the file response if the dedicated endpoint fails.
      // Note: fileResponse.components is only populated when fetched without depth restriction.
      for (const [componentId, component] of Object.entries(fileResponse.components || {})) {
        const comp = component as { key: string; name: string; componentSetId?: string };
        const key = String(comp.key || '').trim();
        if (!key) continue;
        components.set(key, {
          key,
          name: String(comp.name || '').trim(),
          id: componentId,
          setId: comp.componentSetId || undefined,
          setName: comp.componentSetId ? componentSetNameById.get(comp.componentSetId) : undefined,
        });
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
    const response = await fetchFigmaLocalVariablesViaMcp({ fileUrl, signal });
    if (signal?.aborted) {
      throw createCodedError('deps.consumer.variables_fetch_aborted', 'Operation aborted');
    }
    return response;
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
        const response = await fetchFigmaLocalVariables({ fileKey, token, signal });
        if (signal?.aborted) {
          throw createCodedError('deps.consumer.variables_fetch_aborted', 'Operation aborted');
        }
        return response;
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
    const fileResponse = await fetchFigmaFile({ fileKey, token, signal });
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
      if (!signal?.aborted) {
        warnings.push(buildConsumerVariablesWarning(error));
      }
    }
    if (signal?.aborted) throw new Error('Operation aborted');

    // Build component ID to key mapping for this file.
    // fileResponse.components may be empty on non-Enterprise plans for library-only files.
    // Consumer files typically don't publish components — they consume from DS libraries.
    // We rely on dsComponentIdToKey (DS catalog) for matching imported component instances.
    const fileComponentIdToInfo = new Map<string, ComponentRef>();
    if (fileResponse.components && Object.keys(fileResponse.components).length > 0) {
      for (const [componentId, component] of Object.entries(fileResponse.components)) {
        const comp = component as { key: string; name: string };
        const componentKey = String(comp.key || '').trim();
        if (!componentKey) continue;
        fileComponentIdToInfo.set(componentId, {
          componentKey,
          componentName: String(comp.name || componentKey).trim() || componentKey,
          nodeId: componentId,
        });
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
    const localComponentDefinitionStack: ComponentRef[] = [];
    const usageDetails = createEmptyUsageDetails();
    const directParentUsageByKey = new Map<string, DirectParentUsageDetail>();
    const localComponentGraphByKey = new Map<string, LocalComponentGraphEdge>();
    const componentPropertyUsageByNode = new Map<string, ComponentPropertyUsageDetail>();
    const tokenBindingUsageByNode = new Map<string, TokenBindingDetail>();

    // Built during scanNode to resolve page context for MCP-fallback nodeIds.
    const nodeIdToPageName = new Map<string, string>();

    const getLocalComponentInfo = (node: FigmaNode): ComponentRef => {
      const fromFile = fileComponentIdToInfo.get(node.id);
      if (fromFile) return fromFile;
      const fallbackName = String(node.name || '').trim() || node.id;
      return {
        componentKey: node.id,
        componentName: fallbackName,
        nodeId: node.id,
      };
    };

    function scanNode(node: FigmaNode, currentPageName = ''): void {
      const nextPageName =
        node.type === 'PAGE'
          ? String(node.name || '').trim() || currentPageName
          : currentPageName;

      if (node.id) nodeIdToPageName.set(node.id, nextPageName);

      const isLocalComponentDefinition = node.type === 'COMPONENT';
      if (isLocalComponentDefinition) {
        localComponentDefinitionStack.push(getLocalComponentInfo(node));
      }

      const activeLocalComponentStack = localComponentDefinitionStack;
      const activeLocalComponent = activeLocalComponentStack[activeLocalComponentStack.length - 1] || null;
      const usageScope = getUsageScope(activeLocalComponentStack.length);

      // Check for component instances
      if (node.componentId) {
        const normalizedComponentId = String(node.componentId || '').trim();
        const viaFile = fileComponentIdToInfo.get(normalizedComponentId);
        const viaDsId = viaFile ? undefined : dsComponentIdToKey.get(normalizedComponentId);
        const componentKey = viaFile?.componentKey || viaDsId || '';
        const resolvedComponent = componentKey && dsCatalog.components.has(componentKey)
          ? dsCatalog.components.get(componentKey)!
          : null;
        const resolvedComponentName = viaFile?.componentName || (resolvedComponent ? buildComponentDisplayName(resolvedComponent) : '');
        const isResolvedLocalComponent = Boolean(viaFile);
        const isResolvedParentComponent = Boolean(resolvedComponent && !isResolvedLocalComponent);
        const currentComponentRef: ComponentRef | null = componentKey
          ? {
              componentKey,
              componentName: resolvedComponentName || componentKey,
              nodeId: normalizedComponentId,
            }
          : null;

        if (componentKey && (resolvedComponent || isResolvedLocalComponent)) {
          if (usageScope === 'page') {
            usageDetails.usageShape.components.page += 1;
          } else if (usageScope === 'local-component') {
            usageDetails.usageShape.components.localComponent += 1;
          } else {
            usageDetails.usageShape.components.nestedLocalComponent += 1;
          }
        }

        if (componentKey && resolvedComponent) {
          if (viaFile) matchedViaFileKey++;
          else matchedViaDsId++;
          if (activeLocalComponent && activeLocalComponent.nodeId !== node.id && isResolvedParentComponent) {
            const parentKey = activeLocalComponent.componentKey;
            const edgeKey = `${parentKey}\u0000${resolvedComponent.key}\u0000${usageScope}`;
            const existing = directParentUsageByKey.get(edgeKey);
            if (existing) {
              existing.usageCount += 1;
              if (existing.sampleNodeIds.length < MAX_CAPTURED_NODE_IDS_PER_ENTRY) {
                existing.sampleNodeIds.push(node.id);
              }
            } else {
              directParentUsageByKey.set(edgeKey, {
                localComponentKey: activeLocalComponent.componentKey,
                localComponentName: activeLocalComponent.componentName,
                parentComponentKey: resolvedComponent.key,
                parentComponentName: buildComponentDisplayName(resolvedComponent),
                usageScope,
                usageCount: 1,
                sampleNodeIds: [node.id],
              });
            }
          }

          if (!componentInstances.has(componentKey)) {
            componentInstances.set(componentKey, {
              componentKey,
              componentName: resolvedComponentName || componentKey,
              nodeIds: [],
              sampleNodes: [],
            });
          }
          const instance = componentInstances.get(componentKey)!;
          if (instance.nodeIds.length < MAX_CAPTURED_NODE_IDS_PER_ENTRY) {
            instance.nodeIds.push(node.id);
          }
          if (instance.sampleNodes.length < MAX_CAPTURED_NODE_IDS_PER_ENTRY) {
            instance.sampleNodes.push(createSampleNodeRef(node.id, nextPageName));
          }
          if (node.componentProperties && typeof node.componentProperties === 'object') {
            const propertyEntries = Object.entries(node.componentProperties)
              .map(([name, value]) => {
                const normalizedName = String(name || '').trim();
                if (!normalizedName) return null;
                const normalizedValue = serializeComponentPropertyValue(value);
                return {
                  name: normalizedName,
                  value: normalizedValue.value,
                  valueType: normalizedValue.valueType,
                };
              })
              .filter((item): item is { name: string; value: string; valueType: string } => item !== null);

            if (propertyEntries.length > 0) {
              const propertyKey = `${node.id}\u0000${componentKey}`;
              const existing = componentPropertyUsageByNode.get(propertyKey);
              if (existing) {
                existing.properties.push(...propertyEntries);
              } else {
                componentPropertyUsageByNode.set(propertyKey, {
                  nodeId: node.id,
                  nodeName: String(node.name || '').trim() || node.id,
                  componentKey,
                  componentName: resolvedComponentName || componentKey,
                  usageScope,
                  localComponentKey: activeLocalComponent?.componentKey,
                  localComponentName: activeLocalComponent?.componentName,
                  properties: propertyEntries,
                });
              }
            }
          }
        }

        if (isResolvedLocalComponent && activeLocalComponent && activeLocalComponent.nodeId !== node.id) {
          const edgeKey = `${activeLocalComponent.componentKey}\u0000${currentComponentRef!.componentKey}`;
          const existing = localComponentGraphByKey.get(edgeKey);
          if (existing) {
            existing.usageCount += 1;
            if (existing.sampleNodeIds.length < MAX_CAPTURED_NODE_IDS_PER_ENTRY) {
              existing.sampleNodeIds.push(node.id);
            }
          } else {
            localComponentGraphByKey.set(edgeKey, {
              parentComponentKey: activeLocalComponent.componentKey,
              parentComponentName: activeLocalComponent.componentName,
              childComponentKey: currentComponentRef!.componentKey,
              childComponentName: currentComponentRef!.componentName,
              usageCount: 1,
              sampleNodeIds: [node.id],
            });
          }
        } else if (normalizedComponentId && !resolvedComponent && !isResolvedLocalComponent) {
          unmatchedComponentIdsTotal += 1;
          if (unmatchedComponentIds.size < MAX_UNMATCHED_COMPONENT_IDS_SAMPLE) {
            unmatchedComponentIds.add(normalizedComponentId);
          }
        }
      }

      // Check for variable bindings
      if (node.boundVariables) {
        const bindingsForNode: TokenBindingDetail["bindings"] = [];
        for (const [fieldName, bindings] of Object.entries(node.boundVariables)) {
          const normalizedField = String(fieldName || '').trim();
          if (!normalizedField) continue;
          for (const binding of normalizeBindings(bindings)) {
            const variableId = binding.id;
            if (!String(variableId || '').trim()) {
              continue;
            }
            totalBoundVariableCount += 1;
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
                  sampleNodes: [],
                  totalNodeCount: 0,
                });
              }
              const variableBinding = variableBindings.get(variableKey)!;
              variableBinding.totalNodeCount += 1;
              if (variableBinding.nodeIds.length < MAX_CAPTURED_NODE_IDS_PER_ENTRY) {
                variableBinding.nodeIds.push(node.id);
              }
              if (variableBinding.sampleNodes.length < MAX_CAPTURED_NODE_IDS_PER_ENTRY) {
                variableBinding.sampleNodes.push(createSampleNodeRef(node.id, nextPageName));
              }
              bindingsForNode.push({
                field: normalizedField,
                variableId,
                variableKey,
                variableName: dsVariable.name,
                variableType: dsVariable.type,
                status: 'resolved',
                resolvedTokenPath: variableKey,
              });
            } else {
              unresolvedBoundVariableCount += 1;
              bindingsForNode.push({
                field: normalizedField,
                variableId,
                variableKey: null,
                variableName: null,
                variableType: null,
                status: 'unresolved',
                resolvedTokenPath: null,
              });
            }
            if (usageScope === 'page') {
              usageDetails.usageShape.tokens.page += 1;
            } else if (usageScope === 'local-component') {
              usageDetails.usageShape.tokens.localComponent += 1;
            } else {
              usageDetails.usageShape.tokens.nestedLocalComponent += 1;
            }
            // Non-DS variables are expected (consumer-local variables) — no warning needed.
          }
        }
        if (bindingsForNode.length > 0) {
          const bindingKey = `${node.id}`;
          const existing = tokenBindingUsageByNode.get(bindingKey);
          if (existing) {
            existing.bindings.push(...bindingsForNode);
          } else {
            tokenBindingUsageByNode.set(bindingKey, {
              nodeId: node.id,
              nodeName: String(node.name || '').trim() || node.id,
              usageScope,
              localComponentKey: activeLocalComponent?.componentKey,
              localComponentName: activeLocalComponent?.componentName,
              bindings: bindingsForNode,
            });
          }
        }
      }

      // Recursively scan children
      if (node.children) {
        for (const child of node.children) {
          scanNode(child, nextPageName);
        }
      }

      if (isLocalComponentDefinition) {
        localComponentDefinitionStack.pop();
      }
    }

    // Start scanning from document root
    scanNode(fileResponse.document);

    // Fallback: query live MCP token usage when we have unresolved variable bindings and
    // the REST/local catalogs are insufficient to resolve them.
    if (signal?.aborted) throw new Error('Operation aborted');
    if (shouldAttemptMcpVariableFallback({
      unresolvedBoundVariableCount,
      variableBindingsCount: variableBindings.size,
      dsCatalogVariableCount: dsCatalog.variables.size,
    })) {
      const mcpUsage = await fetchConsumerBoundVariableUsageViaMcp(fileKey, signal);
      if (mcpUsage && mcpUsage.length > 0) {
        const resolveEntryNodeCount = (entry: TokenUsageEntry): number => {
          const byCount = Number(entry.nodeCount);
          if (Number.isFinite(byCount) && byCount >= 0) {
            return Math.floor(byCount);
          }
          return Array.isArray(entry.nodeIds) ? entry.nodeIds.length : 0;
        };
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
              sampleNodes: Array.isArray(entry.nodeIds)
                ? entry.nodeIds.slice(0, MAX_CAPTURED_NODE_IDS_PER_ENTRY).map((nodeId) => {
                    const nid = String(nodeId || '').trim();
                    return createSampleNodeRef(nid, nodeIdToPageName.get(nid) ?? '');
                  })
                : [],
              totalNodeCount: resolveEntryNodeCount(entry),
            });
            fallbackAddedCount += 1;
            continue;
          }

          const mergedNodeIds = new Set<string>(existing.nodeIds);
          const existingSampleNodeIds = new Set(existing.sampleNodes.map((entry) => entry.nodeId));
          for (const nodeId of entry.nodeIds || []) {
            const normalized = String(nodeId || '').trim();
            if (normalized) mergedNodeIds.add(normalized);
            if (
              normalized &&
              existing.sampleNodes.length < MAX_CAPTURED_NODE_IDS_PER_ENTRY &&
              !existingSampleNodeIds.has(normalized)
            ) {
              existing.sampleNodes.push(createSampleNodeRef(normalized, nodeIdToPageName.get(normalized) ?? ''));
              existingSampleNodeIds.add(normalized);
            }
          }
          existing.nodeIds = Array.from(mergedNodeIds).slice(0, MAX_CAPTURED_NODE_IDS_PER_ENTRY);
          // Avoid double-counting when fallback overlaps with already scanned bindings.
          // Keep the highest confidence count across local scan, MCP count and merged sample IDs.
          existing.totalNodeCount = Math.max(
            existing.totalNodeCount,
            resolveEntryNodeCount(entry),
            mergedNodeIds.size,
          );
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
          `fileComponentIdToInfo: ${fileComponentIdToInfo.size} entries.`,
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
    // Compute local counts for adoption tracking (SC-1, SC-2)
    // localComponentUsedCount captures only component instances that do not resolve
    // to the tracked DS or to a local component in this file.
    const localComponentUsedCount = unmatchedComponentIdsTotal;

    const parentDerivedComponentCount = new Set(
      Array.from(directParentUsageByKey.values(), (entry) => entry.localComponentKey),
    ).size;

    // localVariableDefinedCount: null if variables fetch failed, otherwise count of variables in consumer file
    const localVariableDefinedCount =
      consumerVariablesResponse?.meta?.variables != null
        ? Object.values(consumerVariablesResponse.meta.variables).length
        : null;

    // localVariableUsedCount (post-MCP): total bound variables minus DS-resolved bindings
    // This is more accurate than unresolvedBoundVariableCount after MCP fallback adds bindings
    const resolvedDsNodeCount = [...variableBindings.values()]
      .reduce((sum, b) => sum + b.totalNodeCount, 0);
    const localVariableUsedCount = Math.max(0, totalBoundVariableCount - resolvedDsNodeCount);

    const result: ConsumerScanResult = {
      componentInstances: Array.from(componentInstances.values()).map(instance => ({
        ...instance,
        nodeIds: instance.nodeIds.slice(0, 20),
        sampleNodes: instance.sampleNodes.slice(0, 20),
      })),
      variableBindings: Array.from(variableBindings.values())
        .map(binding => ({
          ...binding,
          nodeIds: binding.nodeIds.slice(0, 20),
          sampleNodes: binding.sampleNodes.slice(0, 20),
        })),
      warnings,
      localComponentUsedCount,
      parentDerivedComponentCount,
      localVariableDefinedCount,
      localVariableUsedCount,
      usageDetails: {
        parentComponentUsages: Array.from(directParentUsageByKey.values()).map((entry) => ({
          ...entry,
          sampleNodeIds: entry.sampleNodeIds.slice(0, 20),
        })),
        localComponentGraph: Array.from(localComponentGraphByKey.values()).map((entry) => ({
          ...entry,
          sampleNodeIds: entry.sampleNodeIds.slice(0, 20),
        })),
        componentPropertyUsages: Array.from(componentPropertyUsageByNode.values()),
        tokenBindingDetails: Array.from(tokenBindingUsageByNode.values()),
        usageShape: usageDetails.usageShape,
      },
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
