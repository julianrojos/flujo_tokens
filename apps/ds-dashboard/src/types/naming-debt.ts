export type NamingDebtSeverity = "error" | "warning" | "info";

export type NamingDebtCategory =
  | "structure"
  | "casing"
  | "vocabulary"
  | "consistency";

export type NamingDebtFixType = "auto" | "manual" | "none";

export type NamingDebtRiskLevel = "safe" | "low" | "medium" | "high";

export interface NamingDebtViolation {
  tokenPath: string;
  tokenSlashPath: string;
  collection: string;
  type: string;
  ruleId: string;
  category: NamingDebtCategory;
  severity: NamingDebtSeverity;
  message: string;
  evidence: string[];
  fix: NamingDebtFixType;
  confidence: number;
  suggestedPath: string | null;
  suggestedSlashPath: string | null;
  proposalIndex: number | null;
}

export interface NamingDebtRenameProposal {
  currentPath: string;
  currentSlashPath: string;
  suggestedPath: string;
  suggestedSlashPath: string;
  rationale: string;
  category: NamingDebtCategory;
  fix: Exclude<NamingDebtFixType, "none">;
  confidence: number;
  directRefs: number;
  transitiveRefs: number;
  affectedSpecs: string[];
  affectedCssFiles: string[];
  riskLevel: NamingDebtRiskLevel;
  breakingChange: boolean;
  effort: "quick_win" | "requires_planning" | "breaking";
}

export interface NamingDebtCollectionScore {
  collection: string;
  totalTokens: number;
  score: number;
  cleanPercent: number;
  issuesBySeverity: Record<NamingDebtSeverity, number>;
}

export interface NamingDebtSummary {
  totalTokens: number;
  totalViolations: number;
  issuesBySeverity: Record<NamingDebtSeverity, number>;
  autoFixable: number;
  manualReview: number;
  overallScore: number;
  collectionsWithDebt: number;
}

export interface NamingDebtRenamePlanStep {
  step: number;
  currentPath: string;
  suggestedPath: string;
  category: NamingDebtCategory;
  fix: Exclude<NamingDebtFixType, "none">;
  riskLevel: NamingDebtRiskLevel;
  affectedFiles: string[];
}

export interface NamingDebtReport {
  ok: true;
  generatedAt: string;
  summary: NamingDebtSummary;
  scoreByCollection: Record<string, NamingDebtCollectionScore>;
  violations: NamingDebtViolation[];
  renameProposals: NamingDebtRenameProposal[];
  quickWins: string[];
  requiresPlanning: string[];
  renamePlan: NamingDebtRenamePlanStep[];
}

