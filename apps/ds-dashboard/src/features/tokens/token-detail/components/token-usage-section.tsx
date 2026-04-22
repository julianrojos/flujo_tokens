/**
 * Token Usage Section - displays usage by component.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { EmptyState } from "@/components/composites";
import { toComponentDetail } from "@/lib/routes";
import { shouldAllowShowAll, shouldShowPageSizeSelect } from "@/lib/table-pagination";
import type { ComponentTokenUsage } from "../lib/token-detail-usage-derivation";

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";

interface TokenUsageFilters {
  componentMode: string;
  componentQuery: string;
}

interface TokenUsageActions {
  setComponentFilter: (key: "cmode" | "cq", value: string) => void;
}

interface TokenUsageSectionProps {
  filteredComponentUsages: ComponentTokenUsage[];
  componentUsageSummary: { total: number; direct: number; viaAlias: number; occurrences: number };
  filters: TokenUsageFilters;
  actions: TokenUsageActions;
}

type ComponentSortField = "component" | "property" | "mode" | "occurrences";
type ComponentSortDirection = "asc" | "desc";

export function TokenUsageSection({
  filteredComponentUsages,
  componentUsageSummary,
  filters,
  actions,
}: TokenUsageSectionProps) {
  const [sort, setSort] = useState<{ field: ComponentSortField; dir: ComponentSortDirection }>({
    field: "component",
    dir: "asc",
  });
  const [pageSize, setPageSize] = useState<string>("25");
  const [currentPage, setCurrentPage] = useState(1);

  const sortedComponentUsages = useMemo(() => {
    const rows = [...filteredComponentUsages];
    rows.sort((left, right) => {
      let comparison = 0;
      if (sort.field === "component") {
        comparison = left.displayName.localeCompare(right.displayName);
      } else if (sort.field === "property") {
        comparison = left.properties.join(", ").localeCompare(right.properties.join(", "));
      } else if (sort.field === "mode") {
        comparison = left.mode.localeCompare(right.mode);
      } else {
        comparison = left.occurrences - right.occurrences;
      }
      if (comparison === 0) {
        comparison = left.slug.localeCompare(right.slug);
      }
      return sort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [filteredComponentUsages, sort]);

  const pageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.filter((size) => size <= Math.max(25, sortedComponentUsages.length)),
    [sortedComponentUsages.length],
  );
  const pageSizeValue = pageSize === PAGE_SIZE_ALL ? sortedComponentUsages.length : Number(pageSize);
  const shouldPaginate =
    pageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(pageSizeValue) &&
    pageSizeValue > 0 &&
    sortedComponentUsages.length > pageSizeValue;
  const totalPages = shouldPaginate ? Math.max(1, Math.ceil(sortedComponentUsages.length / pageSizeValue)) : 1;
  const showPageSizeSelect = shouldShowPageSizeSelect(sortedComponentUsages.length);

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
  }, [pageSize, pageSizeOptions, sortedComponentUsages.length]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedComponentUsages = useMemo(() => {
    if (!shouldPaginate) return sortedComponentUsages;
    const start = (currentPage - 1) * pageSizeValue;
    return sortedComponentUsages.slice(start, start + pageSizeValue);
  }, [currentPage, pageSizeValue, shouldPaginate, sortedComponentUsages]);

  const pageStart = shouldPaginate
    ? (currentPage - 1) * pageSizeValue + 1
    : sortedComponentUsages.length === 0
      ? 0
      : 1;
  const pageEnd = shouldPaginate
    ? Math.min(sortedComponentUsages.length, currentPage * pageSizeValue)
    : sortedComponentUsages.length;

  const toggleSort = (field: ComponentSortField) => {
    setSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  const hasUsage = componentUsageSummary.total > 0;

  if (!hasUsage) {
    return (
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Usage in Components</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Inbox}
            title="No components usage"
            compact
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage in Components</CardTitle>
        <CardDescription>
          {componentUsageSummary.total} components · {componentUsageSummary.occurrences} bindings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.componentMode} onChange={(e) => actions.setComponentFilter("cmode", e.target.value)}>
            <option value="all">All modes</option>
            <option value="direct">Direct</option>
            <option value="via_alias">Via alias</option>
          </Select>
          <Input placeholder="Filter by component…" value={filters.componentQuery} onChange={(e) => actions.setComponentFilter("cq", e.target.value)} className="w-80" />
          {showPageSizeSelect ? (
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
                {shouldAllowShowAll(sortedComponentUsages.length) ? <option value={PAGE_SIZE_ALL}>All</option> : null}
              </Select>
            </div>
          ) : null}
        </div>

        {sortedComponentUsages.length > 0 ? (
          shouldPaginate ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {sortedComponentUsages.length}
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
          ) : null
        ) : null}

        {pagedComponentUsages.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead label="Component" onSort={() => toggleSort("component")} ariaLabel="Sort by component" />
                <SortableTableHead label="Property" onSort={() => toggleSort("property")} ariaLabel="Sort by property" />
                <SortableTableHead label="Mode" onSort={() => toggleSort("mode")} ariaLabel="Sort by mode" />
                <SortableTableHead label="Instances" onSort={() => toggleSort("occurrences")} ariaLabel="Sort by instances" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedComponentUsages.map((usage) => (
                <TableRow key={usage.slug}>
                  <TableCell className="!font-normal">
                    <Link
                      to={toComponentDetail(usage.slug)}
                      className="text-foreground hover:text-primary"
                      aria-label={`Open ${usage.displayName} component detail`}
                    >
                      {usage.displayName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {usage.properties.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {usage.properties.map((property) => (
                          <span key={property} className="font-mono text-xs text-foreground">
                            {property}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {(usage.mode === "direct" || usage.mode === "both") && (
                        <Badge variant="success">direct ({usage.directOccurrences})</Badge>
                      )}
                      {(usage.mode === "via_alias" || usage.mode === "both") && (
                        <Badge variant="neutral">via_alias ({usage.viaAliasOccurrences})</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{usage.occurrences}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-sm text-muted-foreground">No component usages match the filters.</div>
        )}

        {shouldPaginate ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pl-0">
            <p className="text-xs text-muted-foreground">
              Showing {pageStart}-{pageEnd} of {sortedComponentUsages.length}
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
      </CardContent>
    </Card>
  );
}
