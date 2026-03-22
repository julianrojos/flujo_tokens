import type { TokenTreeNode } from "@/types/token-tree";

function nodeMatches(node: TokenTreeNode, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase();
  const tokenPath = String(node.tokenData?.path || "").toLowerCase();
  const tokenValue = String(node.tokenData?.resolvedValue || "").toLowerCase();
  return (
    node.name.toLowerCase().includes(normalized) ||
    node.path.toLowerCase().includes(normalized) ||
    tokenPath.includes(normalized) ||
    tokenValue.includes(normalized)
  );
}

export function countTokens(node: TokenTreeNode): number {
  if (node.type === "token") return 1;
  return node.children.reduce((sum, child) => sum + countTokens(child), 0);
}

export function collectExpandableNodeIds(node: TokenTreeNode, target: Set<string>) {
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

  const walk = (node: TokenTreeNode, ancestors: string[]): boolean => {
    const selfMatch = nodeMatches(node, normalized);
    let childMatch = false;
    for (const child of node.children) {
      if (walk(child, [...ancestors, node.id])) childMatch = true;
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
    walk(root, []);
  }

  return expanded;
}

export function shouldRenderNodeByQuery(node: TokenTreeNode, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  if (nodeMatches(node, normalized)) return true;
  for (const child of node.children) {
    if (shouldRenderNodeByQuery(child, normalized)) return true;
  }
  return false;
}
