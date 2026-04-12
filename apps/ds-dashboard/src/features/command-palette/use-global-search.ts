import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchComponentRegistry,
  fetchComponentsHealth,
  fetchTokenHealth,
  fetchTokenRegistry,
  getActiveSystemId,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { ROUTE_PATTERNS, toComponentDetail, toTokenDetail } from "@/lib/routes";
import type { ComponentsHealthReport } from "@/types/components-health";
import type { TokenHealthReport } from "@/types/token-health";

export type GlobalSearchItemKind = "token" | "component" | "health-issue";

export interface GlobalSearchItem {
  id: string;
  kind: GlobalSearchItemKind;
  title: string;
  subtitle?: string;
  href: string;
  keywords: string[];
}

function buildHealthIssueItems(
  tokenHealth: TokenHealthReport | null,
  componentsHealth: ComponentsHealthReport | null,
) {
  const items: GlobalSearchItem[] = [];

  if (tokenHealth) {
    const summary = tokenHealth.summary;
    const tokenIssues: Array<{ count: number; title: string; keywords: string[] }> = [
      {
        count: summary.unused_tokens_total,
        title: `${summary.unused_tokens_total} unused tokens`,
        keywords: ["unused", "tokens", "health"],
      },
      {
        count: summary.high_coupling_tokens_total,
        title: `${summary.high_coupling_tokens_total} high coupling tokens`,
        keywords: ["high", "coupling", "impact"],
      },
      {
        count: summary.broken_aliases_total,
        title: `${summary.broken_aliases_total} broken aliases`,
        keywords: ["aliases", "broken", "token"],
      },
      {
        count: summary.broken_css_var_refs_total,
        title: `${summary.broken_css_var_refs_total} broken css var refs`,
        keywords: ["css", "refs", "broken"],
      },
      {
        count: summary.wcag_failures_total,
        title: `${summary.wcag_failures_total} WCAG failures`,
        keywords: ["wcag", "contrast", "accessibility"],
      },
    ];

    for (const issue of tokenIssues) {
      if (issue.count <= 0) continue;
      items.push({
        id: `health:token:${issue.title}`,
        kind: "health-issue",
        title: issue.title,
        subtitle: "Token Health",
        href: ROUTE_PATTERNS.health,
        keywords: issue.keywords,
      });
    }
  }

  if (componentsHealth) {
    const componentIssues: Array<{ count: number; title: string; keywords: string[] }> = [
      {
        count: componentsHealth.filters.without_spec.total,
        title: `${componentsHealth.filters.without_spec.total} components without spec`,
        keywords: ["spec", "components"],
      },
    ];

    for (const issue of componentIssues) {
      if (issue.count <= 0) continue;
      items.push({
        id: `health:component:${issue.title}`,
        kind: "health-issue",
        title: issue.title,
        subtitle: "Components Health",
        href: ROUTE_PATTERNS.health,
        keywords: issue.keywords,
      });
    }
  }

  return items;
}

export function useGlobalSearch() {
  const [tokens, setTokens] = useState<GlobalSearchItem[]>([]);
  const [components, setComponents] = useState<GlobalSearchItem[]>([]);
  const [healthIssues, setHealthIssues] = useState<GlobalSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);

  const activeSystemRef = getActiveSystemId();

  const reloadIndex = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tokenRegistry, componentRegistry, tokenHealth, componentsHealth] =
        await Promise.all([
          fetchTokenRegistry(),
          fetchComponentRegistry(),
          fetchTokenHealth().catch(() => null),
          fetchComponentsHealth().catch(() => null),
        ]);

      const tokenItems: GlobalSearchItem[] = (tokenRegistry.entries ?? []).map((entry) => ({
        id: `token:${entry.path}`,
        kind: "token",
        title: entry.path,
        subtitle: `${entry.collection} · ${entry.type} · ${entry.resolvedValue}`,
        href: toTokenDetail(entry.path),
        keywords: [entry.path, entry.slashPath, entry.cssVar, entry.collection, entry.type],
      }));

      const componentItems: GlobalSearchItem[] = (
        componentRegistry.components ?? []
      ).map((item) => ({
        id: `component:${item.slug}`,
        kind: "component",
        title: item.display_name,
        subtitle: item.spec.exists ? "with spec" : "without spec",
        href: toComponentDetail(item.slug),
        keywords: [
          item.display_name,
          item.slug,
          item.spec.exists ? "with spec" : "without spec",
          "spec",
          item.spec.exists ? "documented" : "missing",
        ],
      }));

      const healthItems = buildHealthIssueItems(
        tokenHealth,
        componentsHealth,
      );

      setTokens(tokenItems);
      setComponents(componentItems);
      setHealthIssues(healthItems);
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Search index unavailable",
          fallbackMessage:
            "Run `npm run ds:token-usage-index` and `npm run ds:registry:sync`, then retry.",
        }),
      );
      setTokens([]);
      setComponents([]);
      setHealthIssues([]);
    } finally {
      setLoading(false);
    }
  }, [activeSystemRef]);

  useEffect(() => {
    void reloadIndex();
  }, [reloadIndex]);

  const allItems = useMemo(
    () => [...healthIssues, ...components, ...tokens],
    [components, healthIssues, tokens],
  );

  return {
    items: allItems,
    loading,
    error,
    reloadIndex,
  };
}
