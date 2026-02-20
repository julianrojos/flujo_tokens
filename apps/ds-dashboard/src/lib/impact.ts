import { computeContrastRatio, normalizeToHex6 } from "../features/tokens/accessibility/color-utils";
import type { ComponentRegistry } from "../types/component-registry";
import type {
  ImpactComponent,
  ImpactRecommendation,
  ImpactReport,
  ImpactSeverity,
  ImpactToken,
  ImpactWcagPairConfig,
  ImpactWcagSimulation,
} from "../types/impact";
import type { TokenGraphViz } from "../types/token-graph";
import type { TokenHealthReport } from "../types/token-health";
import type { TokenRegistry } from "../types/token-registry";
import type { TokenUsageEntry, TokenUsageIndex, TokenUsageOccurrence } from "../types/token-usage-index";

const MAX_DEPTH = 8;
const DEFAULT_DEPTH = 4;
const CSS_VAR_ALIAS_RE = /^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)\s*$/i;
const CSS_VAR_RE = /^--[a-z0-9-]+$/i;

type RegistryToken = TokenRegistry["entries"][number];
type GraphNode = TokenGraphViz["nodes"][number];

type RegistryIndexes = {
  byPath: Map<string, RegistryToken>;
  bySlashPath: Map<string, RegistryToken>;
  byCssVar: Map<string, RegistryToken>;
};

type GraphIndexes = {
  nodeById: Map<string, GraphNode>;
  nodeIdByPath: Map<string, string>;
  nodeIdBySlashPath: Map<string, string>;
  nodeIdByCssVar: Map<string, string>;
  inById: Map<string, string[]>;
};

function normalizeDepth(rawDepth: number | undefined): number {
  if (!Number.isFinite(rawDepth)) return DEFAULT_DEPTH;
  return Math.max(0, Math.min(MAX_DEPTH, Math.floor(rawDepth ?? DEFAULT_DEPTH)));
}

function buildRegistryIndexes(registry: TokenRegistry): RegistryIndexes {
  const byPath = new Map<string, RegistryToken>();
  const bySlashPath = new Map<string, RegistryToken>();
  const byCssVar = new Map<string, RegistryToken>();

  for (const entry of registry.entries ?? []) {
    if (entry.path && !byPath.has(entry.path)) byPath.set(entry.path, entry);
    if (entry.slashPath && !bySlashPath.has(entry.slashPath)) bySlashPath.set(entry.slashPath, entry);
    if (entry.cssVar && !byCssVar.has(entry.cssVar)) byCssVar.set(entry.cssVar, entry);
  }

  return { byPath, bySlashPath, byCssVar };
}

function buildGraphIndexes(graph: TokenGraphViz): GraphIndexes {
  const nodeById = new Map<string, GraphNode>();
  const nodeIdByPath = new Map<string, string>();
  const nodeIdBySlashPath = new Map<string, string>();
  const nodeIdByCssVar = new Map<string, string>();
  const inById = new Map<string, string[]>();

  for (const node of graph.nodes ?? []) {
    nodeById.set(node.id, node);
    if (node.path) nodeIdByPath.set(node.path, node.id);
    if (node.slashPath) nodeIdBySlashPath.set(node.slashPath, node.id);
    if (node.cssVar) nodeIdByCssVar.set(node.cssVar, node.id);
    inById.set(node.id, []);
  }

  for (const edge of graph.edges ?? []) {
    if (!inById.has(edge.target)) continue;
    inById.get(edge.target)!.push(edge.source);
  }

  return { nodeById, nodeIdByPath, nodeIdBySlashPath, nodeIdByCssVar, inById };
}

function resolveRegistryToken(indexes: RegistryIndexes, tokenRef: string): RegistryToken | null {
  const query = String(tokenRef || "").trim();
  if (!query) return null;
  return (
    indexes.byPath.get(query) ??
    indexes.bySlashPath.get(query) ??
    indexes.byCssVar.get(query) ??
    null
  );
}

function resolveNodeId(
  graphIndexes: GraphIndexes,
  tokenRef: string,
  resolvedToken: RegistryToken | null,
): string | null {
  if (resolvedToken) {
    return (
      graphIndexes.nodeIdByPath.get(resolvedToken.path) ??
      graphIndexes.nodeIdBySlashPath.get(resolvedToken.slashPath) ??
      graphIndexes.nodeIdByCssVar.get(resolvedToken.cssVar) ??
      null
    );
  }

  const query = String(tokenRef || "").trim();
  if (!query) return null;
  return (
    graphIndexes.nodeIdByPath.get(query) ??
    graphIndexes.nodeIdBySlashPath.get(query) ??
    graphIndexes.nodeIdByCssVar.get(query) ??
    null
  );
}

