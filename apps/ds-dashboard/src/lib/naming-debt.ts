import type { NamingDebtCategory, NamingDebtFixType, NamingDebtReport, NamingDebtRenameProposal, NamingDebtRiskLevel, NamingDebtSeverity, NamingDebtViolation } from "../types/naming-debt";
import type { TokenGraphViz } from "../types/token-graph";
import type { TokenRegistry } from "../types/token-registry";
import type { TokenUsageIndex } from "../types/token-usage-index";

type RegistryToken = TokenRegistry["entries"][number];

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
  synonymVariantsByScope: Map<string, Set<string>>;
};

const AMBIGUOUS_ABBREVIATIONS = new Map<string, string>([
  ["bg", "background"],
  ["fg", "foreground"],
  ["btn", "button"],
  ["lbl", "label"],
  ["txt", "text"],
  ["nav", "navigation"],
  ["clr", "color"],
  ["iconbtn", "icon_button"],
]);

const GENERIC_TERMINAL_SEGMENTS = new Set([
  "base",
  "default",
  "value",
  "token",
  "item",
  "misc",
  "general",
]);

const SYNONYM_GROUPS = [
  ["background", "bg", "surface", "fill"],
  ["foreground", "fg", "text", "content"],
  ["border", "outline", "stroke", "divider"],
  ["primary", "brand", "main", "default"],
  ["small", "sm", "compact", "xs"],
] as const;

const SYNONYM_CANONICAL = new Map<string, string>();
const SYNONYM_GROUP_INDEX = new Map<string, number>();
for (let groupIndex = 0; groupIndex < SYNONYM_GROUPS.length; groupIndex += 1) {
  const group = SYNONYM_GROUPS[groupIndex];
  const canonical = group[0];
  for (const variant of group) {
    SYNONYM_CANONICAL.set(variant, canonical);
    SYNONYM_GROUP_INDEX.set(variant, groupIndex);
  }
}

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

function replaceSegmentPreservingPath(token: RegistryToken, replaceAtIndex: number, nextSegment: string) {
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

function buildSynonymScopeMap(tokens: RegistryToken[]) {
  const byScope = new Map<string, Set<string>>();
  for (const token of tokens) {
    const segments = splitPath(token.path);
    for (let index = 1; index < segments.length; index += 1) {
      const variant = normalizeTerm(segments[index]);
      if (!variant || !SYNONYM_GROUP_INDEX.has(variant)) continue;
      const scope = `${token.collection}:${token.type}:${SYNONYM_GROUP_INDEX.get(variant)}:${index}`;
      if (!byScope.has(scope)) byScope.set(scope, new Set());
      byScope.get(scope)!.add(variant);
    }
  }
  return byScope;
}

function buildGraphDependentsIndex(graph: TokenGraphViz | null | undefined) {
  if (!graph) return new Map<string, number>();

  const inById = new Map<string, string[]>();
  const nodeIdByPath = new Map<string, string>();
  for (const node of graph.nodes || []) {
    inById.set(node.id, []);
    nodeIdByPath.set(node.path, node.id);
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
}) {
  const totalImpact = args.directRefs + args.transitiveRefs;
  if (totalImpact === 0) return "safe" as const;
  if (totalImpact >= 25 || args.affectedSpecs >= 10) return "high" as const;
  if (totalImpact >= 8 || args.affectedSpecs >= 4) return "medium" as const;
  return "low" as const;
}

function effortByRisk(riskLevel: NamingDebtRiskLevel) {
  if (riskLevel === "safe" || riskLevel === "low") return "quick_win" as const;
  if (riskLevel === "medium") return "requires_planning" as const;
  return "breaking" as const;
}

const NAMING_RULES: NamingRule[] = [
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
          message: "Segment mixes unsupported separators. Prefer kebab/camel style without underscores.",
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
    check: (token) => {
      const segments = splitPath(token.path);
      for (let index = 1; index < segments.length; index += 1) {
        const normalized = normalizeTerm(segments[index]);
        const canonical = AMBIGUOUS_ABBREVIATIONS.get(normalized);
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
    check: (token) => {
      const segments = splitPath(token.path);
      if (segments.length < 2) return null;
      const terminal = normalizeTerm(segments[segments.length - 1]);
      if (!GENERIC_TERMINAL_SEGMENTS.has(terminal)) return null;
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
    check: (token) => {
      const depth = splitPath(token.path).length;
      if (depth <= 7) return null;
      return {
        category: "structure",
        severity: "info",
        message: `Path depth is ${depth} segments; consider reducing hierarchy complexity.`,
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
        const groupIndex = SYNONYM_GROUP_INDEX.get(variant);
        if (groupIndex === undefined) continue;
        const scope = `${token.collection}:${token.type}:${groupIndex}:${index}`;
        const variantsInScope = context.synonymVariantsByScope.get(scope);
        if (!variantsInScope || variantsInScope.size <= 1) continue;
        const canonical = SYNONYM_CANONICAL.get(variant);
        if (!canonical || canonical === variant) continue;
        const suggested = replaceSegmentPreservingPath(token, index, canonical);
        return {
          category: "consistency",
          severity: "warning",
          message: `Inconsistent synonym usage in ${token.collection}/${token.type}. Prefer '${canonical}' over '${segments[index]}'.`,
          evidence: Array.from(variantsInScope).sort((left, right) => left.localeCompare(right)),
          fix: suggested ? "manual" : "manual",
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

export function analyzeNamingDebt(args: {
  tokenRegistry: TokenRegistry;
  tokenUsageIndex?: TokenUsageIndex | null;
  tokenGraph?: TokenGraphViz | null;
}): NamingDebtReport {
  const tokens = args.tokenRegistry.entries || [];
  const context: NamingRuleContext = {
    synonymVariantsByScope: buildSynonymScopeMap(tokens),
  };

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
    for (const rule of NAMING_RULES) {
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
    const riskDiff = riskRank[left.riskLevel] - riskRank[right.riskLevel];
    if (riskDiff !== 0) return riskDiff;
    const refsDiff =
      left.directRefs + left.transitiveRefs - (right.directRefs + right.transitiveRefs);
    if (refsDiff !== 0) return refsDiff;
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
    const debtPoints = issues.error * 10 + issues.warning * 4 + issues.info * 1;
    const maxPoints = Math.max(1, totalTokens * 10);
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
    issuesBySeverity.error * 10 + issuesBySeverity.warning * 4 + issuesBySeverity.info * 1;
  const overallMaxPoints = Math.max(1, tokens.length * 10);
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
        (item) => item.issuesBySeverity.error + item.issuesBySeverity.warning + item.issuesBySeverity.info > 0,
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

