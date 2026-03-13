/**
 * Token Export Handlers
 *
 * Handler for token export with multiple format serializers:
 * - CSS (custom properties)
 * - Tailwind (theme extension)
 * - TypeScript (const export)
 */

import {
    ExportTokensParams,
    ExportTokensResult,
    TokenExportFormat,
    createBridgeError,
    ERROR_CODES,
} from '../protocol';

import { isVariableAlias, resolveVariableAliases } from './variables';

/**
 * Convert a Figma variable name to a CSS custom property name.
 * Example: "colors/primary/Blue 300" -> "--colors-primary-blue-300"
 */
function toCssVarName(name: string): string {
    return (
        '--' +
        name
            .replace(/[\/_\s]+/g, '-')
            .replace(/-+/g, '-')
            .toLowerCase()
            .replace(/^-/, '')
    );
}

/**
 * Convert Figma RGB/RGBA to hex string.
 */
function rgbaToHex(rgba: { r: number; g: number; b: number; a?: number }): string {
    const r = Math.round(rgba.r * 255)
        .toString(16)
        .padStart(2, '0');
    const g = Math.round(rgba.g * 255)
        .toString(16)
        .padStart(2, '0');
    const b = Math.round(rgba.b * 255)
        .toString(16)
        .padStart(2, '0');
    const a = rgba.a !== undefined && rgba.a !== 1
        ? Math.round(rgba.a * 255)
            .toString(16)
            .padStart(2, '0')
        : '';
    return `#${r}${g}${b}${a}`;
}

/**
 * Convert a Figma variable value to a string representation.
 */
function figmaValueToString(val: unknown, resolvedType: string): string {
    if (val === null || val === undefined) {
        return 'unset';
    }

    if (resolvedType === 'COLOR') {
        if (typeof val === 'object' && 'r' in val) {
            return rgbaToHex(val as { r: number; g: number; b: number; a?: number });
        }
        // If it's an alias, we'll handle it separately
        if (isVariableAlias(val)) {
            return '/* alias */';
        }
        return String(val);
    }

    if (resolvedType === 'FLOAT') {
        return String(val);
    }

    if (resolvedType === 'STRING') {
        return String(val);
    }

    if (resolvedType === 'BOOLEAN') {
        return String(val);
    }

    return String(val);
}

/**
 * Build a nested object from flat path entries.
 * Example: ["colors/primary/blue", "#0000FF"] -> { colors: { primary: { blue: "#0000FF" } } }
 */
function buildNestedObject(
    entries: Array<{ path: string; value: unknown }>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const entry of entries) {
        const parts = entry.path.split('/');
        let current = result;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in current)) {
                current[part] = {};
            }
            current = current[part] as Record<string, unknown>;
        }

        const lastPart = parts[parts.length - 1];
        current[lastPart] = entry.value;
    }

    return result;
}

/**
 * Format variables as CSS custom properties.
 * resolveAliases=true: resolve aliases to concrete values
 * resolveAliases=false: emit CSS var() references for aliases
 */