function collectDependents(graphIndexes: GraphIndexes, rootId: string, depth: number) {
  const visited = new Set<string>([rootId]);
  const levels = new Map<string, number>([[rootId, 0]]);
  const queue: Array<{ id: string; level: number }> = [{ id: rootId, level: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.level >= depth) continue;
    const dependents = graphIndexes.inById.get(current.id) ?? [];
    for (const dependentId of dependents) {
      if (!graphIndexes.nodeById.has(dependentId)) continue;
      if (visited.has(dependentId)) continue;
      visited.add(dependentId);
      const nextLevel = current.level + 1;
      levels.set(dependentId, nextLevel);
      queue.push({ id: dependentId, level: nextLevel });
    }
  }

  return { visited, levels };
}

function severityRank(severity: ImpactSeverity): number {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  if (severity === "medium") return 2;
  return 3;
}

function pickHigherSeverity(left: ImpactSeverity, right: ImpactSeverity): ImpactSeverity {
  return severityRank(left) <= severityRank(right) ? left : right;
}

function baseTokenSeverity(args: {
  depth: number;
  usageCount: number;
  highCoupling: boolean;
}): ImpactSeverity {
  if (args.highCoupling) return "high";
  if (args.usageCount >= 25) return "high";
  if (args.depth <= 1 && args.usageCount >= 8) return "high";
  if (args.depth <= 1) return "medium";
  if (args.usageCount >= 4) return "medium";
  return "low";
}

function requiredContrastRatio(level: "AA" | "AAA", textSize: "normal" | "large"): number {
  if (level === "AAA") return textSize === "large" ? 4.5 : 7;
  return textSize === "large" ? 3 : 4.5;
}

function normalizePair(pair: Partial<ImpactWcagPairConfig> | null | undefined): ImpactWcagPairConfig | null {
  if (!pair) return null;
  const foreground = String(pair.foreground || "").trim();
  const background = String(pair.background || "").trim();
  if (!foreground || !background) return null;
  const level = String(pair.level || "AA").trim().toUpperCase() === "AAA" ? "AAA" : "AA";
  const textSize =
    String(pair.textSize || "normal").trim().toLowerCase() === "large"
      ? "large"
      : "normal";
  return { foreground, background, level, textSize };
}

function resolveColorRefToHex(
  tokenRef: string,
  registryIndexes: RegistryIndexes,
  rootOverride: {
    rootCssVar: string;
    nextHex: string | null;
  },
): string | null {
  const raw = String(tokenRef || "").trim();
  if (!raw) return null;
  const directColor = normalizeToHex6(raw);
  if (directColor) return directColor;

  const token = resolveRegistryToken(registryIndexes, raw);
  if (!token) return null;
  return resolveTokenToHex(token, registryIndexes, rootOverride, new Set<string>());
}

function resolveTokenToHex(
  token: RegistryToken,
  registryIndexes: RegistryIndexes,
  rootOverride: {
    rootCssVar: string;
    nextHex: string | null;
  },
  visitedCssVars: Set<string>,
): string | null {
  if (token.cssVar === rootOverride.rootCssVar && rootOverride.nextHex) {
    return rootOverride.nextHex;
  }

  const asHex = normalizeToHex6(token.resolvedValue);
  if (asHex) return asHex;

  const match = String(token.resolvedValue || "").trim().match(CSS_VAR_ALIAS_RE);
  if (!match) return null;
  const cssVarRef = String(match[1] || "").trim();
  if (!cssVarRef) return null;
  if (cssVarRef === rootOverride.rootCssVar && rootOverride.nextHex) {
    return rootOverride.nextHex;
  }
  if (visitedCssVars.has(cssVarRef)) return null;
  visitedCssVars.add(cssVarRef);

  const next = registryIndexes.byCssVar.get(cssVarRef);
  if (!next) return null;
  return resolveTokenToHex(next, registryIndexes, rootOverride, visitedCssVars);
}

function resolveTokenFromAnyRef(
  ref: string,
  registryIndexes: RegistryIndexes,
): RegistryToken | null {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  if (CSS_VAR_RE.test(raw)) return registryIndexes.byCssVar.get(raw) ?? null;
  return resolveRegistryToken(registryIndexes, raw);
}

