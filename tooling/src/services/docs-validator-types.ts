/**
 * Docs Validator Types
 *
 * Shared type definitions for documentation validation.
 * Used by docs-validator.ts and extracted validator modules.
 */

/**
 * A single validation issue (error or warning).
 */
export interface DocsValidatorIssue {
  code: string;
  file: string;
  line?: number;
  message: string;
  severity?: 'error' | 'warning' | 'info';
  details?: unknown;
  suggested?: string;
  expected?: string | string[];
  actual?: string | string[];
  token?: string;
  rule_ids?: string[];
  blocking?: boolean;
}

/**
 * Validation summary statistics.
 */
export interface DocsValidationSummary {
  filesChecked: number;
  tokenRefsChecked: number;
  tokenRefsInvalid: number;
  errors: number;
  warnings: number;
}

/**
 * Governance metadata from rule manifest.
 */
export interface DocsValidationGovernance {
  manifestPath: string;
  manifestLoaded: boolean;
}

/**
 * Complete validation report.
 */
export interface DocsValidationReport {
  ok: boolean;
  generatedAt: string;
  governance: DocsValidationGovernance;
  summary: DocsValidationSummary;
  errors: DocsValidatorIssue[];
  warnings: DocsValidatorIssue[];
}

/**
 * Options for validateDocs() function.
 */
export interface DocsValidatorOptions {
  docsRoot?: string;
  registryPath?: string;
  filePath?: string;
  allowExtraH2?: boolean;
  checkOverview?: boolean;
  manifestPath?: string;
}
