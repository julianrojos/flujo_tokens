import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState, FilterBar, PageHeader, StatsOverview } from "@/components/composites";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { ArrowLeft, ChevronDown, ChevronRight, Inbox, Unlink } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { Select } from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSortState } from "@/lib/use-sort-state";
import { cn } from "@/lib/utils";
import { dedupeSampleNodes } from "@/lib/sample-node-utils";
import {
  extractComponentParentAlias,
  normalizeComponentLookupKey,
  resolveKnownComponentSlug,
  splitComponentName,
} from "@/lib/component-identity";
import { useDsFileKey } from "@/hooks/use-ds-file-key";
import { writeCachedConsumerLabel } from "@/lib/consumer-label-cache";
import { IMPACT_SORT_ORDER } from "@/lib/impact-level";
import { PAGE_SIZE_ALL, useTablePagination } from "@/lib/table-pagination";
import type { SampleNodeRef } from "@/types/consumers";
import type { ComponentCatalogItem } from "@/types/component-catalog";
import { getComponentTableDisplayInfo } from "./lib/component-table-display";
import { ConsumerSampleLinksModal } from "./components/consumer-sample-links-modal";
import { groupByParentComponent } from "./lib/component-grouping";
import { useConsumerDetailData } from "./hooks/use-consumer-detail-data";
import {
  resolveVariableTokenEntry,
} from "./lib/consumer-detail-lookups";

type ConsumerUsageTab = "components" | "variables";
type VariableSortField = "variableName" | "nodes" | "variableType" | "collection";
type ComponentSortField = "parentName" | "totalInstances" | "impactLevel";
type ComponentStatusFilter = "all" | "imported" | "not-imported";

const CONSUMER_USAGE_TABS: Array<{ id: ConsumerUsageTab; label: string }> = [
  { id: "variables", label: "Variables Usage" },
  { id: "components", label: "Components Usage" },
];

