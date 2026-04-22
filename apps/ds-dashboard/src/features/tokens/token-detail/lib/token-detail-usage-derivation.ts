import type { VariableUsageReport } from "@/types/consumers";
import type { ComponentCatalogItem } from "@/types/component-catalog";
import type { TokenCatalog, TokenCatalogEntry } from "@/types/token-catalog";
import type { TokenUsageOccurrence } from "@/types/token-usage-index";
import {
  buildTokenUsageTargets,
  normalizeUsageKeyForMatch,
  resolveAliasTarget,
  tokenMatchesRef,
  variableReportMatchesTokenTargets,
} from "./token-detail-transforms";

const PARENT_CONSUMER_ID_PREFIX = "parent:" as const;

function buildTokenLookupIndex(registry: TokenCatalog | null): Map<string, TokenCatalogEntry> {
  const lookup = new Map<string, TokenCatalogEntry>();
  if (!registry) return lookup;

  for (const entry of registry.entries ?? []) {
    for (const ref of [entry.path, entry.slashPath, entry.cssVar]) {
      const normalized = String(ref || "").trim();
      if (!normalized || lookup.has(normalized)) continue;
      lookup.set(normalized, entry);
    }
  }

  return lookup;
}

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

function buildReverseAliasGraph(registry: TokenCatalog | null): Map<string, string[]> {
  const reverse = new Map<string, string[]>();
  if (!registry) return reverse;
  for (const entry of registry.entries ?? []) {
    const aliasRef = String(entry.aliasOf || "").trim();
    if (!aliasRef) continue;
    const target = resolveAliasTarget(registry, aliasRef);
    if (!target) continue;
    const list = reverse.get(target.path) ?? [];
    if (!list.includes(entry.path)) {
      list.push(entry.path);
    }
    reverse.set(target.path, list);
  }
  for (const list of reverse.values()) {
    list.sort((left, right) => left.localeCompare(right));
  }
  return reverse;
}

function collectDescendants(
  path: string,
  reverse: Map<string, string[]>,
  memo: Map<string, Set<string>>,
  visiting: Set<string>,
): Set<string> {
  const cached = memo.get(path);
  if (cached) return cached;
  if (visiting.has(path)) {
    return new Set<string>();
  }

  visiting.add(path);
  const descendants = new Set<string>();

  for (const child of reverse.get(path) ?? []) {
    if (!child || child === path) continue;
    descendants.add(child);
    const nested = collectDescendants(child, reverse, memo, visiting);
    for (const entry of nested) {
      descendants.add(entry);
    }
  }

  visiting.delete(path);
  memo.set(path, descendants);
  return descendants;
}

export interface TokenUsageInTokensRow {
  path: string;
  displayPath: string;
  collection: string;
  type: string;
  depth: number;
  consumers: number;
  properties: string[];
}

export function buildComponentUsagePropertiesIndex(args: {
  registry: TokenCatalog | null;
  components?: ComponentCatalogItem[];
}): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  if (!args.registry || !Array.isArray(args.components) || args.components.length === 0) {
    return index;
  }

  const tokenLookup = buildTokenLookupIndex(args.registry);

  for (const component of args.components) {
    const bindings = Array.isArray(component.figma?.token_bindings)
      ? component.figma.token_bindings
      : [];
    if (bindings.length === 0) continue;

    for (const binding of bindings) {
      const tokenRef = String(binding.token_path || "").trim();
      if (!tokenRef) continue;

      const property = normalizePropertyLabel(
        String(binding.property_path || binding.field || ""),
      );
      if (!property) continue;

      const matchedToken = tokenLookup.get(tokenRef) ?? null;
      if (!matchedToken) continue;

      const visiting = new Set<string>();
      let current: TokenCatalogEntry | null = matchedToken;

      while (current && !visiting.has(current.path)) {
        visiting.add(current.path);
        const properties = index.get(current.path) ?? new Set<string>();
        properties.add(property);
        index.set(current.path, properties);
        current = current.aliasOf ? resolveAliasTarget(args.registry, current.aliasOf) : null;
      }
    }
  }

  return index;
}

