import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";
import { useDesignSystem } from "@/lib/design-system-context";
import { toTokenDetail } from "@/lib/routes";
import { getTopTokenHotspots } from "../lib/token-hotspots";
import {
  useTokenCatalogQuery,
  useTokenUsageIndexQuery,
  useTokenVariableReportsQuery,
} from "../use-health-queries";

const TOP_TOKENS_LIMIT = 12;

function getUsageTooltip(componentSlugs: string[], parentFileName: string): string {
  if (componentSlugs.length === 0) return "No component slugs available";
  const displayNames = componentSlugs.map((slug) =>
    slug === "Parent file" ? parentFileName : slug,
  );
  return `Used in: ${displayNames.join(", ")}`;
}

export function TokenHotspotsCard() {
  const { systemId } = useParams<{ systemId: string }>();
  const resolvedSystemId = String(systemId || "").trim();
  const { systems } = useDesignSystem();
  const usageIndexQuery = useTokenUsageIndexQuery(resolvedSystemId);
  const tokenCatalogQuery = useTokenCatalogQuery(resolvedSystemId);
  const variableReportsQuery = useTokenVariableReportsQuery(resolvedSystemId);
  const parentFileName = useMemo(() => {
    const currentSystem = systems.find((system) => system.id === resolvedSystemId);
    return currentSystem?.name?.trim() || "Parent file";
  }, [resolvedSystemId, systems]);

  const rows = useMemo(
    () => getTopTokenHotspots({
      usageIndex: usageIndexQuery.data ?? null,
      tokenCatalog: tokenCatalogQuery.data ?? null,
      variableReports: variableReportsQuery.data ?? [],
      limit: TOP_TOKENS_LIMIT,
    }),
    [tokenCatalogQuery.data, usageIndexQuery.data, variableReportsQuery.data],
  );
  const maxUsageCount = rows.reduce((max, row) => Math.max(max, row.usageCount), 0);
  const isLoading = usageIndexQuery.isLoading || tokenCatalogQuery.isLoading || variableReportsQuery.isLoading;
  const isError = tokenCatalogQuery.isError || variableReportsQuery.isError;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token hotspots</CardTitle>
          <CardDescription>Loading parent design system token usage.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-8 animate-pulse rounded-full bg-muted/60" />
            <div className="h-8 animate-pulse rounded-full bg-muted/60" />
            <div className="h-8 animate-pulse rounded-full bg-muted/60" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token hotspots</CardTitle>
          <CardDescription>Token usage chart unavailable.</CardDescription>
        </CardHeader>
        <CardContent>
          <StatusAlert variant="warning" title="Token hotspots unavailable">
            Could not load token usage for the current system.
          </StatusAlert>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token hotspots</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusAlert variant="success" title="No token hotspots">
            No tokens are currently used in the parent design system.
          </StatusAlert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token hotspots</CardTitle>
        <CardDescription>Most-used tokens in the parent design system.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.map((row) => {
            const width = maxUsageCount > 0 ? Math.max(4, (row.usageCount / maxUsageCount) * 100) : 0;
            const tooltip = getUsageTooltip(row.componentSlugs, parentFileName);
            return (
              <div key={row.path} className="space-y-1" title={tooltip}>
                <div className="min-w-0">
                  <Link
                    to={toTokenDetail(row.path)}
                    className="block truncate text-sm text-foreground hover:text-primary"
                    title={`${row.path} · ${tooltip}`}
                  >
                    {row.path}
                  </Link>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/70">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                      style={{ width: `${width}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="shrink-0 tabular-nums text-sm font-semibold text-foreground">
                    {row.usageCount}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
