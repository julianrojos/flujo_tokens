/**
 * Index Artifacts
 *
 * Builds indexing artifacts from token maps.
 */

import type { TokenValue, ExecutionSummary, CssVarOwner, CssVarCollision } from '../../types/tokens.js';
import type { ModeScope, SerializedScopeIndex, IndexCheckpointPayload, SerializedIndexContext, SerializedTokenGraph } from '../cli-types.js';
import { isModeDefaultKey } from '../../types/tokens.js';
import { normalizeModeName, normalizePreferredMode, matchesPreferredMode } from '../../utils/modes.js';
import { createSummary, createProcessingContext } from '../../runtime/context.js';
import { foundModeKeys } from '../../runtime/state.js';
import { collectTokenMaps } from '../../core/indexing.js';
import { createTokenGraph, buildCycleStatusFromGraph, buildEmittableKeySetFromGraph } from '../../core/token-graph.js';
import { serializeIndexingContext, serializeTokenGraph, serializeCssCollisionMap, createIndexingContextFromSerialized } from '../checkpoint-serializer.js';

/**
 * Builds index artifacts from file entries.
 *
 * ## Side Effects (Important)
 *
 * This function mutates the `mutableSummary` parameter by reference via `collectTokenMaps()`:
 * - `mutableSummary.cssVarNameCollisions` is incremented
 * - `mutableSummary.cssVarNameCollisionDetails` array is populated with collision descriptions
 *
 * This is intentional: the checkpoint payload reads from `mutableSummary.cssVarNameCollisionDetails`
 * at the end to preserve collision information across cache restores.
 *
 * @param fileEntries - Token file entries to process
 * @param mutableSummary - Execution summary (MUTATED during execution)
 * @param preferredMode - Preferred mode for token resolution
 * @param modeStrictPreferred - Whether strict mode checks apply
 * @returns Index artifacts including serialized scopes, collision maps, and mode sets
 */
