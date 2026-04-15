import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

import {
  fetchComponentRegistry,
  fetchComponentUsageIndex,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useSortState } from "@/lib/use-sort-state";
import type { ComponentRegistryItem } from "@/types/component-registry";
import type { ComponentUsageIndex } from "@/types/component-usage-index";
import { Badge } from "@/components/ui/badge";
import { FilterBar, PageHeader, StatsOverview } from "@/components/composites";
import { ApiErrorMessage } from "@/components/api-error-message";
import { Select } from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SortField =
  | "display_name"
  | "spec_exists"
  | "usage_count";

function specBadgeVariant(exists: boolean) {
  return exists ? ("success" as const) : ("neutral" as const);
}

export function ComponentsPage() {
  const [rows, setRows] = useState<ComponentRegistryItem[]>([]);
  const [usageBySlug, setUsageBySlug] = useState<
    ComponentUsageIndex["by_slug"]
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [search, setSearch] = useState("");
  const [specFilter, setSpecFilter] = useState("all");
  const [sort, toggleSort] = useSortState<SortField>({
    field: "display_name",
    dir: "asc",
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [registryPayload, usagePayload] = await Promise.all([
        fetchComponentRegistry(),
        fetchComponentUsageIndex().catch(() => ({ by_slug: {} })),
      ]);
      setRows(registryPayload.components ?? []);
      setUsageBySlug(usagePayload.by_slug ?? {});
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Component data unavailable",
          fallbackMessage: "Unable to load component registry.",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filtered = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    const next = rows.filter((item) => {
      const matchesSearch =
        !lowered ||
        item.display_name.toLowerCase().includes(lowered) ||
        item.slug.toLowerCase().includes(lowered);
      const matchesSpec =
        specFilter === "all"
          || (specFilter === "with-spec" && item.spec.exists)
          || (specFilter === "without-spec" && !item.spec.exists);
      return matchesSearch && matchesSpec;
    });

    next.sort((a, b) => {
      const valueFor = (row: ComponentRegistryItem): string | number => {
        if (sort.field === "display_name") return row.display_name.toLowerCase();
        if (sort.field === "spec_exists") return row.spec.exists ? 1 : 0;
        if (sort.field === "usage_count") return usageBySlug[row.slug]?.used_in.length ?? 0;
        return 0;
      };

      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.dir === "asc" ? comparison : comparison * -1;
    });

    return next;
  }, [rows, search, specFilter, sort, usageBySlug]);

  const stats = useMemo(() => {
    const total = rows.length;
    const withSpec = rows.filter((item) => item.spec.exists).length;
    return { total, withSpec };
  }, [rows]);

  const displayNameBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.slug] = row.display_name;
    }
    return map;
  }, [rows]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Componentes"
        description="Filtra y ordena con datos locales del registry generado."
      />

      <StatsOverview
        gridClassName="md:grid-cols-2"
        items={[
          { id: "components-total", label: "Total componentes", value: stats.total },
          { id: "components-with-spec", label: "Con spec", value: stats.withSpec },
        ]}
      />

      <div className="rounded-xl border border-border/70 bg-card/85 p-5 pt-0 text-card-foreground backdrop-blur-sm">
          <FilterBar
            searchValue={search}
            onSearch={setSearch}
            searchPlaceholder="Buscar por nombre o slug"
            count={filtered.length}
          >
            <Select
              value={specFilter}
              onChange={(event) => setSpecFilter(event.target.value)}
            >
              <option value="all">Spec: All</option>
              <option value="with-spec">With spec</option>
              <option value="without-spec">Without spec</option>
            </Select>
          </FilterBar>

          {error ? (
            <ApiErrorMessage error={error} />
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead label="Component" onSort={() => toggleSort("display_name")} />
                <SortableTableHead label="Spec" onSort={() => toggleSort("spec_exists")} />
                <SortableTableHead label="Used In" onSort={() => toggleSort("usage_count")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground"
                  >
                    No components match your filters.
                  </TableCell>
                </TableRow>
              ) : null}

              {loading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={`loading-${index}`}>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        Loading components...
                      </TableCell>
                    </TableRow>
                  ))
                : filtered.map((item) => (
                    <TableRow key={item.slug}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.figma.file_url ? (
                            <a
                              href={item.figma.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-muted-foreground hover:text-primary"
                              title={`Open ${item.display_name} in Figma`}
                              aria-label={`Open ${item.display_name} in Figma`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : null}
                          <Link
                            to={`/components/${item.slug}`}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                            aria-label={`Open ${item.display_name} detail`}
                          >
                            {item.display_name}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <Link
                            to={`/components/${item.slug}`}
                            className="font-mono hover:text-primary hover:underline"
                            aria-label={`Open ${item.slug} detail`}
                          >
                            {item.slug}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={specBadgeVariant(item.spec.exists)}>
                          {item.spec.exists ? "With spec" : "Without spec"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const usedInSlugs = usageBySlug[item.slug]?.used_in ?? [];
                          if (usedInSlugs.length === 0) return "-";
                          const labels = usedInSlugs.map(
                            (slug) => displayNameBySlug[slug] || slug,
                          );
                          return labels.join(", ");
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
      </div>
    </div>
  );
}