function normalizeFilterText(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function renderComponentName(
  componentKey: string,
  componentName: string,
  componentSlugByLookup: Record<string, string>,
): ReactNode {
  const { parentName, variantLabel } = splitComponentName(componentName);
  const resolvedComponentSlug = resolveKnownComponentSlug({
    lookup: componentSlugByLookup,
    parentName,
    variantName: variantLabel,
  });

  if (resolvedComponentSlug) {
    return (
      <Link
        to={`/components/${encodeURIComponent(resolvedComponentSlug)}`}
        className="text-app-accent hover:underline"
      >
        <span className="font-normal">{componentName || componentKey}</span>
      </Link>
    );
  }

  return <span className="font-normal">{componentName || componentKey}</span>;
}

function ConsumerUsageTabsNav({
  activeTab,
  onChange,
}: {
  activeTab: ConsumerUsageTab;
  onChange: (tab: ConsumerUsageTab) => void;
}) {
  return (
    <nav className="flex gap-1 border-b border-border" role="tablist">
      {CONSUMER_USAGE_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const tabId = `consumer-usage-tab-${tab.id}`;
        const panelId = `consumer-usage-panel-${tab.id}`;
        return (
          <button
            key={tab.id}
            type="button"
            id={tabId}
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId}
            onClick={() => onChange(tab.id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-sm font-medium transition",
              isActive
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

export function ConsumerDetailPage() {
  const { consumerName } = useParams<{ consumerName: string }>();
  const { dsFileKey, loading: dsFileKeyLoading } = useDsFileKey();
  const {
    consumer,
    components,
    variables,
    lookups: {
      componentSlugByLookup,
      tokenByExactLookup,
      tokenByLookup,
    },
    catalogs: {
      componentCatalogItems,
    },
    loading,
    error,
  } = useConsumerDetailData(consumerName, dsFileKey, dsFileKeyLoading);
  const [activeUsageTab, setActiveUsageTab] = useState<ConsumerUsageTab>("variables");
  const [variableSort, toggleVariableSort] = useSortState<VariableSortField>({ field: "variableName", dir: "asc" });
  const [componentSort, toggleComponentSort] = useSortState<ComponentSortField>({ field: "impactLevel", dir: "asc" });
  const [componentSearch, setComponentSearch] = useState("");
  const [componentStatusFilter, setComponentStatusFilter] = useState<ComponentStatusFilter>("all");
  const [variableSearch, setVariableSearch] = useState("");
  const [variableTypeFilter, setVariableTypeFilter] = useState("all");
  const [sampleLinksModal, setSampleLinksModal] = useState<{
    title: string;
    sampleNodes: SampleNodeRef[];
  } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const consumerId = consumer?.id ?? "";
  const componentSortAriaSort = componentSort.dir === "asc" ? "ascending" : "descending";
  const variableSortAriaSort = variableSort.dir === "asc" ? "ascending" : "descending";

  function handleToggleGroup(parentName: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(parentName) ? next.delete(parentName) : next.add(parentName);
      return next;
    });
  }

  useEffect(() => {
    if (!consumerName || !consumer?.consumerName) return;
    writeCachedConsumerLabel(consumerName, consumer.consumerName);
  }, [consumerName, consumer?.consumerName]);

  // Filter components and variables for this consumer, extracting sampleLinks from the consumer's usage
  const consumerComponents = useMemo(
    () =>
      components.flatMap((c) => {
        const usages = c.consumers.filter((u) => u.consumerId === consumerId);
        if (usages.length === 0) return [];

        const sampleLinks = Array.from(new Set(usages.flatMap((usage) => usage.sampleLinks || [])));
        const sampleNodes = dedupeSampleNodes(usages.flatMap((usage) => usage.sampleNodes || []));
        return [
          {
            ...c,
            instances: usages.reduce((sum, u) => sum + (u.instanceCount || 0), 0),
            sampleLinks,
            sampleNodes,
          },
        ];
      }),
    [components, consumerId],
  );

  const consumerVariables = useMemo(
    () =>
      variables.flatMap((v) => {
        const usages = v.consumers.filter((u) => u.consumerId === consumerId);
        if (usages.length === 0) return [];

        const sampleLinks = Array.from(new Set(usages.flatMap((usage) => usage.sampleLinks || [])));
        const sampleNodes = dedupeSampleNodes(usages.flatMap((usage) => usage.sampleNodes || []));
        const tokenEntry = resolveVariableTokenEntry(
          v.variableName,
          v.variableKey,
          tokenByExactLookup,
          tokenByLookup,
        );
        return [
          {
            ...v,
            collection: tokenEntry?.collection || "",
            nodes: usages.reduce((sum, u) => sum + (u.nodeCount || 0), 0),
            sampleLinks,
            sampleNodes,
          },
        ];
      }),
    [consumerId, tokenByExactLookup, tokenByLookup, variables],
  );

  const variableTypes = useMemo(() => {
    const set = new Set(consumerVariables.map((entry) => entry.variableType));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [consumerVariables]);

  const filteredVariables = useMemo(() => {
    const loweredSearch = normalizeFilterText(variableSearch);
    const filtered = consumerVariables.filter((variable) => {
      if (variableTypeFilter !== "all" && variable.variableType !== variableTypeFilter) {
        return false;
      }
      if (!loweredSearch) return true;
      const searchableValues = [
        variable.variableName,
        variable.variableKey,
        variable.variableType,
      ];
      return searchableValues.some((value) => normalizeFilterText(value).includes(loweredSearch));
    });

    filtered.sort((a, b) => {
      const mul = variableSort.dir === "asc" ? 1 : -1;
      if (variableSort.field === "variableName") return mul * a.variableName.localeCompare(b.variableName);
      if (variableSort.field === "collection") return mul * ((a.collection || "").localeCompare(b.collection || ""));
      if (variableSort.field === "nodes") return mul * ((a.nodes ?? 0) - (b.nodes ?? 0));
      if (variableSort.field === "variableType") return mul * a.variableType.localeCompare(b.variableType);
      return 0;
    });

    return filtered;
  }, [
    consumerVariables,
    variableSearch,
    variableTypeFilter,
    variableSort,
  ]);
  const {
    pageSize: variablePageSize,
    setPageSize: setVariablePageSize,
    pageSizeOptions: variablePageSizeOptions,
    showPageSizeSelect: showVariablePageSizeSelect,
    allowShowAll: allowVariableShowAll,
    currentPage: variableCurrentPage,
    totalPages: variableTotalPages,
    pageStart: variablePageStart,
    pageEnd: variablePageEnd,
    shouldPaginate: shouldPaginateVariables,
    goPrevious: goVariablePrevious,
    goNext: goVariableNext,
    pagedItems: variablePagedRows,
  } = useTablePagination(filteredVariables, {
    resetKey: `${variableSearch}|${variableTypeFilter}|${variableSort.field}|${variableSort.dir}`,
  });

  const componentDisplayNameBySlug = useMemo(
    () => new Map(componentCatalogItems.map((item) => [item.slug, item.display_name])),
    [componentCatalogItems],
  );
  const componentDisplayNameByVariant = useMemo(() => {
    const lookup = new Map<string, string>();
    const ambiguous = new Set<string>();

    for (const item of componentCatalogItems) {
      const parentDisplayName = String(item.display_name || "").trim();
      if (!parentDisplayName) continue;

      for (const variant of item.figma?.variants || []) {
        const variantName = String(variant?.name || "").trim();
        if (!variantName) continue;

        const candidates = new Set<string>([variantName]);
        const parsedVariant = getComponentTableDisplayInfo({ componentName: variantName });
        if (parsedVariant.variantLabel) {
          candidates.add(parsedVariant.variantLabel);
        }

        for (const candidate of candidates) {
          const key = normalizeComponentLookupKey(extractComponentParentAlias(candidate));
          if (!key || ambiguous.has(key)) continue;
          const current = lookup.get(key);
          if (!current) {
            lookup.set(key, parentDisplayName);
            continue;
          }
          if (current !== parentDisplayName) {
            lookup.delete(key);
            ambiguous.add(key);
          }
        }
      }
    }

    return lookup;
  }, [componentCatalogItems]);
  // Group component variants by parent component
  const componentGroups = useMemo(
    () => groupByParentComponent(consumerComponents),
    [consumerComponents],
  );

  const filteredComponentGroups = useMemo(() => {
    const loweredSearch = normalizeFilterText(componentSearch);
    const filtered = componentGroups.filter((group) => {
      const variant = group.variants[0];
      if (!variant) {
        return false;
      }
      const normalizedComponentName = normalizeComponentLookupKey(group.parentName);
      const resolvedComponentSlug = resolveKnownComponentSlug({
        lookup: componentSlugByLookup,
        parentName: group.parentName,
        variantName: variant.componentName,
      });
      const parentDisplayName = resolvedComponentSlug
        ? componentDisplayNameBySlug.get(resolvedComponentSlug)
        : componentDisplayNameByVariant.get(normalizedComponentName);
      const isImported = Boolean(resolvedComponentSlug || parentDisplayName);

      if (componentStatusFilter === "imported" && !isImported) {
        return false;
      }
      if (componentStatusFilter === "not-imported" && isImported) {
        return false;
      }
      if (!loweredSearch) return true;
      const values = [
        group.parentName,
        String(group.totalInstances ?? 0),
        group.worstImpactLevel.level,
        ...group.variants.flatMap((variant) => [
          variant.componentName,
          variant.variantLabel,
          String(variant.instances ?? 0),
          variant.impactLevel.level,
        ]),
      ];
      return values.some((value) => normalizeFilterText(value).includes(loweredSearch));
    });

    filtered.sort((a, b) => {
      const mul = componentSort.dir === "asc" ? 1 : -1;
      if (componentSort.field === "parentName") return mul * a.parentName.localeCompare(b.parentName);
      if (componentSort.field === "totalInstances") return mul * ((a.totalInstances ?? 0) - (b.totalInstances ?? 0));
      // impactLevel: asc = CRITICAL first
      return mul * (IMPACT_SORT_ORDER[a.worstImpactLevel.level] - IMPACT_SORT_ORDER[b.worstImpactLevel.level]);
    });

    return filtered;
  }, [
    componentDisplayNameBySlug,
    componentDisplayNameByVariant,
    componentGroups,
    componentSearch,
    componentSort,
    componentSlugByLookup,
    componentStatusFilter,
  ]);
  const {
    pageSize: componentPageSize,
    setPageSize: setComponentPageSize,
    pageSizeOptions: componentPageSizeOptions,
    showPageSizeSelect: showComponentPageSizeSelect,
    allowShowAll: allowComponentShowAll,
    currentPage: componentCurrentPage,
    totalPages: componentTotalPages,
    pageStart: componentPageStart,
    pageEnd: componentPageEnd,
    shouldPaginate: shouldPaginateComponents,
    goPrevious: goComponentPrevious,
    goNext: goComponentNext,
    pagedItems: pagedComponentGroups,
  } = useTablePagination(filteredComponentGroups, {
    resetKey: `${componentSearch}|${componentStatusFilter}|${componentSort.field}|${componentSort.dir}`,
  });

  const consumerFileKey = consumer?.consumerFileKey || dsFileKey || "";

  const openSampleLinksModal = (title: string, sampleNodes: SampleNodeRef[]) => {
    setSampleLinksModal({ title, sampleNodes });
  };

  const renderSampleLinksButton = (title: string, sampleNodes: SampleNodeRef[]) => {
    if (sampleNodes.length === 0) {
      return <span className="text-muted-foreground">—</span>;
    }

    return (
      <button
        type="button"
        className="text-foreground underline-offset-2 hover:text-primary hover:no-underline"
        aria-label={`Open sample links for ${title}`}
        onClick={() => openSampleLinksModal(title, sampleNodes)}
      >
        {sampleNodes.length}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Loading..." description="Loading consumer details" />
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Loading consumer details...</p>
        </div>
      </div>
    );
  }

  if (!consumer) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Consumer not found"
          description="The requested consumer could not be found"
          actions={
            <Button variant="outline" size="sm" onClick={() => window.history.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to consumers
            </Button>
          }
        />
        {error ? <ApiErrorMessage error={error} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={consumer.consumerName}
      />

      {error ? <ApiErrorMessage error={error} /> : null}

      {consumer.latestSync && (
        <div className="mt-4 space-y-4">
          {/* Row 1: 4 KPI cards (DS/Non-DS per dimension) */}
          <StatsOverview
            className="mt-4"
            items={[
              {
                id: "consumer-ds-components",
                label: "DS components",
                value: consumer.latestSync.componentCount,
              },
              {
                id: "consumer-non-ds-components",
                label: "Non-DS components",
                value: consumer.latestSync.localComponentUsedCount ?? "—",
                description:
                  "Includes local and other-library components not matched to the tracked DS during the last sync",
              },
              {
                id: "consumer-ds-variables",
                label: "DS variables",
                value: consumer.latestSync.variableCount,
              },
              {
                id: "consumer-non-ds-variables",
                label: "Non-DS variables",
                value: consumer.latestSync.localVariableUsedCount ?? "—",
                description:
                  "Includes local and other-library variable bindings not matched to the tracked DS during the last sync",
              },
            ]}
          />

        </div>
      )}

      <ConsumerUsageTabsNav activeTab={activeUsageTab} onChange={setActiveUsageTab} />

      {activeUsageTab === "components" ? (
        <Card
          id="consumer-usage-panel-components"
          role="tabpanel"
          aria-labelledby="consumer-usage-tab-components"
          className="p-5 text-card-foreground"
        >
          <FilterBar
            searchValue={componentSearch}
            onSearch={setComponentSearch}
            searchPlaceholder="Search by component, variant, or impact"
            searchAriaLabel="Search components"
            count={filteredComponentGroups.length}
            rightSlot={
              showComponentPageSizeSelect ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows</span>
                  <Select
                    value={componentPageSize}
                    onChange={(event) => setComponentPageSize(event.target.value)}
                    className="w-[132px]"
                    aria-label="Rows per page"
                  >
                    {componentPageSizeOptions.map((size) => (
                      <option key={size} value={String(size)}>
                        {size}
                      </option>
                    ))}
                    {allowComponentShowAll ? <option value={PAGE_SIZE_ALL}>All</option> : null}
                  </Select>
                </div>
              ) : null
            }
          >
            <Select
              value={componentStatusFilter}
              onChange={(event) => setComponentStatusFilter(event.target.value as ComponentStatusFilter)}
              aria-label="Filter by import status"
            >
              <option value="all">Status: All</option>
              <option value="imported">Imported</option>
              <option value="not-imported">Not imported</option>
            </Select>
          </FilterBar>

          {shouldPaginateComponents ? (
            <div className="mt-3 mb-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {componentPageStart}–{componentPageEnd} of {filteredComponentGroups.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goComponentPrevious}
                  disabled={componentCurrentPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {componentCurrentPage} / {componentTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goComponentNext}
                  disabled={componentCurrentPage >= componentTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}

          {filteredComponentGroups.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={consumer.latestSync ? "No DS components found" : "No sync data yet"}
              description={
                consumer.latestSync
                  ? "Try adjusting the current filters."
                  : "Use Sync now above to load consumer usage."
              }
              compact
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Component"
                    onSort={() => toggleComponentSort("parentName")}
                    ariaSort={componentSort.field === "parentName" ? componentSortAriaSort : "none"}
                  />
                  <SortableTableHead
                    label="Instances"
                    onSort={() => toggleComponentSort("totalInstances")}
                    ariaSort={componentSort.field === "totalInstances" ? componentSortAriaSort : "none"}
                  />
                  <SortableTableHead
                    label="Impact"
                    onSort={() => toggleComponentSort("impactLevel")}
                    ariaSort={componentSort.field === "impactLevel" ? componentSortAriaSort : "none"}
                  />
                  <TableHead
                    showSortIcon={false}
                    className="normal-case tracking-normal"
                    title="Up to 20 use cases"
                  >
                    Examples
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedComponentGroups.map((group) => {
                  const isSingleVariant = group.variants.length === 1;
                  const variant = group.variants[0];
                  const normalizedComponentName = normalizeComponentLookupKey(group.parentName);
                  const resolvedComponentSlug = resolveKnownComponentSlug({
                    lookup: componentSlugByLookup,
                    parentName: group.parentName,
                    variantName: variant.componentName,
                  });
                  const parentDisplayName = resolvedComponentSlug
                    ? componentDisplayNameBySlug.get(resolvedComponentSlug)
                    : componentDisplayNameByVariant.get(normalizedComponentName);
                  const displayInfo = getComponentTableDisplayInfo({
                    componentName: group.parentName,
                    parentDisplayName,
                  });
                  const displayParentName = displayInfo.componentLabel || group.parentName || "(unnamed component)";

                  const isUncatalogued = !resolvedComponentSlug && !parentDisplayName;

                  if (isSingleVariant) {
                    return (
                      <TableRow key={variant.componentKey} className={cn(isUncatalogued && "opacity-70")}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {isUncatalogued && (
                              <span
                                title="Not in DS catalog"
                                aria-label="Not in DS catalog"
                                role="img"
                                className="shrink-0"
                              >
                                <Unlink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                              </span>
                            )}
                            <div className="space-y-0.5">
                              {resolvedComponentSlug ? (
                                <Link
                                  to={`/components/${encodeURIComponent(resolvedComponentSlug)}`}
                                  className="text-foreground hover:text-primary"
                                >
                                  {displayParentName}
                                </Link>
                              ) : (
                                <span>{displayParentName}</span>
                              )}
                              {variant.variantLabel && (
                                <span className="block text-xs text-muted-foreground">
                                  {variant.variantLabel}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-foreground">{group.totalInstances}</span>
                        </TableCell>
                        <TableCell>
                          <ImpactLevelBadge level={group.worstImpactLevel.level} />
                        </TableCell>
                        <TableCell>
                          {renderSampleLinksButton(variant.variantLabel || variant.componentName, variant.sampleNodes || [])}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const isExpanded = expandedGroups.has(group.parentName);
                  return (
                    <Fragment key={group.parentName}>
                      <TableRow className={cn(isUncatalogued && "opacity-70")}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="flex items-center"
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${displayParentName}`}
                              onClick={() => handleToggleGroup(group.parentName)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                              )}
                            </button>
                            {isUncatalogued && (
                              <span
                                title="Not in DS catalog"
                                aria-label="Not in DS catalog"
                                role="img"
                                className="shrink-0"
                              >
                                <Unlink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                              </span>
                            )}
                            {resolvedComponentSlug ? (
                              <Link
                                to={`/components/${encodeURIComponent(resolvedComponentSlug)}`}
                                className="text-foreground hover:text-primary"
                              >
                                {displayParentName}
                              </Link>
                            ) : (
                              <span>{displayParentName}</span>
                            )}
                            <Badge variant="neutral" className="text-[10px]">
                              {group.variants.length} variants
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-foreground">{group.totalInstances}</span>
                        </TableCell>
                        <TableCell>
                          <ImpactLevelBadge level={group.worstImpactLevel.level} />
                        </TableCell>
                        <TableCell>
                          {renderSampleLinksButton(displayParentName, group.sampleNodes || [])}
                        </TableCell>
                      </TableRow>
                      {isExpanded &&
                        group.variants.map((v) => (
                          <TableRow key={v.componentKey} className={cn("bg-muted/10", isUncatalogued && "opacity-70")}>
                            <TableCell className="pl-9">
                              <span className="text-muted-foreground">
                                {v.variantLabel || v.componentName}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-foreground">{v.instances}</span>
                            </TableCell>
                            <TableCell>
                              <ImpactLevelBadge level={v.impactLevel.level} />
                            </TableCell>
                            <TableCell>
                              {renderSampleLinksButton(v.variantLabel || v.componentName, v.sampleNodes || [])}
                            </TableCell>
                          </TableRow>
                        ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {shouldPaginateComponents ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {componentPageStart}–{componentPageEnd} of {filteredComponentGroups.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                onClick={goComponentPrevious}
                disabled={componentCurrentPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {componentCurrentPage} / {componentTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                onClick={goComponentNext}
                disabled={componentCurrentPage >= componentTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {activeUsageTab === "variables" ? (
        <Card
          id="consumer-usage-panel-variables"
          role="tabpanel"
          aria-labelledby="consumer-usage-tab-variables"
          className="p-5 text-card-foreground"
        >
          <FilterBar
            searchValue={variableSearch}
            onSearch={setVariableSearch}
            searchPlaceholder="Search by variable or type"
            searchAriaLabel="Search variables"
            count={filteredVariables.length}
            rightSlot={
              showVariablePageSizeSelect ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows</span>
                  <Select
                    value={variablePageSize}
                    onChange={(event) => setVariablePageSize(event.target.value)}
                    className="w-[132px]"
                    aria-label="Rows per page"
                  >
                    {variablePageSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                    {allowVariableShowAll ? <option value={PAGE_SIZE_ALL}>All</option> : null}
                  </Select>
                </div>
              ) : null
            }
          >
            <Select
              value={variableTypeFilter}
              aria-label="Filter by variable type"
              onChange={(event) => setVariableTypeFilter(event.target.value)}
            >
              <option value="all">Type: All</option>
              {variableTypes.map((item) => (
                <option key={item} value={item}>
                  {item.toLowerCase()}
                </option>
              ))}
            </Select>
          </FilterBar>

          {shouldPaginateVariables ? (
            <div className="mt-3 mb-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {variablePageStart}–{variablePageEnd} of {filteredVariables.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goVariablePrevious}
                  disabled={variableCurrentPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {variableCurrentPage} / {variableTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goVariableNext}
                  disabled={variableCurrentPage >= variableTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}

          {filteredVariables.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-6">
              <EmptyState
                icon={Inbox}
                title={consumer.latestSync ? "No DS variables found" : "No sync data yet"}
                description={
                  consumer.latestSync
                    ? "Try adjusting the current filters."
                    : "Use Sync now above to load consumer usage."
                }
                compact
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Variable"
                    onSort={() => toggleVariableSort("variableName")}
                    ariaSort={variableSort.field === "variableName" ? variableSortAriaSort : "none"}
                  />
                  <SortableTableHead
                    label="Collection"
                    onSort={() => toggleVariableSort("collection")}
                    ariaSort={variableSort.field === "collection" ? variableSortAriaSort : "none"}
                  />
                  <SortableTableHead
                    label="Nodes"
                    onSort={() => toggleVariableSort("nodes")}
                    ariaSort={variableSort.field === "nodes" ? variableSortAriaSort : "none"}
                  />
                  <SortableTableHead
                    label="Type"
                    onSort={() => toggleVariableSort("variableType")}
                    ariaSort={variableSort.field === "variableType" ? variableSortAriaSort : "none"}
                  />
                  <TableHead
                    showSortIcon={false}
                    className="normal-case tracking-normal"
                    title="Up to 20 use cases"
                  >
                    Examples
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variablePagedRows.map((v) => {
                  const tokenEntry = resolveVariableTokenEntry(
                    v.variableName,
                    v.variableKey,
                    tokenByExactLookup,
                    tokenByLookup,
                  );
                  const displayTokenName = tokenEntry?.slashPath || tokenEntry?.path || v.variableName;
                  return (
                    <TableRow key={v.variableKey}>
                      <TableCell>
                        {tokenEntry ? (
                          <Link
                            to={`/tokens/${encodeURIComponent(tokenEntry.path)}`}
                            className="text-foreground hover:text-primary"
                          >
                            {displayTokenName}
                          </Link>
                        ) : (
                          <span>{displayTokenName}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tokenEntry?.collection ? (
                          <Badge variant="neutral">{tokenEntry.collection}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-foreground">{v.nodes}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono lowercase text-foreground">{v.variableType}</span>
                      </TableCell>
                      <TableCell>
                        {renderSampleLinksButton(displayTokenName, v.sampleNodes || [])}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {shouldPaginateVariables ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {variablePageStart}-{variablePageEnd} of {filteredVariables.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goVariablePrevious}
                  disabled={variableCurrentPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {variableCurrentPage} / {variableTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goVariableNext}
                  disabled={variableCurrentPage >= variableTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}

        </Card>
      ) : null}

      <ConsumerSampleLinksModal
        open={sampleLinksModal !== null}
        onClose={() => setSampleLinksModal(null)}
        title={sampleLinksModal?.title || "Sample links"}
        consumerFileKey={consumerFileKey}
        sampleNodes={sampleLinksModal?.sampleNodes || []}
      />
    </div>
  );
}
