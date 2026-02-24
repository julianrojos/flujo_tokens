/**
 * Dependency analysis backed by token graph structures.
 */

import type { IndexingContext } from '../types/tokens.js';
import { buildCycleStatusFromGraph, createTokenGraph, getResolvedTokenKeyFromParts } from './token-graph.js';

export { getResolvedTokenKeyFromParts };

/**
 * Builds cycle reachability status for every token key.
 * Uses graph SCC precomputation and reverse traversal to mark all nodes that lead into cycles.
 */
export function buildCycleStatus(ctx: IndexingContext): Map<string, boolean> {
    const graph = createTokenGraph(ctx);
    return buildCycleStatusFromGraph(graph);
}