function usageEntryForToken(usageIndex: TokenUsageIndex, token: RegistryToken): TokenUsageEntry | null {
  return (
    usageIndex.byPath?.[token.path] ??
    usageIndex.bySlashPath?.[token.slashPath] ??
    usageIndex.byCssVar?.[token.cssVar] ??
    null
  );
}

function resolveComponentSlug(occurrence: TokenUsageOccurrence): string {
  const fromOwner = String(occurrence.owner || "").trim();
  if (fromOwner) return fromOwner;
  const source = String(occurrence.source || "");
  const match = source.match(/components\/([^/]+)\.ya?ml$/i);
  return match ? String(match[1] || "").trim() : "";
}

function severityAndRecommendation(args: {
  criticalTokens: number;
  highTokens: number;
  blastRadius: number;
  componentsCount: number;
  wcagRegressions: number;
}): { severity: ImpactSeverity; recommendation: ImpactRecommendation; score: number } {
  const score = Math.min(
    100,
    args.wcagRegressions * 30 +
      args.criticalTokens * 20 +
      args.highTokens * 8 +
      args.componentsCount * 3 +
      args.blastRadius,
  );

  if (args.wcagRegressions > 0 || args.criticalTokens > 0) {
    return { severity: "critical", recommendation: "do-not-proceed", score };
  }
  if (args.highTokens > 0 || args.componentsCount >= 12 || args.blastRadius >= 20) {
    return { severity: "high", recommendation: "review", score };
  }
  if (args.componentsCount >= 4 || args.blastRadius >= 8) {
    return { severity: "medium", recommendation: "review", score };
  }
  return { severity: "low", recommendation: "proceed", score };
}

