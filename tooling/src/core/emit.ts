/**
 * Emission phase: value resolution and CSS output generation.
 */

import type { EmissionContext, ExecutionSummary, TokenValue, IndexingContext, WalkHandlers } from '../types/tokens.js';
import type { WalkState, WalkOptions } from './walk.js';
import { warnedInvalidTokenDetails } from '../runtime/state.js';
import {
    walkTokenTreeInternal,
    createWalkContext,
} from './walk.js';
import { pathStr, normalizePathKey, buildPathKey, buildVisitedRefSet } from '../utils/paths.js';
import { toKebabCase, isValidCssVariableName, buildCssVarNameFromPrefix } from '../utils/strings.js';
import { formatDiagnostic } from '../utils/logging.js';
import { canEmitUntypedTokenValue, canEmitTokenValue } from '../utils/emittable.js';
import { ReferenceResolver } from './reference-resolver.js';
import { processValueWithRegistry } from './value-processors.js';

// Re-export processValue for backward compatibility
export { processValueWithRegistry as processValue };

// Local alias for use within this file
const processValue = processValueWithRegistry;

// --- Recording helpers ---

function getSummaryTokenKey(currentPath: string[]): string {
    const normalized = normalizePathKey(buildPathKey(currentPath));
    if (normalized) return normalized;
    return normalizePathKey(pathStr(currentPath));
}

function incrementUniqueTokenCount(summary: ExecutionSummary, currentPath: string[]): void {
    const key = getSummaryTokenKey(currentPath);
    if (!key || summary.countedTokenKeys.has(key)) return;
    summary.countedTokenKeys.add(key);
    summary.totalTokens++;
}

function incrementUniqueGeneratedCount(summary: ExecutionSummary, currentPath: string[]): void {
    const key = getSummaryTokenKey(currentPath);
    if (!key || summary.countedGeneratedKeys.has(key)) return;
    summary.countedGeneratedKeys.add(key);
    summary.successCount++;
}

function incrementUniqueTokenTypeCount(summary: ExecutionSummary, currentPath: string[], varType?: string): void {
    if (!varType) return;
    const key = getSummaryTokenKey(currentPath);
    if (!key) return;

    const typeKey = `${key}::${varType}`;
    if (summary.countedTokenTypeKeys.has(typeKey)) return;
    summary.countedTokenTypeKeys.add(typeKey);
    summary.tokenTypeCounts[varType] = (summary.tokenTypeCounts[varType] || 0) + 1;
}

/**
 * Precomputes which tokens are actually emittable so references to non-emitted tokens
 * can be flagged as unresolved instead of silently resolving to ghost vars.
 */
export function buildEmittableKeySet(ctx: IndexingContext): Set<string> {
    const emittable = new Set<string>();

    for (const [key, token] of ctx.valueMap.entries()) {
        if (!token) continue;
        if (canEmitTokenValue(token.$type, token.$value)) {
            emittable.add(key);
        }
    }

    return emittable;
}

/**
 * Emits a single custom property declaration into `collectedVars`, if the name is valid.
 */
export function emitCssVar(
    summary: ExecutionSummary,
    collectedVars: string[],
    varName: string,
    value: string,
    currentPath: string[],
    recordInvalidName: boolean
): void {
    if (!isValidCssVariableName(varName)) {
        console.warn(formatDiagnostic('warn', `${varName} is not a valid CSS variable name, skipping`));
        if (recordInvalidName) {
            const detail = `${pathStr(currentPath)} (Invalid CSS Var: ${varName})`;
            if (!summary.invalidNames.includes(detail)) {
                summary.invalidNames.push(detail);
            }
        }
        return;
    }

    collectedVars.push(`  ${varName}: ${value};`);
    incrementUniqueGeneratedCount(summary, currentPath);
}

// --- Emission orchestration ---

/**
 * Emission phase: flattens the token tree into CSS declarations.
 * Sorted traversal is used to make the output deterministic across runs.
 *
 * Returns primitives first (no references) and aliases later.
 */
export function flattenTokens(
    ctx: EmissionContext,
    obj: any,
    prefix: string[] = [],
    currentPath: string[] = [],
    preferredMode?: string,
    modeStrict = false,
    skipBaseWhenMode = false,
    modeOverridesOnly = false,
    allowModeBranches = true
): { primitives: string[]; aliases: string[] } {
    const { summary } = ctx;
    const primitiveVars: string[] = [];
    const aliasVars: string[] = [];

    const state: WalkState = {
        summary,
        prefix,
        currentPath,
        depth: 0,
        inModeBranch: false,
        inheritedType: undefined,
    };

    const options: WalkOptions = {
        sortKeys: true,
        preferredMode,
        modeStrict,
        skipBaseWhenMode,
        modeOverridesOnly,
        allowModeBranches,
    };

    const handlers: WalkHandlers = {
        onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath, inheritedType }) => {
            incrementUniqueTokenCount(summary, tokenPath);
            const rawValue = tokenObj.$value;
            const varType = tokenObj.$type ?? inheritedType;

            incrementUniqueTokenTypeCount(summary, tokenPath, varType);

            if (rawValue == null) {
                console.warn(`⚠️  Token without $value (or null) at ${pathStr(tokenPath)}, skipping`);
                return;
            }

            // Compatibility mode for non-strict exports:
            // allow untyped primitive/alias tokens, but keep blocking untyped composites.
            if (!varType && !canEmitUntypedTokenValue(rawValue)) {
                const detail = `${pathStr(tokenPath)} (Missing $type)`;
                if (summary.invalidTokens.includes(detail)) {
                    return;
                }

                if (!warnedInvalidTokenDetails.has(detail)) {
                    warnedInvalidTokenDetails.add(detail);
                    console.error(`❌ Strict Error: Token without $type at ${pathStr(tokenPath)}. SKIPPING.`);
                }
                summary.invalidTokens.push(detail);
                return;
            }

            const visitedRefs = buildVisitedRefSet(tokenPath);
            const resolvedValue = processValue(ctx, rawValue, varType, tokenPath, visitedRefs);
            if (resolvedValue === null) return;

            const varName = buildCssVarNameFromPrefix(tokenPrefix);
            const target = ReferenceResolver.containsReference(rawValue) ? aliasVars : primitiveVars;
            emitCssVar(summary, target, varName, resolvedValue, tokenPath, true);
        },

        onLegacyPrimitive: ({ value, key, normalizedKey, currentPath: parentPath, prefix: parentPrefix, inheritedType }) => {
            const varName = buildCssVarNameFromPrefix([...parentPrefix, normalizedKey]);
            const leafPath = [...parentPath, key];
            incrementUniqueTokenCount(summary, leafPath);

            incrementUniqueTokenTypeCount(summary, leafPath, inheritedType);

            const visitedRefs = buildVisitedRefSet(leafPath);
            const processedValue = processValue(ctx, value, inheritedType, leafPath, visitedRefs);
            if (processedValue === null) return;

            const target = ReferenceResolver.containsReference(value) ? aliasVars : primitiveVars;
            emitCssVar(summary, target, varName, processedValue, leafPath, false);
        }
    };

    const walkCtx = createWalkContext(handlers, options);
    walkTokenTreeInternal(obj, state, walkCtx);

    return { primitives: primitiveVars, aliases: aliasVars };
}
