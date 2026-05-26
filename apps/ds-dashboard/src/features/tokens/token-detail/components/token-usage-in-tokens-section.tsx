/**
 * Token Usage in Tokens Section - displays downstream token consumers.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { EmptyState } from "@/components/composites";
import { toTokenDetail } from "@/lib/routes";
import { PAGE_SIZE_ALL, useTablePagination } from "@/lib/table-pagination";

import type { TokenUsageInTokensRow } from "../lib/token-detail-usage-derivation";

type TokenSortField = "token" | "collection" | "type" | "depth" | "consumers" | "properties";
type TokenSortDirection = "asc" | "desc";

interface TokenUsageInTokensSectionProps {
  rows: TokenUsageInTokensRow[];
}

export function TokenUsageInTokensSection({ rows }: TokenUsageInTokensSectionProps) {
  const [sort, setSort] = useState<{ field: TokenSortField; dir: TokenSortDirection }>({
    field: "token",
    dir: "asc",
  });
  const sortAriaSort = sort.dir === "asc" ? "ascending" : "descending";

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((left, right) => {
      let comparison = 0;
      if (sort.field === "token") comparison = left.path.localeCompare(right.path);
      else if (sort.field === "collection") comparison = left.collection.localeCompare(right.collection);
      else if (sort.field === "type") comparison = left.type.localeCompare(right.type);
      else if (sort.field === "depth") comparison = left.depth - right.depth;
      else if (sort.field === "consumers") comparison = left.consumers - right.consumers;
      else comparison = left.properties.join(", ").localeCompare(right.properties.join(", "));

      if (comparison === 0) {
        comparison = left.path.localeCompare(right.path);
      }
      return sort.dir === "asc" ? comparison : comparison * -1;
    });
    return next;
  }, [rows, sort]);

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
    pagedItems: pagedRows,
  } = useTablePagination(sortedRows);

  const totalConsumers = rows.reduce((sum, row) => sum + row.consumers, 0);
  const hasUsage = rows.length > 0;

  const toggleSort = (field: TokenSortField) => {
    setSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  if (!hasUsage) {
    return (
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Usage in Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={Inbox} title="No tokens usage" compact />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage in Tokens</CardTitle>
        <CardDescription>
          {sortedRows.length} tokens · {totalConsumers} downstream consumers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showPageSizeSelect ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="ml-auto flex items-center gap-2">
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
          </div>
        ) : null}

        {shouldPaginate ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pl-0">
            <p className="text-xs text-muted-foreground">
              Showing {pageStart}-{pageEnd} of {sortedRows.length}
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

        {pagedRows.length > 0 ? (
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
                  label="Collection"
                  onSort={() => toggleSort("collection")}
                  ariaLabel="Sort by collection"
                  ariaSort={sort.field === "collection" ? sortAriaSort : "none"}
                />
                <SortableTableHead
                  label="Type"
                  onSort={() => toggleSort("type")}
                  ariaLabel="Sort by type"
                  ariaSort={sort.field === "type" ? sortAriaSort : "none"}
                />
                <SortableTableHead
                  label="Depth"
                  onSort={() => toggleSort("depth")}
                  ariaLabel="Sort by depth"
                  ariaSort={sort.field === "depth" ? sortAriaSort : "none"}
                />
                <SortableTableHead
                  label="Consumers"
                  onSort={() => toggleSort("consumers")}
                  ariaLabel="Sort by consumers"
                  ariaSort={sort.field === "consumers" ? sortAriaSort : "none"}
                />
                <SortableTableHead
                  label="Properties"
                  onSort={() => toggleSort("properties")}
                  ariaLabel="Sort by properties"
                  ariaSort={sort.field === "properties" ? sortAriaSort : "none"}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.path}>
                  <TableCell className="!font-normal">
                    <Link
                      to={toTokenDetail(row.path)}
                      className="text-foreground hover:text-primary"
                      aria-label={`Open ${row.displayPath} token detail`}
                    >
                      {row.displayPath}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{row.collection}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono lowercase text-foreground">
                      {row.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-foreground">
                      {row.depth}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-foreground">
                      {row.consumers}
                    </span>
                  </TableCell>
                  <TableCell>
                    {row.properties.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.properties.map((property) => (
                          <span
                            key={property}
                            className="font-mono text-foreground"
                          >
                            {property}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-sm text-muted-foreground">No token usages match the filters.</div>
        )}
      </CardContent>
    </Card>
  );
}