export function computeImpactReport(args: {
  tokenPath: string;
  newValue?: string | null;
  depth?: number;
  tokenRegistry: TokenRegistry;
  tokenGraph: TokenGraphViz;
  tokenUsageIndex: TokenUsageIndex;
  tokenHealth: TokenHealthReport | null;
  componentRegistry: ComponentRegistry | null;
  wcagPairs?: ImpactWcagPairConfig[];
}): ImpactReport {
  const tokenQuery = String(args.tokenPath || "").trim();
  if (!tokenQuery) {
    throw new Error("tokenPath is required.");
  }

  const depth = normalizeDepth(args.depth);
  const registryIndexes = buildRegistryIndexes(args.tokenRegistry);
  const graphIndexes = buildGraphIndexes(args.tokenGraph);

  const rootToken = resolveRegistryToken(registryIndexes, tokenQuery);
  const rootNodeId = resolveNodeId(graphIndexes, tokenQuery, rootToken);

  if (!rootToken) {
    throw new Error(`Token '${tokenQuery}' not found in token-registry.`);
  }
  if (!rootNodeId) {
    throw new Error(`Token '${tokenQuery}' not found in token-graph.`);
  }

  const normalizedNewValue = args.newValue ? normalizeToHex6(String(args.newValue)) : null;
  if (args.newValue && !normalizedNewValue) {
    throw new Error(`newValue '${args.newValue}' is not a valid CSS color.`);
  }

  const dependents = collectDependents(graphIndexes, rootNodeId, depth);
  const highCouplingPaths = new Set(
    (args.tokenHealth?.high_coupling_tokens?.items ?? []).map((item) => item.path),
  );

  const affectedTokens: ImpactToken[] = [];
  const affectedPathSet = new Set<string>();

  for (const nodeId of dependents.visited) {
    const graphNode = graphIndexes.nodeById.get(nodeId);
    if (!graphNode) continue;
    const registryEntry =
      resolveRegistryToken(registryIndexes, graphNode.path) ??
      resolveRegistryToken(registryIndexes, graphNode.slashPath) ??
      resolveRegistryToken(registryIndexes, graphNode.cssVar) ??
      rootToken;
    if (!registryEntry) continue;

    const usageEntry = usageEntryForToken(args.tokenUsageIndex, registryEntry);
    const usageCount = usageEntry?.usageCount ?? 0;
    const level = dependents.levels.get(nodeId) ?? 0;
    const reasons: string[] = [];

    if (level === 0) reasons.push("Selected token");
    else if (level === 1) reasons.push("Direct dependent");
    else reasons.push(`Transitive dependent (depth ${level})`);

    if (usageCount > 0) reasons.push(`Used in ${usageCount} place${usageCount === 1 ? "" : "s"}`);
    if (highCouplingPaths.has(registryEntry.path)) reasons.push("High coupling token");
    if (usageCount >= 25) reasons.push("High usage token");

    affectedPathSet.add(registryEntry.path);

    affectedTokens.push({
      id: graphNode.id,
      path: registryEntry.path,
      slashPath: registryEntry.slashPath,
      cssVar: registryEntry.cssVar,
      type: registryEntry.type,
      collection: registryEntry.collection,
      resolvedValue: registryEntry.resolvedValue,
      depth: level,
      usageCount,
      severity: baseTokenSeverity({
        depth: level,
        usageCount,
        highCoupling: highCouplingPaths.has(registryEntry.path),
      }),
      reasons,
    });
  }

  affectedTokens.sort((left, right) => {
    const byDepth = left.depth - right.depth;
    if (byDepth !== 0) return byDepth;
    const byUsage = right.usageCount - left.usageCount;
    if (byUsage !== 0) return byUsage;
    return left.path.localeCompare(right.path, "en", { sensitivity: "base" });
  });

  const normalizedPairs = (args.wcagPairs ?? []).map(normalizePair).filter(Boolean) as ImpactWcagPairConfig[];
  const wcagSimulation: ImpactWcagSimulation[] = [];
  const wcagRegressionTokenPaths = new Set<string>();
  const rootOverride = {
    rootCssVar: rootToken.cssVar,
    nextHex: normalizedNewValue,
  };

  for (const pair of normalizedPairs) {
    const fgToken = resolveTokenFromAnyRef(pair.foreground, registryIndexes);
    const bgToken = resolveTokenFromAnyRef(pair.background, registryIndexes);

    const pairTouchesAffected =
      (fgToken ? affectedPathSet.has(fgToken.path) : false) ||
      (bgToken ? affectedPathSet.has(bgToken.path) : false) ||
      pair.foreground === rootToken.path ||
      pair.foreground === rootToken.slashPath ||
      pair.foreground === rootToken.cssVar ||
      pair.background === rootToken.path ||
      pair.background === rootToken.slashPath ||
      pair.background === rootToken.cssVar;

    if (!pairTouchesAffected) continue;

    const originalForegroundHex = resolveColorRefToHex(
      pair.foreground,
      registryIndexes,
      { rootCssVar: rootToken.cssVar, nextHex: null },
    );
    const originalBackgroundHex = resolveColorRefToHex(
      pair.background,
      registryIndexes,
      { rootCssVar: rootToken.cssVar, nextHex: null },
    );
    if (!originalForegroundHex || !originalBackgroundHex) continue;

    const requiredRatio = requiredContrastRatio(pair.level, pair.textSize);
    const originalRatio = computeContrastRatio(originalBackgroundHex, originalForegroundHex);
    const originalPass = originalRatio >= requiredRatio;

    const simulatedForegroundHex = resolveColorRefToHex(pair.foreground, registryIndexes, rootOverride);
    const simulatedBackgroundHex = resolveColorRefToHex(pair.background, registryIndexes, rootOverride);
    const simulatedRatio =
      normalizedNewValue && simulatedForegroundHex && simulatedBackgroundHex
        ? computeContrastRatio(simulatedBackgroundHex, simulatedForegroundHex)
        : null;
    const simulatedPass = simulatedRatio === null ? null : simulatedRatio >= requiredRatio;
    const regression = originalPass && simulatedPass === false;

    if (regression) {
      if (fgToken) wcagRegressionTokenPaths.add(fgToken.path);
      if (bgToken) wcagRegressionTokenPaths.add(bgToken.path);
    }

    wcagSimulation.push({
      foreground: pair.foreground,
      background: pair.background,
      level: pair.level,
      textSize: pair.textSize,
      requiredRatio,
      originalRatio,
      simulatedRatio,
      originalPass,
      simulatedPass,
      regression,
      foregroundHex: originalForegroundHex,
      backgroundHex: originalBackgroundHex,
      simulatedForegroundHex: simulatedForegroundHex ?? null,
      simulatedBackgroundHex: simulatedBackgroundHex ?? null,
    });
  }

  for (const token of affectedTokens) {
    if (!wcagRegressionTokenPaths.has(token.path)) continue;
    token.severity = "critical";
    token.reasons = Array.from(new Set([...token.reasons, "WCAG regression risk"]));
  }

  affectedTokens.sort((left, right) => {
    const bySeverity = severityRank(left.severity) - severityRank(right.severity);
    if (bySeverity !== 0) return bySeverity;
    const byDepth = left.depth - right.depth;
    if (byDepth !== 0) return byDepth;
    const byUsage = right.usageCount - left.usageCount;
    if (byUsage !== 0) return byUsage;
    return left.path.localeCompare(right.path, "en", { sensitivity: "base" });
  });

  const componentBySlug = new Map(
    (args.componentRegistry?.components ?? []).map((component) => [component.slug, component] as const),
  );
  const tokenByPath = new Map(affectedTokens.map((item) => [item.path, item] as const));
  const componentRows = new Map<
    string,
    {
      slug: string;
      displayName: string;
      pipelineStage: string;
      affectedTokenPaths: Set<string>;
      affectedProperties: Set<string>;
      occurrences: number;
      severity: ImpactSeverity;
      visualProofAvailable: boolean;
    }
  >();

  for (const token of affectedTokens) {
    const usageEntry = args.tokenUsageIndex.byPath?.[token.path];
    if (!usageEntry?.usedIn?.length) continue;
    for (const occurrence of usageEntry.usedIn) {
      if (occurrence.kind !== "component-spec") continue;
      const slug = resolveComponentSlug(occurrence);
      if (!slug) continue;
      const component = componentBySlug.get(slug);
      const current = componentRows.get(slug) ?? {
        slug,
        displayName: component?.display_name ?? slug,
        pipelineStage: component?.pipeline_stage ?? "unknown",
        affectedTokenPaths: new Set<string>(),
        affectedProperties: new Set<string>(),
        occurrences: 0,
        severity: "low" as ImpactSeverity,
        visualProofAvailable: Boolean(component?.visual_proof?.exists),
      };
      current.affectedTokenPaths.add(token.path);
      if (occurrence.detail) current.affectedProperties.add(occurrence.detail);
      current.occurrences += 1;
      current.severity = pickHigherSeverity(current.severity, token.severity);
      componentRows.set(slug, current);
    }
  }

  const affectedComponents: ImpactComponent[] = Array.from(componentRows.values())
    .map((component) => ({
      slug: component.slug,
      displayName: component.displayName,
      pipelineStage: component.pipelineStage,
      affectedTokenPaths: Array.from(component.affectedTokenPaths).sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" }),
      ),
      affectedProperties: Array.from(component.affectedProperties).sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" }),
      ),
      occurrences: component.occurrences,
      severity: component.severity,
      visualProofAvailable: component.visualProofAvailable,
    }))
    .sort((left, right) => {
      const bySeverity = severityRank(left.severity) - severityRank(right.severity);
      if (bySeverity !== 0) return bySeverity;
      const byOccurrences = right.occurrences - left.occurrences;
      if (byOccurrences !== 0) return byOccurrences;
      return left.displayName.localeCompare(right.displayName, "en", { sensitivity: "base" });
    });

  const criticalTokens = affectedTokens.filter((token) => token.severity === "critical").length;
  const highTokens = affectedTokens.filter((token) => token.severity === "high").length;
  const wcagRegressions = wcagSimulation.filter((row) => row.regression).length;
  const directDependents = affectedTokens.filter((token) => token.depth === 1).length;
  const transitiveDependents = affectedTokens.filter((token) => token.depth > 1).length;
  const usageTotal = affectedTokens.reduce((total, token) => total + token.usageCount, 0);
  const blastRadius = Math.max(0, affectedTokens.length - 1);
  const scoreMeta = severityAndRecommendation({
    criticalTokens,
    highTokens,
    blastRadius,
    componentsCount: affectedComponents.length,
    wcagRegressions,
  });

  return {
    ok: true,
    query: {
      tokenPath: tokenQuery,
      newValue: normalizedNewValue,
      depth,
    },
    rootToken: {
      path: rootToken.path,
      slashPath: rootToken.slashPath,
      cssVar: rootToken.cssVar,
      type: rootToken.type,
      collection: rootToken.collection,
      resolvedValue: rootToken.resolvedValue,
      simulatedResolvedValue: normalizedNewValue,
    },
    affectedTokens,
    affectedComponents,
    wcagSimulation,
    summary: {
      severity: scoreMeta.severity,
      severityScore: scoreMeta.score,
      recommendation: scoreMeta.recommendation,
      blastRadius,
      affectedTokens: affectedTokens.length,
      directDependents,
      transitiveDependents,
      affectedComponents: affectedComponents.length,
      affectedUsages: usageTotal,
      wcagRegressions,
    },
    generatedAt: new Date().toISOString(),
  };
}

