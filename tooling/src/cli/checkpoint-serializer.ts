/**
 * Checkpoint Serializer
 *
 * Serialization utilities for pipeline checkpoint persistence.
 */

import type { TokenValue, TokenGraph, ExecutionSummary } from '../types/tokens.js';
import type { IndexingContext } from '../types/tokens.js';
import type { CssVarCollision, CssVarOwner } from '../types/tokens.js';
import type { SummarySnapshot, SerializedIndexContext, SerializedTokenGraph, SerializedCssVarCollision } from './cli-types.js';
import { createSummary, createProcessingContext } from '../runtime/context.js';

/**
 * Serializes an indexing context for checkpoint storage.
 */
export function serializeIndexingContext(ctx: Readonly<IndexingContext>): SerializedIndexContext {
    return {
        refMap: Array.from(ctx.refMap.entries()),
        valueMap: Array.from(ctx.valueMap.entries()),
        collisionKeys: Array.from(ctx.collisionKeys.values()),
        idToVarName: Array.from(ctx.idToVarName.entries()),
        idToTokenKey: Array.from(ctx.idToTokenKey.entries())
    };
}

/**
 * Reconstructs an indexing context from serialized data.
 */
export function createIndexingContextFromSerialized(serialized: SerializedIndexContext): Readonly<IndexingContext> {
    const summary = createSummary();
    return createProcessingContext({
        summary,
        refMap: new Map<string, string>(serialized.refMap),
        valueMap: new Map<string, TokenValue>(serialized.valueMap),
        collisionKeys: new Set<string>(serialized.collisionKeys),
        idToVarName: new Map<string, string>(serialized.idToVarName),
        idToTokenKey: new Map<string, string>(serialized.idToTokenKey)
    });
}

/**
 * Serializes a token graph for checkpoint storage.
 */
export function serializeTokenGraph(graph: TokenGraph): SerializedTokenGraph {
    return {
        nodes: Array.from(graph.nodes.entries()),
        edges: Array.from(graph.edges.entries()),
        reverseEdges: Array.from(graph.reverseEdges.entries()),
        collections: Array.from(graph.collections.entries()),
        modes: Array.from(graph.modes.entries()),
        pathToNodeId: Array.from(graph.pathToNodeId.entries()),
        idToNodeId: Array.from(graph.idToNodeId.entries()),
        cycleNodeIds: Array.from(graph.cycleNodeIds.values())
    };
}

/**
 * Reconstructs a token graph from serialized data.
 */
export function deserializeTokenGraph(serialized: SerializedTokenGraph): TokenGraph {
    return {
        nodes: new Map(serialized.nodes),
        edges: new Map(serialized.edges),
        reverseEdges: new Map(serialized.reverseEdges),
        collections: new Map(serialized.collections),
        modes: new Map(serialized.modes),
        pathToNodeId: new Map(serialized.pathToNodeId),
        idToNodeId: new Map(serialized.idToNodeId),
        cycleNodeIds: new Set(serialized.cycleNodeIds)
    };
}

/**
 * Serializes a CSS variable collision map for checkpoint storage.
 */
export function serializeCssCollisionMap(
    map: Map<string, CssVarCollision>
): Array<[string, SerializedCssVarCollision]> {
    return Array.from(map.entries()).map(([name, collision]) => [
        name,
        {
            first: collision.first,
            others: Array.from(collision.others.entries())
        }
    ]);
}

/**
 * Reconstructs a CSS variable collision map from serialized data.
 */
export function deserializeCssCollisionMap(
    entries: Array<[string, SerializedCssVarCollision]>
): Map<string, CssVarCollision> {
    const map = new Map<string, CssVarCollision>();
    for (const [name, collision] of entries) {
        map.set(name, {
            first: collision.first,
            others: new Map<string, CssVarOwner>(collision.others)
        });
    }
    return map;
}

/**
 * Converts an execution summary to a snapshot for checkpoint storage.
 */
export function toSummarySnapshot(summary: ExecutionSummary): SummarySnapshot {
    return {
        totalTokens: summary.totalTokens,
        successCount: summary.successCount,
        unresolvedRefs: [...summary.unresolvedRefs],
        invalidNames: [...summary.invalidNames],
        circularDeps: summary.circularDeps,
        depthLimitHits: summary.depthLimitHits,
        cssVarNameCollisions: summary.cssVarNameCollisions,
        cssVarNameCollisionDetails: [...summary.cssVarNameCollisionDetails],
        invalidTokens: [...summary.invalidTokens],
        tokenTypeCounts: { ...summary.tokenTypeCounts }
    };
}

/**
 * Reconstructs an execution summary from a snapshot.
 */
export function fromSummarySnapshot(snapshot: SummarySnapshot): ExecutionSummary {
    return {
        totalTokens: snapshot.totalTokens,
        successCount: snapshot.successCount,
        unresolvedRefs: [...snapshot.unresolvedRefs],
        invalidNames: [...snapshot.invalidNames],
        circularDeps: snapshot.circularDeps,
        depthLimitHits: snapshot.depthLimitHits,
        cssVarNameCollisions: snapshot.cssVarNameCollisions,
        cssVarNameCollisionDetails: [...snapshot.cssVarNameCollisionDetails],
        invalidTokens: [...snapshot.invalidTokens],
        tokenTypeCounts: { ...snapshot.tokenTypeCounts },
        countedTokenKeys: new Set<string>(),
        countedGeneratedKeys: new Set<string>(),
        countedTokenTypeKeys: new Set<string>()
    };
}
