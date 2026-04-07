/**
 * Components Handlers (P1 + P2)
 *
 * Handlers for component-related bridge methods:
 * - GET_LOCAL_COMPONENTS (P1)
 * - GET_COMPONENT (P1)
 * - INSTANTIATE_COMPONENT (P1)
 * - SET_NODE_DESCRIPTION (P1)
 * - ADD_COMPONENT_PROPERTY (P1)
 * - EDIT_COMPONENT_PROPERTY (P1)
 * - DELETE_COMPONENT_PROPERTY (P1)
 * - SET_INSTANCE_PROPERTIES (P1)
 * - SEARCH_COMPONENTS (P2)
 * - GET_COMPONENT_SPEC (P2)
 * - GET_COMPONENT_IMAGE (P2)
 * - AUDIT_COMPONENT_TOKEN_COVERAGE (P2)
 * - APPLY_TOKENS_TO_COMPONENT (P2)
 */

import {
  createBridgeError,
  ERROR_CODES,
  SearchComponentsParams,
  SearchComponentsResult,
  CompactComponentResult,
  GetComponentSpecParams,
  GetComponentSpecResult,
  SpecLayerNode,
  VariantSpec,
  GetComponentImageParams,
  GetComponentImageResult,
  ComponentImageResult,
  AuditTokenCoverageParams,
  AuditTokenCoverageResult,
  UnboundNodeInfo,
  ApplyTokensParams,
  ApplyTokensResult,
  ApplyTokensResultItem,
} from '../protocol';
import { stripDiacritics } from '../utils/strip-diacritics.js';

const PAGE_BATCH_SIZE = 3;

// ============================================================================
// Type Helpers
// ============================================================================

interface ComponentData {
  key: string;
  nodeId: string;
  name: string;
  type: string;
  description: string | null;
  width: number;
  height: number;
  properties?: Array<{
    name: string;
    type: string;
    defaultValue: unknown;
  }>;
}

interface ComponentSetData {
  key: string;
  nodeId: string;
  name: string;
  type: 'COMPONENT_SET';
  description: string | null;
  variantAxes: Array<{
    name: string;
    values: string[];
  }>;
  variants: Array<{
    key: string;
    nodeId: string;
    name: string;
    description: string | null;
    variantProperties: Record<string, string>;
    width: number;
    height: number;
  }>;
  defaultVariant: ComponentData | null;
  properties: Array<{
    name: string;
    type: string;
    defaultValue: unknown;
  }>;
}

// ============================================================================
// GET_LOCAL_COMPONENTS
// ============================================================================

export async function handleGetLocalComponents(
  _params: Record<string, unknown>
): Promise<unknown> {
  try {
    console.log('[Bridge] Fetching all local components...');

    const components: ComponentData[] = [];
    const componentSets: ComponentSetData[] = [];

    // Helper to extract component data
    function extractComponentData(node: ComponentNode | BaseNode, isPartOfSet: boolean): ComponentData {
      const data: ComponentData = {
        key: 'key' in node ? (node.key as string) : '',
        nodeId: node.id,
        name: node.name,
        type: node.type,
        description: 'description' in node ? (node.description as string | null) : null,
        width: 'width' in node ? (node.width as number) : 0,
        height: 'height' in node ? (node.height as number) : 0,
      };

      // Get property definitions for non-variant components
      if (!isPartOfSet && 'componentPropertyDefinitions' in node) {
        const propDefs = node.componentPropertyDefinitions as ComponentPropertyDefinitions;
        data.properties = [];
        for (const propName in propDefs) {
          if (propDefs.hasOwnProperty(propName)) {
            const propDef = propDefs[propName];
            data.properties.push({
              name: propName,
              type: propDef.type,
              defaultValue: propDef.defaultValue,
            });
          }
        }
      }

      return data;
    }

    // Helper to extract component set data with all variants
    function extractComponentSetData(node: ComponentSetNode): ComponentSetData {
      const variantAxes: Record<string, string[]> = {};
      const variants: ComponentSetData['variants'] = [];

      // Parse variant properties from children names
      for (const child of node.children) {
        if (child.type === 'COMPONENT') {
          // Parse variant name (e.g., "Size=md, State=default")
          const variantProps: Record<string, string> = {};
          const parts = child.name.split(',').map(p => p.trim());

          for (const part of parts) {
            const kv = part.split('=');
            if (kv.length === 2) {
              const key = kv[0].trim();
              const value = kv[1].trim();
              variantProps[key] = value;

              // Track all values for each axis
              if (!variantAxes[key]) {
                variantAxes[key] = [];
              }
              if (!variantAxes[key].includes(value)) {
                variantAxes[key].push(value);
              }
            }
          }

          variants.push({
            key: child.key,
            nodeId: child.id,
            name: child.name,
            description: child.description || null,
            variantProperties: variantProps,
            width: child.width,
            height: child.height,
          });
        }
      }

      // Convert variantAxes to array format
      const axes = Object.entries(variantAxes).map(([name, values]) => ({
        name,
        values,
      }));

      // Get component set properties
      const properties: ComponentSetData['properties'] = [];
      for (const propName in node.componentPropertyDefinitions) {
        if (node.componentPropertyDefinitions.hasOwnProperty(propName)) {
          const propDef = node.componentPropertyDefinitions[propName];
          properties.push({
            name: propName,
            type: propDef.type,
            defaultValue: propDef.defaultValue,
          });
        }
      }

      return {
        key: node.key,
        nodeId: node.id,
        name: node.name,
        type: 'COMPONENT_SET',
        description: node.description || null,
        variantAxes: axes,
        variants,
        defaultVariant: variants.length > 0 ? {
          key: variants[0].key,
          nodeId: variants[0].nodeId,
          name: variants[0].name,
          type: 'COMPONENT',
          description: variants[0].description,
          width: variants[0].width,
          height: variants[0].height,
        } : null,
        properties,
      };
    }

    // Recursively search for components
    function findComponents(node: BaseNode) {
      if (node.type === 'COMPONENT_SET') {
        componentSets.push(extractComponentSetData(node as ComponentSetNode));
      } else if (node.type === 'COMPONENT') {
        // Only add standalone components (not variants inside component sets)
        if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
          components.push(extractComponentData(node, false));
        }
      }

      // Recurse into children
      if ('children' in node) {
        for (const child of node.children) {
          findComponents(child);
        }
      }
    }

    // Process all pages in batches to avoid blocking UI
    await figma.loadAllPagesAsync();
    const pages = figma.root.children;

    for (let i = 0; i < pages.length; i += PAGE_BATCH_SIZE) {
      const batch = pages.slice(i, i + PAGE_BATCH_SIZE);
      for (const page of batch) {
        findComponents(page);
      }
      // Yield to event loop to avoid blocking
      if (i + PAGE_BATCH_SIZE < pages.length) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    console.log(`[Bridge] Found ${components.length} components and ${componentSets.length} component sets`);

    return {
      success: true,
      data: {
        components,
        componentSets,
        totalComponents: components.length,
        totalComponentSets: componentSets.length,
        fileName: figma.root.name,
        fileKey: figma.fileKey || null,
        timestamp: Date.now(),
      },
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to get local components'
    );
  }
}

