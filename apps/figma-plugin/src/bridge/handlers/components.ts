/**
 * Components Handlers (P1)
 *
 * Handlers for component-related bridge methods:
 * - GET_LOCAL_COMPONENTS
 * - GET_COMPONENT
 * - INSTANTIATE_COMPONENT
 * - SET_NODE_DESCRIPTION
 * - ADD_COMPONENT_PROPERTY
 * - EDIT_COMPONENT_PROPERTY
 * - DELETE_COMPONENT_PROPERTY
 * - SET_INSTANCE_PROPERTIES
 */

import {
  createBridgeError,
  ERROR_CODES,
} from '../protocol';

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
