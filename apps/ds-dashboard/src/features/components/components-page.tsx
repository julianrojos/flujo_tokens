import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

import {
  fetchComponentCatalog,
  fetchDesignSystemsConfig,
  fetchComponentUsageIndex,
  getActiveSystemId,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useSortState } from "@/lib/use-sort-state";
import type { ComponentCatalogItem } from "@/types/component-catalog";
import type { ComponentUsageIndex } from "@/types/component-usage-index";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar, PageHeader, StatsOverview } from "@/components/composites";
import { ApiErrorMessage } from "@/components/api-error-message";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";
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
  | "variants_count"
  | "spec_exists"
  | "token_coverage"
  | "usage_count";

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";

function specBadgeVariant(exists: boolean) {
  return exists ? ("success" as const) : ("neutral" as const);
}

function getVariantCount(item: ComponentCatalogItem) {
  const figmaVariants = Array.isArray(item.figma.variants) ? item.figma.variants.length : null;
  if (figmaVariants !== null) return figmaVariants;
  return Number(item.visual_proof?.variants_count ?? 0) || 0;
}

function getTokenBindingCoverage(item: ComponentCatalogItem): {
  resolved: number;
  total: number;
} {
  const bindings = Array.isArray(item.figma.token_bindings) ? item.figma.token_bindings : [];
  const total = bindings.length;
  const resolved = bindings.filter((binding) => binding.status === "resolved").length;
  return { resolved, total };
}

function buildTokenCoverage(item: ComponentCatalogItem) {
  const { resolved, total } = getTokenBindingCoverage(item);
  const variant =
    total <= 0
      ? ("neutral" as const)
      : resolved >= total
        ? ("success" as const)
        : resolved === 0
          ? ("warning" as const)
          : ("default" as const);
  const className = total > 0 ? "border-status-success-border/30" : "";
  const percent = total > 0 ? Math.round((resolved / total) * 100) : null;
  const label = percent === null ? "—" : `${percent}%`;
  return { resolved, total, variant, className, label };
}