// ============================================================================
// GET_COMPONENT
// ============================================================================

export async function handleGetComponent(
  params: { nodeId: string }
): Promise<unknown> {
  try {
    console.log('[Bridge] Fetching component:', params.nodeId);

    const node = await figma.getNodeByIdAsync(params.nodeId);

    if (!node) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.nodeId}`);
    }

    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET' && node.type !== 'INSTANCE') {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `Node is not a component. Type: ${node.type}`
      );
    }

    // Detect if this is a variant (COMPONENT inside a COMPONENT_SET)
    const isVariant = node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET';

    // Extract component data
    const componentData = {
      success: true,
      timestamp: Date.now(),
      nodeId: params.nodeId,
      component: {
        id: node.id,
        name: node.name,
        type: node.type,
        description: 'description' in node ? (node.description as string | null) : null,
        descriptionMarkdown: 'descriptionMarkdown' in node ? (node.descriptionMarkdown as string | null) : null,
        visible: node.visible,
        locked: node.locked,
        annotations: 'annotations' in node ? (node.annotations as Annotation[]) : [],
        isVariant,
        componentPropertyDefinitions: !isVariant && 'componentPropertyDefinitions' in node
          ? node.componentPropertyDefinitions
          : undefined,
        children: 'children' in node
          ? node.children.map(child => ({
            id: child.id,
            name: child.name,
            type: child.type,
          }))
          : undefined,
      },
    };

    console.log('[Bridge] Component data ready');

    return componentData;
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to get component'
    );
  }
}

// ============================================================================
// INSTANTIATE_COMPONENT
// ============================================================================

export async function handleInstantiateComponent(
  params: {
    componentKey?: string;
    nodeId?: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    overrides?: Record<string, unknown>;
    variant?: Record<string, string>;
    parentId?: string;
  }
): Promise<unknown> {
  try {
    console.log('[Bridge] Instantiating component:', params.componentKey || params.nodeId);

    let component: ComponentNode | null = null;

    // Try published library first (by key), then fall back to local component (by nodeId)
    if (params.componentKey) {
      try {
        component = await figma.importComponentByKeyAsync(params.componentKey);
      } catch {
        console.log('[Bridge] Not a published component, trying local...');
      }
    }

    // Fall back to local component by nodeId
    if (!component && params.nodeId) {
      const node = await figma.getNodeByIdAsync(params.nodeId);
      if (node) {
        if (node.type === 'COMPONENT') {
          component = node as ComponentNode;
        } else if (node.type === 'COMPONENT_SET') {
          // For component sets, find the right variant or use default
          const componentSet = node as ComponentSetNode;

          if (params.variant && componentSet.children.length > 0) {
            // Build variant name from properties
            const variantParts = Object.entries(params.variant).map(
              ([key, value]) => `${key}=${value}`
            );
            const targetVariantName = variantParts.join(', ');

            // Find matching variant
            for (const child of componentSet.children) {
              if (child.type === 'COMPONENT' && child.name === targetVariantName) {
                component = child as ComponentNode;
                break;
              }
            }

            // If no exact match, try partial match
            if (!component) {
              for (const child of componentSet.children) {
                if (child.type === 'COMPONENT') {
                  const matches = Object.entries(params.variant).every(
                    ([key, value]) => child.name.includes(`${key}=${value}`)
                  );
                  if (matches) {
                    component = child as ComponentNode;
                    break;
                  }
                }
              }
            }
          }

          // Default to first variant if no match
          if (!component && componentSet.children.length > 0) {
            component = componentSet.children[0] as ComponentNode;
          }
        }
      }
    }

    if (!component) {
      const errorParts = ['Component not found.'];

      if (params.componentKey && !params.nodeId) {
        errorParts.push(`Component key "${params.componentKey}" not found.`);
      } else if (params.nodeId) {
        errorParts.push(`NodeId "${params.nodeId}" does not exist.`);
      } else {
        errorParts.push('No componentKey or nodeId was provided.');
      }

      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, errorParts.join(' '));
    }

    // Create the instance
    const instance = component.createInstance();

    // Apply position if specified
    if (params.position) {
      instance.x = params.position.x || 0;
      instance.y = params.position.y || 0;
    }

    // Apply size override if specified
    if (params.size) {
      instance.resize(params.size.width, params.size.height);
    }

    // Apply property overrides
    if (params.overrides) {
      for (const propName in params.overrides) {
        if (params.overrides.hasOwnProperty(propName)) {
          try {
            const value = params.overrides[propName] as string | boolean | VariableAlias;
            instance.setProperties({ [propName]: value });
          } catch (propError) {
            console.warn('[Bridge] Could not set property', propName, propError);
          }
        }
      }
    }

    // Apply variant selection if specified
    if (params.variant) {
      try {
        const variantProps: Record<string, string | boolean | VariableAlias> = {};
        for (const [key, value] of Object.entries(params.variant)) {
          variantProps[key] = value as string | boolean | VariableAlias;
        }
        instance.setProperties(variantProps);
      } catch (variantError) {
        console.warn('[Bridge] Could not set variant', variantError);
      }
    }

    // Append to parent if specified
    if (params.parentId) {
      const parent = await figma.getNodeByIdAsync(params.parentId);
      if (parent && 'appendChild' in parent) {
        (parent as FrameNode | ComponentNode | ComponentSetNode).appendChild(instance);
      }
    }

    console.log('[Bridge] Component instantiated:', instance.id);

    return {
      success: true,
      instance: {
        id: instance.id,
        name: instance.name,
        x: instance.x,
        y: instance.y,
        width: instance.width,
        height: instance.height,
      },
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to instantiate component'
    );
  }
}

// ============================================================================
// SET_NODE_DESCRIPTION
// ============================================================================

export async function handleSetNodeDescription(
  params: { nodeId: string; description: string; descriptionMarkdown?: string }
): Promise<unknown> {
  try {
    console.log('[Bridge] Setting description on node:', params.nodeId);

    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.nodeId}`);
    }

    if (!('description' in node)) {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `Node type ${node.type} does not support description`
      );
    }

    node.description = params.description || '';

    if (params.descriptionMarkdown && 'descriptionMarkdown' in node) {
      node.descriptionMarkdown = params.descriptionMarkdown;
    }

    console.log('[Bridge] Description set successfully');

    return {
      success: true,
      node: {
        id: node.id,
        name: node.name,
        description: node.description,
      },
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to set description'
    );
  }
}

