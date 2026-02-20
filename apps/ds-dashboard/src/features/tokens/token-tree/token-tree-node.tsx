import { ChevronRight, FileJson2, Folder, FolderTree } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TokenTreeNode } from "@/types/token-tree";
import { countTokens, shouldRenderNodeByQuery } from "./tree-utils";

interface TokenTreeNodeProps {
  node: TokenTreeNode;
  depth: number;
  expandedNodeIds: Set<string>;
  onToggle: (nodeId: string) => void;
  query: string;
}

function getNodeIcon(type: TokenTreeNode["type"]) {
  if (type === "collection") return FolderTree;
  if (type === "group") return Folder;
  return FileJson2;
}

export function TokenTreeNodeItem({
  node,
  depth,
  expandedNodeIds,
  onToggle,
  query,
}: TokenTreeNodeProps) {
  if (!shouldRenderNodeByQuery(node, query)) return null;

  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodeIds.has(node.id);
  const Icon = getNodeIcon(node.type);

  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors",
          "hover:bg-accent/70",
          node.type === "token" && "text-muted-foreground",
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => {
          if (hasChildren) onToggle(node.id);
        }}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-90",
            )}
          />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}

        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            node.type === "token" ? "text-muted-foreground" : "text-foreground",
          )}
        />

        <span className="truncate">{node.name}</span>

        {node.type === "collection" ? (
          <Badge variant="neutral" className="ml-auto">
            {countTokens(node)} tokens
          </Badge>
        ) : null}

        {node.type === "token" && node.tokenData?.resolvedValue ? (
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
            {node.tokenData.resolvedValue}
          </span>
        ) : null}
      </button>

      {hasChildren && isExpanded ? (
        <div>
          {node.children.map((child) => (
            <TokenTreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodeIds={expandedNodeIds}
              onToggle={onToggle}
              query={query}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
