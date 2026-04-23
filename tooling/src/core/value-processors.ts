/**
 * Value processors for token emission.
 * 
 * Each processor handles a specific type of token value and converts it to CSS-ready string.
 * Uses Strategy pattern for extensibility and separation of concerns.
 */

import type { EmissionContext, TokenValue } from '../types/tokens.js';
import { isPlainObject, isVariableAlias } from '../types/tokens.js';
import { ReferenceResolver } from './reference-resolver.js';
import { pathStr } from '../utils/paths.js';
import { withPathSegment } from '../utils/path-stack.js';
import { toKebabCase, isValidCssVariableName } from '../utils/strings.js';
import { coerceTypographyDimension, coerceBorderDimension } from '../utils/coerce.js';

// --- Types ---

export interface ValueProcessorInput {
    ctx: EmissionContext;
    value: unknown;
    varType?: string;
    currentPath: string[];
    resolver: ReferenceResolver;
}

export interface ValueProcessor {
    /**
     * Returns true if this processor can handle the given value and type.
     */
    canProcess(value: unknown, varType?: string): boolean;

    /**
     * Processes the value and returns CSS-ready string, or null if unable to process.
     */
    process(input: ValueProcessorInput): string | null;
}

// --- Shadow Processor ---

export class ShadowValueProcessor implements ValueProcessor {
    canProcess(value: unknown, varType?: string): boolean {
        if (varType !== 'shadow') return false;
        if (!isPlainObject(value) && !Array.isArray(value)) return false;
        return true;
    }

    process(input: ValueProcessorInput): string | null {
        const { ctx, value, currentPath, resolver } = input;

        if (Array.isArray(value)) {
            return value.map(v => this.processShadowObject(ctx, v, currentPath, resolver)).join(', ');
        }

        if (isPlainObject(value)) {
            return this.processShadowObject(ctx, value, currentPath, resolver);
        }

        return null;
    }

    private processShadowObject(
        ctx: EmissionContext,
        shadowObj: unknown,
        currentPath: string[],
        parentResolver: ReferenceResolver
    ): string {
        if (!isPlainObject(shadowObj)) return JSON.stringify(shadowObj);

        const shadow = shadowObj as Record<string, any>;

        const rawType = shadow.type as unknown;
        const rawColor = shadow.color as unknown;
        const rawOffset = shadow.offset as unknown;
        const rawRadius = shadow.radius as unknown;
        const rawSpread = shadow.spread as unknown;

        const type = rawType === 'INNER_SHADOW' ? 'INNER_SHADOW' : 'DROP_SHADOW';

        const resolveDim = (val: unknown, def: number): string => {
            if (val == null) return `${def}px`;

            // Delegate ALL dispatch (number, string, VARIABLE_ALIAS) to the shared processor,
            // threading the inherited visitedRefs so cycle detection is preserved.
            const resolved = processValueWithRegistry(ctx, val, undefined, currentPath, parentResolver.visitedRefsSet);

            if (resolved === null) {
                // Fallback for unprocessable values — still emit something rather than [object Object]
                if (typeof val === 'number') return `${val}px`;
                if (typeof val === 'string') return val;
                return `${def}px`;
            }

            // If resolved is a plain numeric string, append px
            if (typeof resolved === 'string' && /^-?\d+(\.\d+)?$/.test(resolved.trim())) {
                return `${resolved}px`;
            }

            // Already resolved (e.g., var(--...), rgba(...), etc.)
            return resolved;
        };

        const offset = isPlainObject(rawOffset) ? (rawOffset as { x?: number | null; y?: number | null }) : { x: 0, y: 0 };
        const offsetXStr = resolveDim(offset.x, 0);
        const offsetYStr = resolveDim(offset.y, 0);
        const radiusStr = resolveDim(rawRadius, 0);
        const spreadStr = resolveDim(rawSpread, 0);

        const colorPart = (() => {
            if (rawColor == null) return 'rgba(0, 0, 0, 1)';

            return withPathSegment(currentPath, 'color', () => {
                // Delegate all color forms (VARIABLE_ALIAS, W3C string ref, plain string, RGB object)
                // through the shared processor with inherited visitedRefs for cycle detection.
                if (isVariableAlias(rawColor)) {
                    return parentResolver.resolveVariableAlias(rawColor, currentPath);
                }

                if (typeof rawColor === 'string') {
                    const { replaced, hadRef } = parentResolver.resolveW3CReferencesInString(rawColor);
                    return hadRef ? replaced : rawColor;
                }

                // For plain objects (e.g. RGB) delegate to generic processor with correct visitedRefs.
                const resolved = processValueWithRegistry(ctx, rawColor, undefined, currentPath, parentResolver.visitedRefsSet);
                if (resolved !== null) return resolved;

                // Fallback: handle RGB object directly
                if (isPlainObject(rawColor)) {
                    const r0 = (rawColor as any).r;
                    const g0 = (rawColor as any).g;
                    const b0 = (rawColor as any).b;
                    const a0 = (rawColor as any).a;

                    if (typeof r0 === 'number' && typeof g0 === 'number' && typeof b0 === 'number') {
                        const channels = [r0, g0, b0];
                        const hasChannelGreaterThanOne = channels.some(c => c > 1);
                        const allWithinUnitRange = channels.every(c => c >= 0 && c <= 1);
                        const isNormalized = !hasChannelGreaterThanOne && allWithinUnitRange;
                        const to255 = (c: number, normalized: boolean): number =>
                            normalized ? Math.round((c || 0) * 255) : Math.round(c || 0);

                        const r = to255(r0, isNormalized);
                        const g = to255(g0, isNormalized);
                        const b = to255(b0, isNormalized);
                        const a = typeof a0 === 'number' ? a0 : 1;

                        return `rgba(${r}, ${g}, ${b}, ${a})`;
                    }
                }

                console.warn(`⚠️  Unsupported shadow color format at ${pathStr(currentPath)}; defaulting to transparent`);
                return 'rgba(0, 0, 0, 0)';
            });
        })();

        if (type === 'INNER_SHADOW') return `inset ${offsetXStr} ${offsetYStr} ${radiusStr} ${spreadStr} ${colorPart}`;
        return `${offsetXStr} ${offsetYStr} ${radiusStr} ${spreadStr} ${colorPart}`;
    }
}

