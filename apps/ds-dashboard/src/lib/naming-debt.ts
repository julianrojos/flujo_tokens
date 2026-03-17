import type {
  NamingDebtCategory,
  NamingDebtFixType,
  NamingDebtRenameProposal,
  NamingDebtReport,
  NamingDebtRiskLevel,
  NamingDebtSeverity,
  NamingDebtViolation,
} from "../types/naming-debt";
import type { TokenGraphViz } from "../types/token-graph";
import type { TokenRegistry } from "../types/token-registry";
import type { TokenUsageIndex } from "../types/token-usage-index";

type RegistryToken = TokenRegistry["entries"][number];

export type NamingDebtScopeMode = "global" | "collection" | "collection-type";

export interface NamingDebtConfigInput {
  ambiguousAbbreviations?: Record<string, string>;
  genericTerminalSegments?: string[];
  synonymGroups?: string[][];
  maxPathDepth?: number;
  ignoreCollections?: string[];
  scopeMode?: NamingDebtScopeMode;
  severityWeights?: Partial<Record<NamingDebtSeverity, number>>;
  riskThresholds?: {
    mediumImpact?: number;
    highImpact?: number;
    mediumSpecs?: number;
    highSpecs?: number;
  };
}

type NamingDebtConfig = {
  ambiguousAbbreviations: Map<string, string>;
  genericTerminalSegments: Set<string>;
  synonymGroups: string[][];
  maxPathDepth: number;
  ignoreCollections: Set<string>;
  scopeMode: NamingDebtScopeMode;
  severityWeights: Record<NamingDebtSeverity, number>;
  riskThresholds: {
    mediumImpact: number;
    highImpact: number;
    mediumSpecs: number;
    highSpecs: number;
  };
};

const DEFAULT_RISK_THRESHOLDS = {
  mediumImpact: 8,
  highImpact: 25,
  mediumSpecs: 4,
  highSpecs: 10,
} as const;

const DEFAULT_CONFIG: Required<NamingDebtConfigInput> = {
  ambiguousAbbreviations: {
    bg: "background",
    fg: "foreground",
    btn: "button",
    lbl: "label",
    txt: "text",
    nav: "navigation",
    clr: "color",
  },
  genericTerminalSegments: ["base", "default", "value", "token", "item", "misc", "general"],
  synonymGroups: [
    ["background", "bg", "surface", "fill"],
    ["foreground", "fg", "text", "content"],
    ["border", "outline", "stroke", "divider"],
    ["primary", "brand", "main", "default"],
    ["small", "sm", "compact", "xs"],
  ],
  maxPathDepth: 7,
  ignoreCollections: [],
  scopeMode: "collection-type",
  severityWeights: { error: 10, warning: 4, info: 1 },
  riskThresholds: DEFAULT_RISK_THRESHOLDS,
};

type NamingRuleResult = {
  category: NamingDebtCategory;
  severity: NamingDebtSeverity;
  message: string;
  evidence?: string[];
  fix?: NamingDebtFixType;
  confidence?: number;
  suggestedPath?: string;
  suggestedSlashPath?: string;
  rationale?: string;
};

type NamingRule = {
  id: string;
  check: (token: RegistryToken, context: NamingRuleContext) => NamingRuleResult | null;
};

type NamingRuleContext = {
  config: NamingDebtConfig;
  synonymVariantsByScope: Map<string, Set<string>>;
  synonymCanonicalByVariant: Map<string, string>;
  synonymGroupIndexByVariant: Map<string, number>;
};

