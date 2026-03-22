export type ImpactSeverity = "critical" | "high" | "medium" | "low";

export type ImpactRecommendation = "proceed" | "review" | "do-not-proceed";

export interface ImpactWcagPairConfig {
  foreground: string;
  background: string;
  level: "AA" | "AAA";
  textSize: "normal" | "large";
}

export interface ImpactToken {
  id: string;
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  collection: string;
  resolvedValue: string;
  depth: number;
  usageCount: number;
  severity: ImpactSeverity;
  reasons: string[];
}

export interface ImpactComponent {
  slug: string;
  displayName: string;
  pipelineStage: string;
  affectedTokenPaths: string[];
  affectedProperties: string[];
  occurrences: number;
  severity: ImpactSeverity;
  visualProofAvailable: boolean;
}

export interface ImpactWcagSimulation {
  foreground: string;
  background: string;
  level: "AA" | "AAA";
  textSize: "normal" | "large";
  requiredRatio: number;
  originalRatio: number;
  simulatedRatio: number | null;
  originalPass: boolean;
  simulatedPass: boolean | null;
  regression: boolean;
  foregroundHex: string | null;
  backgroundHex: string | null;
  simulatedForegroundHex: string | null;
  simulatedBackgroundHex: string | null;
}

export interface ImpactSummary {
  severity: ImpactSeverity;
  severityScore: number;
  recommendation: ImpactRecommendation;
  blastRadius: number;
  affectedTokens: number;
  directDependents: number;
  transitiveDependents: number;
  affectedComponents: number;
  affectedUsages: number;
  wcagRegressions: number;
}

export interface ImpactReport {
  ok: true;
  query: {
    tokenPath: string;
    newValue: string | null;
    depth: number;
  };
  rootToken: {
    path: string;
    slashPath: string;
    cssVar: string;
    type: string;
    collection: string;
    resolvedValue: string;
    simulatedResolvedValue: string | null;
  };
  affectedTokens: ImpactToken[];
  affectedComponents: ImpactComponent[];
  wcagSimulation: ImpactWcagSimulation[];
  summary: ImpactSummary;
  generatedAt: string;
}

