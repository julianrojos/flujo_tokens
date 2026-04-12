import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, RefreshCcw } from "lucide-react";

import {
  fetchComponentRegistry,
  fetchComponentUsageIndex,
  refreshRegistry,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useSortState } from "@/lib/use-sort-state";
import type { ComponentRegistryItem } from "@/types/component-registry";
import type { ComponentUsageIndex } from "@/types/component-usage-index";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar, PageHeader } from "@/components/composites";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  const [syncing, setSyncing] = useState(false);

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

  const handleRefreshFromPipeline = async () => {
    setSyncing(true);
    try {
      await refreshRegistry();
      await loadData();
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Registry refresh failed",
          fallbackMessage: "Unable to refresh component registry.",
        }),
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Total componentes</CardDescription>
            <CardTitle>{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Con spec</CardDescription>
            <CardTitle>{stats.withSpec}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardContent>
          <PageHeader
            title="Componentes"
            description="Filtra y ordena con datos locales del registry generado."
            actions={
              <Button
                variant="outline"
                onClick={handleRefreshFromPipeline}
                disabled={syncing}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {syncing ? "Refreshing..." : "Refresh Registry"}
              </Button>
            }
          />

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
        </CardContent>
      </Card>
    </div>
  );
}