export function buildTokenUsageInTokensRows(args: {
  tokenPath: string;
  registry: TokenCatalog | null;
  components?: ComponentCatalogItem[];
  componentUsagePropertiesByTokenPath?: Map<string, Set<string>>;
}): TokenUsageInTokensRow[] {
  const token = args.registry?.byPath?.[args.tokenPath] ?? null;
  if (!token) return [];

  const componentUsagePropertiesByTokenPath =
    args.componentUsagePropertiesByTokenPath ??
    buildComponentUsagePropertiesIndex({
      registry: args.registry,
      components: args.components,
    });

  const reverse = buildReverseAliasGraph(args.registry);
  const rowsByPath = new Map<string, { token: TokenCatalogEntry; depth: number }>();
  const queue: Array<{ path: string; depth: number }> = [{ path: token.path, depth: 0 }];
  const visited = new Set<string>([token.path]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const childPath of reverse.get(current.path) ?? []) {
      if (!childPath || visited.has(childPath)) continue;
      visited.add(childPath);
      const child =
        args.registry?.byPath?.[childPath] ?? args.registry?.bySlashPath?.[childPath] ?? null;
      if (!child || child.path === token.path) continue;
      rowsByPath.set(child.path, { token: child, depth: current.depth + 1 });
      queue.push({ path: child.path, depth: current.depth + 1 });
    }
  }

  const downstreamMemo = new Map<string, Set<string>>();
  return Array.from(rowsByPath.values())
    .map((entry) => {
      const descendants = collectDescendants(
        entry.token.path,
        reverse,
        downstreamMemo,
        new Set<string>(),
      );
      descendants.delete(entry.token.path);
      return {
        path: entry.token.path,
        displayPath: entry.token.slashPath,
        collection: entry.token.collection,
        type: entry.token.type,
        depth: entry.depth,
        consumers: descendants.size,
        properties: Array.from(
          componentUsagePropertiesByTokenPath.get(entry.token.path) ?? new Set<string>(),
        ).sort((left, right) => left.localeCompare(right)),
      };
    })
    .sort((left, right) => {
      if (left.depth !== right.depth) return left.depth - right.depth;
      const consumersDiff = right.consumers - left.consumers;
      if (consumersDiff !== 0) return consumersDiff;
      return left.path.localeCompare(right.path);
    });
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

function normalizePropertyLabel(value: string): string {
  return String(value || "").trim();
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

export interface ComponentTokenUsage {
  slug: string;
  displayName: string;
  mode: "direct" | "via_alias" | "both";
  occurrences: number;
  directOccurrences: number;
  viaAliasOccurrences: number;
  properties: string[];
}

export function buildComponentTokenUsageRows(args: {
  tokenPath: string;
  registry: TokenCatalog | null;
  components: ComponentCatalogItem[];
}): ComponentTokenUsage[] {
  const token = args.registry?.byPath?.[args.tokenPath] ?? null;
  if (!token || !Array.isArray(args.components) || args.components.length === 0) {
    return [];
  }

  const aliasPaths = collectAliasDescendantPaths(args.registry, token.path);
  const aliasPathByRef = new Map<string, string>();

  for (const aliasPath of aliasPaths) {
    const aliasToken =
      args.registry?.byPath?.[aliasPath] ?? args.registry?.bySlashPath?.[aliasPath] ?? null;
    if (!aliasToken) continue;
    for (const target of buildTokenUsageTargets(aliasToken)) {
      const normalized = String(target || "").trim();
      if (!normalized || aliasPathByRef.has(normalized)) continue;
      aliasPathByRef.set(normalized, aliasPath);
    }
  }

  return args.components
    .map((component): ComponentTokenUsage | null => {
      const bindings = Array.isArray(component.figma?.token_bindings)
        ? component.figma.token_bindings
        : [];
      if (bindings.length === 0) return null;

      let directOccurrences = 0;
      let viaAliasOccurrences = 0;
      const properties = new Set<string>();

      for (const binding of bindings) {
        const tokenRef = String(binding.token_path || "").trim();
        if (!tokenRef) continue;

        const property = normalizePropertyLabel(
          String(binding.property_path || binding.field || ""),
        );

        if (tokenMatchesRef(token, tokenRef)) {
          directOccurrences += 1;
          if (property) properties.add(property);
          continue;
        }

        const aliasPath = aliasPathByRef.get(tokenRef) ?? null;
        if (!aliasPath) continue;
        viaAliasOccurrences += 1;
        if (property) properties.add(property);
      }

      const occurrences = directOccurrences + viaAliasOccurrences;
      if (occurrences === 0) return null;
      const mode: ComponentTokenUsage["mode"] =
        directOccurrences > 0 && viaAliasOccurrences > 0
          ? "both"
          : viaAliasOccurrences > 0
            ? "via_alias"
            : "direct";

      return {
        slug: component.slug,
        displayName: component.display_name || component.slug,
        mode,
        occurrences,
        directOccurrences,
        viaAliasOccurrences,
        properties: Array.from(properties.values()).sort((left, right) => left.localeCompare(right)),
      };
    })
    .filter((entry): entry is ComponentTokenUsage => Boolean(entry))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}