// --- Typography Processor ---

export class TypographyValueProcessor implements ValueProcessor {
    canProcess(value: unknown, varType?: string): boolean {
        if (varType !== 'typography') return false;
        if (!isPlainObject(value)) return false;
        return true;
    }

    process(input: ValueProcessorInput): string | null {
        const { ctx, value, currentPath } = input;

        if (!isPlainObject(value)) return null;

        const resolveStringValue = (val: string): string => {
            const resolver = new ReferenceResolver({
                ctx,
                currentPath,
                visitedRefs: undefined,
                seenInValue: new Set<string>(),
            });
            const { replaced, hadRef } = resolver.resolveW3CReferencesInString(val);
            return hadRef ? replaced : val;
        };

        const resolveValue = (key: string): string | null => {
            const val = (value as Record<string, any>)[key];
            if (val == null) return null;

            // Handle VARIABLE_ALIAS objects explicitly
            if (isVariableAlias(val)) {
                const resolver = new ReferenceResolver({
                    ctx,
                    currentPath,
                    visitedRefs: undefined,
                    seenInValue: new Set<string>(),
                });
                return resolver.resolveVariableAlias(val, currentPath);
            }

            // Handle strings (may contain W3C refs)
            if (typeof val === 'string') return resolveStringValue(val);

            // Handle numbers: apply units based on property semantics
            if (typeof val === 'number') {
                // fontWeight: unitless (400, 700)
                if (key === 'fontWeight') return String(val);
                // lineHeight: unitless by default (1.5, 2) to preserve valid CSS ratios
                if (key === 'lineHeight') return String(val);
                // fontSize: needs explicit unit (16 => 16px)
                if (key === 'fontSize') return `${val}px`;
                // Default: no unit for unknown properties
                return String(val);
            }

            // Fallback: delegate to the global processor for recursive resolution.
            // This handles arrays, nested objects, and any other complex values,
            // preserving the semantics of the original processValue() flow.
            // If the processor returns null, fall back to String(val) as last resort.
            return processValueWithRegistry(ctx, val, undefined, currentPath) ?? String(val);
        };

        const family = resolveValue('fontFamily');
        const size = resolveValue('fontSize');
        const weight = resolveValue('fontWeight');
        const lineHeight = resolveValue('lineHeight');
        const style = resolveValue('fontStyle');

        if (!size || !family) {
            return null;
        }

        const parts: string[] = [];
        if (style) parts.push(style);
        if (weight) parts.push(weight);

        let sizePart = size;
        if (lineHeight) {
            sizePart += `/${lineHeight}`;
        }
        parts.push(sizePart);

        let finalFamily = family;
        const hasSpaces = /\s/.test(family);
        const isVar = family.startsWith('var(');
        const isQuoted = /^['"]/.test(family);

        if (hasSpaces && !isVar && !isQuoted) {
            finalFamily = `"${family}"`;
        }
        parts.push(finalFamily);

        return parts.join(' ');
    }
}

// --- Border Processor ---

export class BorderValueProcessor implements ValueProcessor {
    canProcess(value: unknown, varType?: string): boolean {
        if (varType !== 'border') return false;
        if (!isPlainObject(value)) return false;
        return true;
    }

