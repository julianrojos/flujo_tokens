/**
 * Layer Token Mapping Section
 *
 * Displays per-variant, per-layer token bindings for a component.
 * Uses the same Card + Table markup pattern as TokenUsageSection.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Link } from "react-router-dom";
import type { TokenRegistry } from "@/types/token-registry";

export interface LayerTokenMappingEntry {
  variant_node_id: string;
  variant_signature: string;
  layer_node_id: string;
  layer_name: string;
  property_path: string;
  variable_id: string;
  token_path: string | null;
  status: "resolved" | "unresolved";
  mode_id: string;
  mode_name: string;
}

interface LayerTokenMappingSectionProps {
  entries: LayerTokenMappingEntry[];
  tokenRegistry?: TokenRegistry | null;
}

type SortField = "token" | "property" | "collection" | "variant" | "layer" | "mode";
type SortDirection = "asc" | "desc";

type BindingWithCollection = {
  entry: LayerTokenMappingEntry;
  collection: string;
};

function resolveCollectionFromTokenPath(
  tokenPath: string | null,
  byPath?: TokenRegistry["byPath"],
  bySlashPath?: TokenRegistry["bySlashPath"],
): string | null {
  const path = String(tokenPath || "").trim();
  if (!path) return null;
  const byPathEntry = byPath?.[path];
  if (byPathEntry?.collection) return byPathEntry.collection;
  const slashPath = path.replace(/\./g, "/");
  const bySlashPathEntry = bySlashPath?.[slashPath];
  if (bySlashPathEntry?.collection) return bySlashPathEntry.collection;
  return null;
}

function normalizedSortText(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function sortValue(item: BindingWithCollection, field: SortField): string {
  if (field === "token") return normalizedSortText(item.entry.token_path);
  if (field === "property") return normalizedSortText(item.entry.property_path);
  if (field === "collection") return normalizedSortText(item.collection);
  if (field === "variant") return normalizedSortText(item.entry.variant_signature);
  if (field === "layer") return normalizedSortText(item.entry.layer_name);
  return normalizedSortText(item.entry.mode_name);
}

function stableIdentity(item: BindingWithCollection): string {
  const e = item.entry;
  return [
    normalizedSortText(e.variant_node_id),
    normalizedSortText(e.layer_node_id),
    normalizedSortText(e.property_path),
    normalizedSortText(e.variable_id),
    normalizedSortText(e.mode_id),
  ].join("|");
}

function compareBindingRows(left: BindingWithCollection, right: BindingWithCollection, sort: { field: SortField; dir: SortDirection }): number {
  const a = sortValue(left, sort.field);
  const b = sortValue(right, sort.field);
  const comparison = a < b ? -1 : a > b ? 1 : 0;
  if (comparison !== 0) {
    return sort.dir === "asc" ? comparison : comparison * -1;
  }
  // Deterministic tie-breaker avoids row jitter when primary values are equal.
  const tieA = stableIdentity(left);
  const tieB = stableIdentity(right);
  return tieA < tieB ? -1 : tieA > tieB ? 1 : 0;
}

export function LayerTokenMappingSection({ entries, tokenRegistry }: LayerTokenMappingSectionProps) {
  const hasEntries = entries.length > 0;
  const byPath = tokenRegistry?.byPath;
  const bySlashPath = tokenRegistry?.bySlashPath;
  const [sort, setSort] = useState<{ field: SortField; dir: SortDirection }>({
    field: "token",
    dir: "asc",
  });

  const sortedEntries = useMemo(() => {
    const withCollection = entries.map((entry) => ({
      entry,
      collection: resolveCollectionFromTokenPath(entry.token_path, byPath, bySlashPath) || "",
    }));
    withCollection.sort((left, right) => compareBindingRows(left, right, sort));
    return withCollection;
  }, [entries, sort, byPath, bySlashPath]);

  const toggleSort = (field: SortField) => {
    setSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tokens used</CardTitle>
        <CardDescription>
          {hasEntries
            ? `Token bindings per layer and variant — ${entries.length} binding${entries.length !== 1 ? "s" : ""}`
            : "Token bindings per layer and variant from the latest structured capture."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasEntries ? (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead label="Token" onSort={() => toggleSort("token")} ariaLabel="Sort by token" />
                <SortableTableHead label="Property" onSort={() => toggleSort("property")} ariaLabel="Sort by property" />
                <SortableTableHead label="Collection" onSort={() => toggleSort("collection")} ariaLabel="Sort by collection" />
                <SortableTableHead label="Variant" onSort={() => toggleSort("variant")} ariaLabel="Sort by variant" />
                <SortableTableHead label="Layer" onSort={() => toggleSort("layer")} ariaLabel="Sort by layer" />
                <SortableTableHead label="Mode" onSort={() => toggleSort("mode")} ariaLabel="Sort by mode" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.map(({ entry, collection }) => (
                <TableRow
                  key={`${entry.variant_node_id}-${entry.layer_node_id}-${entry.property_path}-${entry.variable_id}-${entry.mode_id}`}
                >
                  <TableCell className="max-w-[200px]">
                    {entry.token_path ? (
                      <div className="font-medium">
                        <Link
                          to={`/tokens/${encodeURIComponent(entry.token_path)}`}
                          className="hover:text-primary hover:underline"
                          aria-label={`Open ${entry.token_path} detail`}
                        >
                          {entry.token_path}
                        </Link>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{entry.property_path}</code>
                  </TableCell>
                  <TableCell>
                    {entry.token_path ? (
                      <Badge variant="neutral" className="text-xs">
                        {collection || "—"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <span className="block truncate text-sm" title={entry.variant_signature || "(no variant)"}>
                      {entry.variant_signature || <span className="text-muted-foreground">—</span>}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[160px]">
                    <span className="block truncate font-mono text-xs" title={entry.layer_name}>
                      {entry.layer_name}
                    </span>
                  </TableCell>
                  <TableCell>
                    {entry.mode_name ? (
                      <Badge variant="neutral" className="text-xs">{entry.mode_name}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-sm text-muted-foreground">
            No layer-token bindings available yet. Reimport this component from Figma to capture where variables are
            applied (layer + property).
          </div>
        )}
      </CardContent>
    </Card>
  );
}
