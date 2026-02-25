/**
 * Token Graph Service
 *
 * Builds a deterministic token dependency graph from token registry
 * and reports cycles, indirection chains, and unused primitive terminals.
 *
 * Pure logic module - I/O handled by runner.
 */

import type {
  TokenRegistry,
  TokenRegistryEntry,
  TokenGraph,
  TokenGraphNode,
  TokenGraphEdge,
  TokenGraphReport,
} from './token-types.js';
import {
  CSS_VAR_REF_RE,
  extractCssVarReferences,
  findTokenByCssVar,
  findTokenByPath,
  isPrimitiveValue,
} from './token-utils.js';

/**
 * Build token graph from registry
 */
export function buildTokenGraph(registry: TokenRegistry): TokenGraph {
  const nodes: TokenGraphNode[] = [];
  const edges: TokenGraphEdge[] = [];
  const adjacencyList = new Map<string, string[]>();
  const reverseAdjacencyList = new Map<string, string[]>();

  // Create nodes
  for (const entry of registry.entries) {
    const node: TokenGraphNode = {
      id: entry.id,
      path: entry.path,
      value: entry.$value,
      type: entry.type,
      cssVar: entry.cssVar,
      depth: 0,
      inDegree: 0,
      outDegree: 0,
    };
    nodes.push(node);
    adjacencyList.set(entry.id, []);
    reverseAdjacencyList.set(entry.id, []);
  }

  // Create edges
  for (const entry of registry.entries) {
    const value = entry.$value.trim();

    // Check for CSS var() references
    if (CSS_VAR_REF_RE.test(value)) {
      const refs = extractCssVarReferences(value);
      for (const ref of refs) {
        const targetToken = findTokenByCssVar(registry, ref);
        if (targetToken) {
          edges.push({
            from: entry.id,
            to: targetToken.id,
            kind: 'w3c-ref',
            ref,
          });

          // Update adjacency lists
          const adj = adjacencyList.get(entry.id) || [];
          if (!adj.includes(targetToken.id)) {
            adj.push(targetToken.id);
            adjacencyList.set(entry.id, adj);
          }

          const revAdj = reverseAdjacencyList.get(targetToken.id) || [];
          if (!revAdj.includes(entry.id)) {
            revAdj.push(entry.id);
            reverseAdjacencyList.set(targetToken.id, revAdj);
          }
        }
      }
    }

    // Check for alias references
    if (entry.aliases) {
      for (const aliasId of entry.aliases) {
        const targetToken = findTokenById(registry, aliasId);
        if (targetToken) {
          edges.push({
            from: entry.id,
            to: targetToken.id,
            kind: 'alias-id',
            ref: aliasId,
          });

          // Update adjacency lists
          const adj = adjacencyList.get(entry.id) || [];
          if (!adj.includes(targetToken.id)) {
            adj.push(targetToken.id);
            adjacencyList.set(entry.id, adj);
          }
        }
      }
    }
  }

  // Calculate degrees
  for (const node of nodes) {
    node.outDegree = adjacencyList.get(node.id)?.length || 0;
    node.inDegree = reverseAdjacencyList.get(node.id)?.length || 0;
  }

  // Calculate depths (BFS from primitives)
  const depths = new Map<string, number>();
  const queue: string[] = [];

  // Start with primitives (depth 0)
  for (const node of nodes) {
    if (isPrimitiveValue(node.value)) {
      depths.set(node.id, 0);
      queue.push(node.id);
    }
  }

  // BFS
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = depths.get(currentId) || 0;

    const dependents = reverseAdjacencyList.get(currentId) || [];
    for (const dependentId of dependents) {
      const existingDepth = depths.get(dependentId) ?? Infinity;
      const newDepth = currentDepth + 1;

      if (newDepth > existingDepth) {
        continue;
      }

      depths.set(dependentId, newDepth);
      queue.push(dependentId);
    }
  }

  // Update node depths
  for (const node of nodes) {
    node.depth = depths.get(node.id) || 0;
  }

  // Detect cycles using DFS
  const cycles = detectCycles(adjacencyList);

  // Group by collections and modes
  const collections = new Map<string, string[]>();
  const modes = new Map<string, { key: string; selector?: string; isDefault?: boolean }>();

  for (const entry of registry.entries) {
    const collection = entry.collection || 'unknown';
    const collEntries = collections.get(collection) || [];
    collEntries.push(entry.id);
    collections.set(collection, collEntries);

    if (entry.mode) {
      modes.set(entry.mode, {
        key: entry.mode,
        selector: `[data-theme="${entry.mode}"]`,
        isDefault: entry.mode.toLowerCase().includes('default'),
      });
    }
  }

  return {
    nodes,
    edges,
    cycles,
    collections,
    modes,
  };
}

/**
 * Detect cycles in graph using DFS
 */
