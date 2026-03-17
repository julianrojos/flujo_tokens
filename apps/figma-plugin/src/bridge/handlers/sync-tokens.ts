/**
 * Sync Tokens Handlers
 *
 * Handlers for token sync operations:
 * - SYNC_TOKENS_PLAN: Compare desired tokens with current state
 * - SYNC_TOKENS_APPLY: Apply the planned changes
 */

import {
    SyncTokensPlanParams,
    SyncTokensPlanResult,
    SyncTokensApplyParams,
    SyncTokensApplyResult,
    TokenDiff,
    DtcgTokenTree,
    createBridgeError,
    ERROR_CODES,
} from '../protocol';

import { hexToFigmaRGB } from './variables';

/**
 * Normalize a token path for comparison.
 * Uses Unicode separator to avoid collisions between paths like colors/primary/blue and colors-primary-blue.
 */
function normalizeTokenPath(path: string): string {
    // Use Unicode Private Use Area character as separator to avoid collision
    return path.toLowerCase().replace(/[\s\/]+/g, '\uE000');
}

/**
 * Convert RGBA to hex for comparison.
 */
function rgbaToHexString(rgba: { r: number; g: number; b: number; a?: number }): string {
    const r = Math.round(rgba.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(rgba.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(rgba.b * 255).toString(16).padStart(2, '0');
    const a = rgba.a !== undefined && rgba.a !== 1
        ? Math.round(rgba.a * 255).toString(16).padStart(2, '0')
        : '';
    return `#${r}${g}${b}${a}`;
}

/**
 * Normalize a value for comparison.
 * Converts COLOR values to hex (lowercase), handles other types appropriately.
 */
function normalizeValueForComparison(value: unknown, resolvedType?: string): unknown {
    if (resolvedType === 'COLOR') {
        // Handle RGBA object
        if (typeof value === 'object' && value !== null && 'r' in value) {
            return rgbaToHexString(value as { r: number; g: number; b: number; a?: number });
        }
        // Handle hex string - normalize to lowercase for comparison
        if (typeof value === 'string' && value.startsWith('#')) {
            return value.toLowerCase();
        }
    }
    return value;
}

/**
 * Check if two values are equivalent after normalization.
 */
function valuesAreEqual(current: unknown, desired: unknown, resolvedType?: string): boolean {
    const normalizedCurrent = normalizeValueForComparison(current, resolvedType);
    const normalizedDesired = normalizeValueForComparison(desired, resolvedType);
    return JSON.stringify(normalizedCurrent) === JSON.stringify(normalizedDesired);
}

/**
 * Flatten a DTCG token tree into individual tokens with paths.
 */
function flattenDtcg(tree: DtcgTokenTree, prefix = ''): Array<{
    path: string;
    value: unknown;
    type: string;
}> {
    const result: Array<{ path: string; value: unknown; type: string }> = [];

    for (const [key, node] of Object.entries(tree)) {
        const currentPath = prefix ? `${prefix}/${key}` : key;

        // Check if this is a leaf node (has $value and $type)
        if (
            typeof node === 'object' &&
            node !== null &&
            '$value' in node &&
            '$type' in node
        ) {
            result.push({
                path: currentPath,
                value: (node as { $value: unknown }).$value,
                type: String((node as { $type: unknown }).$type),
            });
        } else if (typeof node === 'object' && node !== null) {
            // Recurse into nested object
            result.push(...flattenDtcg(node as DtcgTokenTree, currentPath));
        }
    }

    return result;
}

/**
 * Convert DTCG type to Figma variable type.
 */
function dtcgTypeToFigmaType(dtcgType: string): string {
    const typeMap: Record<string, string> = {
        color: 'COLOR',
        number: 'FLOAT',
        dimension: 'FLOAT',
        fontWeight: 'FLOAT',
        spacing: 'FLOAT',
        borderWidth: 'FLOAT',
        string: 'STRING',
        fontFamily: 'STRING',
        boolean: 'BOOLEAN',
    };

    return typeMap[dtcgType.toLowerCase()] || 'STRING';
}

/**
 * Convert a value to Figma format based on type.
 */
function convertValueForFigma(value: unknown, figmaType: string): VariableValue {
    if (figmaType === 'COLOR' && typeof value === 'string') {
        return hexToFigmaRGB(value);
    }
    return value as VariableValue;
}

/**
 * SYNC_TOKENS_PLAN - Create a diff plan between desired and current tokens.
 */
export async function handleSyncTokensPlan(
    params: SyncTokensPlanParams
): Promise<SyncTokensPlanResult> {
    console.log('[Bridge] Planning token sync:', params);

    const { tokens, collection, pruneMode = false } = params;

    // Flatten desired tokens
    const desiredTokens = flattenDtcg(tokens);
    console.log(`[Bridge] Flattened ${desiredTokens.length} desired tokens`);

    // Get current variables
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    // Filter by collection name if specified
    let targetCollections = collections;
    if (collection) {
        targetCollections = collections.filter((c) =>
            c.name.toLowerCase().includes(collection.toLowerCase())
        );
    }

    if (targetCollections.length === 0) {
        throw createBridgeError(
            ERROR_CODES.COLLECTION_NOT_FOUND,
            `No collections found matching "${collection}"`
        );
    }

    // Get collection ID
    const targetCollection = targetCollections[0];

    // Build current variables map (normalized to lowercase for comparison)
    const currentMap = new Map<string, { variable: Variable; value: unknown }>();
    for (const v of variables) {
        if (v.variableCollectionId === targetCollection.id) {
            const normalizedName = normalizeTokenPath(v.name);
            currentMap.set(normalizedName, {
                variable: v,
                value: v.valuesByMode[targetCollection.defaultModeId],
            });
        }
    }

    // Build diff
    const plan: TokenDiff[] = [];
    let additions = 0;
    let updates = 0;
    let deletions = 0;

    // Process desired tokens
    for (const desired of desiredTokens) {
        const normalizedName = normalizeTokenPath(desired.path);
        const current = currentMap.get(normalizedName);

        if (!current) {
            // New token - addition
            plan.push({
                path: desired.path,
                action: 'add',
                desiredValue: desired.value,
                tokenType: desired.type,
            });
            additions++;
        } else {
            // Check if value changed (using normalized comparison for COLOR types)
            if (!valuesAreEqual(current.value, desired.value, current.variable.resolvedType)) {
                plan.push({
                    path: desired.path,
                    action: 'update',
                    currentValue: current.value,
                    desiredValue: desired.value,
                    variableId: current.variable.id,
                });
                updates++;
            }
            // Remove from currentMap to track what's left for deletion
            currentMap.delete(normalizedName);
        }
    }

    // Handle deletions (if pruneMode is enabled)
    if (pruneMode) {
        for (const [, currentEntry] of currentMap) {
            plan.push({
                path: currentEntry.variable.name,
                action: 'delete',
                currentValue: currentEntry.value,
                variableId: currentEntry.variable.id,
            });
            deletions++;
        }
    }

    const summary = { additions, updates, deletions };

    console.log(`[Bridge] Sync plan: ${additions} additions, ${updates} updates, ${deletions} deletions`);

    return {
        success: true,
        plan,
        summary,
    };
}

/**
 * SYNC_TOKENS_APPLY - Apply the planned changes.
 */
export async function handleSyncTokensApply(
    params: SyncTokensApplyParams
): Promise<SyncTokensApplyResult> {
    console.log('[Bridge] Applying token sync:', params);

    const { plan, collection, abortOnError = true } = params;

    if (!plan || plan.length === 0) {
        throw createBridgeError(
            ERROR_CODES.INVALID_PARAMETER,
            'plan must not be empty'
        );
    }

    // Get collections
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    // Filter by collection name if specified
    let targetCollections = collections;
    if (collection) {
        targetCollections = collections.filter((c) =>
            c.name.toLowerCase().includes(collection.toLowerCase())
        );
    }

    if (targetCollections.length === 0) {
        throw createBridgeError(
            ERROR_CODES.COLLECTION_NOT_FOUND,
            `No collections found matching "${collection}"`
        );
    }

    const targetCollection = targetCollections[0];
    const modeId = targetCollection.defaultModeId;

    // Group plan by action
    const additions = plan.filter((p) => p.action === 'add');
    const updates = plan.filter((p) => p.action === 'update');
    const deletions = plan.filter((p) => p.action === 'delete');

    const applied = { added: 0, updated: 0, deleted: 0 };
    const errors: Array<{ path: string; error: string }> = [];

    // Process additions
    for (const item of additions) {
        try {
            const figmaType = dtcgTypeToFigmaType(
                // Use tokenType from TokenDiff as primary source, fallback to $type for compatibility
                item.tokenType ?? (
                    typeof item.desiredValue === 'object' && item.desiredValue !== null && '$type' in item.desiredValue
                        ? String((item.desiredValue as { $type: string }).$type)
                        : 'string'
                )
            );

            const variable = figma.variables.createVariable(
                item.path, // Already in DTCG format (e.g., colors/blue-300)
                targetCollection.id,
                figmaType as VariableResolvedDataType
            );

            // Set value
            const processedValue = convertValueForFigma(item.desiredValue, figmaType);
            variable.setValueForMode(modeId, processedValue);

            applied.added++;
            console.log(`[Bridge] Added token: ${item.path}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[Bridge] Failed to add token ${item.path}:`, errorMessage);
            errors.push({ path: item.path, error: errorMessage });
            if (abortOnError) {
                break;
            }
        }
    }

    // Process updates (if not aborted)
    if (!abortOnError || errors.length === 0) {
        for (const item of updates) {
            try {
                if (!item.variableId) {
                    throw new Error('variableId is required for update');
                }

                const variable = await figma.variables.getVariableByIdAsync(item.variableId);
                if (!variable) {
                    throw new Error(`Variable not found: ${item.variableId}`);
                }

                const processedValue = convertValueForFigma(item.desiredValue, variable.resolvedType);
                variable.setValueForMode(modeId, processedValue);

                applied.updated++;
                console.log(`[Bridge] Updated token: ${item.path}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[Bridge] Failed to update token ${item.path}:`, errorMessage);
                errors.push({ path: item.path, error: errorMessage });
                if (abortOnError) {
                    break;
                }
            }
        }
    }

    // Process deletions (if not aborted)
    if (!abortOnError || errors.length === 0) {
        for (const item of deletions) {
            try {
                if (!item.variableId) {
                    throw new Error('variableId is required for delete');
                }

                const variable = await figma.variables.getVariableByIdAsync(item.variableId);
                if (!variable) {
                    throw new Error(`Variable not found: ${item.variableId}`);
                }

                variable.remove();
                applied.deleted++;
                console.log(`[Bridge] Deleted token: ${item.path}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[Bridge] Failed to delete token ${item.path}:`, errorMessage);
                errors.push({ path: item.path, error: errorMessage });
                if (abortOnError) {
                    break;
                }
            }
        }
    }

    const success = errors.length === 0;

    console.log(
        `[Bridge] Sync applied: ${applied.added} added, ${applied.updated} updated, ${applied.deleted} deleted, ${errors.length} errors`
    );

    return {
        success,
        applied,
        errors,
    };
}
