/**
 * Layer Token Mapping Section
 *
 * Displays per-variant, per-layer token bindings for a component.
 * Uses the same Card + Table markup pattern as TokenUsageSection.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterBar } from "@/components/composites";
import { Link } from "react-router-dom";
import { PAGE_SIZE_ALL, useTablePagination } from "@/lib/table-pagination";
import type { TokenCatalog } from "@/types/token-catalog";

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
  tokenCatalog?: TokenCatalog | null;
}

type SortField = "token" | "property" | "collection" | "variant" | "instances";
type SortDirection = "asc" | "desc";
type BindingWithCollection = {
  entry: LayerTokenMappingEntry;
  collection: string;
};
type GroupedBindingWithCollection = {
  entry: LayerTokenMappingEntry;
  collection: string;
  refsCount: number;
};

function resolveCollectionFromTokenPath(
  tokenPath: string | null,
  byPath?: TokenCatalog["byPath"],
  bySlashPath?: TokenCatalog["bySlashPath"],
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
  return normalizedSortText(item.entry.variant_signature);
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
  if (sort.field === "instances") {
    return 0;
  }
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

export function LayerTokenMappingSection({ entries, tokenCatalog }: LayerTokenMappingSectionProps) {
  const hasEntries = entries.length > 0;
  const byPath = tokenCatalog?.byPath;
  const bySlashPath = tokenCatalog?.bySlashPath;
  const [search, setSearch] = useState("");
  const [selectedVariant, setSelectedVariant] = useState<string>("__all__");
  const [selectedCollection, setSelectedCollection] = useState<string>("__all__");
  const [sort, setSort] = useState<{ field: SortField; dir: SortDirection }>({
    field: "token",
    dir: "asc",
  });
  const sortAriaSort = sort.dir === "asc" ? "ascending" : "descending";
  const displayTokenPath = (value: string | null | undefined) => String(value || "").trim().replace(/\./g, "/");

  const { variantOptions, collectionOptions, filteredEntries, sortedFilteredEntries } = useMemo(() => {
    const rows = entries.map((entry) => ({
      entry,
      collection: resolveCollectionFromTokenPath(entry.token_path, byPath, bySlashPath) || "",
    }));
    const signatures = Array.from(
      new Set(rows.map(({ entry }) => String(entry.variant_signature || "").trim())),
    );
    signatures.sort((a, b) => {
      const aIsEmpty = a.length === 0;
      const bIsEmpty = b.length === 0;
      if (aIsEmpty && !bIsEmpty) return 1;
      if (!aIsEmpty && bIsEmpty) return -1;
      return normalizedSortText(a).localeCompare(normalizedSortText(b));
    });
    const collections = Array.from(
      new Set(
        rows
          .map(({ collection }) => String(collection || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => normalizedSortText(a).localeCompare(normalizedSortText(b)));
    const loweredSearch = search.trim().toLowerCase();
    const filtered = rows.filter(({ entry, collection }) => {
      const variant = String(entry.variant_signature || "").trim();
      const tokenPath = String(entry.token_path || "").trim();
      const layer = String(entry.layer_name || "").trim();
      const property = String(entry.property_path || "").trim();
    const matchesVariant =
        selectedVariant === "__all__" || variant === selectedVariant;
      const matchesCollection =
        selectedCollection === "__all__" || collection === selectedCollection;
      const matchesSearch =
        !loweredSearch ||
        tokenPath.toLowerCase().includes(loweredSearch) ||
        layer.toLowerCase().includes(loweredSearch) ||
        property.toLowerCase().includes(loweredSearch) ||
        variant.toLowerCase().includes(loweredSearch);
      return matchesVariant && matchesCollection && matchesSearch;
    });
    const sorted = [...filtered];
    sorted.sort((left, right) => compareBindingRows(left, right, sort));
    return {
      variantOptions: signatures,
      collectionOptions: collections,
      filteredEntries: filtered,
      sortedFilteredEntries: sorted,
    };
  }, [entries, byPath, bySlashPath, search, selectedVariant, selectedCollection, sort]);

  useEffect(() => {
    setSelectedVariant((current) => {
      if (current === "__all__") return current;
      return variantOptions.includes(current) ? current : "__all__";
    });
  }, [variantOptions]);
  useEffect(() => {
    setSelectedCollection((current) => {
      if (current === "__all__") return current;
      return collectionOptions.includes(current) ? current : "__all__";
    });
  }, [collectionOptions]);

  const groupedSortedFilteredEntries = useMemo(() => {
    const byVisibleRow = new Map<string, GroupedBindingWithCollection>();
    for (const row of sortedFilteredEntries) {
      const key = [
        normalizedSortText(row.entry.token_path),
        normalizedSortText(row.entry.property_path),
        normalizedSortText(row.collection),
        normalizedSortText(row.entry.variant_signature),
      ].join("|");
      const current = byVisibleRow.get(key);
      if (!current) {
        byVisibleRow.set(key, { ...row, refsCount: 1 });
        continue;
      }
      current.refsCount += 1;
    }
    return Array.from(byVisibleRow.values());
  }, [sortedFilteredEntries]);

  const displayedEntries = useMemo(() => {
    if (sort.field !== "instances") {
      return groupedSortedFilteredEntries;
    }

    const sorted = [...groupedSortedFilteredEntries];
    sorted.sort((left, right) => {
      const comparison = left.refsCount - right.refsCount;
      if (comparison !== 0) {
        return sort.dir === "asc" ? comparison : comparison * -1;
      }

      const leftIdentity = stableIdentity(left);
      const rightIdentity = stableIdentity(right);
      return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
    });
    return sorted;
  }, [groupedSortedFilteredEntries, sort]);

  const {
    pageSize,
    setPageSize,
    pageSizeOptions,
    showPageSizeSelect,
    allowShowAll,
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    shouldPaginate,
    goPrevious,
    goNext,
    pagedItems: pagedEntries,
  } = useTablePagination(displayedEntries, {
    resetKey: `${search}|${selectedVariant}|${selectedCollection}`,
  });

  const hasFilteredEntries = displayedEntries.length > 0;

  const toggleSort = useCallback((field: SortField) => {
    setSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  }, []);

  return (
    <Card>
      <CardHeader className={hasEntries && hasFilteredEntries ? undefined : "pb-0"}>
        <h2 className="text-lg font-titles font-semibold tracking-tight titles-color">
          Tokens used
        </h2>
        <CardDescription>
          {hasEntries
            ? (
                selectedVariant === "__all__"
                  ? `Token bindings per layer and variant — ${groupedSortedFilteredEntries.length} grouped row${groupedSortedFilteredEntries.length !== 1 ? "s" : ""} from ${entries.length} binding${entries.length !== 1 ? "s" : ""}`
                  : `Token bindings per layer and variant — ${groupedSortedFilteredEntries.length} grouped row${groupedSortedFilteredEntries.length !== 1 ? "s" : ""} from ${filteredEntries.length} binding${filteredEntries.length !== 1 ? "s" : ""}`
              )
            : "Token bindings per layer and variant from the latest structured capture."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasEntries ? (
          <FilterBar
            searchValue={search}
            onSearch={setSearch}
            searchPlaceholder="Filter by token, layer, property, or variant"
            rightSlot={
              showPageSizeSelect ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows</span>
                  <Select
                    value={pageSize}
                    onChange={(event) => setPageSize(event.target.value)}
                    className="w-[132px]"
                    aria-label="Rows per page"
                  >
                    {pageSizeOptions.map((size) => (
                      <option key={size} value={String(size)}>
                        {size}
                      </option>
                    ))}
                    {allowShowAll ? <option value={PAGE_SIZE_ALL}>All</option> : null}
                  </Select>
                </div>
              ) : null
            }
          >
            <Select
              value={selectedCollection}
              onChange={(event) => setSelectedCollection(event.target.value)}
              aria-label="Filter token bindings by collection"
            >
              <option value="__all__">Collection: All</option>
              {collectionOptions.map((collection) => (
                <option key={collection} value={collection}>
                  {collection}
                </option>
              ))}
            </Select>
            <Select
              id="tokens-used-variant-filter"
              value={selectedVariant}
              onChange={(event) => setSelectedVariant(event.target.value)}
              aria-label="Filter token bindings by variant"
            >
              <option value="__all__">Variant: All</option>
              {variantOptions.map((variant) => (
                <option key={variant || "__no_variant__"} value={variant}>
                  {variant || "(no variant)"}
                </option>
              ))}
            </Select>
          </FilterBar>
        ) : null}
        {hasEntries ? (
          hasFilteredEntries ? (
            <>
              {shouldPaginate ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-0">
                  <p className="text-xs text-muted-foreground">
                    Showing {pageStart}-{pageEnd} of {displayedEntries.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goPrevious}
                      disabled={currentPage <= 1}
                    >
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goNext}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Token"
                      onSort={() => toggleSort("token")}
                      ariaLabel="Sort by token"
                      ariaSort={sort.field === "token" ? sortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Property"
                      onSort={() => toggleSort("property")}
                      ariaLabel="Sort by property"
                      ariaSort={sort.field === "property" ? sortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Collection"
                      onSort={() => toggleSort("collection")}
                      ariaLabel="Sort by collection"
                      ariaSort={sort.field === "collection" ? sortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Variant"
                      onSort={() => toggleSort("variant")}
                      ariaLabel="Sort by variant"
                      ariaSort={sort.field === "variant" ? sortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Instances"
                      onSort={() => toggleSort("instances")}
                      ariaLabel="Sort by instances"
                      ariaSort={sort.field === "instances" ? sortAriaSort : "none"}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedEntries.map(({ entry, collection, refsCount }) => (
                    <TableRow
                      key={`${entry.variant_node_id}-${entry.layer_node_id}-${entry.property_path}-${entry.variable_id}-${entry.mode_id}`}
                    >
                      <TableCell>
                        {entry.token_path ? (
                          <Link
                            to={`/tokens/${encodeURIComponent(entry.token_path)}`}
                            className="text-foreground hover:text-primary"
                            aria-label={`Open ${displayTokenPath(entry.token_path)} detail`}
                          >
                            {displayTokenPath(entry.token_path)}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono !font-normal text-foreground">
                          {entry.property_path}
                        </span>
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
                        <span className="block truncate text-sm !font-normal" title={entry.variant_signature || "(no variant)"}>
                          {entry.variant_signature || <span className="text-muted-foreground">—</span>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-foreground">
                          {refsCount}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {shouldPaginate ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-0">
                  <p className="text-xs text-muted-foreground">
                    Showing {pageStart}-{pageEnd} of {displayedEntries.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goPrevious}
                      disabled={currentPage <= 1}
                    >
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goNext}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={Inbox}
              title="No token bindings found"
              description="No token bindings match the selected variant."
              compact
            />
          )
        ) : (
          <EmptyState
            icon={Inbox}
            title="No token bindings yet"
            description="Reimport this component from Figma to capture where variables are applied."
            compact
          />
        )}
      </CardContent>
    </Card>
  );
}