// ============================================================================
// ADD_COMPONENT_PROPERTY
// ============================================================================

export async function handleAddComponentProperty(
  params: {
    nodeId: string;
    propertyName: string;
    propertyType: string;
    defaultValue: string | boolean | VariableAlias;
    preferredValues?: InstanceSwapPreferredValue[];
  }
): Promise<unknown> {
  try {
    console.log('[Bridge] Adding component property:', params.propertyName, 'type:', params.propertyType);

    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.nodeId}`);
    }

    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `Node must be a COMPONENT or COMPONENT_SET. Got: ${node.type}`
      );
    }

    // Check if it's a variant (can't add properties to variants)
    if (node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET') {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        'Cannot add properties to variant components. Add to the parent COMPONENT_SET instead.'
      );
    }

    // Build options if preferredValues provided
    const options = params.preferredValues ? { preferredValues: params.preferredValues } : undefined;

    const propertyNameWithId = (node as ComponentNode).addComponentProperty(
      params.propertyName,
      params.propertyType as ComponentPropertyType,
      params.defaultValue,
      options
    );

    console.log('[Bridge] Property added:', propertyNameWithId);

    return {
      success: true,
      propertyName: propertyNameWithId,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to add component property'
    );
  }
}

// ============================================================================
// EDIT_COMPONENT_PROPERTY
// ============================================================================

export async function handleEditComponentProperty(
  params: { nodeId: string; propertyName: string; newValue: unknown }
): Promise<unknown> {
  try {
    console.log('[Bridge] Editing component property:', params.propertyName);

    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.nodeId}`);
    }

    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `Node must be a COMPONENT or COMPONENT_SET. Got: ${node.type}`
      );
    }

    const propertyNameWithId = (node as ComponentNode).editComponentProperty(
      params.propertyName,
      params.newValue as never
    );

    console.log('[Bridge] Property edited:', propertyNameWithId);

    return {
      success: true,
      propertyName: propertyNameWithId,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to edit component property'
    );
  }
}

