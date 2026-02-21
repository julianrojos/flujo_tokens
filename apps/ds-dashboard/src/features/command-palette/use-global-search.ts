import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchComponentRegistry,
  fetchComponentsHealth,
  fetchNamingDebt,
  fetchTokenHealth,
  fetchTokenRegistry,
} from "@/lib/api";
import type { ComponentsHealthReport } from "@/types/components-health";
import type { NamingDebtReport } from "@/types/naming-debt";
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
  namingDebt: NamingDebtReport | null,
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
        href: "/health",
        keywords: issue.keywords,
      });
    }
  }

  if (componentsHealth) {
    const summary = componentsHealth.summary;
    const componentIssues: Array<{ count: number; title: string; keywords: string[] }> = [
      {
        count: summary.needs_review,
        title: `${summary.needs_review} components need review`,
        keywords: ["components", "review", "health"],
      },
      {
        count: componentsHealth.filters.missing_visual_proof.total,
        title: `${componentsHealth.filters.missing_visual_proof.total} components without visual proof`,
        keywords: ["visual", "proof", "components"],
      },
      {
        count: componentsHealth.filters.blocked_in_pipeline.total,
        title: `${componentsHealth.filters.blocked_in_pipeline.total} components blocked in pipeline`,
        keywords: ["pipeline", "blocked", "components"],
      },
    ];

    for (const issue of componentIssues) {
      if (issue.count <= 0) continue;
      items.push({
        id: `health:component:${issue.title}`,
        kind: "health-issue",
        title: issue.title,
        subtitle: "Components Health",
        href: "/health",
        keywords: issue.keywords,
      });
    }
  }

  if (namingDebt && namingDebt.summary.totalViolations > 0) {
    items.push({
      id: "health:naming-debt",
      kind: "health-issue",
      title: `${namingDebt.summary.totalViolations} naming debt issues`,
      subtitle: "Naming Debt",
      href: "/tokens/naming-debt",
      keywords: ["naming", "debt", "normalization", "tokens"],
    });
  }

  return items;
}

export function useGlobalSearch() {
  const [tokens, setTokens] = useState<GlobalSearchItem[]>([]);
  const [components, setComponents] = useState<GlobalSearchItem[]>([]);
  const [healthIssues, setHealthIssues] = useState<GlobalSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadIndex = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tokenRegistry, componentRegistry, tokenHealth, componentsHealth, namingDebt] =
        await Promise.all([
          fetchTokenRegistry(),
          fetchComponentRegistry(),
          fetchTokenHealth().catch(() => null),
          fetchComponentsHealth().catch(() => null),
          fetchNamingDebt().catch(() => null),
        ]);

      const tokenItems: GlobalSearchItem[] = (tokenRegistry.entries ?? []).map((entry) => ({
        id: `token:${entry.path}`,
        kind: "token",
        title: entry.path,
        subtitle: `${entry.collection} · ${entry.type} · ${entry.resolvedValue}`,
        href: `/tokens/${encodeURIComponent(entry.path)}`,
        keywords: [entry.path, entry.slashPath, entry.cssVar, entry.collection, entry.type],
      }));

      const componentItems: GlobalSearchItem[] = (
        componentRegistry.components ?? []
      ).map((item) => ({
        id: `component:${item.slug}`,
        kind: "component",
        title: item.display_name,
        subtitle: `${item.pipeline_stage} · ${item.doc.status}`,
        href: `/components/${encodeURIComponent(item.slug)}`,
        keywords: [item.display_name, item.slug, item.pipeline_stage, item.doc.status],
      }));

      const healthItems = buildHealthIssueItems(
        tokenHealth,
        componentsHealth,
        namingDebt,
      );

      setTokens(tokenItems);
      setComponents(componentItems);
      setHealthIssues(healthItems);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setTokens([]);
      setComponents([]);
      setHealthIssues([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