export function ComponentsPage() {
  const [rows, setRows] = useState<ComponentCatalogItem[]>([]);
  const [usageBySlug, setUsageBySlug] = useState<
    ComponentUsageIndex["by_slug"]
  >({});
  const [importedComponentsCount, setImportedComponentsCount] = useState<number | null>(null);
  const [scannedComponentsCount, setScannedComponentsCount] = useState<number | null>(null);
  const [docsEditedPercent, setDocsEditedPercent] = useState(0);
  const [hasPartialData, setHasPartialData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [search, setSearch] = useState("");
  const [specFilter, setSpecFilter] = useState("all");
  const [pageSize, setPageSize] = useState<string>("25");
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, toggleSort] = useSortState<SortField>({
    field: "display_name",
    dir: "asc",
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [registryResult, designSystemsResult, usageResult] = await Promise.allSettled([
        fetchComponentCatalog(),
        fetchDesignSystemsConfig(),
        fetchComponentUsageIndex(),
      ]);
      if (registryResult.status !== "fulfilled") {
        throw registryResult.reason;
      }
      const registryPayload = registryResult.value;
      const designSystemsConfig =
        designSystemsResult.status === "fulfilled" ? designSystemsResult.value : null;
      const usagePayload =
        usageResult.status === "fulfilled" ? usageResult.value : { by_slug: {} };
      const activeSystemId = String(getActiveSystemId() || "").trim();
      const activeSystem =
        designSystemsConfig?.systems.find((entry) => entry.id === activeSystemId) ?? null;
      const totalComponents = Number(registryPayload.summary?.total_components ?? 0);
      const withEditorial = Number(registryPayload.summary?.with_editorial ?? 0);
      const importedComponents =
        activeSystem && typeof activeSystem.importedComponentsCount === "number" &&
          Number.isFinite(activeSystem.importedComponentsCount)
          ? activeSystem.importedComponentsCount
          : null;
      const scannedComponents =
        activeSystem && typeof activeSystem.detectedComponentsCount === "number" &&
          Number.isFinite(activeSystem.detectedComponentsCount)
          ? activeSystem.detectedComponentsCount
          : null;
      setRows(registryPayload.components ?? []);
      setUsageBySlug(usagePayload.by_slug ?? {});
      setImportedComponentsCount(importedComponents);
      setScannedComponentsCount(scannedComponents);
      setHasPartialData(
        designSystemsResult.status !== "fulfilled" ||
          usageResult.status !== "fulfilled" ||
          activeSystem === null ||
          importedComponents === null ||
          scannedComponents === null,
      );
      setDocsEditedPercent(
        totalComponents > 0 ? Math.round((withEditorial / totalComponents) * 100) : 0,
      );
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Component data unavailable",
          fallbackMessage: "Unable to load component catalog.",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const tokenCoverageBySlug = useMemo(() => {
    const map: Record<string, ReturnType<typeof buildTokenCoverage>> = {};
    for (const row of rows) {
      map[row.slug] = buildTokenCoverage(row);
    }
    return map;
  }, [rows]);

  const variantCountBySlug = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of rows) {
      map[row.slug] = getVariantCount(row);
    }
    return map;
  }, [rows]);

  const usedInCountBySlug = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of rows) {
      map[row.slug] = usageBySlug[row.slug]?.used_in.length ?? 0;
    }
    return map;
  }, [rows, usageBySlug]);

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
      const valueFor = (row: ComponentCatalogItem): string | number => {
        if (sort.field === "display_name") return row.display_name.toLowerCase();
        if (sort.field === "variants_count") return variantCountBySlug[row.slug] ?? getVariantCount(row);
        if (sort.field === "spec_exists") return row.spec.exists ? 1 : 0;
        if (sort.field === "token_coverage") {
          const coverage = tokenCoverageBySlug[row.slug];
          if (!coverage || coverage.total <= 0) return 0;
          return coverage.resolved / coverage.total;
        }
        if (sort.field === "usage_count") return usedInCountBySlug[row.slug] ?? 0;
        return 0;
      };

      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.dir === "asc" ? comparison : comparison * -1;
    });

    return next;
  }, [rows, search, specFilter, sort, usedInCountBySlug, tokenCoverageBySlug, variantCountBySlug]);

  const pageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.filter((size) => size <= filtered.length),
    [filtered.length],
  );
  const pageSizeValue = pageSize === PAGE_SIZE_ALL ? filtered.length : Number(pageSize);
  const shouldPaginate =
    pageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(pageSizeValue) &&
    pageSizeValue > 0 &&
    filtered.length > pageSizeValue;
  const totalPages = shouldPaginate ? Math.max(1, Math.ceil(filtered.length / pageSizeValue)) : 1;

  useEffect(() => {
    if (pageSize !== PAGE_SIZE_ALL) {
      const numericValue = Number(pageSize);
      if (!pageSizeOptions.includes(numericValue as (typeof PAGE_SIZE_OPTIONS)[number])) {
        const fallback = pageSizeOptions[pageSizeOptions.length - 1];
        setPageSize(fallback !== undefined ? String(fallback) : PAGE_SIZE_ALL);
        return;
      }
    }
    setCurrentPage(1);
  }, [pageSize, pageSizeOptions, search, specFilter]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedComponents = useMemo(() => {
    if (!shouldPaginate) return filtered;
    const start = (currentPage - 1) * pageSizeValue;
    return filtered.slice(start, start + pageSizeValue);
  }, [currentPage, filtered, pageSizeValue, shouldPaginate]);

  const pageStart = shouldPaginate ? (currentPage - 1) * pageSizeValue + 1 : filtered.length === 0 ? 0 : 1;
  const pageEnd = shouldPaginate ? Math.min(filtered.length, currentPage * pageSizeValue) : filtered.length;

  const displayNameBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.slug] = row.display_name;
    }
    return map;
  }, [rows]);

  const usedInLabelsBySlug = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of rows) {
      const usedInSlugs = usageBySlug[row.slug]?.used_in ?? [];
      map[row.slug] = usedInSlugs.map((slug) => displayNameBySlug[slug] || slug);
    }
    return map;
  }, [rows, usageBySlug, displayNameBySlug]);

  const multiVariantPercent = useMemo(() => {
    const total = rows.length;
    if (total <= 0) return 0;
    const multiVariant = rows.filter((item) => (variantCountBySlug[item.slug] ?? getVariantCount(item)) >= 2).length;
    return Math.round((multiVariant / total) * 100);
  }, [rows, variantCountBySlug]);

  const formatCount = (value: number | null) => (value === null ? "—" : String(value));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Components"
      />

      <StatsOverview
        items={[
          {
            id: "components-imported-scanned",
            label: "Imported / scanned components",
            value: `${formatCount(importedComponentsCount)} / ${formatCount(scannedComponentsCount)}`,
          },
          { id: "components-docs-edited", label: "Documentation coverage", value: `${docsEditedPercent}%` },
          { id: "components-multi-variant-rate", label: "Multi-variant rate", value: `${multiVariantPercent}%` },
        ]}
      />

      {hasPartialData ? (
        <StatusAlert variant="warning" title="Partial component data">
          Some KPI values are unavailable because the design system config or usage index could not be loaded.
        </StatusAlert>
      ) : null}

      <Card className="p-5 text-card-foreground backdrop-blur-sm">
          <FilterBar
            searchValue={search}
            onSearch={setSearch}
            searchPlaceholder="Buscar por nombre o slug"
            count={filtered.length}
            rightSlot={(
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
                  <option value={PAGE_SIZE_ALL}>All</option>
                </Select>
              </div>
            )}
          >
            <Select
              value={specFilter}
              onChange={(event) => setSpecFilter(event.target.value)}
            >
              <option value="all">Docs: All</option>
              <option value="with-spec">Docs</option>
              <option value="without-spec">No docs</option>
            </Select>
          </FilterBar>

          {error ? (
            <ApiErrorMessage error={error} />
          ) : null}

          {shouldPaginate ? (
            <div className="mt-3 mb-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {filtered.length}
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

          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead label="Component" onSort={() => toggleSort("display_name")} />
                <SortableTableHead label="Variants" onSort={() => toggleSort("variants_count")} />
                <SortableTableHead label="Spec" onSort={() => toggleSort("spec_exists")} />
                <SortableTableHead label="Tokens coverage" onSort={() => toggleSort("token_coverage")} />
                <SortableTableHead label="Used In" onSort={() => toggleSort("usage_count")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No components match your filters.
                  </TableCell>
                </TableRow>
              ) : null}

              {loading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={`loading-${index}`}>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        Loading components...
                      </TableCell>
                    </TableRow>
                  ))
                : pagedComponents.map((item) => {
                    const coverage = tokenCoverageBySlug[item.slug] ?? buildTokenCoverage(item);
                    return (
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
                            className="text-foreground hover:text-primary hover:underline"
                            aria-label={`Open ${item.display_name} detail`}
                          >
                            {item.display_name}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>{variantCountBySlug[item.slug] ?? getVariantCount(item)}</TableCell>
                      <TableCell>
                        <Badge variant={specBadgeVariant(item.spec.exists)}>
                          {item.spec.exists ? "Docs" : "No docs"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={coverage.variant}
                          className={coverage.className}
                        >
                          {coverage.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const labels = usedInLabelsBySlug[item.slug] ?? [];
                          if (labels.length === 0) return "-";
                          return labels.join(", ");
                        })()}
                      </TableCell>
                    </TableRow>
                    );
                  })}
            </TableBody>
          </Table>

          {shouldPaginate ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {filtered.length}
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
      </Card>
    </div>
  );
}