// ============================================================================
// DELETE_COMPONENT_PROPERTY
// ============================================================================

export async function handleDeleteComponentProperty(
  params: { nodeId: string; propertyName: string }
): Promise<unknown> {
  try {
    console.log('[Bridge] Deleting component property:', params.propertyName);

    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.nodeId}`);
    }

    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `Node must be a COMPONENT or COMPONENT_SET. Got: ${node.type}`
      );
    }

    (node as ComponentNode).deleteComponentProperty(params.propertyName);

    console.log('[Bridge] Property deleted');

    return {
      success: true,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to delete component property'
    );
  }
}

// ============================================================================
// SET_INSTANCE_PROPERTIES
// ============================================================================

export async function handleSetInstanceProperties(
  params: { nodeId: string; properties: Record<string, string | boolean | VariableAlias> }
): Promise<unknown> {
  try {
    console.log('[Bridge] Setting instance properties on:', params.nodeId);

    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.nodeId}`);
    }

    if (node.type !== 'INSTANCE') {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `Node must be an INSTANCE. Got: ${node.type}`
      );
    }

    // Load main component first (required for documentAccess: dynamic-page)
    await node.getMainComponentAsync();

    // Get current properties for reference
    const currentProps = node.componentProperties;

    // Build the properties object
    const propsToSet: { [key: string]: string | boolean | VariableAlias } = {};
    const propUpdates = params.properties || {};

    for (const propName in propUpdates) {
      const newValue = propUpdates[propName];

      // Check if this exact property name exists
      if (currentProps[propName] !== undefined) {
        propsToSet[propName] = newValue;
      } else {
        // Try to find a matching property with a suffix (for TEXT/BOOLEAN/INSTANCE_SWAP)
        let foundMatch = false;
        for (const existingProp in currentProps) {
          if (existingProp.startsWith(propName + '#')) {
            propsToSet[existingProp] = newValue;
            foundMatch = true;
            break;
          }
        }

        if (!foundMatch) {
          console.warn('[Bridge] Property not found:', propName);
        }
      }
    }

    if (Object.keys(propsToSet).length === 0) {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `No valid properties to set. Available: ${Object.keys(currentProps).join(', ')}`
      );
    }

    // Apply the properties
    node.setProperties(propsToSet);

    // Get updated properties
    const updatedProps = node.componentProperties;

    console.log('[Bridge] Instance properties updated');

    return {
      success: true,
      instance: {
        id: node.id,
        name: node.name,
        propertiesSet: Object.keys(propsToSet),
        currentProperties: Object.keys(updatedProps).reduce((acc, key) => {
          acc[key] = {
            type: updatedProps[key].type,
            value: updatedProps[key].value,
          };
          return acc;
        }, {} as Record<string, { type: string; value: unknown }>),
      },
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to set instance properties'
    );
  }
}

// ============================================================================
// SEARCH_COMPONENTS (P2)
// ============================================================================

export async function handleSearchComponents(
  params: SearchComponentsParams
): Promise<SearchComponentsResult> {
  try {
    const nameContains = params.nameContains?.toLowerCase();
    const namePattern = params.namePattern ? new RegExp(params.namePattern, 'i') : null;
    const includeVariants = params.includeVariants ?? false;
    const limit = Math.max(1, Math.min(params.limit ?? 50, 200));

    const components: CompactComponentResult[] = [];
    let count = 0;
    let truncated = false;

    // Helper to check name filters
    function passesNameFilter(node: BaseNode): boolean {
      // nameContains: diacritic-insensitive substring match
      if (nameContains) {
        const normalizedName = stripDiacritics(node.name.toLowerCase());
        const normalizedQuery = stripDiacritics(nameContains.toLowerCase());
        if (!normalizedName.includes(normalizedQuery)) {
          return false;
        }
      }
      // namePattern: preserve regex semantics (user's explicit pattern)
      if (namePattern && !namePattern.test(node.name)) {
        return false;
      }
      return true;
    }

    // Helper to extract compact component data
    function extractCompact(node: ComponentNode | ComponentSetNode, pageName?: string): CompactComponentResult {
      if (node.type === 'COMPONENT_SET') {
        return {
          key: node.key,
          nodeId: node.id,
          name: node.name,
          type: 'COMPONENT_SET',
          variantCount: node.children.length,
          pageName,
        };
      }
      return {
        key: node.key,
        nodeId: node.id,
        name: node.name,
        type: 'COMPONENT',
        pageName,
      };
    }

    // BFS traversal
    // SC-01: loadAllPagesAsync() loads ALL pages into memory - this is a fixed cost.
    // The Figma plugin API does not support partial page loads.
    // Early-exit at limit only stops BFS traversal, NOT the page loading.
    await figma.loadAllPagesAsync();
    const queue: Array<{ node: BaseNode; pageName: string }> = figma.root.children.map(page => ({
      node: page,
      pageName: page.name,
    }));
    let didHitLimit = false;

    while (queue.length > 0 && count < limit) {
      const { node, pageName } = queue.shift()!;

      if (node.type === 'COMPONENT_SET') {
        const componentSet = node as ComponentSetNode;
        if (passesNameFilter(componentSet)) {
          components.push(extractCompact(componentSet, pageName));
          count++;

          // Include variants if requested
          if (includeVariants && count < limit) {
            for (const child of componentSet.children) {
              if (child.type === 'COMPONENT' && count < limit) {
                if (passesNameFilter(child)) {
                  components.push({
                    key: child.key,
                    nodeId: child.id,
                    name: child.name,
                    type: 'COMPONENT',
                    pageName,
                  });
                  count++;
                }
              } else if (child.type === 'COMPONENT' && count >= limit) {
                // Stopped adding variants due to limit - mark as truncated
                didHitLimit = true;
                break;
              }
            }
          }
        }
      } else if (node.type === 'COMPONENT') {
        const component = node as ComponentNode;
        // Only add standalone components (not variants inside component sets)
        if (!component.parent || component.parent.type !== 'COMPONENT_SET') {
          if (passesNameFilter(component)) {
            components.push(extractCompact(component, pageName));
            count++;
          }
        }
      }

      // Add children to queue
      if ('children' in node) {
        for (const child of node.children) {
          queue.push({ node: child, pageName });
        }
      }
    }

    // Mark as truncated if we hit the limit anywhere (including inside variant loops)
    if (count >= limit) {
      didHitLimit = true;
    }

    truncated = didHitLimit;

    return {
      success: true,
      components,
      count: components.length,
      truncated,
    };
  } catch (error) {
    // Preserve BridgeError codes, only wrap unknown errors
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    ) {
      throw error;
    }
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to search components'
    );
  }
}

