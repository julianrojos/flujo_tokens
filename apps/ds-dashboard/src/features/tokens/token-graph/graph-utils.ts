import type { TokenGraphViz, TokenGraphVizEdge, TokenGraphVizNode } from "@/types/token-graph";

export type GraphDirection = "dependencies" | "dependents" | "both";

export type PositionedNode = TokenGraphVizNode & {
  x: number;
  y: number;
  level: number;
};

export type PositionedGraph = {
  nodes: PositionedNode[];
  edges: TokenGraphVizEdge[];
  nodeById: Map<string, PositionedNode>;
};

export function getNodeDisplayKey(node: TokenGraphVizNode): string {
  return (
    String(node.displayKey || "").trim() ||
    String(node.path || "").trim() ||
    String(node.cssVar || "").trim() ||
    String(node.id || "").trim()
  );
}

function stableSortByDisplayKey(a: TokenGraphVizNode, b: TokenGraphVizNode) {
  return getNodeDisplayKey(a).localeCompare(getNodeDisplayKey(b), "en", {
    sensitivity: "base",
  });
}

export function buildGraphIndexes(graph: TokenGraphViz) {
  const nodeById = new Map<string, TokenGraphVizNode>();
  for (const node of graph.nodes) nodeById.set(node.id, node);

  const outById = new Map<string, string[]>();
  const inById = new Map<string, string[]>();
  for (const node of graph.nodes) {
    outById.set(node.id, []);
    inById.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (outById.has(edge.source)) outById.get(edge.source)!.push(edge.target);
    if (inById.has(edge.target)) inById.get(edge.target)!.push(edge.source);
  }

  for (const [id, list] of outById) {
    const unique = Array.from(new Set(list));
    unique.sort((a, b) => {
      const aNode = nodeById.get(a);
      const bNode = nodeById.get(b);
      if (!aNode || !bNode) return a.localeCompare(b);
      return stableSortByDisplayKey(aNode, bNode);
    });
    outById.set(id, unique);
  }

  for (const [id, list] of inById) {
    const unique = Array.from(new Set(list));
    unique.sort((a, b) => {
      const aNode = nodeById.get(a);
      const bNode = nodeById.get(b);
      if (!aNode || !bNode) return a.localeCompare(b);
      return stableSortByDisplayKey(aNode, bNode);
    });
    inById.set(id, unique);
  }

  return { nodeById, outById, inById };
}

export function resolveNodeIdFromQuery(graph: TokenGraphViz, query: string) {
  const q = String(query || "").trim();
  if (!q) return null;
  const indexes = buildGraphIndexes(graph);

  if (indexes.nodeById.has(q)) return q;

  const lowered = q.toLowerCase();
  for (const node of graph.nodes) {
    if (node.path?.toLowerCase() === lowered) return node.id;
    if (node.slashPath?.toLowerCase() === lowered) return node.id;
    if (node.cssVar?.toLowerCase() === lowered) return node.id;
    if (node.displayKey?.toLowerCase() === lowered) return node.id;
  }
  return null;
}

export function buildSubgraph(args: {
  graph: TokenGraphViz;
  rootId: string;
  depth: number;
  direction: GraphDirection;
}) {
  const { graph, rootId } = args;
  const depth = Math.max(0, Math.min(8, Math.floor(args.depth)));
  const { nodeById, outById, inById } = buildGraphIndexes(graph);

  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<{ id: string; level: number }> = [];

  visited.add(rootId);
  levels.set(rootId, 0);
  queue.push({ id: rootId, level: 0 });

  const includeEdge = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.level >= depth) continue;

    const neighbors: string[] = [];
    if (args.direction === "dependencies" || args.direction === "both") {
      neighbors.push(...(outById.get(current.id) ?? []));
      for (const targetId of outById.get(current.id) ?? []) {
        includeEdge.add(`${current.id}→${targetId}`);
      }
    }
    if (args.direction === "dependents" || args.direction === "both") {
      neighbors.push(...(inById.get(current.id) ?? []));
      for (const sourceId of inById.get(current.id) ?? []) {
        includeEdge.add(`${sourceId}→${current.id}`);
      }
    }

    for (const nextId of neighbors) {
      if (!nodeById.has(nextId)) continue;
      if (!visited.has(nextId)) {
        visited.add(nextId);
        levels.set(nextId, current.level + 1);
        queue.push({ id: nextId, level: current.level + 1 });
      } else {
        const existingLevel = levels.get(nextId);
        if (existingLevel === undefined || existingLevel > current.level + 1) {
          levels.set(nextId, current.level + 1);
        }
      }
    }
  }

  const nodes = Array.from(visited)
    .map((id) => {
      const node = nodeById.get(id);
      if (!node) return null;
      return { node, level: levels.get(id) ?? 0 };
    })
    .filter(Boolean) as Array<{ node: TokenGraphVizNode; level: number }>;

  nodes.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return stableSortByDisplayKey(a.node, b.node);
  });

  const edges: TokenGraphVizEdge[] = [];
  for (const edge of graph.edges) {
    if (!visited.has(edge.source) || !visited.has(edge.target)) continue;
    if (!includeEdge.has(`${edge.source}→${edge.target}`)) continue;
    edges.push(edge);
  }

  edges.sort((a, b) => {
    const aFrom = nodeById.get(a.source);
    const bFrom = nodeById.get(b.source);
    const byFrom = (aFrom?.displayKey ?? a.source).localeCompare(
      bFrom?.displayKey ?? b.source,
      "en",
      { sensitivity: "base" },
    );
    if (byFrom !== 0) return byFrom;
    const aTo = nodeById.get(a.target);
    const bTo = nodeById.get(b.target);
    return (aTo?.displayKey ?? a.target).localeCompare(
      bTo?.displayKey ?? b.target,
      "en",
      { sensitivity: "base" },
    );
  });

  return { nodes, edges, nodeById, levels };
}

export function layoutSubgraph(args: {
  nodes: Array<{ node: TokenGraphVizNode; level: number }>;
  edges: TokenGraphVizEdge[];
  nodeById: Map<string, TokenGraphVizNode>;
  levels: Map<string, number>;
}) : PositionedGraph {
  const levelGroups = new Map<number, TokenGraphVizNode[]>();
  for (const { node, level } of args.nodes) {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(node);
  }

  for (const [level, group] of levelGroups) {
    const sorted = group.slice().sort(stableSortByDisplayKey);
    levelGroups.set(level, sorted);
  }

  const maxLevel = Math.max(0, ...Array.from(levelGroups.keys()));
  const nodeWidth = 260;
  const nodeHeight = 44;
  const gapX = 80;
  const gapY = 18;

  const positioned: PositionedNode[] = [];

  for (let level = 0; level <= maxLevel; level += 1) {
    const group = levelGroups.get(level) ?? [];
    const totalHeight =
      group.length * nodeHeight + Math.max(0, group.length - 1) * gapY;
    const startY = -totalHeight / 2;

    for (let i = 0; i < group.length; i += 1) {
      const node = group[i];
      positioned.push({
        ...node,
        level,
        x: level * (nodeWidth + gapX),
        y: startY + i * (nodeHeight + gapY),
      });
    }
  }

  const nodeById = new Map<string, PositionedNode>();
  for (const node of positioned) nodeById.set(node.id, node);

  return { nodes: positioned, edges: args.edges, nodeById };
}

export function truncateLabel(value: string, max = 34) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
