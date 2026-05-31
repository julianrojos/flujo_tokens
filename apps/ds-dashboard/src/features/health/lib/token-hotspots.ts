import type { VariableUsageReport } from "@/types/consumers";
import {
  buildTokenUsageTargets,
  variableReportMatchesTokenTargets,
} from "@/lib/token-usage-matching";
import type { TokenCatalog, TokenCatalogEntry } from "@/types/token-catalog";
import type { TokenUsageIndex } from "@/types/token-usage-index";

export interface TokenHotspotRow {
  path: string;
  usageCount: number;
  componentSlugs: string[];
}

function getParentDesignSystemUsage(usedIn: TokenUsageIndex["entries"][number]["usedIn"]): {
  usageCount: number;
  componentSlugs: string[];
} {
  const parentUsages = usedIn.filter((usage) => usage.kind !== "figma-consumer-applied");

  return {
    usageCount: parentUsages.length,
    componentSlugs: parentUsages
      .map((usage) => usage.owner.trim())
      .filter(Boolean)
      .filter((slug, index, all) => all.indexOf(slug) === index)
      .sort((left, right) => left.localeCompare(right)),
  };
}

function getReportUsageForToken(
  token: TokenCatalogEntry,
  variableReports: VariableUsageReport[],
): {
  usageCount: number;
  componentSlugs: string[];
} {
  const targets = buildTokenUsageTargets(token);
  const componentSlugs = new Set<string>();
  let usageCount = 0;

  for (const report of variableReports) {
    if (!variableReportMatchesTokenTargets(report, targets)) continue;
    for (const consumer of report.consumers ?? []) {
      if (!String(consumer.consumerId || "").startsWith("parent:")) continue;

      const nodeCount = Number.isFinite(consumer.nodeCount)
        ? Math.max(0, Number(consumer.nodeCount))
        : 0;
      if (nodeCount === 0) continue;

      usageCount += nodeCount;
      const componentSlug = String(consumer.consumerName || consumer.consumerFileKey || consumer.consumerId || "").trim();
      if (componentSlug) componentSlugs.add(componentSlug);
    }
  }

  return {
    usageCount,
    componentSlugs: Array.from(componentSlugs).sort((left, right) => left.localeCompare(right)),
  };
}

export function getTopTokenHotspots(args: {
  usageIndex?: TokenUsageIndex | null;
  tokenCatalog?: TokenCatalog | null;
  variableReports?: VariableUsageReport[] | null;
  limit: number;
}): TokenHotspotRow[] {
  const { usageIndex, tokenCatalog, variableReports, limit } = args;
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (normalizedLimit === 0) return [];

  const rowsByPath = new Map<string, TokenHotspotRow>();

  for (const entry of usageIndex?.entries ?? []) {
    const parentUsage = getParentDesignSystemUsage(entry.usedIn);
    rowsByPath.set(entry.path, {
      path: entry.path,
      usageCount: parentUsage.usageCount,
      componentSlugs: parentUsage.componentSlugs,
    });
  }

  for (const token of tokenCatalog?.entries ?? []) {
    const reportUsage = getReportUsageForToken(token, variableReports ?? []);
    if (reportUsage.usageCount === 0) continue;

    const current = rowsByPath.get(token.path);
    rowsByPath.set(token.path, {
      path: token.path,
      usageCount: reportUsage.usageCount,
      componentSlugs: Array.from(new Set([
        ...(current?.componentSlugs ?? []),
        ...reportUsage.componentSlugs,
      ])).sort((left, right) => left.localeCompare(right)),
    });
  }

  return Array.from(rowsByPath.values())
    .filter((row) => row.usageCount > 0)
    .sort((left, right) => {
      const comparison = right.usageCount - left.usageCount;
      if (comparison !== 0) return comparison;
      return left.path.localeCompare(right.path);
    })
    .slice(0, normalizedLimit);
}
