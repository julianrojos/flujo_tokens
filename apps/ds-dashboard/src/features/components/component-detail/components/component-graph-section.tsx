import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { ComponentUsageEntry } from "@/types/component-usage-index";
import type { ComponentCatalogItem } from "@/types/component-catalog";

interface ComponentGraphSectionProps {
  usage: ComponentUsageEntry | null;
  allItems: ComponentCatalogItem[];
}

export function ComponentGraphSection({ usage, allItems }: ComponentGraphSectionProps) {
  const [usesSortDir, setUsesSortDir] = useState<"asc" | "desc">("asc");
  const [usedBySortDir, setUsedBySortDir] = useState<"asc" | "desc">("asc");

  // Build slug to display name map
  const slugToDisplayName = new Map(
    allItems.map((item) => [item.slug, item.display_name] as const)
  );

  const sortByDisplayName = useMemo(
    () => (rows: string[], dir: "asc" | "desc") =>
      [...rows].sort((left, right) => {
        const leftName = String(slugToDisplayName.get(left) ?? left).toLowerCase();
        const rightName = String(slugToDisplayName.get(right) ?? right).toLowerCase();
        const comparison = leftName.localeCompare(rightName) || left.localeCompare(right);
        return dir === "asc" ? comparison : comparison * -1;
      }),
    [slugToDisplayName],
  );
  const hasUses = usage !== null && usage.uses.length > 0;
  const hasUsedBy = usage !== null && usage.used_in.length > 0;
  const hasUsage = hasUses || hasUsedBy;
  const useTwoColumns = hasUses && hasUsedBy;
  const usesSortAriaSort = usesSortDir === "asc" ? "ascending" : "descending";
  const usedBySortAriaSort = usedBySortDir === "asc" ? "ascending" : "descending";

  const renderRelationTable = (
    rows: string[],
    sortDir: "asc" | "desc",
    onSort: () => void,
    ariaSort: "ascending" | "descending",
  ) => {
    const sortedRows = sortByDisplayName(rows, sortDir);
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              label="Component"
              onSort={onSort}
              ariaLabel="Sort by component"
              ariaSort={ariaSort}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((slug) => (
            <TableRow key={slug}>
              <TableCell className="!font-normal">
                <Link
                  to={`/components/${encodeURIComponent(slug)}`}
                  className="text-foreground hover:text-primary"
                  aria-label={`Open ${slugToDisplayName.get(slug) ?? slug} component detail`}
                >
                  {slugToDisplayName.get(slug) ?? slug}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  if (!hasUsage) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Component Dependencies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={useTwoColumns ? "grid gap-6 lg:grid-cols-2" : "space-y-6"}>
          {hasUses ? (
            <section className="space-y-2 min-w-0">
              <h3 className="text-sm font-titles font-semibold titles-color">Uses</h3>
              {renderRelationTable(
                usage.uses,
                usesSortDir,
                () => setUsesSortDir((current) => (current === "asc" ? "desc" : "asc")),
                usesSortAriaSort,
              )}
            </section>
          ) : null}

          {hasUsedBy ? (
            <section className="space-y-2 min-w-0">
              <h3 className="text-sm font-titles font-semibold titles-color">Used by</h3>
              {renderRelationTable(
                usage.used_in,
                usedBySortDir,
                () => setUsedBySortDir((current) => (current === "asc" ? "desc" : "asc")),
                usedBySortAriaSort,
              )}
            </section>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
