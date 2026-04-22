/**
 * Token Usage in Tokens Section - displays downstream token consumers.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { EmptyState } from "@/components/composites";
import { toTokenDetail } from "@/lib/routes";

import type { TokenUsageInTokensRow } from "../lib/token-detail-usage-derivation";

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";

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
  const [pageSize, setPageSize] = useState<string>("25");
  const [currentPage, setCurrentPage] = useState(1);

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

  const pageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.filter((size) => size <= Math.max(25, sortedRows.length)),
    [sortedRows.length],
  );
  const pageSizeValue = pageSize === PAGE_SIZE_ALL ? sortedRows.length : Number(pageSize);
  const shouldPaginate =
    pageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(pageSizeValue) &&
    pageSizeValue > 0 &&
    sortedRows.length > pageSizeValue;
  const totalPages = shouldPaginate ? Math.max(1, Math.ceil(sortedRows.length / pageSizeValue)) : 1;

  useEffect(() => {
    if (pageSize !== PAGE_SIZE_ALL) {
      const numericValue = Number(pageSize);
      if (!pageSizeOptions.includes(numericValue as (typeof PAGE_SIZE_OPTIONS)[number])) {
        const fallback = pageSizeOptions[pageSizeOptions.length - 1] ?? 25;
        setPageSize(String(fallback));
        return;
      }
    }
    setCurrentPage(1);
  }, [pageSize, pageSizeOptions, sortedRows.length]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    if (!shouldPaginate) return sortedRows;
    const start = (currentPage - 1) * pageSizeValue;
    return sortedRows.slice(start, start + pageSizeValue);
  }, [currentPage, pageSizeValue, shouldPaginate, sortedRows]);

  const pageStart = shouldPaginate
    ? (currentPage - 1) * pageSizeValue + 1
    : sortedRows.length === 0
      ? 0
      : 1;
  const pageEnd = shouldPaginate
    ? Math.min(sortedRows.length, currentPage * pageSizeValue)
    : sortedRows.length;

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
        <CardHeader>
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
              <option value={PAGE_SIZE_ALL}>All</option>
            </Select>
          </div>
        </div>

        {shouldPaginate ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pl-0">
            <p className="text-xs text-muted-foreground">
              Showing {pageStart}-{pageEnd} of {sortedRows.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
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
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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
                <SortableTableHead label="Token" onSort={() => toggleSort("token")} ariaLabel="Sort by token" />
                <SortableTableHead label="Collection" onSort={() => toggleSort("collection")} ariaLabel="Sort by collection" />
                <SortableTableHead label="Type" onSort={() => toggleSort("type")} ariaLabel="Sort by type" />
                <SortableTableHead label="Depth" onSort={() => toggleSort("depth")} ariaLabel="Sort by depth" />
                <SortableTableHead label="Consumers" onSort={() => toggleSort("consumers")} ariaLabel="Sort by consumers" />
                <SortableTableHead label="Properties" onSort={() => toggleSort("properties")} ariaLabel="Sort by properties" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.path}>
                  <TableCell className="!font-normal">
                    <Link
                      to={toTokenDetail(row.path)}
                      className="text-foreground hover:text-primary hover:underline"
                      aria-label={`Open ${row.displayPath} token detail`}
                    >
                      {row.displayPath}
                    </Link>
                  </TableCell>
                  <TableCell>{row.collection}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>
                    <Badge variant="neutral" className="font-mono text-xs">
                      {row.depth}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral" className="font-mono text-xs">
                      {row.consumers}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.properties.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.properties.map((property) => (
                          <Badge key={property} variant="neutral" className="font-mono text-xs">
                            {property}
                          </Badge>
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
