import { fetchFigmaFile, fetchFigmaLocalVariables, FigmaApiError } from '../../../../tooling/src/utils/figma-api.js';
import { fetchFigmaLocalVariablesViaMcp, type FigmaVariablesResponse } from '../../../../tooling/src/services/figma-mcp-variables.js';

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

    // Build component catalog
    const components = new Map<string, DsComponentCatalog>();
    if (fileResponse.components) {
      for (const [componentId, component] of Object.entries(fileResponse.components)) {
        const comp = component as { key: string; name: string };
        components.set(comp.key, {
          key: comp.key,
          name: comp.name,
          id: componentId,
        });
      }
    }

    // Fetch variables: MCP-first with REST fallback
    const variablesResponse = await fetchVariablesForDsFile(dsFileKey, token, signal);

    // Build variable catalog
    const variables = new Map<string, DsVariableCatalog>();
    const variableIdToKey = new Map<string, string>();

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
 * Fetch variables for DS file: MCP-first with REST fallback
 */
async function fetchVariablesForDsFile(
  dsFileKey: string,
  token: string,
  signal?: AbortSignal,
): Promise<FigmaVariablesResponse> {
  const fileUrl = `https://www.figma.com/design/${dsFileKey}`;
  if (signal?.aborted) {
    throw createCodedError('deps.consumer.variables_fetch_aborted', 'Operation aborted');
  }

  // Try MCP first
  try {
    return await fetchFigmaLocalVariablesViaMcp({ fileUrl });
  } catch (mcpError) {
    // MCP failed. Fallback to REST where possible.
    const mcpErrorMsg = mcpError instanceof Error ? mcpError.message : String(mcpError);
    console.warn(`[buildDsCatalog] MCP variables fetch failed: ${mcpErrorMsg}. Attempting REST fallback...`);
    if (signal?.aborted) {
      throw createCodedError('deps.consumer.variables_fetch_aborted', 'Operation aborted', {
        cause: mcpError,
      });
    }

    // Fallback to REST if token is available
    if (token && String(token).trim()) {
      try {
        return await fetchFigmaLocalVariables({ fileKey: dsFileKey, token });
      } catch (restError) {
        // Both MCP and REST failed
        const restErrorMsg = restError instanceof Error ? restError.message : String(restError);
        console.warn(`[buildDsCatalog] REST variables fetch failed: ${restErrorMsg}`);
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
    const consumerVariablesResponse = await fetchFigmaLocalVariables({ fileKey, token });
    const componentInstances = new Map<string, ComponentInstance>();
    const variableBindings = new Map<string, VariableBinding>();
    const warnings: Array<{ code: string; message: string; nodeId?: string }> = [];

    // Build component ID to key mapping for this file
    const fileComponentIdToKey = new Map<string, string>();
    if (fileResponse.components) {
      for (const [componentId, component] of Object.entries(fileResponse.components)) {
        const comp = component as { key: string; name: string };
        fileComponentIdToKey.set(componentId, comp.key);
      }
    }

    // Build consumer variable ID -> key mapping
    const consumerVariableIdToKey = new Map<string, string>();
    if (consumerVariablesResponse.meta?.variables) {
      for (const variable of Object.values(consumerVariablesResponse.meta.variables)) {
        const variableKey = String((variable as Record<string, unknown>).key || '').trim();
        if (!variableKey) continue;
        consumerVariableIdToKey.set(variable.id, variableKey);
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

    function scanNode(node: FigmaNode): void {
      // Check for component instances
      if (node.componentId) {
        const componentKey = fileComponentIdToKey.get(node.componentId);
        if (componentKey && dsCatalog.components.has(componentKey)) {
          const dsComponent = dsCatalog.components.get(componentKey)!;
          if (!componentInstances.has(componentKey)) {
            componentInstances.set(componentKey, {
              componentKey,
              componentName: dsComponent.name,
              nodeIds: [],
            });
          }
          componentInstances.get(componentKey)!.nodeIds.push(node.id);
        }
        // Non-DS components are expected (local components) — no warning needed.
      }

      // Check for variable bindings
      if (node.boundVariables) {
        for (const [, bindings] of Object.entries(node.boundVariables)) {
          for (const binding of normalizeBindings(bindings)) {
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
              variableBindings.get(variableKey)!.nodeIds.push(node.id);
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
