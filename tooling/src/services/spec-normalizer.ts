/**
 * Spec Normalizer Service
 *
 * Ensures structural consistency, canonical field ordering, and TBD counting for component specs.
 */

import {
    isPlainObject,
    isTbdMarker,
    componentNameToDisplayName,
} from '../utils/index.js';
import {
    PROPERTY_FIELD_ORDER,
    coerceSpecPropertyType,
    getSpecPropertyTypeInfo,
} from './spec-property-types.js';

export const SPEC_TOP_LEVEL_ORDER = Object.freeze([
    'name',
    'status',
    'figma',
    'summary',
    'anatomy',
    'properties',
    'content_guidelines',
    'best_practices',
    'accessibility',
    'token_mapping',
    'qa',
    'related_components',
]);

const FIGMA_FIELD_ORDER = Object.freeze([
    'file',
    'page',
    'component_set',
    'component_set_node_id',
]);

/**
 * Recursively count "TBD" values in an object or array.
 */
export function countTbdValues(value: any): number {
    if (typeof value === 'string') return isTbdMarker(value) ? 1 : 0;
    if (Array.isArray(value)) {
        return value.reduce((sum, item) => sum + countTbdValues(item), 0);
    }
    if (isPlainObject(value)) {
        return Object.values(value).reduce(
            (sum: number, item: any) => sum + countTbdValues(item),
            0,
        );
    }
    return 0;
}

function deepClone<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => deepClone(item)) as unknown as T;
    }
    if (isPlainObject(value)) {
        const result: any = {};
        for (const [key, child] of Object.entries(value)) {
            result[key] = deepClone(child);
        }
        return result as T;
    }
    return value;
}

/**
 * Merge a generated spec value with a template value, preserving template structure.
 */
export function mergeWithTemplate(templateValue: any, generatedValue: any): any {
    if (generatedValue === undefined) return deepClone(templateValue);

    if (Array.isArray(templateValue)) {
        return Array.isArray(generatedValue)
            ? deepClone(generatedValue)
            : deepClone(templateValue);
    }

    if (isPlainObject(templateValue)) {
        const generatedObject = isPlainObject(generatedValue) ? generatedValue : {};
        const result: any = {};

        for (const [key, childTemplate] of Object.entries(templateValue)) {
            result[key] = mergeWithTemplate(childTemplate, generatedObject[key]);
        }

        for (const [key, childValue] of Object.entries(generatedObject)) {
            if (!(key in result)) result[key] = deepClone(childValue);
        }

        return result;
    }

    return deepClone(generatedValue);
}

/**
 * Restore canonical field order for spec YAML.
 */
export function normalizeSpecOrder(spec: any): any {
    const ordered: any = {};
    for (const key of SPEC_TOP_LEVEL_ORDER) {
        if (key in spec) ordered[key] = spec[key];
    }
    for (const [key, value] of Object.entries(spec)) {
        if (!(key in ordered)) ordered[key] = value;
    }

    if (isPlainObject(ordered.figma)) {
        const figmaOrdered: any = {};
        for (const key of FIGMA_FIELD_ORDER) {
            if (key in ordered.figma) figmaOrdered[key] = ordered.figma[key];
        }
        for (const [key, value] of Object.entries(ordered.figma)) {
            if (!(key in figmaOrdered)) figmaOrdered[key] = value;
        }
        ordered.figma = figmaOrdered;
    }

    if (Array.isArray(ordered.properties)) {
        const stableDecorated = ordered.properties.map((item: any, index: number) => ({
            item: isPlainObject(item) ? item : {},
            index,
        }));

        stableDecorated.sort((a, b) => {
            const typeA = coerceSpecPropertyType(a.item.type);
            const typeB = coerceSpecPropertyType(b.item.type);
            const infoA = typeA ? getSpecPropertyTypeInfo(typeA) : null;
            const infoB = typeB ? getSpecPropertyTypeInfo(typeB) : null;
            const groupA = infoA ? infoA.orderingGroup : Number.MAX_SAFE_INTEGER;
            const groupB = infoB ? infoB.orderingGroup : Number.MAX_SAFE_INTEGER;
            if (groupA !== groupB) return groupA - groupB;
            return a.index - b.index;
        });

        ordered.properties = stableDecorated.map(({ item }) => {
            const canonicalType = coerceSpecPropertyType(item.type);
            if (canonicalType) item.type = canonicalType;
            const propertyOrdered: any = {};
            for (const key of PROPERTY_FIELD_ORDER) {
                if (key in item) propertyOrdered[key] = item[key];
            }
            for (const [key, value] of Object.entries(item)) {
                if (!(key in propertyOrdered)) propertyOrdered[key] = value;
            }
            return propertyOrdered;
        });
    }

    return ordered;
}

export interface NormalizeSpecOptions {
    templateSpec: any;
    generatedSpecRaw: any;
    componentName?: string;
    nodeId?: string;
    fileKeyFromUrl?: string;
    tokenCandidates?: any;
    prefillTokenMappingFn?: (mapping: any, candidates: any, field: string) => number;
}

/**
 * High-level orchestration for spec normalization.
 */
export function normalizeSpec(options: NormalizeSpecOptions): { normalizedSpec: any; prefilledCount: number } {
    const {
        templateSpec,
        generatedSpecRaw,
        componentName,
        nodeId,
        fileKeyFromUrl,
        tokenCandidates,
        prefillTokenMappingFn = () => 0,
    } = options;

    const mergedSpec = mergeWithTemplate(templateSpec, generatedSpecRaw);

    // ensureSpecMetadata logic
    if (!isPlainObject(mergedSpec.figma)) mergedSpec.figma = {};
    if (componentName && isTbdMarker(mergedSpec.name)) {
        mergedSpec.name = componentNameToDisplayName(componentName);
    }
    if (componentName && !String(mergedSpec.name || '').trim()) {
        mergedSpec.name = componentNameToDisplayName(componentName);
    }

    if (fileKeyFromUrl && (!mergedSpec.figma.file || isTbdMarker(mergedSpec.figma.file))) {
        mergedSpec.figma.file = fileKeyFromUrl;
    }
    if (
        nodeId &&
        (!mergedSpec.figma.component_set_node_id || isTbdMarker(mergedSpec.figma.component_set_node_id))
    ) {
        mergedSpec.figma.component_set_node_id = nodeId;
    }

    const prefilledCount = prefillTokenMappingFn(
        mergedSpec.token_mapping,
        tokenCandidates,
        'token_mapping',
    );

    const normalizedSpec = normalizeSpecOrder(mergedSpec);

    return {
        normalizedSpec,
        prefilledCount,
    };
}
