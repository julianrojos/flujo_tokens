import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
} from "@/components/ui/overlay";
import { ApiErrorMessage } from "@/components/api-error-message";
import type { ApiErrorDisplay } from "@/lib/api-error-ux";
import type { TokenCollectionTree, TokenTreeNode } from "@/types/token-tree";
import { collectExpandableNodeIds, countTokens, findExpandedPathByQuery } from "./tree-utils";
import { TokenTreeNodeItem } from "./token-tree-node";

interface TokenTreeModalProps {
  open: boolean;
  onClose: () => void;
  collections: TokenCollectionTree[];
  summary: {
    collections: number;
    tokens: number;
  } | null;
  loading: boolean;
  error: ApiErrorDisplay | null;
  onReload: () => void;
}

export function TokenTreeModal({
  open,
  onClose,
  collections,
  summary,
  loading,
  error,
  onReload,
}: TokenTreeModalProps) {
  const [query, setQuery] = useState("");
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  const roots = useMemo(() => collections.map((collection) => collection.root), [collections]);
  const tokenValueByCssVar = useMemo(() => {
    const byCssVar = new Map<string, string>();

    const walk = (node: TokenTreeNode) => {
      if (node.type === "token") {
        const cssVar = String(node.tokenData?.cssVar || "").trim();
        const resolvedValue = String(node.tokenData?.resolvedValue || "").trim();
        if (cssVar && resolvedValue && !byCssVar.has(cssVar)) {
          byCssVar.set(cssVar, resolvedValue);
        }
      }
      for (const child of node.children) {
        walk(child);
      }
    };

    for (const root of roots) {
      walk(root);
    }

    return byCssVar;
  }, [roots]);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      const defaultExpanded = new Set<string>();
      for (const root of roots) {
        if (root.children.length > 0) defaultExpanded.add(root.id);
      }
      setExpandedNodeIds(defaultExpanded);
      return;
    }
    setExpandedNodeIds(findExpandedPathByQuery(roots, query));
  }, [open, roots, query]);

  const expandAll = () => {
    const next = new Set<string>();
    for (const root of roots) {
      collectExpandableNodeIds(root, next);
    }
    setExpandedNodeIds(next);
  };

  const collapseAll = () => {
    setExpandedNodeIds(new Set());
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} zIndex={1001}>
      <ModalContent className="max-h-[92vh] w-[min(980px,96vw)] overflow-hidden">
        <ModalHeader>
          <div>
            <h3 id="token-collection-tree-title" className="text-lg font-semibold">
              Token Collections Tree
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Estructura jerárquica derivada de `token-registry.json` por colección.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
            <X className="h-4 w-4" />
          </Button>
        </ModalHeader>

        <div className="border-b border-border/70 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative w-full md:max-w-md">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search token name, path, or value"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={expandAll} disabled={loading}>
                Expand all
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll} disabled={loading}>
                Collapse all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onReload}
                disabled={loading}
                aria-label="Reload tree data"
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="max-h-[56vh] overflow-auto p-3">
          {loading ? (
            <div className="rounded-md border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              Loading token trees...
            </div>
          ) : null}

          {!loading && error ? (
            <ApiErrorMessage error={error} className="p-4" />
          ) : null}

          {!loading && !error && roots.length === 0 ? (
            <div className="rounded-md border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              No token collections found.
            </div>
          ) : null}

          {!loading && !error && roots.length > 0 ? (
            <div className="space-y-1">
              {roots.map((root) => (
                <TokenTreeNodeItem
                  key={root.id}
                  node={root}
                  depth={0}
                  expandedNodeIds={expandedNodeIds}
                  onToggle={toggleNode}
                  query={query}
                  tokenValueByCssVar={tokenValueByCssVar}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border/70 px-5 py-3 text-xs text-muted-foreground">
          <span>
            {summary?.tokens ?? roots.reduce((total, root) => total + countTokens(root), 0)} tokens
          </span>
          <span>{summary?.collections ?? roots.length} collections</span>
        </div>
      </ModalContent>
    </Modal>
  );
}