// ============================================================================
// GET_COMPONENT_SPEC (P2)
// ============================================================================

async function buildAnatomy(
  node: BaseNode,
  depth: number,
  currentDepth: number
): Promise<SpecLayerNode> {
  const result: SpecLayerNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Extract boundVariables if available
  if ('boundVariables' in node && node.boundVariables) {
    const bv = node.boundVariables as Record<string, unknown>;
    const boundVarsRecord: Record<string, Array<{ variableId: string }>> = {};

    for (const [field, aliasOrArray] of Object.entries(bv)) {
      const aliases = Array.isArray(aliasOrArray) ? aliasOrArray : [aliasOrArray];
      const validAliases: Array<{ variableId: string }> = [];

      for (const alias of aliases) {
        if (alias && typeof alias === 'object' && 'id' in alias) {
          validAliases.push({ variableId: (alias as { id: string }).id });
        }
      }

      if (validAliases.length > 0) {
        boundVarsRecord[field] = validAliases;
      }
    }

    if (Object.keys(boundVarsRecord).length > 0) {
      result.boundVariables = boundVarsRecord;
    }
  }

  // Extract layout metadata (SC-05)
  if ('layoutMode' in node && node.layoutMode) {
    const layoutMode = node.layoutMode as 'HORIZONTAL' | 'VERTICAL' | 'NONE';
    const spacing = 'itemSpacing' in node ? (node.itemSpacing as number) : undefined;
    const paddingTop = 'paddingTop' in node ? (node.paddingTop as number) : undefined;
    const paddingRight = 'paddingRight' in node ? (node.paddingRight as number) : undefined;
    const paddingBottom = 'paddingBottom' in node ? (node.paddingBottom as number) : undefined;
    const paddingLeft = 'paddingLeft' in node ? (node.paddingLeft as number) : undefined;
    const alignmentHorizontal = 'primaryAxisAlignItems' in node ? (node.primaryAxisAlignItems as string) : undefined;
    const alignmentVertical = 'counterAxisAlignItems' in node ? (node.counterAxisAlignItems as string) : undefined;
    const sizingHorizontal = 'primaryAxisSizingMode' in node ? (node.primaryAxisSizingMode as string) : undefined;
    const sizingVertical = 'counterAxisSizingMode' in node ? (node.counterAxisSizingMode as string) : undefined;

    result.layout = {
      mode: layoutMode === 'HORIZONTAL' ? 'horizontal' : layoutMode === 'VERTICAL' ? 'vertical' : 'none',
      spacing,
      padding: (paddingTop !== undefined || paddingRight !== undefined || paddingBottom !== undefined || paddingLeft !== undefined)
        ? {
          top: paddingTop ?? 0,
          right: paddingRight ?? 0,
          bottom: paddingBottom ?? 0,
          left: paddingLeft ?? 0,
        }
        : undefined,
      alignment: (alignmentHorizontal || alignmentVertical)
        ? {
          horizontal: alignmentHorizontal ?? 'min',
          vertical: alignmentVertical ?? 'min',
        }
        : undefined,
      sizing: (sizingHorizontal || sizingVertical)
        ? {
          horizontal: sizingHorizontal ?? 'fixed',
          vertical: sizingVertical ?? 'fixed',
        }
        : undefined,
    };
  }

  // Recurse into children if depth allows
  if (depth === -1 || currentDepth < depth) {
    if ('children' in node && node.children.length > 0) {
      result.children = [];
      for (const child of node.children) {
        result.children.push(await buildAnatomy(child, depth, currentDepth + 1));
      }
    }
  }

  return result;
}

