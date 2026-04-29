import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { PageHeader } from "@/components/composites/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import {
  listConsumers,
  fetchReportByComponent,
  fetchReportByVariable,
  fetchConsumerSyncRuns,
  fetchComponentCatalog,
  fetchTokenCatalog,
} from "@/lib/api";
import { ConsumerSyncStatusBadge } from "./components/consumer-sync-status-badge";
import { AdoptionBar } from "./components/adoption-bar";
import { buildDimensionAdoptionState } from "./lib/adoption-metrics";
import { groupByParentComponent } from "./lib/component-grouping";
import {
  buildComponentLookupMap,
  resolveKnownComponentSlug,
  splitComponentName,
} from "@/lib/component-identity";
import { useDsFileKey } from "@/hooks/use-ds-file-key";
import { writeCachedConsumerLabel } from "@/lib/consumer-label-cache";
import { formatSyncedAt } from "@/lib/format-synced-at";
import { IMPACT_SORT_ORDER } from "@/lib/impact-level";
import type {
  DsConsumer,
  DsSyncRun,
  ComponentUsageReport,
  VariableUsageReport,
  ImpactLevel,
  UsageScope,
} from "@/types/consumers";

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
};

function normalizeLookupKey(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function formatDurationMs(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const duration = typeof value === "number" ? value : Number(value);
  return Number.isFinite(duration) && duration >= 0 ? `${Math.round(duration)}ms` : "—";
}

function formatUsageScope(scope: UsageScope): string {
  if (scope === "page") return "Page / screen";
  if (scope === "local-component") return "Local component";
  return "Nested local component";
}

function formatPropertyValue(value: string): string {
  if (value === "null" || value === "undefined" || value === "") return "—";
  return value;
}

function sumUsageScopeSummary(summary: { page: number; localComponent: number; nestedLocalComponent: number }): number {
  return summary.page + summary.localComponent + summary.nestedLocalComponent;
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

function sortByImpactThenCount<T extends { impactLevel: { level: ImpactLevel }; instances?: number; nodes?: number }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const impactDiff = IMPACT_SORT_ORDER[a.impactLevel.level] - IMPACT_SORT_ORDER[b.impactLevel.level];
    if (impactDiff !== 0) return impactDiff;
    const countA = a.instances ?? a.nodes ?? 0;
    const countB = b.instances ?? b.nodes ?? 0;
    return countB - countA;
  });
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