async function formatCSS(
    variables: Variable[],
    collections: VariableCollection[],
    modeId: string,
    resolveAliases: boolean
): Promise<string> {
    const lines: string[] = [];

    for (const collection of collections) {
        const collectionVars = variables.filter(
            (v) => v.variableCollectionId === collection.id
        );

        if (collectionVars.length === 0) continue;

        // Get mode name
        const mode = collection.modes.find((m) => m.modeId === modeId);
        const modeName = mode?.name || 'default';

        lines.push(`/* Collection: ${collection.name} (${modeName}) */`);
        lines.push(`:root {`);

        for (const v of collectionVars) {
            const cssName = toCssVarName(v.name);
            const val = v.valuesByMode[modeId];

            // Handle alias resolution based on resolveAliases flag
            // resolveAliases=true => concrete resolved value
            // resolveAliases=false => var() reference
            if (isVariableAlias(val)) {
                if (resolveAliases) {
                    // Resolve to concrete value
                    const resolvedValues = await resolveVariableAliases(v, modeId);
                    const resolvedVal = resolvedValues[modeId];
                    const strVal = figmaValueToString(resolvedVal, v.resolvedType);
                    lines.push(`  ${cssName}: ${strVal};`);
                } else {
                    // Emit var() reference
                    const targetVar = await figma.variables.getVariableByIdAsync(
                        typeof val.id === 'string' ? val.id : String(val.id)
                    );
                    if (targetVar) {
                        lines.push(`  ${cssName}: var(${toCssVarName(targetVar.name)});`);
                    } else {
                        lines.push(`  ${cssName}: unset; /* alias target not found */`);
                    }
                }
            } else {
                const strVal = figmaValueToString(val, v.resolvedType);
                lines.push(`  ${cssName}: ${strVal};`);
            }
        }

        lines.push(`}`);
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Convert Figma variable value to a type-safe value for JSON serialization.
 * Preserves number and boolean types, converts colors to hex.
 */
function toTypeSafeValue(val: unknown, resolvedType: string): unknown {
    if (val === null || val === undefined) {
        return null;
    }

    if (resolvedType === 'COLOR') {
        if (typeof val === 'object' && 'r' in val) {
            return rgbaToHex(val as { r: number; g: number; b: number; a?: number });
        }
        return val;
    }

    if (resolvedType === 'FLOAT') {
        // Keep as number if it's a numeric value
        if (typeof val === 'number') {
            return val;
        }
        const num = Number(val);
        return isNaN(num) ? val : num;
    }

    if (resolvedType === 'BOOLEAN') {
        if (typeof val === 'boolean') {
            return val;
        }
        return val;
    }

    return val;
}

/**
 * Format variables as Tailwind theme extension.
 */
async function formatTailwind(
    variables: Variable[],
    collections: VariableCollection[],
    modeId: string
): Promise<string> {
    const entries: Array<{ path: string; value: unknown }> = [];

    for (const collection of collections) {
        const collectionVars = variables.filter(
            (v) => v.variableCollectionId === collection.id
        );

        for (const v of collectionVars) {
            // Resolve aliases to concrete values
            const resolvedValues = await resolveVariableAliases(v, modeId);
            const val = resolvedValues[modeId];
            // Convert to type-safe value (preserves numbers, booleans, converts colors to hex)
            const typeSafeVal = toTypeSafeValue(val, v.resolvedType);
            // Prefix with collection name
            entries.push({
                path: `${collection.name}/${v.name}`,
                value: typeSafeVal,
            });
        }
    }

    const nested = buildNestedObject(entries);

    // Generate the Tailwind config as a JS object
    const jsContent = JSON.stringify({ theme: { extend: nested } }, null, 2);

    return `module.exports = ${jsContent};`;
}

/**
 * Format variables as TypeScript constants.
 */
async function formatTypeScript(
    variables: Variable[],
    collections: VariableCollection[],
    modeId: string
): Promise<string> {
    const entries: Array<{ path: string; value: unknown }> = [];

    for (const collection of collections) {
        const collectionVars = variables.filter(
            (v) => v.variableCollectionId === collection.id
        );

        for (const v of collectionVars) {
            // Resolve aliases to concrete values
            const resolvedValues = await resolveVariableAliases(v, modeId);
            const val = resolvedValues[modeId];
            // Convert to type-safe value (preserves numbers, booleans, converts colors to hex)
            const typeSafeVal = toTypeSafeValue(val, v.resolvedType);
            // Prefix with collection name
            entries.push({
                path: `${collection.name}/${v.name}`,
                value: typeSafeVal,
            });
        }
    }

    const nested = buildNestedObject(entries);

    // Generate TypeScript with const assertion
    return `export const tokens = ${JSON.stringify(nested, null, 2)} as const;`;
}

/**
 * EXPORT_TOKENS - Export variables in multiple formats.
 */
export async function handleExportTokens(
    params: ExportTokensParams
): Promise<ExportTokensResult> {
    console.log('[Bridge] Exporting tokens:', params);

    const { format, collection, mode, resolveAliases = true } = params;

    // Validate format
    const validFormats: TokenExportFormat[] = ['css', 'tailwind', 'typescript'];
    if (!validFormats.includes(format)) {
        throw createBridgeError(
            ERROR_CODES.INVALID_PARAMETER,
            `Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`
        );
    }

    // Fetch all variables and collections
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    // Filter by collection name if specified
    let filteredCollections = collections;
    if (collection) {
        filteredCollections = collections.filter((c) =>
            c.name.toLowerCase().includes(collection.toLowerCase())
        );
    }

    if (filteredCollections.length === 0) {
        throw createBridgeError(
            ERROR_CODES.COLLECTION_NOT_FOUND,
            `No collections found${collection ? ` matching "${collection}"` : ''}`
        );
    }

    // Filter variables by the filtered collections
    const collectionIds = new Set(filteredCollections.map((c) => c.id));
    const filteredVariables = variables.filter((v) => collectionIds.has(v.variableCollectionId));

    // Find the mode ID
    let targetModeId: string;
    if (mode) {
        // Find mode by name in the filtered collections
        let foundModeId: string | null = null;
        for (const c of filteredCollections) {
            const m = c.modes.find((m) => m.name.toLowerCase() === mode.toLowerCase());
            if (m) {
                foundModeId = m.modeId;
                break;
            }
        }
        if (!foundModeId) {
            throw createBridgeError(
                ERROR_CODES.INVALID_PARAMETER,
                `Mode "${mode}" not found in collection${collection ? ` "${collection}"` : ''}`
            );
        }
        targetModeId = foundModeId;
    } else {
        // Use the default mode of the first collection
        targetModeId = filteredCollections[0].defaultModeId;
    }

    // Generate content based on format
    let content: string;
    switch (format) {
        case 'css':
            content = await formatCSS(filteredVariables, filteredCollections, targetModeId, resolveAliases);
            break;
        case 'tailwind':
            content = await formatTailwind(filteredVariables, filteredCollections, targetModeId);
            break;
        case 'typescript':
            content = await formatTypeScript(filteredVariables, filteredCollections, targetModeId);
            break;
        default:
            throw createBridgeError(
                ERROR_CODES.INVALID_PARAMETER,
                `Unsupported format: ${format}`
            );
    }

    const stats = {
        variableCount: filteredVariables.length,
        collectionCount: filteredCollections.length,
    };

    console.log(
        `[Bridge] Exported ${stats.variableCount} variables in ${stats.collectionCount} collections as ${format}`
    );

    return {
        success: true,
        content,
        format,
        stats,
    };
}
