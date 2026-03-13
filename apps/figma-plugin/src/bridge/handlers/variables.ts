/**
 * Variables Handlers
 *
 * Handlers for variable-related bridge methods:
 * - GET_VARIABLES_DATA
 * - REFRESH_VARIABLES
 * - UPDATE_VARIABLE
 * - CREATE_VARIABLE
 * - DELETE_VARIABLE
 * - RENAME_VARIABLE
 * - SET_VARIABLE_DESCRIPTION
 */

import {
  GetVariablesDataParams,
  GetVariablesDataResult,
  RefreshVariablesParams,
  RefreshVariablesResult,
  UpdateVariableParams,
  UpdateVariableResult,
  CreateVariableParams,
  CreateVariableResult,
  DeleteVariableParams,
  DeleteVariableResult,
  RenameVariableParams,
  RenameVariableResult,
  SetVariableDescriptionParams,
  SetVariableDescriptionResult,
  SearchVariablesParams,
  SearchVariablesResult,
  VariableData,
  VariableCollectionData,
  createBridgeError,
  ERROR_CODES,
} from '../protocol';

/**
 * Helper: Serialize a Figma Variable to protocol format.
 */
function serializeVariable(v: Variable): VariableData {
  return {
    id: v.id,
    name: v.name,
    key: v.key,
    resolvedType: v.resolvedType,
    valuesByMode: v.valuesByMode,
    variableCollectionId: v.variableCollectionId,
    scopes: v.scopes,
    description: v.description,
    hiddenFromPublishing: v.hiddenFromPublishing,
  };
}

/**
 * Helper: Serialize a Figma VariableCollection to protocol format.
 */
function serializeCollection(c: VariableCollection): VariableCollectionData {
  return {
    id: c.id,
    name: c.name,
    key: c.key,
    modes: c.modes,
    defaultModeId: c.defaultModeId,
    variableIds: c.variableIds,
  };
}

/**
 * Helper: Convert hex color to Figma RGB format.
 */
function hexToFigmaRGB(hex: string): RGBA {
  hex = hex.replace(/^#/, '');

  // Validate hex characters
  if (!/^[0-9A-Fa-f]+$/.test(hex)) {
    throw createBridgeError(
      ERROR_CODES.INVALID_PARAMETER,
      `Invalid hex color: "${hex}" contains non-hex characters`
    );
  }

  let r: number, g: number, b: number, a: number = 1;

  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
  } else if (hex.length === 4) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
    a = parseInt(hex[3] + hex[3], 16) / 255;
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  } else if (hex.length === 8) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
    a = parseInt(hex.substring(6, 8), 16) / 255;
  } else {
    throw createBridgeError(
      ERROR_CODES.INVALID_PARAMETER,
      `Invalid hex color format: "${hex}". Expected 3, 4, 6, or 8 hex characters.`
    );
  }

  return { r, g, b, a };
}

/**
 * GET_VARIABLES_DATA - Return cached variables data.
 */
export async function handleGetVariablesData(
  _params: GetVariablesDataParams
): Promise<GetVariablesDataResult> {
  try {
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    return {
      success: true,
      timestamp: Date.now(),
      fileKey: figma.fileKey || null,
      variables: variables.map(serializeVariable),
      variableCollections: collections.map(serializeCollection),
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to get variables'
    );
  }
}

/**
 * REFRESH_VARIABLES - Re-fetch all variables data.
 */
export async function handleRefreshVariables(
  _params: RefreshVariablesParams
): Promise<RefreshVariablesResult> {
  try {
    console.log('[Bridge] Refreshing variables data...');

    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    const result: RefreshVariablesResult = {
      success: true,
      timestamp: Date.now(),
      fileKey: figma.fileKey || null,
      variables: variables.map(serializeVariable),
      variableCollections: collections.map(serializeCollection),
    };

    console.log(
      `[Bridge] Variables refreshed: ${variables.length} variables in ${collections.length} collections`
    );

    return result;
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to refresh variables'
    );
  }
}

/**
 * UPDATE_VARIABLE - Update a variable's value in a specific mode.
 */
export async function handleUpdateVariable(
  params: UpdateVariableParams
): Promise<UpdateVariableResult> {
  try {
    console.log('[Bridge] Updating variable:', params.variableId);

    const variable = await figma.variables.getVariableByIdAsync(params.variableId);
    if (!variable) {
      throw createBridgeError(ERROR_CODES.VARIABLE_NOT_FOUND, `Variable not found: ${params.variableId}`);
    }

    const value = params.value as VariableValue;

    // Check if value is a variable alias
    if (typeof value === 'string' && value.startsWith('VariableID:')) {
      const aliasValue: VariableValue = {
        type: 'VARIABLE_ALIAS' as const,
        id: value,
      };
      variable.setValueForMode(params.modeId, aliasValue);
      console.log('[Bridge] Converting to variable alias:', value);
    } else if (variable.resolvedType === 'COLOR' && typeof value === 'string') {
      variable.setValueForMode(params.modeId, hexToFigmaRGB(value));
    } else {
      variable.setValueForMode(params.modeId, value);
    }

    console.log('[Bridge] Variable updated successfully');

    return {
      success: true,
      variable: serializeVariable(variable),
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to update variable'
    );
  }
}

/**
 * CREATE_VARIABLE - Create a new variable in a collection.
 */