async function buildVariantSpec(variant: ComponentNode): Promise<VariantSpec> {
  const layerTokens: Array<{ nodeId: string; nodeName: string; field: string; variableId: string }> = [];

  // BFS to collect all boundVariables in the variant
  const queue: BaseNode[] = [variant];
  while (queue.length > 0) {
    const node = queue.shift()!;

    if ('boundVariables' in node && node.boundVariables) {
      const bv = node.boundVariables as Record<string, unknown>;
      for (const [field, aliasOrArray] of Object.entries(bv)) {
        const aliases = Array.isArray(aliasOrArray) ? aliasOrArray : [aliasOrArray];
        for (const alias of aliases) {
          if (alias && typeof alias === 'object' && 'id' in alias) {
            layerTokens.push({
              nodeId: node.id,
              nodeName: node.name,
              field,
              variableId: (alias as { id: string }).id,
            });
          }
        }
      }
    }

    if ('children' in node) {
      for (const child of node.children) {
        queue.push(child);
      }
    }
  }

  // Parse variant properties from name
  const variantProperties: Record<string, string> = {};
  const parts = variant.name.split(',').map(p => p.trim());
  for (const part of parts) {
    const kv = part.split('=');
    if (kv.length === 2) {
      variantProperties[kv[0].trim()] = kv[1].trim();
    }
  }

  return {
    key: variant.key,
    nodeId: variant.id,
    name: variant.name,
    description: variant.description || null,
    variantProperties,
    layerTokens,
  };
}

