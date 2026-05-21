import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState, FilterBar, PageHeader } from "@/components/composites";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Inbox } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import {
  listConsumers,
  fetchReportByComponent,
  fetchReportByVariable,
  fetchComponentCatalog,
  fetchTokenCatalog,
} from "@/lib/api";
import { Select } from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSortState } from "@/lib/use-sort-state";
import { cn } from "@/lib/utils";
import { dedupeSampleNodes } from "@/lib/sample-node-utils";
import {
  buildComponentLookupMap,
  extractComponentParentAlias,
  normalizeComponentLookupKey,
  resolveKnownComponentSlug,
  splitComponentName,
} from "@/lib/component-identity";
import { useDsFileKey } from "@/hooks/use-ds-file-key";
import { writeCachedConsumerLabel } from "@/lib/consumer-label-cache";
import { formatSyncedAt } from "@/lib/format-synced-at";
import { IMPACT_SORT_ORDER } from "@/lib/impact-level";
import { shouldAllowShowAll, shouldShowPageSizeSelect } from "@/lib/table-pagination";
import type {
  DsConsumer,
  DsSyncRun,
  ComponentUsageReport,
  VariableUsageReport,
  ImpactLevel,
  UsageScope,
  SampleNodeRef,
} from "@/types/consumers";
import type { ComponentCatalogItem } from "@/types/component-catalog";
import { getComponentTableDisplayInfo } from "./lib/component-table-display";
import { ConsumerSyncStatusBadge } from "./components/consumer-sync-status-badge";
import { ConsumerSampleLinksModal } from "./components/consumer-sample-links-modal";
import { AdoptionBar } from "./components/adoption-bar";
import { buildDimensionAdoptionState } from "./lib/adoption-metrics";
import { groupByParentComponent } from "./lib/component-grouping";

type ConsumerUsageTab = "components" | "variables";
type VariableSortField = "variableName" | "nodes" | "variableType";
type ComponentSortField = "parentName" | "totalInstances" | "impactLevel";

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";
const CONSUMER_USAGE_TABS: Array<{ id: ConsumerUsageTab; label: string }> = [
  { id: "variables", label: "Variable Usage" },
  { id: "components", label: "Component Usage" },
];

function normalizeTokenLookupKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^_+/, "")
    .replace(/^semanticos[./]/, "")
    .replace(/^primitivos[./]/, "")
    .replace(/^theme[./]/, "")
    .replace(/^tokens?[./]/, "")
    .replace(/^--+/, "")
    .replace(/[._]+/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

type TokenLookupEntry = {
  path: string;
  slashPath: string;
  collection: string;
};

function normalizeLookupKey(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeFilterText(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function formatUsageScope(scope: UsageScope): string {
  if (scope === "page") return "Page / screen";
  if (scope === "local-component") return "Local component";
  return "Nested local component";
}

function sumUsageScopeSummary(summary: { page: number; localComponent: number; nestedLocalComponent: number }): number {
  return summary.page + summary.localComponent + summary.nestedLocalComponent;
}

function resolveVariableTokenEntry(
  variableName: string,
  variableKey: string,
  exactLookup: Record<string, TokenLookupEntry>,
  fallbackLookup: Record<string, TokenLookupEntry | null>,
): TokenLookupEntry | null {
  const variableNameExact = normalizeLookupKey(variableName);
  const variableKeyExact = normalizeLookupKey(variableKey);
  return (
    (variableNameExact && exactLookup[variableNameExact]) ||
    (variableKeyExact && exactLookup[variableKeyExact]) ||
    fallbackLookup[normalizeTokenLookupKey(variableName)] ||
    fallbackLookup[normalizeTokenLookupKey(variableKey)] ||
    null
  );
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

function renderDimensionBar(dsUsed: number, localUsed: number | null | undefined): ReactNode {
  const state = buildDimensionAdoptionState(dsUsed, localUsed);

  if (state.showNA) {
    return (
      <span className="flex-1 text-muted-foreground" title="No usage data">
        N/A
      </span>
    );
  }

  if (state.showBar && state.totalLocalUsed != null) {
    return (
      <AdoptionBar
        dsCount={state.totalDsUsed}
        nonDsCount={state.totalLocalUsed}
        className="flex-1"
        barClassName="h-2"
      />
    );
  }

  return (
    <span className="flex-1 text-muted-foreground" title="Adoption data unavailable">
      —
    </span>
  );
}

function computeWorstImpactLevel(
  components: Array<{ impactLevel: { level: ImpactLevel } }>,
  variables: Array<{ impactLevel: { level: ImpactLevel } }>,
): ImpactLevel | null {
  const allItems = [...components, ...variables];
  if (allItems.length === 0) return null;

  // Track worst level directly to avoid redundant Object.keys().find() lookup
  let worstLevel: ImpactLevel = allItems[0].impactLevel.level;
  let worstScore = IMPACT_SORT_ORDER[worstLevel];

  for (const item of allItems) {
    const score = IMPACT_SORT_ORDER[item.impactLevel.level];
    if (score < worstScore) {
      worstScore = score;
      worstLevel = item.impactLevel.level;
    }
  }

  return worstLevel;
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
  const { consumerId } = useParams<{ consumerId: string }>();
  const { dsFileKey, loading: dsFileKeyLoading } = useDsFileKey();
  const [consumer, setConsumer] = useState<(DsConsumer & { latestSync?: DsSyncRun }) | null>(null);
  const [components, setComponents] = useState<ComponentUsageReport[]>([]);
  const [variables, setVariables] = useState<VariableUsageReport[]>([]);
  const [componentSlugByLookup, setComponentSlugByLookup] = useState<Record<string, string>>({});
  const [componentCatalogItems, setComponentCatalogItems] = useState<ComponentCatalogItem[]>([]);
  const [tokenByExactLookup, setTokenByExactLookup] = useState<Record<string, TokenLookupEntry>>({});
  const [tokenByLookup, setTokenByLookup] = useState<Record<string, TokenLookupEntry | null>>({});
  const [activeUsageTab, setActiveUsageTab] = useState<ConsumerUsageTab>("variables");
  const [variableSort, toggleVariableSort] = useSortState<VariableSortField>({ field: "variableName", dir: "asc" });
  const [componentSort, toggleComponentSort] = useSortState<ComponentSortField>({ field: "impactLevel", dir: "asc" });
  const [componentSearch, setComponentSearch] = useState("");
  const [componentPageSize, setComponentPageSize] = useState<string>("25");
  const [componentCurrentPage, setComponentCurrentPage] = useState(1);
  const [variableSearch, setVariableSearch] = useState("");
  const [variableTypeFilter, setVariableTypeFilter] = useState("all");
  const [variablePageSize, setVariablePageSize] = useState<string>("25");
  const [variableCurrentPage, setVariableCurrentPage] = useState(1);
  const [isUsageDetailsOpen, setIsUsageDetailsOpen] = useState(false);
  const [isTokenBindingOpen, setIsTokenBindingOpen] = useState(false);
  const [sampleLinksModal, setSampleLinksModal] = useState<{
    title: string;
    sampleNodes: SampleNodeRef[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function handleToggleGroup(parentName: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(parentName) ? next.delete(parentName) : next.add(parentName);
      return next;
    });
  }

  useEffect(() => {
    const loadData = async () => {
      if (!consumerId || dsFileKeyLoading) return;

      setLoading(true);
      setError(null);

      try {
        if (!dsFileKey) {
          setError(toApiErrorDisplay(new Error("No figmaFileId found for active system"), {
            fallbackTitle: "Configuration error",
            fallbackMessage: "Set the Figma File ID in Design Systems Admin.",
          }));
          setLoading(false);
          return;
        }

        const consumersResponse = await listConsumers(dsFileKey);
        const foundConsumer = consumersResponse.data.find((c) => c.id === consumerId);
        if (foundConsumer) {
          setConsumer(foundConsumer);
        }

        // Load component and variable reports
        const [componentsResponse, variablesResponse, componentCatalog, tokenCatalog] = await Promise.all([
          fetchReportByComponent(dsFileKey),
          fetchReportByVariable(dsFileKey),
          fetchComponentCatalog().catch((cause) => {
            console.warn("[consumer-detail] Component registry fetch failed", cause);
            return { components: [] };
          }),
          fetchTokenCatalog().catch((cause) => {
            console.warn("[consumer-detail] Token registry fetch failed", cause);
            return { entries: [] };
          }),
        ]);
        setComponents(componentsResponse.data || []);
        setVariables(variablesResponse.data || []);
        setComponentCatalogItems(componentCatalog.components || []);
        setComponentSlugByLookup(buildComponentLookupMap(componentCatalog.components || []));
        const tokenLookup = (tokenCatalog.entries || []).reduce<{
          exact: Record<string, TokenLookupEntry>;
          fallback: Record<string, TokenLookupEntry | null>;
        }>(
          (acc, entry) => {
            const path = String(entry.path || "").trim();
            if (!path) return acc;
            const slashPath = String(entry.slashPath || "").trim();
            const cssVar = String(entry.cssVar || "").trim();
            const collection = String(entry.collection || "").trim();
            const tokenEntry: TokenLookupEntry = { path, slashPath, collection };

            const exactKeys = [normalizeLookupKey(path), normalizeLookupKey(slashPath), normalizeLookupKey(cssVar)].filter(
              Boolean,
            );
            for (const key of exactKeys) {
              acc.exact[key] = tokenEntry;
            }

            const fallbackKeys = [
              normalizeTokenLookupKey(path),
              normalizeTokenLookupKey(slashPath),
              normalizeTokenLookupKey(cssVar),
            ].filter(Boolean);
            for (const key of fallbackKeys) {
              if (!(key in acc.fallback)) {
                acc.fallback[key] = tokenEntry;
                continue;
              }
              const existing = acc.fallback[key];
              if (existing && existing.path !== tokenEntry.path) {
                // Ambiguous normalized key; disable fallback for this key.
                acc.fallback[key] = null;
              }
            }

            return acc;
          },
          { exact: {}, fallback: {} },
        );
        setTokenByExactLookup(tokenLookup.exact);
        setTokenByLookup(tokenLookup.fallback);
      } catch (cause) {
        setError(toApiErrorDisplay(cause, {
          fallbackTitle: "Load consumer failed",
          fallbackMessage: "Unable to load consumer details.",
        }));
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [consumerId, dsFileKey, dsFileKeyLoading]);

  useEffect(() => {
    if (!consumer?.id || !consumer?.consumerName) return;
    writeCachedConsumerLabel(consumer.id, consumer.consumerName);
  }, [consumer?.id, consumer?.consumerName]);

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
        return [
          {
            ...v,
            nodes: usages.reduce((sum, u) => sum + (u.nodeCount || 0), 0),
            sampleLinks,
            sampleNodes,
          },
        ];
      }),
    [consumerId, variables],
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

  useEffect(() => {
    setVariableCurrentPage(1);
  }, [variablePageSize, variableSearch, variableTypeFilter, variableSort]);

  const variablePageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.map((size) => String(size)),
    [],
  );
  const variablePageSizeValue =
    variablePageSize === PAGE_SIZE_ALL ? filteredVariables.length : Number(variablePageSize);
  const shouldPaginateVariables =
    variablePageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(variablePageSizeValue) &&
    variablePageSizeValue > 0 &&
    filteredVariables.length > variablePageSizeValue;
  const variableTotalPages = shouldPaginateVariables
    ? Math.max(1, Math.ceil(filteredVariables.length / variablePageSizeValue))
    : 1;
  const variablePagedRows = useMemo(() => {
    if (!shouldPaginateVariables) return filteredVariables;
    const start = (variableCurrentPage - 1) * variablePageSizeValue;
    return filteredVariables.slice(start, start + variablePageSizeValue);
  }, [filteredVariables, shouldPaginateVariables, variableCurrentPage, variablePageSizeValue]);
  const variablePageStart = shouldPaginateVariables
    ? (variableCurrentPage - 1) * variablePageSizeValue + 1
    : filteredVariables.length === 0
      ? 0
      : 1;
  const variablePageEnd = shouldPaginateVariables
    ? Math.min(filteredVariables.length, variableCurrentPage * variablePageSizeValue)
    : filteredVariables.length;

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
  }, [componentGroups, componentSearch, componentSort]);

  const componentPageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.map((size) => String(size)),
    [],
  );
  const componentPageSizeValue =
    componentPageSize === PAGE_SIZE_ALL ? filteredComponentGroups.length : Number(componentPageSize);
  const shouldPaginateComponents =
    componentPageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(componentPageSizeValue) &&
    componentPageSizeValue > 0 &&
    filteredComponentGroups.length > componentPageSizeValue;
  const componentTotalPages = shouldPaginateComponents
    ? Math.max(1, Math.ceil(filteredComponentGroups.length / componentPageSizeValue))
    : 1;
  const showComponentPageSizeSelect = shouldShowPageSizeSelect(filteredComponentGroups.length);

  useEffect(() => {
    setComponentCurrentPage(1);
  }, [componentPageSize, componentSearch, componentSort]);

  useEffect(() => {
    setComponentCurrentPage((prev) => Math.min(prev, componentTotalPages));
  }, [componentTotalPages]);

  const pagedComponentGroups = useMemo(() => {
    if (!shouldPaginateComponents) return filteredComponentGroups;
    const start = (componentCurrentPage - 1) * componentPageSizeValue;
    return filteredComponentGroups.slice(start, start + componentPageSizeValue);
  }, [componentCurrentPage, componentPageSizeValue, filteredComponentGroups, shouldPaginateComponents]);

  const componentPageStart = shouldPaginateComponents
    ? (componentCurrentPage - 1) * componentPageSizeValue + 1
    : filteredComponentGroups.length === 0
      ? 0
      : 1;
  const componentPageEnd = shouldPaginateComponents
    ? Math.min(filteredComponentGroups.length, componentCurrentPage * componentPageSizeValue)
    : filteredComponentGroups.length;

  // Compute worst impact level for overview
  const worstImpactLevel = useMemo(
    () => computeWorstImpactLevel(consumerComponents, consumerVariables),
    [consumerComponents, consumerVariables],
  );
  const usageDetails = consumer?.latestSync?.usageDetails ?? null;
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
        className="text-foreground underline-offset-2 hover:text-primary hover:underline"
        aria-label={`Open sample links for ${title}`}
        onClick={() => openSampleLinksModal(title, sampleNodes)}
      >
        Figma ({sampleNodes.length})
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
        description={consumer.consumerFileKey}
        actions={
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to consumers
          </Button>
        }
      />

      {error ? <ApiErrorMessage error={error} /> : null}

      {/* Overview */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-titles font-semibold titles-color">Overview</h2>
            <p className="text-sm text-muted-foreground">
              Last synced: {consumer.latestSync ? formatSyncedAt(consumer.latestSync.syncedAt) : "Never"}
            </p>
          </div>
          <ConsumerSyncStatusBadge latestSync={consumer.latestSync} />
        </div>
        {consumer.latestSync && (
          <div className="mt-4 space-y-4">
            {/* Row 1: 4 KPI cards (DS/Non-DS per dimension) */}
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold">{consumer.latestSync.componentCount}</p>
                <p className="text-xs text-muted-foreground">DS components</p>
              </div>
              <div
                className="rounded-lg border border-border bg-muted/50 p-3 text-center"
                title="Includes local and other-library components not matched to the tracked DS during the last sync"
              >
                <p className="text-2xl font-bold">
                  {consumer.latestSync.localComponentUsedCount ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">Non-DS comp.</p>
                <p className="sr-only">
                  Includes local and other-library components not matched to the tracked DS during
                  the last sync.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold">{consumer.latestSync.variableCount}</p>
                <p className="text-xs text-muted-foreground">DS variables</p>
              </div>
              <div
                className="rounded-lg border border-border bg-muted/50 p-3 text-center"
                title="Includes local and other-library variable bindings not matched to the tracked DS during the last sync"
              >
                <p className="text-2xl font-bold">
                  {consumer.latestSync.localVariableUsedCount ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">Non-DS vars</p>
                <p className="sr-only">
                  Includes local and other-library variable bindings not matched to the tracked DS
                  during the last sync.
                </p>
              </div>
            </div>

            {/* Row 2: Adoption bars (per dimension) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="w-20 shrink-0">Components</span>
                {renderDimensionBar(
                  consumer.latestSync.componentCount,
                  consumer.latestSync.localComponentUsedCount,
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="w-20 shrink-0">Variables</span>
                {renderDimensionBar(
                  consumer.latestSync.variableCount,
                  consumer.latestSync.localVariableUsedCount,
                )}
              </div>
            </div>

            {/* Row 3: Footer with parent-derived components + warnings/impact */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span title="Local components that directly use at least one parent DS component">
                Direct parent usage: {consumer.latestSync.parentDerivedComponentCount ?? "—"} comp
              </span>
              <div className="flex items-center gap-3">
                {consumer.latestSync.warningCount > 0 && (
                  <Badge variant="warning">{consumer.latestSync.warningCount} warnings</Badge>
                )}
                {worstImpactLevel && <ImpactLevelBadge level={worstImpactLevel} />}
              </div>
            </div>
          </div>
        )}
      </div>

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
            searchPlaceholder="Buscar por componente, variante o impacto"
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
                    {shouldAllowShowAll(filteredComponentGroups.length) ? (
                      <option value={PAGE_SIZE_ALL}>All</option>
                    ) : null}
                  </Select>
                </div>
              ) : null
            }
          />

          {shouldPaginateComponents ? (
            <div className="mt-3 mb-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {componentPageStart}–{componentPageEnd} of {filteredComponentGroups.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setComponentCurrentPage((prev) => Math.max(1, prev - 1))}
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
                  onClick={() => setComponentCurrentPage((prev) => Math.min(componentTotalPages, prev + 1))}
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
                  <SortableTableHead label="Component" onSort={() => toggleComponentSort("parentName")} />
                  <SortableTableHead label="Instances" onSort={() => toggleComponentSort("totalInstances")} className="text-right" />
                  <SortableTableHead label="Impact" onSort={() => toggleComponentSort("impactLevel")} />
                  <TableHead showSortIcon={false} className="normal-case tracking-normal">Figma</TableHead>
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

                  if (isSingleVariant) {
                    return (
                      <TableRow key={variant.componentKey}>
                        <TableCell>
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
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="neutral">{group.totalInstances}</Badge>
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
                      <TableRow>
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
                        <TableCell className="text-right">
                          <Badge variant="neutral">{group.totalInstances}</Badge>
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
                          <TableRow key={v.componentKey} className="bg-muted/10">
                            <TableCell className="pl-9">
                              <span className="text-xs text-muted-foreground">
                                {v.variantLabel || v.componentName}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="neutral" className="text-[10px]">
                                {v.instances}
                              </Badge>
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
                  onClick={() => setComponentCurrentPage((prev) => Math.max(1, prev - 1))}
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
                  onClick={() => setComponentCurrentPage((prev) => Math.min(componentTotalPages, prev + 1))}
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
            searchPlaceholder="Buscar por variable o tipo"
            count={filteredVariables.length}
            rightSlot={
              shouldShowPageSizeSelect(filteredVariables.length) ? (
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
                    {shouldAllowShowAll(filteredVariables.length) ? (
                      <option value={PAGE_SIZE_ALL}>All</option>
                    ) : null}
                  </Select>
                </div>
              ) : null
            }
          >
            <Select
              value={variableTypeFilter}
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
                  onClick={() => setVariableCurrentPage((prev) => Math.max(1, prev - 1))}
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
                  onClick={() => setVariableCurrentPage((prev) => Math.min(variableTotalPages, prev + 1))}
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
                  <SortableTableHead label="Variable" onSort={() => toggleVariableSort("variableName")} />
                  <TableHead showSortIcon={false} className="normal-case tracking-normal">Collection</TableHead>
                  <SortableTableHead label="Nodes" onSort={() => toggleVariableSort("nodes")} className="text-right" />
                  <SortableTableHead label="Type" onSort={() => toggleVariableSort("variableType")} />
                  <TableHead showSortIcon={false} className="normal-case tracking-normal">Figma</TableHead>
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
                      <TableCell className="text-right">
                        <Badge variant="neutral">{v.nodes}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs lowercase text-foreground">{v.variableType}</span>
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
                  onClick={() => setVariableCurrentPage((prev) => Math.max(1, prev - 1))}
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
                  onClick={() => setVariableCurrentPage((prev) => Math.min(variableTotalPages, prev + 1))}
                  disabled={variableCurrentPage >= variableTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}

        </Card>
      ) : null}

      {activeUsageTab === "variables" && usageDetails ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20"
            onClick={() => setIsTokenBindingOpen((open) => !open)}
            aria-controls="token-binding-content"
            aria-expanded={isTokenBindingOpen}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold titles-color">Token binding detail</h3>
              <Badge variant="neutral">{usageDetails.tokenBindingDetails.length} nodes</Badge>
            </div>
            {isTokenBindingOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {isTokenBindingOpen ? (
            <div id="token-binding-content" className="border-t border-border/50 p-5">
              {usageDetails.tokenBindingDetails.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No token binding details captured for this consumer.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="normal-case tracking-normal">Node</TableHead>
                        <TableHead className="normal-case tracking-normal">Scope</TableHead>
                        <TableHead className="normal-case tracking-normal">Local component</TableHead>
                        <TableHead className="normal-case tracking-normal">Field</TableHead>
                        <TableHead className="normal-case tracking-normal">Variable</TableHead>
                        <TableHead className="normal-case tracking-normal">Status</TableHead>
                        <TableHead className="normal-case tracking-normal">Token path</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usageDetails.tokenBindingDetails.flatMap((entry) =>
                        entry.bindings.map((binding) => (
                          <TableRow key={`${entry.nodeId}-${binding.field}-${binding.variableId}`}>
                            <TableCell>{entry.nodeName}</TableCell>
                            <TableCell>
                              <Badge variant="neutral" className="text-[10px]">
                                {formatUsageScope(entry.usageScope)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {entry.localComponentKey && entry.localComponentName ? (
                                renderComponentName(entry.localComponentKey, entry.localComponentName, componentSlugByLookup)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{binding.field}</TableCell>
                            <TableCell>
                              {binding.status === "resolved" ? (
                                <span>{binding.variableName ?? binding.variableId}</span>
                              ) : (
                                <span className="text-muted-foreground">Unresolved ({binding.variableId})</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={binding.status === "resolved" ? "success" : "warning"}>
                                {binding.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {binding.resolvedTokenPath ?? "—"}
                            </TableCell>
                          </TableRow>
                        )),
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {usageDetails ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20"
            onClick={() => setIsUsageDetailsOpen((open) => !open)}
            aria-controls="usage-details-content"
            aria-expanded={isUsageDetailsOpen}
          >
            <div>
              <h2 className="text-base font-titles font-semibold titles-color">Usage Details</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Direct parent usage, local component graph and component properties.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="neutral">
                Components {sumUsageScopeSummary(usageDetails.usageShape.components)}
              </Badge>
              <Badge variant="neutral">
                Tokens {sumUsageScopeSummary(usageDetails.usageShape.tokens)}
              </Badge>
              {isUsageDetailsOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </div>
          </button>
          {isUsageDetailsOpen ? (
          <div id="usage-details-content" className="border-t border-border/50">
          <div className="grid gap-px border-b border-border/50 md:grid-cols-2">
            <div className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Component usage shape
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="neutral">Page {usageDetails.usageShape.components.page}</Badge>
                <Badge variant="neutral">
                  Local {usageDetails.usageShape.components.localComponent}
                </Badge>
                <Badge variant="neutral">
                  Nested {usageDetails.usageShape.components.nestedLocalComponent}
                </Badge>
              </div>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Token usage shape
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="neutral">Page {usageDetails.usageShape.tokens.page}</Badge>
                <Badge variant="neutral">
                  Local {usageDetails.usageShape.tokens.localComponent}
                </Badge>
                <Badge variant="neutral">
                  Nested {usageDetails.usageShape.tokens.nestedLocalComponent}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-px">
            <section>
              <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
                <h3 className="text-sm font-semibold titles-color">Direct parent usage</h3>
                <Badge variant="neutral">{usageDetails.parentComponentUsages.length} entries</Badge>
              </div>
              {usageDetails.parentComponentUsages.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No direct DS parent component usage captured for this consumer.
                </p>
              ) : (
                <div className="overflow-x-auto px-5 pb-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="normal-case tracking-normal">Local component</TableHead>
                        <TableHead className="normal-case tracking-normal">Parent DS component</TableHead>
                        <TableHead className="normal-case tracking-normal">Scope</TableHead>
                        <TableHead className="normal-case tracking-normal text-right">Uses</TableHead>
                        <TableHead className="normal-case tracking-normal">Samples</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usageDetails.parentComponentUsages.map((usage) => (
                        <TableRow key={`${usage.localComponentKey}-${usage.parentComponentKey}-${usage.usageScope}`}>
                          <TableCell>
                            {renderComponentName(usage.localComponentKey, usage.localComponentName, componentSlugByLookup)}
                          </TableCell>
                          <TableCell>
                            {renderComponentName(usage.parentComponentKey, usage.parentComponentName, componentSlugByLookup)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="neutral" className="text-[10px]">
                              {formatUsageScope(usage.usageScope)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="neutral">{usage.usageCount}</Badge>
                          </TableCell>
                          <TableCell>
                            {usage.sampleNodeIds.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {usage.sampleNodeIds.map((nodeId) => (
                                  <Badge key={nodeId} variant="neutral" className="rounded-md text-[10px] font-normal">
                                    {nodeId}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
                <h3 className="text-sm font-semibold titles-color">Local component graph</h3>
                <Badge variant="neutral">{usageDetails.localComponentGraph.length} edges</Badge>
              </div>
              {usageDetails.localComponentGraph.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No local component composition edges captured for this consumer.
                </p>
              ) : (
                <div className="overflow-x-auto px-5 pb-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="normal-case tracking-normal">Parent local component</TableHead>
                        <TableHead className="normal-case tracking-normal">Child local component</TableHead>
                        <TableHead className="normal-case tracking-normal text-right">Uses</TableHead>
                        <TableHead className="normal-case tracking-normal">Samples</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usageDetails.localComponentGraph.map((edge) => (
                        <TableRow key={`${edge.parentComponentKey}-${edge.childComponentKey}`}>
                          <TableCell>
                            {renderComponentName(edge.parentComponentKey, edge.parentComponentName, componentSlugByLookup)}
                          </TableCell>
                          <TableCell>
                            {renderComponentName(edge.childComponentKey, edge.childComponentName, componentSlugByLookup)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="neutral">{edge.usageCount}</Badge>
                          </TableCell>
                          <TableCell>
                            {edge.sampleNodeIds.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {edge.sampleNodeIds.map((nodeId) => (
                                  <Badge key={nodeId} variant="neutral" className="rounded-md text-[10px] font-normal">
                                    {nodeId}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

          </div>
          </div>
          ) : null}
        </section>
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