export async function handleCreateVariable(
  params: CreateVariableParams
): Promise<CreateVariableResult> {
  try {
    console.log('[Bridge] Creating variable:', params.name);

    const collection = await figma.variables.getVariableCollectionByIdAsync(params.collectionId);
    if (!collection) {
      throw createBridgeError(
        ERROR_CODES.COLLECTION_NOT_FOUND,
        `Collection not found: ${params.collectionId}`
      );
    }

    const variable = figma.variables.createVariable(
      params.name,
      collection.id,
      params.resolvedType as VariableResolvedDataType
    );

    // Set initial values if provided
    if (params.valuesByMode) {
      for (const modeId in params.valuesByMode) {
        const value = params.valuesByMode[modeId];
        let processedValue: VariableValue = value as VariableValue;
        if (params.resolvedType === 'COLOR' && typeof value === 'string') {
          processedValue = hexToFigmaRGB(value);
        }
        variable.setValueForMode(modeId, processedValue);
      }
    }

    // Set description if provided
    if (params.description) {
      variable.description = params.description;
    }

    // Set scopes if provided
    if (params.scopes) {
      variable.scopes = params.scopes as VariableScope[];
    }

    console.log('[Bridge] Variable created:', variable.id);

    return {
      success: true,
      variable: serializeVariable(variable),
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to create variable'
    );
  }
}

/**
 * DELETE_VARIABLE - Delete a variable.
 */
export async function handleDeleteVariable(
  params: DeleteVariableParams
): Promise<DeleteVariableResult> {
  try {
    console.log('[Bridge] Deleting variable:', params.variableId);

    const variable = await figma.variables.getVariableByIdAsync(params.variableId);
    if (!variable) {
      throw createBridgeError(ERROR_CODES.VARIABLE_NOT_FOUND, `Variable not found: ${params.variableId}`);
    }

    const deletedInfo = {
      id: variable.id,
      name: variable.name,
    };

    variable.remove();

    console.log('[Bridge] Variable deleted');

    return {
      success: true,
      deleted: deletedInfo,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to delete variable'
    );
  }
}

/**
 * RENAME_VARIABLE - Rename a variable.
 */
export async function handleRenameVariable(
  params: RenameVariableParams
): Promise<RenameVariableResult> {
  try {
    console.log('[Bridge] Renaming variable:', params.variableId, 'to', params.newName);

    const variable = await figma.variables.getVariableByIdAsync(params.variableId);
    if (!variable) {
      throw createBridgeError(ERROR_CODES.VARIABLE_NOT_FOUND, `Variable not found: ${params.variableId}`);
    }

    const oldName = variable.name;
    variable.name = params.newName;

    console.log(`[Bridge] Variable renamed from "${oldName}" to "${params.newName}"`);

    return {
      success: true,
      variable: serializeVariable(variable),
      oldName,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to rename variable'
    );
  }
}

/**
 * SET_VARIABLE_DESCRIPTION - Set description on a variable.
 */
export async function handleSetVariableDescription(
  params: SetVariableDescriptionParams
): Promise<SetVariableDescriptionResult> {
  try {
    console.log('[Bridge] Setting description on variable:', params.variableId);

    const variable = await figma.variables.getVariableByIdAsync(params.variableId);
    if (!variable) {
      throw createBridgeError(ERROR_CODES.VARIABLE_NOT_FOUND, `Variable not found: ${params.variableId}`);
    }

    variable.description = params.description || '';

    console.log('[Bridge] Variable description set successfully');

    return {
      success: true,
      variable: serializeVariable(variable),
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to set variable description'
    );
  }
}

/**
 * SEARCH_VARIABLES - Search variables with filters
 */
export async function handleSearchVariables(
  params: SearchVariablesParams
): Promise<unknown> {
  try {
    console.log('[Bridge] Searching variables with filters:', params);

    const variables = await figma.variables.getLocalVariablesAsync();

    // Build collection filter set if collectionId is specified
    const collectionIdSet = params.collectionId ? new Set([params.collectionId]) : null;

    // Build regex if namePattern is specified
    let nameRegex: RegExp | null = null;
    if (params.namePattern) {
      try {
        nameRegex = new RegExp(params.namePattern, 'i');
      } catch {
        throw createBridgeError(
          ERROR_CODES.INVALID_PARAMETER,
          `Invalid namePattern regex: ${params.namePattern}`
        );
      }
    }

    // Filter variables
    const filtered = variables.filter((v: Variable) => {
      // Filter by collectionId
      if (collectionIdSet && !collectionIdSet.has(v.variableCollectionId)) {
        return false;
      }
      // Filter by resolvedType
      if (params.resolvedType && v.resolvedType !== params.resolvedType) {
        return false;
      }
      // Filter by namePattern (regex match)
      if (nameRegex && !nameRegex.test(v.name)) {
        return false;
      }
      return true;
    });

    // Apply limit (default: 50, max: 200, min: 0)
    const rawLimit = params.limit ?? 50;
    const limit = rawLimit < 0 ? 0 : Math.min(rawLimit, 200);
    const limited = filtered.slice(0, limit);

    // Build result based on compact flag
    const resultVariables = limited.map((v: Variable) => {
      if (params.compact) {
        return {
          id: v.id,
          name: v.name,
          key: v.key,
          resolvedType: v.resolvedType,
          variableCollectionId: v.variableCollectionId,
        };
      }
      return serializeVariable(v);
    });

    console.log(`[Bridge] Found ${resultVariables.length} matching variables`);

    return {
      success: true,
      variables: resultVariables,
      count: resultVariables.length,
    } as SearchVariablesResult;
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
      error instanceof Error ? error.message : 'Failed to search variables'
    );
  }
}