export async function handleGetComponentSpec(
  params: GetComponentSpecParams
): Promise<GetComponentSpecResult> {
  try {
    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.nodeId}`);
    }

    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `Node must be COMPONENT or COMPONENT_SET. Got: ${node.type}`
      );
    }

    const depth = params.depth ?? 3;
    const compact = params.compact ?? false;

    // Build anatomy
    const anatomy = await buildAnatomy(node, depth, 0);

    // For compact mode, remove children
    if (compact && anatomy.children) {
      anatomy.children = undefined;
    }

    // Extract variant axes and variants for COMPONENT_SET
    let variants: VariantSpec[] | undefined;
    let variantAxes: Array<{ name: string; values: string[] }> | undefined;

    if (node.type === 'COMPONENT_SET') {
      const componentSet = node as ComponentSetNode;
      variants = [];
      const axesMap: Record<string, Set<string>> = {};

      for (const child of componentSet.children) {
        if (child.type === 'COMPONENT') {
          variants.push(await buildVariantSpec(child as ComponentNode));

          // Parse axes from variant name
          const parts = child.name.split(',').map(p => p.trim());
          for (const part of parts) {
            const kv = part.split('=');
            if (kv.length === 2) {
              const axisName = kv[0].trim();
              const axisValue = kv[1].trim();
              if (!axesMap[axisName]) {
                axesMap[axisName] = new Set();
              }
              axesMap[axisName].add(axisValue);
            }
          }
        }
      }

      variantAxes = Object.entries(axesMap).map(([name, values]) => ({
        name,
        values: Array.from(values),
      }));
    }

    // Infer states axis (look for 'State', 'Status', or 'Interaction')
    const states: string[] = [];
    if (variantAxes) {
      const stateAxis = variantAxes.find(
        axis => ['State', 'Status', 'Interaction'].includes(axis.name)
      );
      if (stateAxis) {
        states.push(...stateAxis.values);
      }
    }

    // Extract props from componentPropertyDefinitions
    const props: Array<{ name: string; type: string; defaultValue: unknown }> = [];
    if ('componentPropertyDefinitions' in node) {
      const propDefs = node.componentPropertyDefinitions;
      for (const propName in propDefs) {
        if (propDefs.hasOwnProperty(propName)) {
          const propDef = propDefs[propName];
          props.push({
            name: propName,
            type: propDef.type,
            defaultValue: propDef.defaultValue,
          });
        }
      }
    }

    // Collect all token bindings from anatomy BFS
    const tokenBindings: Array<{ nodeId: string; nodeName: string; field: string; variableId: string }> = [];
    const bindingQueue: BaseNode[] = [node];
    while (bindingQueue.length > 0) {
      const n = bindingQueue.shift()!;
      if ('boundVariables' in n && n.boundVariables) {
        const bv = n.boundVariables as Record<string, unknown>;
        for (const [field, aliasOrArray] of Object.entries(bv)) {
          const aliases = Array.isArray(aliasOrArray) ? aliasOrArray : [aliasOrArray];
          for (const alias of aliases) {
            if (alias && typeof alias === 'object' && 'id' in alias) {
              tokenBindings.push({
                nodeId: n.id,
                nodeName: n.name,
                field,
                variableId: (alias as { id: string }).id,
              });
            }
          }
        }
      }
      if ('children' in n) {
        for (const child of n.children) {
          bindingQueue.push(child);
        }
      }
    }

    return {
      success: true,
      nodeId: node.id,
      name: node.name,
      type: node.type as 'COMPONENT' | 'COMPONENT_SET',
      description: 'description' in node ? (node.description as string | null) : null,
      anatomy,
      variants,
      variantAxes,
      props,
      states,
      tokenBindings,
    };
  } catch (error) {
    // Preserve BridgeError codes, only wrap unknown errors
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    ) {
      throw error;
    }
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to get component spec'
    );
  }
}

// ============================================================================
// GET_COMPONENT_IMAGE (P2)
// ============================================================================

const MAX_COMPONENT_IMAGE_BATCH = 20;

export async function handleGetComponentImage(
  params: GetComponentImageParams
): Promise<GetComponentImageResult> {
  try {
    // Keep at 20 for now: no explicit WS max-payload config exists in server manager.
    // Timeout pressure (60s) is the primary operational constraint.
    if (params.nodeIds.length > MAX_COMPONENT_IMAGE_BATCH) {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `Max ${MAX_COMPONENT_IMAGE_BATCH} nodeIds allowed per batch`
      );
    }

    const format = params.format ?? 'PNG';
    const scale = params.scale ?? 2;
    const images: ComponentImageResult[] = [];

    // Serial loop to avoid blocking plugin main thread
    for (const nodeId of params.nodeIds) {
      const node = await figma.getNodeByIdAsync(nodeId);

      if (!node || !('exportAsync' in node)) {
        images.push({
          nodeId,
          format,
          error: 'Node not found or not exportable',
        });
        continue;
      }

      try {
        const bytes = await node.exportAsync({
          format,
          constraint: { type: 'SCALE', value: scale },
        });
        const base64 = figma.base64Encode(bytes);
        images.push({
          nodeId,
          base64,
          format,
          byteLength: bytes.length,
        });
      } catch (err) {
        images.push({
          nodeId,
          format,
          error: err instanceof Error ? err.message : 'Export failed',
        });
      }
    }

    const errors = images.filter(i => i.error).length;
    const success = images.length === 0 ? true : errors < images.length;

    return {
      success,
      images,
      count: images.length,
      errors,
    };
  } catch (error) {
    // Preserve BridgeError codes, only wrap unknown errors
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    ) {
      throw error;
    }
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to get component images'
    );
  }
}

// ============================================================================
// AUDIT_COMPONENT_TOKEN_COVERAGE (P2)
// ============================================================================

export async function handleAuditTokenCoverage(
  params: AuditTokenCoverageParams
): Promise<AuditTokenCoverageResult> {
  try {
    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.nodeId}`);
    }

    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        `Node must be COMPONENT or COMPONENT_SET. Got: ${node.type}`
      );
    }

    const maxNodes = Math.max(1, Math.min(params.maxNodes ?? 500, 2000));
    const fieldCoverage: Record<string, { total: number; bound: number }> = {};
    const unboundNodes: UnboundNodeInfo[] = [];
    let totalNodes = 0;
    let nodesWithBindings = 0;
    let truncated = false;

    // BFS traversal
    const queue: BaseNode[] = [node];

    while (queue.length > 0) {
      if (totalNodes >= maxNodes) {
        truncated = true;
        break;
      }

      const currentNode = queue.shift()!;
      totalNodes++;

      // Check boundVariables
      const bv = ('boundVariables' in currentNode ? currentNode.boundVariables : {}) ?? {};
      const hasAnyBinding = Object.keys(bv).length > 0;

      if (hasAnyBinding) {
        nodesWithBindings++;
      }

      // Check fills/strokes presence
      const hasFills = 'fills' in currentNode && Array.isArray((currentNode as { fills: unknown }).fills) && (currentNode.fills as unknown[]).length > 0;
      const hasStrokes = 'strokes' in currentNode && Array.isArray((currentNode as { strokes: unknown }).strokes) && (currentNode.strokes as unknown[]).length > 0;

      // Track field coverage for bindable fields
      if (hasFills) {
        fieldCoverage['fills'] = fieldCoverage['fills'] ?? { total: 0, bound: 0 };
        fieldCoverage['fills'].total++;
        if (bv['fills']) fieldCoverage['fills'].bound++;
      }

      if (hasStrokes) {
        fieldCoverage['strokes'] = fieldCoverage['strokes'] ?? { total: 0, bound: 0 };
        fieldCoverage['strokes'].total++;
        if (bv['strokes']) fieldCoverage['strokes'].bound++;
      }

      // Track opacity if not default
      if ('opacity' in currentNode && currentNode.opacity !== 1) {
        fieldCoverage['opacity'] = fieldCoverage['opacity'] ?? { total: 0, bound: 0 };
        fieldCoverage['opacity'].total++;
        if (bv['opacity']) fieldCoverage['opacity'].bound++;
      }

      // Add to unboundNodes if has visual properties but no bindings
      if ((hasFills || hasStrokes) && !hasAnyBinding) {
        unboundNodes.push({
          nodeId: currentNode.id,
          nodeName: currentNode.name,
          nodeType: currentNode.type,
          hasFills,
          hasStrokes,
        });
      }

      // Add children to queue
      if ('children' in currentNode) {
        for (const child of currentNode.children) {
          queue.push(child);
        }
      }
    }

    const coveragePercent = totalNodes > 0 ? Math.round((nodesWithBindings / totalNodes) * 100) : 0;

    return {
      success: true,
      nodeId: node.id,
      totalNodes,
      nodesWithBindings,
      coveragePercent,
      truncated,
      unboundNodes,
      fieldCoverage,
    };
  } catch (error) {
    // Preserve BridgeError codes, only wrap unknown errors
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    ) {
      throw error;
    }
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to audit token coverage'
    );
  }
}

