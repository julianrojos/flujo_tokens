/**
 * Token Diff Table - displays diff rows for a change kind.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TokenUsageEntry } from "@/types/token-usage-index";
import type { DiffTableRow, SortField, SortDirection } from "../hooks/use-token-diff";
import { badgeForChange, rowTone, formatImpactCount, isRiskyResolvedValueChange } from "../lib/token-diff-transforms";

interface TokenDiffTableProps {
  kind: "added" | "removed" | "modified";
  title: string;
  rows: DiffTableRow[];
  sort: { field: SortField; dir: SortDirection };
  onSort: (field: SortField) => void;
  graphDependentsMap: Map<string, number>;
  usageByPath: Record<string, TokenUsageEntry>;
  onRowClick: (row: DiffTableRow) => void;
  selected: DiffTableRow | null;
}

export function TokenDiffTable({
  kind,
  title,
  rows,
  sort,
  onSort,
  graphDependentsMap,
  usageByPath,
  onRowClick,
  selected,
}: TokenDiffTableProps) {
  const sortedRows = useMemo(() => {
    return rows.slice().sort((left, right) => {
      const valueFor = (row: DiffTableRow) => {
        if (sort.field === "token") return row.tokenPath.toLowerCase();
        if (sort.field === "status") return row.change_class === "breaking" ? 1 : 0;
        if (sort.field === "uses") return usageByPath[row.tokenPath]?.usageCount ?? -1;
        if (sort.field === "dependents") return graphDependentsMap.get(row.tokenPath) ?? 0;
        return (row.fieldsChanged || []).join(",").toLowerCase();
      };
      const aValue = valueFor(left);
      const bValue = valueFor(right);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.dir === "asc" ? comparison : comparison * -1;
    });
  }, [rows, sort, graphDependentsMap, usageByPath]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>0 items</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No items.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{rows.length} items</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Token"
                onSort={() => onSort("token")}
              />
              <SortableTableHead
                label="Status"
                onSort={() => onSort("status")}
              />
              <SortableTableHead
                className="text-right"
                label="Uses"
                onSort={() => onSort("uses")}
              />
              <SortableTableHead
                className="text-right"
                label="Dependents"
                onSort={() => onSort("dependents")}
              />
              <SortableTableHead
                label="Notes"
                onSort={() => onSort("notes")}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => {
              const usageEntry = usageByPath[row.tokenPath];
              const usageCount = usageEntry?.usageCount ?? null;
              const dependentsCount = graphDependentsMap.get(row.tokenPath) ?? 0;
              const isRisky = isRiskyResolvedValueChange({ fields_changed: row.fieldsChanged }, usageCount);

              return (
                <TableRow
                  key={`${row.kind}:${row.identity}`}
                  className={cn("cursor-pointer", rowTone(kind, row.change_class), selected?.key === row.key && selected?.kind === row.kind && "bg-muted/50")}
                  onClick={() => onRowClick(row)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  aria-label={`View impact for ${row.tokenPath}`}
                >
                  <TableCell className="font-mono">{row.tokenPath}</TableCell>
                  <TableCell>
                    <Badge variant={badgeForChange(kind, row.change_class)}>
                      {row.change_class}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatImpactCount(usageCount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatImpactCount(dependentsCount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {isRisky ? "resolvedValue changed" : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
