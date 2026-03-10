/**
 * Modes and Collections Handlers
 *
 * Handlers for:
 * - ADD_MODE
 * - RENAME_MODE
 * - CREATE_VARIABLE_COLLECTION
 * - DELETE_VARIABLE_COLLECTION
 */

import {
  AddModeParams,
  AddModeResult,
  RenameModeParams,
  RenameModeResult,
  CreateVariableCollectionParams,
  CreateVariableCollectionResult,
  DeleteVariableCollectionParams,
  DeleteVariableCollectionResult,
  VariableCollectionData,
  createBridgeError,
  ERROR_CODES,
} from '../protocol';

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
 * ADD_MODE - Add a mode to a variable collection.
 */
export async function handleAddMode(params: AddModeParams): Promise<AddModeResult> {
  try {
    console.log('[Bridge] Adding mode to collection:', params.collectionId);

    const collection = await figma.variables.getVariableCollectionByIdAsync(
      params.collectionId
    );
    if (!collection) {
      throw createBridgeError(
        ERROR_CODES.COLLECTION_NOT_FOUND,
        `Collection not found: ${params.collectionId}`
      );
    }

    const newModeId = collection.addMode(params.modeName);

    console.log(`[Bridge] Mode "${params.modeName}" added with ID:`, newModeId);

    return {
      success: true,
      collection: serializeCollection(collection),
      newMode: {
        modeId: newModeId,
        name: params.modeName,
      },
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to add mode'
    );
  }
}

/**
 * RENAME_MODE - Rename a mode in a variable collection.
 */
export async function handleRenameMode(params: RenameModeParams): Promise<RenameModeResult> {
  try {
    console.log('[Bridge] Renaming mode:', params.modeId, 'in collection:', params.collectionId);

    const collection = await figma.variables.getVariableCollectionByIdAsync(
      params.collectionId
    );
    if (!collection) {
      throw createBridgeError(
        ERROR_CODES.COLLECTION_NOT_FOUND,
        `Collection not found: ${params.collectionId}`
      );
    }

    const currentMode = collection.modes.find((m) => m.modeId === params.modeId);
    if (!currentMode) {
      throw createBridgeError(ERROR_CODES.INVALID_PARAMETER, `Mode not found: ${params.modeId}`);
    }

    const oldName = currentMode.name;
    collection.renameMode(params.modeId, params.newName);

    console.log(`[Bridge] Mode renamed from "${oldName}" to "${params.newName}"`);

    return {
      success: true,
      collection: serializeCollection(collection),
      oldName,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to rename mode'
    );
  }
}

/**
 * CREATE_VARIABLE_COLLECTION - Create a new variable collection.
 */
export async function handleCreateVariableCollection(
  params: CreateVariableCollectionParams
): Promise<CreateVariableCollectionResult> {
  try {
    console.log('[Bridge] Creating collection:', params.name);

    const collection = figma.variables.createVariableCollection(params.name);

    // Rename the default mode if a name is provided
    if (params.initialModeName && collection.modes.length > 0) {
      collection.renameMode(collection.modes[0].modeId, params.initialModeName);
    }

    // Add additional modes if provided
    if (params.additionalModes && params.additionalModes.length > 0) {
      for (const modeName of params.additionalModes) {
        collection.addMode(modeName);
      }
    }

    console.log('[Bridge] Collection created:', collection.id);

    return {
      success: true,
      collection: serializeCollection(collection),
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to create collection'
    );
  }
}

/**
 * DELETE_VARIABLE_COLLECTION - Delete a variable collection.
 */
export async function handleDeleteVariableCollection(
  params: DeleteVariableCollectionParams
): Promise<DeleteVariableCollectionResult> {
  try {
    console.log('[Bridge] Deleting collection:', params.collectionId);

    const collection = await figma.variables.getVariableCollectionByIdAsync(
      params.collectionId
    );
    if (!collection) {
      throw createBridgeError(
        ERROR_CODES.COLLECTION_NOT_FOUND,
        `Collection not found: ${params.collectionId}`
      );
    }

    const deletedInfo = {
      id: collection.id,
      name: collection.name,
      variableCount: collection.variableIds.length,
    };

    collection.remove();

    console.log('[Bridge] Collection deleted');

    return {
      success: true,
      deleted: deletedInfo,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to delete collection'
    );
  }
}
