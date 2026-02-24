function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTokenGraphDirection(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "dependencies" || value === "dependents" || value === "both") return value;
  return "both";
}

export function normalizeTokenGraphDepth(raw) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed)) return 3;
  return clampInt(parsed, 0, 8);
}

function buildTokenGraphIndexes(graph) {
  const nodeById = new Map();
  for (const node of graph.nodes || []) nodeById.set(node.id, node);

  const outById = new Map();
  const inById = new Map();
  for (const node of graph.nodes || []) {
    outById.set(node.id, []);
    inById.set(node.id, []);
  }

  for (const edge of graph.edges || []) {
    if (outById.has(edge.source)) outById.get(edge.source)?.push(edge.target);
    if (inById.has(edge.target)) inById.get(edge.target)?.push(edge.source);
  }

  for (const [id, list] of outById) outById.set(id, Array.from(new Set(list)));
  for (const [id, list] of inById) inById.set(id, Array.from(new Set(list)));

  return { nodeById, outById, inById };
}

function resolveTokenGraphNodeId(graph, query) {
  const q = String(query || "").trim();
  if (!q) return null;

  const indexes = buildTokenGraphIndexes(graph);
  if (indexes.nodeById.has(q)) return q;

  const lowered = q.toLowerCase();
  for (const node of graph.nodes || []) {
    if (String(node.path || "").toLowerCase() === lowered) return node.id;
    if (String(node.slashPath || "").toLowerCase() === lowered) return node.id;
    if (String(node.cssVar || "").toLowerCase() === lowered) return node.id;
    if (String(node.displayKey || "").toLowerCase() === lowered) return node.id;
  }

  return null;
}

export function buildTokenGraphQueryPayload({ graph, token, direction, depth }) {
  const indexes = buildTokenGraphIndexes(graph);
  const rootId = resolveTokenGraphNodeId(graph, token);
  if (!rootId) return null;

  const root = indexes.nodeById.get(rootId);
  if (!root) return null;

  const collectReachable = (neighborsFor) => {
    const visited = new Set();
    const queue = [{ id: rootId, level: 0 }];
    const seen = new Set([rootId]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.level >= depth) continue;

      for (const nextId of neighborsFor(current.id)) {
        if (!indexes.nodeById.has(nextId) || seen.has(nextId)) continue;
        seen.add(nextId);
        visited.add(nextId);
        queue.push({ id: nextId, level: current.level + 1 });
      }
    }

    return visited;
  };

  const toRef = (node) => ({
    id: node.id,
    path: node.path,
    slashPath: node.slashPath,
    cssVar: node.cssVar,
    displayKey: node.displayKey,
    type: node.type,
    collection: node.collection,
    isCycleMember: node.isCycleMember,
  });

  const sortNodes = (ids) =>
    ids
      .map((id) => indexes.nodeById.get(id))
      .filter(Boolean)
      .sort((a, b) =>
        String(a?.displayKey || "").localeCompare(String(b?.displayKey || ""), "en", {
          sensitivity: "base",
        }),
      )
      .map((node) => toRef(node));

  const directDependencies = indexes.outById.get(rootId) ?? [];
  const directDependents = indexes.inById.get(rootId) ?? [];

  const dependencySet =
    direction === "dependents"
      ? new Set()
      : collectReachable((id) => indexes.outById.get(id) ?? []);
  const dependentSet =
    direction === "dependencies"
      ? new Set()
      : collectReachable((id) => indexes.inById.get(id) ?? []);

  const subgraphVisited = new Set([rootId]);
  for (const id of dependencySet) subgraphVisited.add(id);
  for (const id of dependentSet) subgraphVisited.add(id);

  const subgraphNodes = sortNodes(Array.from(subgraphVisited));
  const subgraphEdges = (graph.edges || []).filter(
    (edge) => subgraphVisited.has(edge.source) && subgraphVisited.has(edge.target),
  );

  return {
    ok: true,
    query: {
      token,
      direction,
      depth,
      resolved_id: rootId,
    },
    root: toRef(root),
    summary: {
      direct_dependencies: directDependencies.length,
      direct_dependents: directDependents.length,
      transitive_dependencies: dependencySet.size,
      transitive_dependents: dependentSet.size,
      subgraph_nodes: subgraphNodes.length,
      subgraph_edges: subgraphEdges.length,
    },
    direct: {
      dependencies: sortNodes(directDependencies),
      dependents: sortNodes(directDependents),
    },
    transitive: {
      dependencies: sortNodes(Array.from(dependencySet)),
      dependents: sortNodes(Array.from(dependentSet)),
    },
    subgraph: {
      nodes: subgraphNodes,
      edges: subgraphEdges,
    },
  };
}