export function ConsumerDetailPage() {
  const { consumerId } = useParams<{ consumerId: string }>();
  const { dsFileKey, loading: dsFileKeyLoading } = useDsFileKey();
  const [consumer, setConsumer] = useState<(DsConsumer & { latestSync?: DsSyncRun }) | null>(null);
  const [components, setComponents] = useState<ComponentUsageReport[]>([]);
  const [variables, setVariables] = useState<VariableUsageReport[]>([]);
  const [syncRuns, setSyncRuns] = useState<DsSyncRun[]>([]);
  const [componentSlugByLookup, setComponentSlugByLookup] = useState<Record<string, string>>({});
  const [tokenByExactLookup, setTokenByExactLookup] = useState<Record<string, TokenLookupEntry>>({});
  const [tokenByLookup, setTokenByLookup] = useState<Record<string, TokenLookupEntry | null>>({});
  const [isSyncLogOpen, setIsSyncLogOpen] = useState(false);
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

        if (dsFileKey) {
          const consumersResponse = await listConsumers(dsFileKey);
          const foundConsumer = consumersResponse.data.find((c) => c.id === consumerId);
          if (foundConsumer) {
            setConsumer(foundConsumer);
          }
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
        setComponentSlugByLookup(buildComponentLookupMap(componentCatalog.components || []));
        const exactTokenLookup = Object.fromEntries(
          (tokenCatalog.entries || []).flatMap((entry) => {
            const path = String(entry.path || "").trim();
            if (!path) return [];
            const slashPath = String(entry.slashPath || "").trim();
            const cssVar = String(entry.cssVar || "").trim();
            const tokenEntry: TokenLookupEntry = { path };
            return [
              [normalizeLookupKey(path), tokenEntry],
              [normalizeLookupKey(slashPath), tokenEntry],
              [normalizeLookupKey(cssVar), tokenEntry],
            ].filter(([key]) => Boolean(key));
          }),
        );
        setTokenByExactLookup(exactTokenLookup);
        const tokenLookup = (tokenCatalog.entries || []).reduce<Record<string, TokenLookupEntry | null>>(
          (acc, entry) => {
            const path = String(entry.path || "").trim();
            if (!path) return acc;
            const slashPath = String(entry.slashPath || "").trim();
            const cssVar = String(entry.cssVar || "").trim();
            const tokenEntry: TokenLookupEntry = { path };
            const keys = [
              normalizeTokenLookupKey(path),
              normalizeTokenLookupKey(slashPath),
              normalizeTokenLookupKey(cssVar),
            ].filter(Boolean);
            for (const key of keys) {
              if (!(key in acc)) {
                acc[key] = tokenEntry;
                continue;
              }
              const existing = acc[key];
              if (existing && existing.path !== tokenEntry.path) {
                // Ambiguous normalized key; disable fallback for this key.
                acc[key] = null;
              }
            }
            return acc;
          },
          {},
        );
        setTokenByLookup(tokenLookup);

        // Load sync runs
        const runsResponse = await fetchConsumerSyncRuns(consumerId);
        setSyncRuns(runsResponse.data || []);
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
  const consumerComponents = components.flatMap((c) => {
    const usages = c.consumers.filter((u) => u.consumerId === consumerId);
    if (usages.length === 0) return [];

    const sampleLinks = Array.from(
      new Set(usages.flatMap((usage) => usage.sampleLinks || [])),
    );
    return [
      {
        ...c,
        instances: usages.reduce((sum, u) => sum + (u.instanceCount || 0), 0),
        sampleLinks,
      },
    ];
  });

  const consumerVariables = variables.flatMap((v) => {
    const usages = v.consumers.filter((u) => u.consumerId === consumerId);
    if (usages.length === 0) return [];

    const sampleLinks = Array.from(
      new Set(usages.flatMap((usage) => usage.sampleLinks || [])),
    );
    return [
      {
        ...v,
        nodes: usages.reduce((sum, u) => sum + (u.nodeCount || 0), 0),
        sampleLinks,
      },
    ];
  });

  // Sort by impact level (descending) then by count (descending)
  const sortedVariables = sortByImpactThenCount(consumerVariables);

  // Group component variants by parent component
  const componentGroups = groupByParentComponent(consumerComponents);

  // Compute worst impact level for overview
  const worstImpactLevel = computeWorstImpactLevel(consumerComponents, consumerVariables);
  const usageDetails = consumer?.latestSync?.usageDetails ?? null;

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

      {/* Component Usage */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-base font-titles font-semibold titles-color">Component Usage</h2>
        {componentGroups.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {consumer.latestSync
              ? "No DS components recorded for this consumer."
              : "No sync data yet — use Sync now above."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="titles-color">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium titles-color">Component</th>
                  <th className="px-3 py-2 text-right font-medium titles-color">Instances</th>
                  <th className="px-3 py-2 text-left font-medium titles-color">Impact</th>
                  <th className="px-3 py-2 text-left font-medium titles-color">Sample Links</th>
                </tr>
              </thead>
              <tbody>
                {componentGroups.map((group) => {
                  const isSingleVariant = group.variants.length === 1;
                  const variant = group.variants[0];
                  const displayParentName = group.parentName || "(unnamed component)";
                  const resolvedComponentSlug = resolveKnownComponentSlug({
                    lookup: componentSlugByLookup,
                    parentName: group.parentName,
                    variantName: variant.componentName,
                  });

                  if (isSingleVariant) {
                    // Single variant: render as flat row
                    return (
                      <tr key={variant.componentKey} className="border-b border-border/50">
                        <td className="px-3 py-2">
                          <div className="space-y-0.5">
                            {resolvedComponentSlug ? (
                            <Link
                              to={`/components/${encodeURIComponent(resolvedComponentSlug)}`}
                              className="text-app-accent hover:underline"
                            >
                              <span className="font-normal">{displayParentName}</span>
                            </Link>
                          ) : (
                            <span className="font-normal">{displayParentName}</span>
                          )}
                            {variant.variantLabel && (
                              <span className="block text-xs text-muted-foreground">
                                {variant.variantLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="neutral">{group.totalInstances}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <ImpactLevelBadge level={group.worstImpactLevel.level} />
                        </td>
                        <td className="px-3 py-2">
                          {group.sampleLinks.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {group.sampleLinks.slice(0, 5).map((link) => (
                                <a
                                  key={link}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-app-accent hover:underline"
                                >
                                  ↗ Figma
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  // Multi-variant: render as expandable group (S-05)
                  const isExpanded = expandedGroups.has(group.parentName);
                  return (
                    <Fragment key={group.parentName}>
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2">
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
                              className="text-app-accent hover:underline"
                            >
                              <span className="font-normal">{displayParentName}</span>
                            </Link>
                          ) : (
                            <span className="font-normal">{displayParentName}</span>
                          )}
                            <Badge variant="neutral" className="text-[10px]">
                              {group.variants.length} variants
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="neutral">{group.totalInstances}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <ImpactLevelBadge level={group.worstImpactLevel.level} />
                        </td>
                        <td className="px-3 py-2">
                          {group.sampleLinks.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {group.sampleLinks.slice(0, 3).map((link) => (
                                <a
                                  key={link}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-app-accent hover:underline"
                                >
                                  ↗ Figma
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded &&
                        group.variants.map((v) => (
                          <tr
                            key={v.componentKey}
                            className="border-b border-border/30 bg-muted/10"
                          >
                            <td className="py-1.5 pl-9 pr-3">
                              <span className="text-xs text-muted-foreground">
                                {v.variantLabel || v.componentName}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <Badge variant="neutral" className="text-[10px]">
                                {v.instances}
                              </Badge>
                            </td>
                            <td className="px-3 py-1.5">
                              <ImpactLevelBadge level={v.impactLevel.level} />
                            </td>
                            <td className="px-3 py-1.5">
                              {v.sampleLinks.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {v.sampleLinks.slice(0, 2).map((link) => (
                                    <a
                                      key={link}
                                      href={link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-app-accent hover:underline"
                                    >
                                      ↗ Figma
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Variable Usage */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-base font-titles font-semibold titles-color">Variable Usage</h2>
        {sortedVariables.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {consumer.latestSync
              ? "No DS variables recorded for this consumer."
              : "No sync data yet — use Sync now above."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="titles-color">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium titles-color">Variable</th>
                  <th className="px-3 py-2 text-right font-medium titles-color">Nodes</th>
                  <th className="px-3 py-2 text-left font-medium titles-color">Type</th>
                  <th className="px-3 py-2 text-left font-medium titles-color">Impact</th>
                  <th className="px-3 py-2 text-left font-medium titles-color">Sample Links</th>
                </tr>
              </thead>
              <tbody>
                {sortedVariables.map((v) => {
                  const variableNameExact = normalizeLookupKey(v.variableName);
                  const variableKeyExact = normalizeLookupKey(v.variableKey);
                  const tokenEntry =
                    (variableNameExact && tokenByExactLookup[variableNameExact]) ||
                    (variableKeyExact && tokenByExactLookup[variableKeyExact]) ||
                    tokenByLookup[normalizeTokenLookupKey(v.variableName)] ||
                    tokenByLookup[normalizeTokenLookupKey(v.variableKey)] ||
                    null;
                  const displayTokenName = tokenEntry?.path || v.variableName;
                  return (
                  <tr key={v.variableKey} className="border-b border-border/50">
                    <td className="px-3 py-2">
                      <p className="font-normal">
                        {tokenEntry ? (
                          <Link
                            to={`/tokens/${encodeURIComponent(tokenEntry.path)}`}
                            className="text-app-accent hover:underline"
                          >
                            <span className="font-normal">{displayTokenName}</span>
                          </Link>
                        ) : (
                          <span className="font-normal">{displayTokenName}</span>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Badge variant="neutral">{v.nodes}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="neutral">{v.variableType}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <ImpactLevelBadge level={v.impactLevel.level} />
                    </td>
                    <td className="px-3 py-2">
                      {v.sampleLinks && v.sampleLinks.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {v.sampleLinks.slice(0, 5).map((link) => (
                            <a
                              key={link}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-app-accent hover:underline"
                            >
                              ↗ Figma
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {usageDetails ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-titles font-semibold titles-color">Usage Details</h2>
              <p className="text-sm text-muted-foreground">
                Direct parent usage, local component graph, component properties and token
                bindings captured during the latest sync.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Badge variant="neutral">
                Components {sumUsageScopeSummary(usageDetails.usageShape.components)}
              </Badge>
              <Badge variant="neutral">
                Tokens {sumUsageScopeSummary(usageDetails.usageShape.tokens)}
              </Badge>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
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
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
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

          <div className="mt-4 space-y-4">
            <section className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold titles-color">Direct parent usage</h3>
                <Badge variant="neutral">{usageDetails.parentComponentUsages.length} entries</Badge>
              </div>
              {usageDetails.parentComponentUsages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No direct DS parent component usage captured for this consumer.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="titles-color">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left font-medium titles-color">Local component</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Parent DS component</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Scope</th>
                        <th className="px-3 py-2 text-right font-medium titles-color">Uses</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Samples</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageDetails.parentComponentUsages.map((usage) => (
                        <tr key={`${usage.localComponentKey}-${usage.parentComponentKey}-${usage.usageScope}`} className="border-b border-border/50">
                          <td className="px-3 py-2">
                            {renderComponentName(usage.localComponentKey, usage.localComponentName, componentSlugByLookup)}
                          </td>
                          <td className="px-3 py-2">
                            {renderComponentName(usage.parentComponentKey, usage.parentComponentName, componentSlugByLookup)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="neutral" className="text-[10px]">
                              {formatUsageScope(usage.usageScope)}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Badge variant="neutral">{usage.usageCount}</Badge>
                          </td>
                          <td className="px-3 py-2">
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold titles-color">Local component graph</h3>
                <Badge variant="neutral">{usageDetails.localComponentGraph.length} edges</Badge>
              </div>
              {usageDetails.localComponentGraph.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No local component composition edges captured for this consumer.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="titles-color">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left font-medium titles-color">Parent local component</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Child local component</th>
                        <th className="px-3 py-2 text-right font-medium titles-color">Uses</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Samples</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageDetails.localComponentGraph.map((edge) => (
                        <tr key={`${edge.parentComponentKey}-${edge.childComponentKey}`} className="border-b border-border/50">
                          <td className="px-3 py-2">
                            {renderComponentName(edge.parentComponentKey, edge.parentComponentName, componentSlugByLookup)}
                          </td>
                          <td className="px-3 py-2">
                            {renderComponentName(edge.childComponentKey, edge.childComponentName, componentSlugByLookup)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Badge variant="neutral">{edge.usageCount}</Badge>
                          </td>
                          <td className="px-3 py-2">
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold titles-color">Component properties</h3>
                <Badge variant="neutral">{usageDetails.componentPropertyUsages.length} nodes</Badge>
              </div>
              {usageDetails.componentPropertyUsages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No component property bindings captured for this consumer.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="titles-color">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left font-medium titles-color">Node</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Component</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Scope</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Local component</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Property</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Value</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageDetails.componentPropertyUsages.flatMap((entry) =>
                        entry.properties.map((property) => (
                          <tr key={`${entry.nodeId}-${entry.componentKey}-${property.name}`} className="border-b border-border/50">
                            <td className="px-3 py-2">{entry.nodeName}</td>
                            <td className="px-3 py-2">
                              {renderComponentName(entry.componentKey, entry.componentName, componentSlugByLookup)}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="neutral" className="text-[10px]">
                                {formatUsageScope(entry.usageScope)}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {entry.localComponentKey && entry.localComponentName ? (
                                renderComponentName(entry.localComponentKey, entry.localComponentName, componentSlugByLookup)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-medium">{property.name}</td>
                            <td className="px-3 py-2">{formatPropertyValue(property.value)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{property.valueType}</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold titles-color">Token binding detail</h3>
                <Badge variant="neutral">{usageDetails.tokenBindingDetails.length} nodes</Badge>
              </div>
              {usageDetails.tokenBindingDetails.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No token binding details captured for this consumer.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="titles-color">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left font-medium titles-color">Node</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Scope</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Local component</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Field</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Variable</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Status</th>
                        <th className="px-3 py-2 text-left font-medium titles-color">Token path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageDetails.tokenBindingDetails.flatMap((entry) =>
                        entry.bindings.map((binding) => (
                          <tr key={`${entry.nodeId}-${binding.field}-${binding.variableId}`} className="border-b border-border/50">
                            <td className="px-3 py-2">{entry.nodeName}</td>
                            <td className="px-3 py-2">
                              <Badge variant="neutral" className="text-[10px]">
                                {formatUsageScope(entry.usageScope)}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {entry.localComponentKey && entry.localComponentName ? (
                                renderComponentName(entry.localComponentKey, entry.localComponentName, componentSlugByLookup)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-medium">{binding.field}</td>
                            <td className="px-3 py-2">
                              {binding.status === "resolved" ? (
                                <span>{binding.variableName ?? binding.variableId}</span>
                              ) : (
                                <span className="text-muted-foreground">Unresolved ({binding.variableId})</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={binding.status === "resolved" ? "success" : "warning"}>
                                {binding.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {binding.resolvedTokenPath ?? "—"}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {/* Sync Run Log */}
      <section className="rounded-lg border border-border bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20"
          onClick={() => setIsSyncLogOpen((open) => !open)}
          aria-expanded={isSyncLogOpen}
          aria-controls="sync-run-log-content"
        >
          <h2 className="text-base font-titles font-semibold titles-color">Sync Run Log</h2>
          {isSyncLogOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {isSyncLogOpen ? (
          <div id="sync-run-log-content" className="border-t border-border/50 p-4 pt-3">
            {syncRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sync runs yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="titles-color">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-medium titles-color">Status</th>
                      <th className="px-3 py-2 text-left font-medium titles-color">Timestamp</th>
                      <th className="px-3 py-2 text-right font-medium titles-color">Components</th>
                      <th className="px-3 py-2 text-right font-medium titles-color">Variables</th>
                      <th className="px-3 py-2 text-right font-medium titles-color">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncRuns.map((run) => (
                      <tr key={run.id} className="border-b border-border/50">
                        <td className="px-3 py-2">
                          <ConsumerSyncStatusBadge latestSync={run} />
                          {run.errorMessage && (
                            <p className="mt-1 text-xs text-status-error">{run.errorMessage}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatSyncedAt(run.syncedAt)}
                        </td>
                        <td className="px-3 py-2 text-right">{run.componentCount}</td>
                        <td className="px-3 py-2 text-right">{run.variableCount}</td>
                        <td className="px-3 py-2 text-right">{formatDurationMs(run.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
