/**
 * Batch Variables Handlers
 *
 * Handlers for batch variable operations:
 * - BATCH_CREATE_VARIABLES
 * - BATCH_UPDATE_VARIABLES
 */

import {
    BatchCreateVariablesParams,
    BatchCreateVariablesResult,
    BatchUpdateVariablesParams,
    BatchUpdateVariablesResult,
    VariableData,
    createBridgeError,
    ERROR_CODES,
} from '../protocol';

import { serializeVariable } from './variables';
import { hexToFigmaRGB } from './variables';

/**
 * BATCH_CREATE_VARIABLES - Create multiple variables in a batch.
 * Uses partial-success semantics: collects errors per item, continues on failure.
 */
export async function handleBatchCreateVariables(
    params: BatchCreateVariablesParams
): Promise<BatchCreateVariablesResult> {
    console.log('[Bridge] Batch creating variables:', params.items.length, 'items');

    const created: VariableData[] = [];
    const errors: Array<{ index: number; name: string; error: string }> = [];

    // Validate items is an array
    if (!Array.isArray(params.items)) {
        throw createBridgeError(
            ERROR_CODES.INVALID_PARAMETER,
            'items must be an array'
        );
    }

    if (params.items.length === 0) {
        return {
            success: true,
            created: [],
            errors: [],
        };
    }

    for (let i = 0; i < params.items.length; i++) {
        const item = params.items[i];
        try {
            // Validate required fields
            if (!item.name) {
                throw createBridgeError(
                    ERROR_CODES.MISSING_PARAMETER,
                    `Item at index ${i}: name is required`
                );
            }
            if (!item.collectionId) {
                throw createBridgeError(
                    ERROR_CODES.MISSING_PARAMETER,
                    `Item at index ${i}: collectionId is required`
                );
            }

            // Get collection
            const collection = await figma.variables.getVariableCollectionByIdAsync(
                item.collectionId
            );
            if (!collection) {
                throw createBridgeError(
                    ERROR_CODES.COLLECTION_NOT_FOUND,
                    `Collection not found: ${item.collectionId}`
                );
            }

            // Create variable
            const variable = figma.variables.createVariable(
                item.name,
                collection.id,
                item.resolvedType as VariableResolvedDataType
            );

            // Set initial values if provided
            if (item.valuesByMode) {
                for (const modeId in item.valuesByMode) {
                    const value = item.valuesByMode[modeId];
                    let processedValue: VariableValue = value as VariableValue;
                    if (item.resolvedType === 'COLOR' && typeof value === 'string') {
                        processedValue = hexToFigmaRGB(value);
                    }
                    variable.setValueForMode(modeId, processedValue);
                }
            }

            // Set description if provided
            if (item.description) {
                variable.description = item.description;
            }

            // Set scopes if provided
            if (item.scopes) {
                variable.scopes = item.scopes as VariableScope[];
            }

            created.push(serializeVariable(variable));
            console.log(`[Bridge] Created variable ${i}:`, variable.id);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            console.error(`[Bridge] Failed to create variable at index ${i}:`, errorMessage);
            errors.push({
                index: i,
                name: item.name || `index_${i}`,
                error: errorMessage,
            });
        }
    }

    const success = errors.length < params.items.length;
    console.log(
        `[Bridge] Batch create complete: ${created.length} created, ${errors.length} errors`
    );

    return {
        success,
        created,
        errors,
    };
}

/**
 * BATCH_UPDATE_VARIABLES - Update multiple variables in a batch.
 * Uses partial-success semantics: collects errors per item, continues on failure.
 */
export async function handleBatchUpdateVariables(
    params: BatchUpdateVariablesParams
): Promise<BatchUpdateVariablesResult> {
    console.log('[Bridge] Batch updating variables:', params.items.length, 'items');

    const updated: VariableData[] = [];
    const errors: Array<{ index: number; variableId: string; error: string }> = [];

    // Validate items is an array
    if (!Array.isArray(params.items)) {
        throw createBridgeError(
            ERROR_CODES.INVALID_PARAMETER,
            'items must be an array'
        );
    }

    if (params.items.length === 0) {
        return {
            success: true,
            updated: [],
            errors: [],
        };
    }

    for (let i = 0; i < params.items.length; i++) {
        const item = params.items[i];
        try {
            // Validate required fields
            if (!item.variableId) {
                throw createBridgeError(
                    ERROR_CODES.MISSING_PARAMETER,
                    `Item at index ${i}: variableId is required`
                );
            }
            if (!item.modeId) {
                throw createBridgeError(
                    ERROR_CODES.MISSING_PARAMETER,
                    `Item at index ${i}: modeId is required`
                );
            }

            // Get variable
            const variable = await figma.variables.getVariableByIdAsync(item.variableId);
            if (!variable) {
                throw createBridgeError(
                    ERROR_CODES.VARIABLE_NOT_FOUND,
                    `Variable not found: ${item.variableId}`
                );
            }

            // Process value
            let processedValue: VariableValue = item.value as VariableValue;
            if (variable.resolvedType === 'COLOR' && typeof item.value === 'string') {
                processedValue = hexToFigmaRGB(item.value);
            } else if (
                typeof item.value === 'string' &&
                item.value.startsWith('VariableID:')
            ) {
                // Handle alias references
                processedValue = {
                    type: 'VARIABLE_ALIAS' as const,
                    id: item.value,
                };
            }

            // Set value
            variable.setValueForMode(item.modeId, processedValue);
            updated.push(serializeVariable(variable));
            console.log(`[Bridge] Updated variable ${i}:`, variable.id);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            console.error(`[Bridge] Failed to update variable at index ${i}:`, errorMessage);
            errors.push({
                index: i,
                variableId: item.variableId || `index_${i}`,
                error: errorMessage,
            });
        }
    }

    const success = errors.length < params.items.length;
    console.log(
        `[Bridge] Batch update complete: ${updated.length} updated, ${errors.length} errors`
    );

    return {
        success,
        updated,
        errors,
    };
}
