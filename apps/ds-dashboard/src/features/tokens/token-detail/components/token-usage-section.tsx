/**
 * Token Usage Section - displays usage by component.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { toComponentDetail } from "@/lib/routes";
import type { ComponentTokenUsage } from "../hooks/use-token-detail";

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

type ComponentSortField = "component" | "mode" | "occurrences";
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

  const sortedComponentUsages = useMemo(() => {
    const rows = [...filteredComponentUsages];
    rows.sort((left, right) => {
      let comparison = 0;
      if (sort.field === "component") {
        comparison = left.displayName.localeCompare(right.displayName);
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

  const toggleSort = (field: ComponentSortField) => {
    setSort((current) =>
      current.field === field
        ? { field, dir: current.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

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
        </div>

        {filteredComponentUsages.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead label="Component" onSort={() => toggleSort("component")} ariaLabel="Sort by component" />
                <SortableTableHead label="Mode" onSort={() => toggleSort("mode")} ariaLabel="Sort by mode" />
                <SortableTableHead label="Instances" onSort={() => toggleSort("occurrences")} ariaLabel="Sort by instances" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedComponentUsages.map((usage) => (
                <TableRow key={usage.slug}>
                  <TableCell className="font-medium">
                    <Link
                      to={toComponentDetail(usage.slug)}
                      className="hover:text-primary hover:underline"
                      aria-label={`Open ${usage.displayName} component detail`}
                    >
                      {usage.displayName}
                    </Link>
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
      </CardContent>
    </Card>
  );
}