    process(input: ValueProcessorInput): string | null {
        const { ctx, value, currentPath } = input;

        if (!isPlainObject(value)) return null;

        const resolveStringValue = (val: string): string => {
            const resolver = new ReferenceResolver({
                ctx,
                currentPath,
                visitedRefs: undefined,
                seenInValue: new Set<string>(),
            });
            const { replaced, hadRef } = resolver.resolveW3CReferencesInString(val);
            return hadRef ? replaced : val;
        };

        const resolveValue = (key: string): string | null => {
            const val = (value as Record<string, any>)[key];
            if (val == null) return null;

            // Handle VARIABLE_ALIAS objects explicitly
            if (isVariableAlias(val)) {
                const resolver = new ReferenceResolver({
                    ctx,
                    currentPath,
                    visitedRefs: undefined,
                    seenInValue: new Set<string>(),
                });
                return resolver.resolveVariableAlias(val, currentPath);
            }

            // Handle strings (may contain W3C refs)
            if (typeof val === 'string') return resolveStringValue(val);

            // Handle numbers: add px for dimensions (width)
            if (typeof val === 'number') {
                return `${val}px`;
            }

            // Fallback: delegate to the global processor for recursive resolution.
            // This handles arrays, nested objects, and any other complex values,
            // preserving the semantics of the original processValue() flow.
            // If the processor returns null, fall back to String(val) as last resort.
            return processValueWithRegistry(ctx, val, undefined, currentPath) ?? String(val);
        };

        const width = resolveValue('width');
        const style = resolveValue('style');
        const color = resolveValue('color');

        if (!width || !color || !style) {
            return null;
        }

        return `${width} ${style} ${color}`;
    }
}

// --- Array Processor ---

export class ArrayValueProcessor implements ValueProcessor {
    canProcess(value: unknown, varType?: string): boolean {
        if (!Array.isArray(value)) return false;
        if (varType === 'shadow') return false; // Handled by ShadowValueProcessor
        return true;
    }

    process(input: ValueProcessorInput): string | null {
        const { ctx, value, varType, currentPath } = input;

        console.warn(`⚠️  Array value found for type '${varType}' at ${pathStr(currentPath)} - Arrays are only supported for shadows.`);

        const resolver = new ReferenceResolver({
            ctx,
            currentPath,
            visitedRefs: undefined,
            seenInValue: new Set<string>(),
        });
        resolver.recordUnresolved(` (Unsupported Array Value for type: ${varType})`);

        return null;
    }
}

// --- String Processor ---

export class StringValueProcessor implements ValueProcessor {
    canProcess(value: unknown): boolean {
        return typeof value === 'string';
    }