function normalizeTerm(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitPath(pathValue: string) {
  return String(pathValue || "")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitSlashPath(slashPath: string) {
  return String(slashPath || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function applyCasePattern(sourceSegment: string, replacement: string) {
  if (!sourceSegment) return replacement;
  if (/^[A-Z0-9_-]+$/.test(sourceSegment)) {
    return replacement.toUpperCase();
  }
  if (/^[A-Z]/.test(sourceSegment)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function replaceSegmentPreservingPath(
  token: RegistryToken,
  replaceAtIndex: number,
  nextSegment: string,
) {
  const pathSegments = splitPath(token.path);
  const slashSegments = splitSlashPath(token.slashPath);
  if (replaceAtIndex < 0 || replaceAtIndex >= pathSegments.length) return null;

  const currentPathSegment = pathSegments[replaceAtIndex];
  pathSegments[replaceAtIndex] = applyCasePattern(currentPathSegment, nextSegment);

  const slashIndex = Math.max(0, replaceAtIndex - 1);
  if (slashIndex < slashSegments.length) {
    const currentSlashSegment = slashSegments[slashIndex];
    slashSegments[slashIndex] = applyCasePattern(currentSlashSegment, nextSegment);
  }

  return {
    suggestedPath: pathSegments.join("."),
    suggestedSlashPath: slashSegments.join("/"),
  };
}

function mergeConfig(input?: NamingDebtConfigInput): NamingDebtConfig {
  const mergedAbbreviations = {
    ...DEFAULT_CONFIG.ambiguousAbbreviations,
    ...(input?.ambiguousAbbreviations || {}),
  };
  const mergedGenericTerminals = [
    ...DEFAULT_CONFIG.genericTerminalSegments,
    ...(input?.genericTerminalSegments || []),
  ];
  const synonymGroups =
    input?.synonymGroups && input.synonymGroups.length > 0
      ? input.synonymGroups
      : DEFAULT_CONFIG.synonymGroups;

  const severityWeights = {
    ...DEFAULT_CONFIG.severityWeights,
    ...(input?.severityWeights || {}),
  } as Record<NamingDebtSeverity, number>;

  const riskThresholds = {
    ...DEFAULT_CONFIG.riskThresholds,
    ...(input?.riskThresholds || {}),
  };

  return {
    ambiguousAbbreviations: new Map(
      Object.entries(mergedAbbreviations).map(([key, value]) => [
        normalizeTerm(key),
        normalizeTerm(value),
      ]),
    ),
    genericTerminalSegments: new Set(
      mergedGenericTerminals.map((item) => normalizeTerm(item)).filter(Boolean),
    ),
    synonymGroups: synonymGroups
      .map((group) => group.map((variant) => normalizeTerm(variant)).filter(Boolean))
      .filter((group) => group.length > 0),
    maxPathDepth: Math.max(2, Math.floor(input?.maxPathDepth ?? DEFAULT_CONFIG.maxPathDepth)),
    ignoreCollections: new Set(
      (input?.ignoreCollections ?? DEFAULT_CONFIG.ignoreCollections)
        .map((collection) => String(collection || "").trim())
        .filter(Boolean),
    ),
    scopeMode: input?.scopeMode ?? DEFAULT_CONFIG.scopeMode,
    severityWeights,
    riskThresholds: {
      mediumImpact: Math.max(
        1,
        Math.floor(riskThresholds.mediumImpact ?? DEFAULT_RISK_THRESHOLDS.mediumImpact),
      ),
      highImpact: Math.max(
        2,
        Math.floor(riskThresholds.highImpact ?? DEFAULT_RISK_THRESHOLDS.highImpact),
      ),
      mediumSpecs: Math.max(
        1,
        Math.floor(riskThresholds.mediumSpecs ?? DEFAULT_RISK_THRESHOLDS.mediumSpecs),
      ),
      highSpecs: Math.max(
        2,
        Math.floor(riskThresholds.highSpecs ?? DEFAULT_RISK_THRESHOLDS.highSpecs),
      ),
    },
  };
}

function buildSynonymIndexes(config: NamingDebtConfig) {
  const synonymCanonicalByVariant = new Map<string, string>();
  const synonymGroupIndexByVariant = new Map<string, number>();

  config.synonymGroups.forEach((group, groupIndex) => {
    const canonical = group[0];
    for (const variant of group) {
      synonymCanonicalByVariant.set(variant, canonical);
      synonymGroupIndexByVariant.set(variant, groupIndex);
    }
  });

  return {
    synonymCanonicalByVariant,
    synonymGroupIndexByVariant,
  };
}

function buildSynonymScopeMap(tokens: RegistryToken[], context: NamingRuleContext) {
  const byScope = new Map<string, Set<string>>();
  for (const token of tokens) {
    const segments = splitPath(token.path);
    for (let index = 1; index < segments.length; index += 1) {
      const variant = normalizeTerm(segments[index]);
      const groupIndex = context.synonymGroupIndexByVariant.get(variant);
      if (groupIndex === undefined) continue;

      const keyBase = `${groupIndex}:${index}`;
      const scope =
        context.config.scopeMode === "global"
          ? keyBase
          : context.config.scopeMode === "collection"
            ? `${token.collection}:${keyBase}`
            : `${token.collection}:${token.type}:${keyBase}`;
      if (!byScope.has(scope)) byScope.set(scope, new Set());
      byScope.get(scope)!.add(variant);
    }
  }
  return byScope;
}

function buildGraphDependentsIndex(graph: TokenGraphViz | null | undefined) {
  if (!graph) return new Map<string, number>();

  const inById = new Map<string, string[]>();
  for (const node of graph.nodes || []) {
    inById.set(node.id, []);
  }
  for (const edge of graph.edges || []) {
    if (!inById.has(edge.target)) continue;
    inById.get(edge.target)!.push(edge.source);
  }

  const dependentsCountByPath = new Map<string, number>();
  for (const node of graph.nodes || []) {
    const visited = new Set<string>([node.id]);
    const queue = [node.id];
    while (queue.length > 0) {
      const nextId = queue.shift()!;
      const dependents = inById.get(nextId) || [];
      for (const dependentId of dependents) {
        if (visited.has(dependentId)) continue;
        visited.add(dependentId);
        queue.push(dependentId);
      }
    }
    dependentsCountByPath.set(node.path, Math.max(0, visited.size - 1));
  }

  return dependentsCountByPath;
}

function toRiskLevel(args: {
  directRefs: number;
  transitiveRefs: number;
  affectedSpecs: number;
  config: NamingDebtConfig;
}) {
  const totalImpact = args.directRefs + args.transitiveRefs;
  if (totalImpact === 0) return "safe" as const;
  if (
    totalImpact >= args.config.riskThresholds.highImpact ||
    args.affectedSpecs >= args.config.riskThresholds.highSpecs
  ) {
    return "high" as const;
  }
  if (
    totalImpact >= args.config.riskThresholds.mediumImpact ||
    args.affectedSpecs >= args.config.riskThresholds.mediumSpecs
  ) {
    return "medium" as const;
  }
  return "low" as const;
}

function effortByRisk(riskLevel: NamingDebtRiskLevel) {
  if (riskLevel === "safe" || riskLevel === "low") return "quick_win" as const;
  if (riskLevel === "medium") return "requires_planning" as const;
  return "breaking" as const;
}

function createRules(): NamingRule[] {
  return [
    {
      id: "mixed-separators",
      check: (token) => {
        const segments = splitPath(token.path);
        for (let index = 1; index < segments.length; index += 1) {
          const segment = segments[index];
          if (!segment.includes("_")) continue;
          const replacement = segment.replace(/_+/g, "-");
          const suggested = replaceSegmentPreservingPath(token, index, replacement);
          return {
            category: "casing",
            severity: "warning",
            message:
              "Segment contains underscore separators; normalize separator style for better consistency.",
            evidence: [segment],
            fix: suggested ? "auto" : "manual",
            confidence: 0.95,
            suggestedPath: suggested?.suggestedPath,
            suggestedSlashPath: suggested?.suggestedSlashPath,
            rationale: "Normalize separator style for deterministic naming.",
          };
        }
        return null;
      },
    },
    {
      id: "ambiguous-abbreviation",
      check: (token, context) => {
        const segments = splitPath(token.path);
        for (let index = 1; index < segments.length; index += 1) {
          const normalized = normalizeTerm(segments[index]);
          const canonical = context.config.ambiguousAbbreviations.get(normalized);
          if (!canonical) continue;
          const suggested = replaceSegmentPreservingPath(token, index, canonical);
          return {
            category: "vocabulary",
            severity: "warning",
            message: `Ambiguous abbreviation '${segments[index]}' detected. Prefer '${canonical}'.`,
            evidence: [segments[index]],
            fix: suggested ? "auto" : "manual",
            confidence: 0.9,
            suggestedPath: suggested?.suggestedPath,
            suggestedSlashPath: suggested?.suggestedSlashPath,
            rationale: "Expand abbreviations to improve semantic clarity.",
          };
        }
        return null;
      },
    },
    {
      id: "generic-terminal",
      check: (token, context) => {
        const segments = splitPath(token.path);
        if (segments.length < 2) return null;
        const terminal = normalizeTerm(segments[segments.length - 1]);
        if (!context.config.genericTerminalSegments.has(terminal)) return null;
        return {
          category: "vocabulary",
          severity: "info",
          message: `Generic terminal segment '${segments[segments.length - 1]}' can hide intent.`,
          evidence: [segments[segments.length - 1]],
          fix: "manual",
          confidence: 0.7,
          rationale: "Use a more descriptive terminal segment when possible.",
        };
      },
    },
    {
      id: "path-depth-outlier",
      check: (token, context) => {
        const depth = splitPath(token.path).length;
        if (depth <= context.config.maxPathDepth) return null;
        return {
          category: "structure",
          severity: "info",
          message: `Path depth is ${depth} segments (threshold ${context.config.maxPathDepth}).`,
          evidence: [String(depth)],
          fix: "manual",
          confidence: 0.65,
          rationale: "Deep token paths tend to increase cognitive load and maintenance cost.",
        };
      },
    },
    {
      id: "synonym-inconsistency",
      check: (token, context) => {
        const segments = splitPath(token.path);
        for (let index = 1; index < segments.length; index += 1) {
          const variant = normalizeTerm(segments[index]);
          const groupIndex = context.synonymGroupIndexByVariant.get(variant);
          if (groupIndex === undefined) continue;
          const scopeBase = `${groupIndex}:${index}`;
          const scope =
            context.config.scopeMode === "global"
              ? scopeBase
              : context.config.scopeMode === "collection"
                ? `${token.collection}:${scopeBase}`
                : `${token.collection}:${token.type}:${scopeBase}`;
          const variantsInScope = context.synonymVariantsByScope.get(scope);
          if (!variantsInScope || variantsInScope.size <= 1) continue;
          const canonical = context.synonymCanonicalByVariant.get(variant);
          if (!canonical || canonical === variant) continue;
          const suggested = replaceSegmentPreservingPath(token, index, canonical);
          return {
            category: "consistency",
            severity: "warning",
            message: `Inconsistent synonym usage in the same scope. Prefer '${canonical}' over '${segments[index]}'.`,
            evidence: Array.from(variantsInScope).sort((left, right) =>
              left.localeCompare(right),
            ),
            fix: "manual",
            confidence: 0.8,
            suggestedPath: suggested?.suggestedPath,
            suggestedSlashPath: suggested?.suggestedSlashPath,
            rationale: "Normalize vocabulary inside the same semantic scope.",
          };
        }
        return null;
      },
    },
  ];
}

export function analyzeNamingDebt(args: {
  tokenRegistry: TokenRegistry;
  tokenUsageIndex?: TokenUsageIndex | null;
  tokenGraph?: TokenGraphViz | null;
  config?: NamingDebtConfigInput;
}): NamingDebtReport {
  const config = mergeConfig(args.config);
  const { synonymCanonicalByVariant, synonymGroupIndexByVariant } = buildSynonymIndexes(config);

  const allTokens = args.tokenRegistry.entries || [];
  const tokens = allTokens.filter(
    (token) => !config.ignoreCollections.has(String(token.collection || "").trim()),
  );

  const context: NamingRuleContext = {
    config,
    synonymCanonicalByVariant,
    synonymGroupIndexByVariant,
    synonymVariantsByScope: new Map<string, Set<string>>(),
  };
  context.synonymVariantsByScope = buildSynonymScopeMap(tokens, context);
  const rules = createRules();

  const violations: NamingDebtViolation[] = [];
  const proposalSeed: Array<{
    currentPath: string;
    currentSlashPath: string;
    suggestedPath: string;
    suggestedSlashPath: string;
    rationale: string;
    category: NamingDebtCategory;
    fix: Exclude<NamingDebtFixType, "none">;
    confidence: number;
  }> = [];

  for (const token of tokens) {
    for (const rule of rules) {
      const outcome = rule.check(token, context);
      if (!outcome) continue;

      let proposalIndex: number | null = null;
      const canPropose = Boolean(outcome.suggestedPath && outcome.suggestedPath !== token.path);
      if (canPropose && outcome.fix && outcome.fix !== "none") {
        proposalIndex = proposalSeed.length;
        proposalSeed.push({
          currentPath: token.path,
          currentSlashPath: token.slashPath,
          suggestedPath: outcome.suggestedPath!,
          suggestedSlashPath: outcome.suggestedSlashPath || token.slashPath,
          rationale: outcome.rationale || outcome.message,
          category: outcome.category,
          fix: outcome.fix as Exclude<NamingDebtFixType, "none">,
          confidence: outcome.confidence ?? 0.75,
        });
      }

      violations.push({
        tokenPath: token.path,
        tokenSlashPath: token.slashPath,
        collection: token.collection,
        type: token.type,
        ruleId: rule.id,
        category: outcome.category,
        severity: outcome.severity,
        message: outcome.message,
        evidence: outcome.evidence || [],
        fix: outcome.fix || "none",
        confidence: outcome.confidence ?? 0.75,
        suggestedPath: outcome.suggestedPath || null,
        suggestedSlashPath: outcome.suggestedSlashPath || null,
        proposalIndex,
      });
    }
  }

  const usageByPath = args.tokenUsageIndex?.byPath || {};
  const dependentsByPath = buildGraphDependentsIndex(args.tokenGraph || null);

  const proposalsByKey = new Map<string, NamingDebtRenameProposal>();
  for (const proposal of proposalSeed) {
    if (proposal.currentPath === proposal.suggestedPath) continue;
    const key = `${proposal.currentPath}=>${proposal.suggestedPath}`;
    if (proposalsByKey.has(key)) continue;

    const usageEntry = usageByPath[proposal.currentPath];
    const directRefs = usageEntry?.usageCount ?? 0;
    const transitiveRefs = dependentsByPath.get(proposal.currentPath) ?? 0;

    const affectedSpecs = Array.from(
      new Set(
        (usageEntry?.usedIn || [])
          .filter((occurrence) => occurrence.kind === "component-spec")
          .map((occurrence) => occurrence.owner)
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));

    const affectedCssFiles = Array.from(
      new Set(
        (usageEntry?.usedIn || [])
          .filter((occurrence) => occurrence.kind === "css-alias")
          .map((occurrence) => occurrence.source)
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));

    const riskLevel = toRiskLevel({
      directRefs,
      transitiveRefs,
      affectedSpecs: affectedSpecs.length,
      config,
    });
    const breakingChange = affectedCssFiles.length > 0 || transitiveRefs > 0;

    proposalsByKey.set(key, {
      currentPath: proposal.currentPath,
      currentSlashPath: proposal.currentSlashPath,
      suggestedPath: proposal.suggestedPath,
      suggestedSlashPath: proposal.suggestedSlashPath,
      rationale: proposal.rationale,
      category: proposal.category,
      fix: proposal.fix,
      confidence: proposal.confidence,
      directRefs,
      transitiveRefs,
      affectedSpecs,
      affectedCssFiles,
      riskLevel,
      breakingChange,
      effort: effortByRisk(riskLevel),
    });
  }

  const renameProposals = Array.from(proposalsByKey.values()).sort((left, right) => {
    const riskRank: Record<NamingDebtRiskLevel, number> = {
      safe: 0,
      low: 1,
      medium: 2,
      high: 3,
    };
    const byRisk = riskRank[left.riskLevel] - riskRank[right.riskLevel];
    if (byRisk !== 0) return byRisk;
    const byRefs =
      left.directRefs + left.transitiveRefs - (right.directRefs + right.transitiveRefs);
    if (byRefs !== 0) return byRefs;
    return left.currentPath.localeCompare(right.currentPath, "en", { sensitivity: "base" });
  });

  const proposalIndexByKey = new Map<string, number>();
  renameProposals.forEach((proposal, index) => {
    proposalIndexByKey.set(`${proposal.currentPath}=>${proposal.suggestedPath}`, index);
  });

  const normalizedViolations = violations
    .map((violation) => {
      if (!violation.suggestedPath) return violation;
      const key = `${violation.tokenPath}=>${violation.suggestedPath}`;
      return {
        ...violation,
        proposalIndex: proposalIndexByKey.has(key)
          ? (proposalIndexByKey.get(key) as number)
          : null,
      };
    })
    .sort((left, right) => {
      const severityRank: Record<NamingDebtSeverity, number> = {
        error: 0,
        warning: 1,
        info: 2,
      };
      const bySeverity = severityRank[left.severity] - severityRank[right.severity];
      if (bySeverity !== 0) return bySeverity;
      const byCollection = left.collection.localeCompare(right.collection, "en", {
        sensitivity: "base",
      });
      if (byCollection !== 0) return byCollection;
      const byPath = left.tokenPath.localeCompare(right.tokenPath, "en", {
        sensitivity: "base",
      });
      if (byPath !== 0) return byPath;
      return left.ruleId.localeCompare(right.ruleId, "en", { sensitivity: "base" });
    });

  const tokenCountByCollection = new Map<string, number>();
  const issueCountByCollection = new Map<
    string,
    { error: number; warning: number; info: number; tokensWithIssues: Set<string> }
  >();

  for (const token of tokens) {
    tokenCountByCollection.set(
      token.collection,
      (tokenCountByCollection.get(token.collection) ?? 0) + 1,
    );
  }

  for (const violation of normalizedViolations) {
    if (!issueCountByCollection.has(violation.collection)) {
      issueCountByCollection.set(violation.collection, {
        error: 0,
        warning: 0,
        info: 0,
        tokensWithIssues: new Set<string>(),
      });
    }
    const scope = issueCountByCollection.get(violation.collection)!;
    scope[violation.severity] += 1;
    scope.tokensWithIssues.add(violation.tokenPath);
  }

  const scoreByCollection: NamingDebtReport["scoreByCollection"] = {};
  for (const [collection, totalTokens] of Array.from(tokenCountByCollection.entries()).sort(
    ([left], [right]) => left.localeCompare(right, "en", { sensitivity: "base" }),
  )) {
    const issues = issueCountByCollection.get(collection) || {
      error: 0,
      warning: 0,
      info: 0,
      tokensWithIssues: new Set<string>(),
    };
    const debtPoints =
      issues.error * config.severityWeights.error +
      issues.warning * config.severityWeights.warning +
      issues.info * config.severityWeights.info;
    const maxPoints = Math.max(1, totalTokens * config.severityWeights.error);
    const score = Math.max(0, Math.round(100 - (debtPoints / maxPoints) * 100));
    const cleanPercent = Math.round(
      ((totalTokens - issues.tokensWithIssues.size) / Math.max(1, totalTokens)) * 100,
    );
    scoreByCollection[collection] = {
      collection,
      totalTokens,
      score,
      cleanPercent,
      issuesBySeverity: {
        error: issues.error,
        warning: issues.warning,
        info: issues.info,
      },
    };
  }

  const issuesBySeverity = normalizedViolations.reduce(
    (acc, violation) => {
      acc[violation.severity] += 1;
      return acc;
    },
    { error: 0, warning: 0, info: 0 } as Record<NamingDebtSeverity, number>,
  );

  const overallDebtPoints =
    issuesBySeverity.error * config.severityWeights.error +
    issuesBySeverity.warning * config.severityWeights.warning +
    issuesBySeverity.info * config.severityWeights.info;
  const overallMaxPoints = Math.max(1, tokens.length * config.severityWeights.error);
  const overallScore = Math.max(
    0,
    Math.round(100 - (overallDebtPoints / overallMaxPoints) * 100),
  );

  const quickWins = renameProposals
    .filter((proposal) => proposal.effort === "quick_win")
    .map((proposal) => proposal.currentPath);
  const requiresPlanning = renameProposals
    .filter((proposal) => proposal.effort !== "quick_win")
    .map((proposal) => proposal.currentPath);

  const renamePlan = renameProposals.map((proposal, index) => ({
    step: index + 1,
    currentPath: proposal.currentPath,
    suggestedPath: proposal.suggestedPath,
    category: proposal.category,
    fix: proposal.fix,
    riskLevel: proposal.riskLevel,
    affectedFiles: Array.from(new Set([...proposal.affectedSpecs, ...proposal.affectedCssFiles])),
  }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      totalTokens: tokens.length,
      totalViolations: normalizedViolations.length,
      issuesBySeverity,
      autoFixable: renameProposals.filter((proposal) => proposal.fix === "auto").length,
      manualReview: renameProposals.filter((proposal) => proposal.fix === "manual").length,
      overallScore,
      collectionsWithDebt: Object.values(scoreByCollection).filter(
        (item) =>
          item.issuesBySeverity.error +
            item.issuesBySeverity.warning +
            item.issuesBySeverity.info >
          0,
      ).length,
    },
    scoreByCollection,
    violations: normalizedViolations,
    renameProposals,
    quickWins,
    requiresPlanning,
    renamePlan,
  };
}
