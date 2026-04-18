import type { VariableUsageReport } from "@/types/consumers";
import type { TokenCatalog } from "@/types/token-catalog";
import type { TokenUsageOccurrence } from "@/types/token-usage-index";
import {
  buildTokenUsageTargets,
  normalizeUsageKeyForMatch,
  resolveAliasTarget,
  variableReportMatchesTokenTargets,
} from "./token-detail-transforms";

const PARENT_CONSUMER_ID_PREFIX = "parent:" as const;

function resolveTokenTargets(tokenPath: string, registry: TokenCatalog | null): Set<string> {
  const token = registry?.byPath?.[tokenPath] ?? null;
  return buildTokenUsageTargets(token);
}

export function collectAliasDescendantPaths(registry: TokenCatalog | null, tokenPath: string): string[] {
  if (!registry) return [];
  const reverse = new Map<string, string[]>();
  for (const entry of registry.entries ?? []) {
    const aliasRef = String(entry.aliasOf || "").trim();
    if (!aliasRef) continue;
    const target = resolveAliasTarget(registry, aliasRef);
    if (!target) continue;
    const list = reverse.get(target.path) ?? [];
    list.push(entry.path);
    reverse.set(target.path, list);
  }

  const out: string[] = [];
  const queue = [...(reverse.get(tokenPath) ?? [])];
  const visited = new Set<string>([tokenPath, ...queue]);
  while (queue.length > 0) {
    const current = String(queue.shift() || "").trim();
    if (!current || current === tokenPath) continue;
    out.push(current);
    for (const child of reverse.get(current) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }
  return out;
}

type MatchMode = { mode: "direct" } | { mode: "via_alias"; aliasPath: string };

function buildVariableReportTargets(report: VariableUsageReport): string[] {
  const targets = new Set<string>();
  const normalizedName = normalizeUsageKeyForMatch(String(report.variableName || ""));
  const exactName = String(report.variableName || "").trim();
  const exactKey = String(report.variableKey || "").trim();
  if (normalizedName) targets.add(normalizedName);
  if (exactName) targets.add(exactName);
  if (exactKey) targets.add(exactKey);
  return Array.from(targets.values());
}

function buildAliasPathByTargetIndex(aliasTargetsByPath: Map<string, Set<string>>): Map<string, string> {
  const byTarget = new Map<string, string>();
  for (const [aliasPath, targets] of aliasTargetsByPath.entries()) {
    for (const target of targets) {
      const normalized = String(target || "").trim();
      if (!normalized) continue;
      if (!byTarget.has(normalized)) {
        byTarget.set(normalized, aliasPath);
      }
    }
  }
  return byTarget;
}

function resolveReportMatchMode(args: {
  report: VariableUsageReport;
  directTargets: Set<string>;
  aliasPathByTarget: Map<string, string>;
}): MatchMode | null {
  const reportCandidate = {
    variableName: args.report.variableName,
    variableKey: args.report.variableKey,
  };
  if (variableReportMatchesTokenTargets(reportCandidate, args.directTargets)) {
    return { mode: "direct" };
  }
  for (const candidateTarget of buildVariableReportTargets(args.report)) {
    const aliasPath = args.aliasPathByTarget.get(candidateTarget);
    if (aliasPath) {
      return { mode: "via_alias", aliasPath };
    }
  }
  return null;
}

function buildOccurrencesFromReports(args: {
  reports: VariableUsageReport[];
  directTargets: Set<string>;
  aliasTargetsByPath: Map<string, Set<string>>;
}): {
  parentCount: number;
  parentOccurrences: TokenUsageOccurrence[];
  consumerCount: number;
  consumerOccurrences: TokenUsageOccurrence[];
} {
  const parentOccurrences: TokenUsageOccurrence[] = [];
  const consumerOccurrences: TokenUsageOccurrence[] = [];
  const aliasPathByTarget = buildAliasPathByTargetIndex(args.aliasTargetsByPath);
  let parentCount = 0;
  let consumerCount = 0;

  for (const report of args.reports) {
    const match = resolveReportMatchMode({
      report,
      directTargets: args.directTargets,
      aliasPathByTarget,
    });
    if (!match) continue;
    const modeDetail =
      match.mode === "via_alias"
        ? `mode:via_alias · alias:${match.aliasPath}`
        : "mode:direct";
    for (const consumer of report.consumers ?? []) {
      const nodeCount = Number.isFinite(consumer.nodeCount)
        ? Math.max(0, Number(consumer.nodeCount))
        : 0;
      const isParent = String(consumer.consumerId || "").startsWith(PARENT_CONSUMER_ID_PREFIX);
      if (isParent) {
        parentCount += nodeCount;
        parentOccurrences.push({
          kind: "figma-applied",
          source: "",
          owner: consumer.consumerName || "Parent file",
          detail: `${report.variableName} · ${consumer.consumerFileKey} · nodes:${nodeCount} · ${modeDetail}`,
        });
      } else {
        consumerCount += nodeCount;
        consumerOccurrences.push({
          kind: "figma-consumer-applied",
          source: "",
          owner: consumer.consumerName || consumer.consumerFileKey || "consumer",
          detail: `${report.variableName} · ${consumer.consumerFileKey} · nodes:${nodeCount} · ${modeDetail}`,
        });
      }
    }
  }

  return { parentCount, parentOccurrences, consumerCount, consumerOccurrences };
}

export function buildFigmaConsumerUsageOccurrences(args: {
  tokenPath: string;
  registry: TokenCatalog | null;
  consumerVariableReports: VariableUsageReport[] | null;
}): {
  parentCount: number;
  parentOccurrences: TokenUsageOccurrence[];
  consumerCount: number;
  consumerOccurrences: TokenUsageOccurrence[];
} {
  const reports = args.consumerVariableReports ?? [];
  const directTargets = resolveTokenTargets(args.tokenPath, args.registry);
  const aliasPaths = collectAliasDescendantPaths(args.registry, args.tokenPath);
  const aliasTargetsByPath = new Map<string, Set<string>>();
  for (const aliasPath of aliasPaths) {
    const aliasToken = args.registry?.byPath?.[aliasPath] ?? args.registry?.bySlashPath?.[aliasPath] ?? null;
    if (!aliasToken) continue;
    aliasTargetsByPath.set(aliasPath, buildTokenUsageTargets(aliasToken));
  }

  if (reports.length === 0) {
    return {
      parentCount: 0,
      parentOccurrences: [],
      consumerCount: 0,
      consumerOccurrences: [],
    };
  }
  return buildOccurrencesFromReports({
    reports,
    directTargets,
    aliasTargetsByPath,
  });
}