export function buildIndexArtifacts(
    fileEntries: Array<{ originalName: string; content: any }>,
    mutableSummary: ExecutionSummary,
    preferredMode: string | undefined,
    modeStrictPreferred: boolean
): {
    payload: IndexCheckpointPayload;
    detectedModeSet: Set<string>;
    emittedModeSet: Set<string>;
    cssVarNameOwners: Map<string, CssVarOwner>;
    cssVarNameCollisionMap: Map<string, CssVarCollision>;
} {
    const refMap = new Map<string, string>();
    const valueMap = new Map<string, TokenValue>();
    const collisionKeys = new Set<string>();
    const idToVarName = new Map<string, string>();
    const idToTokenKey = new Map<string, string>();

    const cssVarNameOwners = new Map<string, CssVarOwner>();
    const cssVarNameCollisionMap = new Map<string, CssVarCollision>();

    const indexingCtx = createProcessingContext({
        summary: mutableSummary,
        refMap,
        valueMap,
        collisionKeys,
        idToVarName,
        idToTokenKey,
        cssVarNameOwners,
        cssVarNameCollisionMap
    });

    for (const { originalName, content } of fileEntries) {
        collectTokenMaps(indexingCtx, content, [], [originalName], preferredMode, modeStrictPreferred, true);
    }

    const modeKeys = Array.from(foundModeKeys);
    const sortedModes = modeKeys.slice().sort((a, b) => normalizeModeName(a).localeCompare(normalizeModeName(b)));
    const detectedModeSet = new Set<string>(sortedModes);

    const scopes: ModeScope[] = [];
    scopes.push({ selector: ':root', mode: undefined, skipBaseWhenMode: false, modeOverridesOnly: false, allowModeBranches: false });

    let emittedModes = sortedModes.filter(modeKey => !isModeDefaultKey(modeKey));
    const preferredForEmission = normalizePreferredMode(preferredMode);
    if (preferredForEmission) {
        const preferredModes = emittedModes.filter(modeKey => matchesPreferredMode(modeKey, preferredForEmission));
        if (preferredModes.length > 0) {
            emittedModes = preferredModes;
        } else {
            console.warn(`ℹ️  Preferred mode "${preferredMode}" was not detected in mode scopes; emitting all detected modes.`);
        }
    }

    for (const modeKey of emittedModes) {
        const selectorValue = normalizeModeName(modeKey);
        const selector = `[data-theme="${selectorValue}"]`;
        scopes.push({ selector, mode: modeKey, skipBaseWhenMode: true, modeOverridesOnly: true, allowModeBranches: true });
    }
    const emittedModeSet = new Set<string>(emittedModes);

    const baseRefMap = new Map<string, string>();
    const baseValueMap = new Map<string, TokenValue>();
    const baseCollisionKeys = new Set<string>();
    const baseIdToVarName = new Map<string, string>();
    const baseIdToTokenKey = new Map<string, string>();

    const baseSummary = createSummary();
    const baseIndexingCtx = createProcessingContext({
        summary: baseSummary,
        refMap: baseRefMap,
        valueMap: baseValueMap,
        collisionKeys: baseCollisionKeys,
        idToVarName: baseIdToVarName,
        idToTokenKey: baseIdToTokenKey
    });

    for (const { originalName, content } of fileEntries) {
        collectTokenMaps(
            baseIndexingCtx,
            content,
            [],
            [originalName],
            undefined,
            modeStrictPreferred,
            false,
            false,
            false
        );
    }

    const scopedIndices: SerializedScopeIndex[] = [];
    for (const scope of scopes) {
        const scopeRefMap = new Map<string, string>(baseRefMap);
        const scopeValueMap = new Map<string, TokenValue>(baseValueMap);
        const scopeCollisionKeys = new Set<string>(baseCollisionKeys);
        const scopeIdToVarName = new Map<string, string>(baseIdToVarName);
        const scopeIdToTokenKey = new Map<string, string>(baseIdToTokenKey);
        const scopeSummary = createSummary();

        const scopeIndexingCtx = createProcessingContext({
            summary: scopeSummary,
            refMap: scopeRefMap,
            valueMap: scopeValueMap,
            collisionKeys: scopeCollisionKeys,
            idToVarName: scopeIdToVarName,
            idToTokenKey: scopeIdToTokenKey
        });

        for (const { originalName, content } of fileEntries) {
            collectTokenMaps(
                scopeIndexingCtx,
                content,
                [],
                [originalName],
                scope.mode,
                modeStrictPreferred,  // ✅ modeStrictPreferred (faltaba)
                scope.skipBaseWhenMode,
                scope.modeOverridesOnly,
                scope.allowModeBranches
            );
        }

        scopedIndices.push({
            scope,
            index: serializeIndexingContext(scopeIndexingCtx)
        });
    }

    const payload: IndexCheckpointPayload = {
        ingestHash: '',
        preferredMode,
        modeStrictPreferred,
        detectedModes: Array.from(detectedModeSet),
        emittedModes: Array.from(emittedModeSet),
        scopes,
        scopedIndices,
        cssVarNameOwners: Array.from(cssVarNameOwners.entries()),
        cssVarNameCollisionMap: serializeCssCollisionMap(cssVarNameCollisionMap),
        cssVarNameCollisions: cssVarNameCollisionMap.size,
        // Read from mutableSummary (mutated by collectTokenMaps via reference)
        cssVarNameCollisionDetails: [...mutableSummary.cssVarNameCollisionDetails]
    };

    return {
        payload,
        detectedModeSet,
        emittedModeSet,
        cssVarNameOwners,
        cssVarNameCollisionMap
    };
}

/**
 * Analyzes scoped indices and builds analyzed scope data.
 */
export function analyzeScopedIndices(
    scopedIndices: SerializedScopeIndex[]
): Array<{
    scope: ModeScope;
    index: SerializedIndexContext;
    graph: SerializedTokenGraph;
    cycleStatus: Array<[string, boolean]>;
    emittableKeys: string[];
}> {
    const analyzedScopes = [];
    for (const { scope, index } of scopedIndices) {
        const indexingCtx = createIndexingContextFromSerialized(index);
        
        // Build modeConfig from scope to preserve mode metadata in the graph
        const modeConfig = {
            key: scope.mode ?? 'modeDefault',
            selector: scope.selector,
            isDefault: !scope.mode
        };
        
        const graph = createTokenGraph(indexingCtx, modeConfig);
        const cycleStatus = buildCycleStatusFromGraph(graph);
        const emittableKeys = buildEmittableKeySetFromGraph(graph);

        analyzedScopes.push({
            scope,
            index: serializeIndexingContext(indexingCtx),
            graph: serializeTokenGraph(graph),
            cycleStatus: Array.from(cycleStatus.entries()),
            emittableKeys: Array.from(emittableKeys.values())
        });
    }

    return analyzedScopes;
}
