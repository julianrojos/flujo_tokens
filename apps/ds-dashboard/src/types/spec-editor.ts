/**
 * Component Spec Editor Types (DB-first)
 *
 * Editorial fields are stored in component_editorial table.
 */

export type SpecValidationSeverity = "error" | "warning";

export interface SpecValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: SpecValidationSeverity;
  requiresConfirmation?: boolean;
}

export interface SpecValidationResult {
  valid: boolean;
  blockingIssueCount: number;
  warningCount: number;
  issues: SpecValidationIssue[];
}

/**
 * Response from PATCH /api/component-spec/:slug/editorial
 */
export interface ComponentSpecPatchEditorialResponse {
  ok: boolean;
  slug: string;
  exists: boolean;
  updatedAt: number | null;
  savedKeys: string[];
  markdownSynced?: boolean;
  message?: string;
}

export type SpecDiffCategory =
  | "metadata"
  | "figma"
  | "summary"
  | "properties"
  | "token_mapping"
  | "accessibility"
  | "content"
  | "qa"
  | "related_components"
  | "other";

export type SpecDiffRisk = "high" | "medium" | "low";
export type SpecDiffKind = "added" | "removed" | "changed";

export interface SpecDiffEntry {
  kind: SpecDiffKind;
  path: string;
  beforeValue: string | null;
  afterValue: string | null;
  category: SpecDiffCategory;
  risk: SpecDiffRisk;
}
