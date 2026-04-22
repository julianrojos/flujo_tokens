import { ChevronRight, FileJson2, Folder, FolderTree } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TokenTreeNode } from "@/types/token-tree";
import { normalizeToHex6 } from "../accessibility/color-utils";
import { countTokens, shouldRenderNodeByQuery } from "./tree-utils";

interface TokenTreeNodeProps {
  node: TokenTreeNode;
  depth: number;
  expandedNodeIds: Set<string>;
  onToggle: (nodeId: string) => void;
  query: string;
  tokenValueByCssVar: ReadonlyMap<string, string>;
}

const VAR_REF_RE = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+)\s*)?\)$/i;
const MAX_COLOR_RESOLUTION_DEPTH = 12;

function resolveSwatchColor(
  rawValue: string,
  tokenValueByCssVar: ReadonlyMap<string, string>,
  depth = 0,
  visited = new Set<string>(),
): string | null {
  if (depth > MAX_COLOR_RESOLUTION_DEPTH) return null;

  const direct = normalizeToHex6(rawValue);
  if (direct) return direct;

  const match = String(rawValue || "").trim().match(VAR_REF_RE);
  if (!match) return null;

  const cssVar = String(match[1] || "").trim();
  const fallback = String(match[2] || "").trim();
  if (!cssVar) return normalizeToHex6(fallback);

  const marker = cssVar.toLowerCase();
  if (visited.has(marker)) return normalizeToHex6(fallback);
  visited.add(marker);

  const referencedValue = tokenValueByCssVar.get(cssVar);
  if (referencedValue) {
    const resolved = resolveSwatchColor(
      referencedValue,
      tokenValueByCssVar,
      depth + 1,
      visited,
    );
    if (resolved) return resolved;
  }

  return normalizeToHex6(fallback);
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
  tokenValueByCssVar,
}: TokenTreeNodeProps) {
  if (!shouldRenderNodeByQuery(node, query)) return null;

  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodeIds.has(node.id);
  const Icon = getNodeIcon(node.type);
  const resolvedValue = String(node.tokenData?.resolvedValue || "").trim();
  const tokenPath = String(node.tokenData?.path || "").trim();
  const displayTokenPath = String(node.tokenData?.slashPath || "").trim() || tokenPath.replace(/\./g, "/");
  const swatchColor =
    node.type === "token"
      ? resolveSwatchColor(resolvedValue, tokenValueByCssVar)
      : null;
  const rowClassName = cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors",
    "hover:bg-accent/70",
    node.type === "token" && "text-muted-foreground",
  );
  const rowStyle = { paddingLeft: `${depth * 14 + 8}px` };

  return (
    <div>
      {node.type === "token" && tokenPath ? (
        <Link
          to={`/tokens/${encodeURIComponent(tokenPath)}`}
          className={rowClassName}
          style={rowStyle}
          title={`Open token detail: ${displayTokenPath}`}
        >
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />

          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              node.type === "token" ? "text-muted-foreground" : "text-foreground",
            )}
          />

          <span className="truncate">{node.name}</span>

          {resolvedValue ? (
            <span className="ml-auto flex min-w-0 items-center gap-2 pl-2 font-mono text-xs text-muted-foreground">
              <span className="truncate">{resolvedValue}</span>
              {swatchColor ? (
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-border/80"
                  style={{ backgroundColor: swatchColor }}
                  aria-label={`Token color ${swatchColor}`}
                  title={swatchColor}
                />
              ) : null}
            </span>
          ) : null}
        </Link>
      ) : (
        <button
          type="button"
          className={rowClassName}
          style={rowStyle}
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

          {node.type === "token" && resolvedValue ? (
            <span className="ml-auto flex min-w-0 items-center gap-2 pl-2 font-mono text-xs text-muted-foreground">
              <span className="truncate">{resolvedValue}</span>
              {swatchColor ? (
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-border/80"
                  style={{ backgroundColor: swatchColor }}
                  aria-label={`Token color ${swatchColor}`}
                  title={swatchColor}
                />
              ) : null}
            </span>
          ) : null}
        </button>
      )}

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
              tokenValueByCssVar={tokenValueByCssVar}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
