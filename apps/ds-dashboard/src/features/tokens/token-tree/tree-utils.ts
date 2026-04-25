import type { TokenTreeNode } from "@/types/token-tree";

function nodeMatchesNormalized(node: TokenTreeNode, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const tokenPath = String(node.tokenData?.path || "").toLowerCase();
  const tokenValue = String(node.tokenData?.resolvedValue || "").toLowerCase();
  return (
    node.name.toLowerCase().includes(normalizedQuery) ||
    node.path.toLowerCase().includes(normalizedQuery) ||
    tokenPath.includes(normalizedQuery) ||
    tokenValue.includes(normalizedQuery)
  );
}

export function countTokens(node: TokenTreeNode): number {
  if (node.type === "token") return 1;
  return node.children.reduce((sum, child) => sum + countTokens(child), 0);
}

export function collectExpandableNodeIds(node: TokenTreeNode, target: Set<string>): void {
  if (node.type !== "token" && node.children.length > 0) {
    target.add(node.id);
  }
  for (const child of node.children) {
    collectExpandableNodeIds(child, target);
  }
}

export function findExpandedPathByQuery(
  roots: TokenTreeNode[],
  query: string,
): Set<string> {
  const expanded = new Set<string>();
  const normalized = query.trim().toLowerCase();
  if (!normalized) return expanded;

  const ancestors: string[] = [];

  const walk = (node: TokenTreeNode): boolean => {
    const selfMatch = nodeMatchesNormalized(node, normalized);
    let childMatch = false;
    if (node.children.length > 0) {
      ancestors.push(node.id);
      try {
        for (const child of node.children) {
          if (walk(child)) childMatch = true;
        }
      } finally {
        ancestors.pop();
      }
    }
    if (selfMatch || childMatch) {
      for (const ancestorId of ancestors) {
        expanded.add(ancestorId);
      }
      if (node.children.length > 0) expanded.add(node.id);
      return true;
    }
    return false;
  };

  for (const root of roots) {
    walk(root);
  }

  return expanded;
}

export function shouldRenderNodeByQuery(node: TokenTreeNode, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  if (nodeMatchesNormalized(node, normalized)) return true;
  for (const child of node.children) {
    if (shouldRenderNodeByQuery(child, normalized)) return true;
  }
  return false;
}