export function detectCycles(adjacencyList: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): void {
    if (recursionStack.has(nodeId)) {
      // Found cycle
      const cycleStart = path.indexOf(nodeId);
      if (cycleStart !== -1) {
        cycles.push([...path.slice(cycleStart), nodeId]);
      }
      return;
    }

    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      dfs(neighbor);
    }

    path.pop();
    recursionStack.delete(nodeId);
  }

  for (const nodeId of adjacencyList.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return cycles;
}

/**
 * Find high indirection chains
 */
export function findHighIndirectionChains(
  graph: TokenGraph,
  threshold: number,
): Array<{
  tokenId: string;
  tokenPath: string;
  chainLength: number;
  chain: string[];
}> {
  const highIndirection: Array<{
    tokenId: string;
    tokenPath: string;
    chainLength: number;
    chain: string[];
  }> = [];

  for (const node of graph.nodes) {
    if (node.depth >= threshold) {
      const chain = buildDependencyChain(node.id, graph);
      highIndirection.push({
        tokenId: node.id,
        tokenPath: node.path,
        chainLength: node.depth,
        chain,
      });
    }
  }

  return highIndirection.sort((a, b) => b.chainLength - a.chainLength);
}

/**
 * Build dependency chain for a token
 */
export function buildDependencyChain(tokenId: string, graph: TokenGraph): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  const queue = [tokenId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const node = graph.nodes.find((n) => n.id === currentId);
    if (node) {
      chain.push(node.path);
    }

    const edges = graph.edges.filter((e) => e.from === currentId);
    for (const edge of edges) {
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  return chain;
}

/**
 * Find unused primitive terminals
 */
export function findUnusedPrimitives(graph: TokenGraph): string[] {
  const unused: string[] = [];

  for (const node of graph.nodes) {
    // Primitive = no outgoing edges (doesn't reference other tokens)
    const isPrimitive = node.outDegree === 0;
    // Unused = no incoming edges (no token references it)
    const isUnused = node.inDegree === 0;

    if (isPrimitive && isUnused) {
      unused.push(node.path);
    }
  }

  return unused.sort();
}

/**
 * Find unresolved aliases
 */
export function findUnresolvedAliases(
  registry: TokenRegistry,
  graph: TokenGraph,
): string[] {
  const unresolved: string[] = [];

  for (const entry of registry.entries) {
    if (entry.aliases) {
      for (const aliasId of entry.aliases) {
        const targetToken = findTokenById(registry, aliasId);
        if (!targetToken) {
          unresolved.push(`${entry.path} -> ${aliasId}`);
        }
      }
    }
  }

  return unresolved;
}

/**
 * Find identity collisions (same cssVar for different tokens)
 */
export function findIdentityCollisions(registry: TokenRegistry): Array<{
  cssVar: string;
  tokenIds: string[];
}> {
  const cssVarMap = new Map<string, string[]>();

  for (const entry of registry.entries) {
    if (entry.cssVar) {
      const existing = cssVarMap.get(entry.cssVar) || [];
      existing.push(entry.id);
      cssVarMap.set(entry.cssVar, existing);
    }
  }

  const collisions: Array<{ cssVar: string; tokenIds: string[] }> = [];

  for (const [cssVar, tokenIds] of cssVarMap.entries()) {
    if (tokenIds.length > 1) {
      collisions.push({ cssVar, tokenIds });
    }
  }

  return collisions;
}

/**
 * Generate token graph report
 */
export function generateGraphReport(
  registry: TokenRegistry,
  options: {
    indirectionThreshold: number;
    maxItems: number;
  },
): TokenGraphReport {
  const graph = buildTokenGraph(registry);
  const cycles = detectCycles(
    graph.edges.reduce((acc, edge) => {
      const adj = acc.get(edge.from) || [];
      if (!adj.includes(edge.to)) {
        adj.push(edge.to);
        acc.set(edge.from, adj);
      }
      return acc;
    }, new Map<string, string[]>()),
  );

  const highIndirection = findHighIndirectionChains(graph, options.indirectionThreshold);
  const unusedPrimitives = findUnusedPrimitives(graph);
  const unresolvedAliases = findUnresolvedAliases(registry, graph);
  const collisions = findIdentityCollisions(registry);

  return {
    timestamp: new Date().toISOString(),
    graph,
    cycles,
    highIndirection: highIndirection.slice(0, options.maxItems),
    unusedPrimitives: unusedPrimitives.slice(0, options.maxItems),
    unresolvedAliases,
    collisions,
    summary: {
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      cycleCount: cycles.length,
      highIndirectionCount: highIndirection.length,
      unusedPrimitiveCount: unusedPrimitives.length,
      unresolvedAliasCount: unresolvedAliases.length,
      collisionCount: collisions.length,
    },
  };
}