// ============================================================================
// APPLY_TOKENS_TO_COMPONENT (P2)
// ============================================================================

export async function handleApplyTokens(
  params: ApplyTokensParams
): Promise<ApplyTokensResult> {
  try {
    // Guard: max 100 items
    if (params.items.length > 100) {
      throw createBridgeError(
        ERROR_CODES.INVALID_PARAMETER,
        'Max 100 items allowed per batch'
      );
    }

    const dryRun = params.dryRun ?? false;
    const items: ApplyTokensResultItem[] = [];

    for (const item of params.items) {
      // Validate node existence
      const node = await figma.getNodeByIdAsync(item.nodeId);
      if (!node) {
        items.push({
          nodeId: item.nodeId,
          variableId: item.variableId,
          field: item.field,
          status: 'error',
          reason: 'Node not found',
        });
        continue;
      }

      // Validate variable existence
      const variable = await figma.variables.getVariableByIdAsync(item.variableId);
      if (!variable) {
        items.push({
          nodeId: item.nodeId,
          variableId: item.variableId,
          field: item.field,
          status: 'error',
          reason: 'Variable not found',
        });
        continue;
      }

      // Validate field support for fills/strokes
      const isFillLike = item.field === 'fills' || item.field === 'strokes';
      if (isFillLike) {
        const prop = item.field as 'fills' | 'strokes';
        if (!(prop in node)) {
          items.push({
            nodeId: item.nodeId,
            variableId: item.variableId,
            field: item.field,
            status: 'error',
            reason: `Node type ${node.type} does not support ${item.field}`,
          });
          continue;
        }
      } else {
        // Validate non-fill-like fields (opacity, cornerRadius, etc.)
        if (!(item.field in node)) {
          items.push({
            nodeId: item.nodeId,
            variableId: item.variableId,
            field: item.field,
            status: 'error',
            reason: `Node type ${node.type} does not support ${item.field}`,
          });
          continue;
        }
      }

      if (dryRun) {
        // dryRun: validate only, no mutations
        items.push({
          nodeId: item.nodeId,
          variableId: item.variableId,
          field: item.field,
          status: 'applied',
        });
      } else {
        // Real apply
        try {
          if (isFillLike) {
            const paintIndex = item.paintIndex ?? 0;
            const paintField = item.paintField ?? 'color';
            const prop = item.field as 'fills' | 'strokes';
            const nodeWithProp = node as SceneNode & { [prop: string]: Paint[] | readonly Paint[] };
            const paintsValue = nodeWithProp[prop];

            if (!Array.isArray(paintsValue)) {
              items.push({
                nodeId: item.nodeId,
                variableId: item.variableId,
                field: item.field,
                status: 'error',
                reason: `Node ${item.nodeId} has invalid ${prop} property`,
              });
              continue;
            }

            const paints = [...paintsValue] as Paint[];

            if (paintIndex >= paints.length) {
              items.push({
                nodeId: item.nodeId,
                variableId: item.variableId,
                field: item.field,
                status: 'error',
                reason: `paintIndex ${paintIndex} out of range`,
              });
              continue;
            }

            // Only solid paints can be bound to variables
            const paint = paints[paintIndex] as SolidPaint;
            if (paint.type !== 'SOLID') {
              items.push({
                nodeId: item.nodeId,
                variableId: item.variableId,
                field: item.field,
                status: 'error',
                reason: `Paint at index ${paintIndex} is not a solid paint (type: ${paint.type})`,
              });
              continue;
            }

            paints[paintIndex] = figma.variables.setBoundVariableForPaint(
              paint,
              paintField as 'color',
              variable
            );
            nodeWithProp[prop] = paints;
          } else {
            (node as SceneNode).setBoundVariable(item.field as VariableBindableNodeField, variable);
          }

          items.push({
            nodeId: item.nodeId,
            variableId: item.variableId,
            field: item.field,
            status: 'applied',
          });
        } catch (err) {
          items.push({
            nodeId: item.nodeId,
            variableId: item.variableId,
            field: item.field,
            status: 'error',
            reason: err instanceof Error ? err.message : 'Failed to bind variable',
          });
        }
      }
    }

    const appliedCount = items.filter(i => i.status === 'applied').length;
    const errorCount = items.filter(i => i.status === 'error').length;
    const success = appliedCount > 0 || (dryRun && items.every(i => i.status !== 'error'));

    return {
      success,
      dryRun,
      items,
      appliedCount,
      errorCount,
    };
  } catch (error) {
    // Preserve BridgeError codes, only wrap unknown errors
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    ) {
      throw error;
    }
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to apply tokens'
    );
  }
}
