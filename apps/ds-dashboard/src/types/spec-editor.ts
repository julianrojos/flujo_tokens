import type { ComponentSpec } from "./component-spec";

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

export type SpecDiffKind = "added" | "removed" | "changed";

export interface SpecDiffEntry {
  kind: SpecDiffKind;
  path: string;
  beforeValue: string | null;
  afterValue: string | null;
  category:
    | "metadata"
    | "figma"
    | "summary"
    | "anatomy"
    | "properties"
    | "token_mapping"
    | "accessibility"
    | "content"
    | "qa"
    | "related_components"
    | "other";
  risk: "low" | "medium" | "high";
}

export interface ComponentSpecValidateResponse {
  ok: true;
  slug: string;
  path: string;
  rawHash: string | null;
  parsed: ComponentSpec | null;
  validation: SpecValidationResult;
  diff: SpecDiffEntry[];
}

export interface ComponentSpecSaveResponse {
  ok: boolean;
  slug: string;
  path: string;
  rawHash: string | null;
  backupPath: string | null;
  parsed: ComponentSpec | null;
  validation: SpecValidationResult;
  diff: SpecDiffEntry[];
  requiresConfirmation?: boolean;
  refreshed?: boolean;
  refreshOutput?: string;
  message?: string;
}

export interface ComponentSpecRestoreResponse {
  ok: boolean;
  slug: string;
  path: string;
  restoredFrom: string | null;
  rawHash: string | null;
  refreshed?: boolean;
  refreshOutput?: string;
  message?: string;
}