    process(input: ValueProcessorInput): string | null {
        const { value, resolver } = input;
        const stringValue = value as string;

        // Preserve common CSS color formats verbatim.
        if (stringValue.startsWith('rgba') || stringValue.startsWith('rgb(')) return stringValue;
        if (/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(stringValue)) return stringValue;

        const { replaced, hadRef } = resolver.resolveW3CReferencesInString(stringValue);

        // Do not force-quote string tokens. Keep raw CSS keywords/idents (e.g., bold, solid),
        // while still resolving embedded references.
        return hadRef ? replaced : stringValue;
    }
}

// --- Primitive Processor ---

export class PrimitiveValueProcessor implements ValueProcessor {
    canProcess(value: unknown): boolean {
        return typeof value === 'number' || typeof value === 'boolean';
    }

    process(input: ValueProcessorInput): string | null {
        return String(input.value);
    }
}

// --- Object Fallback Processor ---

export class ObjectFallbackProcessor implements ValueProcessor {
    canProcess(value: unknown, varType?: string): boolean {
        if (!isPlainObject(value)) return false;
        if (isVariableAlias(value)) return false; // Handled separately
        // Composite types already handled by specific processors
        if (varType === 'shadow' || varType === 'typography' || varType === 'border') return false;
        return true;
    }

    process(input: ValueProcessorInput): string | null {
        const { currentPath, varType } = input;

        console.error(`❌ Error: Unable to process composite token at ${pathStr(currentPath)} (Type: ${varType}). Skipping.`);

        const resolver = new ReferenceResolver({
            ctx: input.ctx,
            currentPath,
            visitedRefs: undefined,
            seenInValue: new Set<string>(),
        });
        resolver.recordUnresolved(` (Invalid/Unsupported Composite: ${varType})`);

        return null;
    }
}

// --- Alias Processor (special case) ---

export class AliasValueProcessor implements ValueProcessor {
    canProcess(value: unknown): boolean {
        return isVariableAlias(value);
    }

    process(input: ValueProcessorInput): string | null {
        const { resolver, currentPath } = input;
        return resolver.resolveVariableAlias(input.value, currentPath);
    }
}

// --- Registry ---

/**
 * Ordered list of value processors.
 * Order matters: more specific processors come first.
 */
export const VALUE_PROCESSORS: ValueProcessor[] = [
    new AliasValueProcessor(),      // VARIABLE_ALIAS objects
    new ShadowValueProcessor(),     // shadow composite
    new TypographyValueProcessor(), // typography composite
    new BorderValueProcessor(),     // border composite
    new ArrayValueProcessor(),      // arrays (non-shadow)
    new StringValueProcessor(),     // strings with ref resolution
    new PrimitiveValueProcessor(),  // numbers and booleans
    new ObjectFallbackProcessor(),  // unsupported objects
];

/**
 * Finds the first processor that can handle the given value and type.
 */
export function findProcessor(value: unknown, varType?: string): ValueProcessor | null {
    for (const processor of VALUE_PROCESSORS) {
        if (processor.canProcess(value, varType)) {
            return processor;
        }
    }
    return null;
}

/**
 * Processes a value using the appropriate processor.
 */
export function processValueWithRegistry(
    ctx: EmissionContext,
    value: TokenValue['$value'],
    varType?: string,
    currentPath: string[] = [],
    visitedRefs?: ReadonlySet<string>
): string | null {
    if (value == null) return null;

    // Apply coercion for typography and border dimensions
    const coerced = coerceTypographyDimension(value, varType, currentPath);
    value = coerced.value;
    varType = coerced.varType;
    const coercedBorder = coerceBorderDimension(value, varType, currentPath);
    value = coercedBorder.value;
    varType = coercedBorder.varType;

    const resolver = new ReferenceResolver({
        ctx,
        currentPath,
        visitedRefs: visitedRefs ?? undefined,
        seenInValue: new Set<string>(),
    });

    const processor = findProcessor(value, varType);
    if (!processor) return null;

    return processor.process({
        ctx,
        value,
        varType,
        currentPath,
        resolver,
    });
}

export function processValue(
    ctx: EmissionContext,
    value: TokenValue['$value'],
    varType?: string,
    currentPath: string[] = [],
    visitedRefs?: ReadonlySet<string>
): string | null {
    return processValueWithRegistry(ctx, value, varType, currentPath, visitedRefs);
}
