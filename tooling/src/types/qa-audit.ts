/**
 * Type definitions for QA audit module.
 */

/**
 * Audit category identifier.
 */
export type AuditCategory = 'coverage' | 'freshness' | 'completeness' | 'integrity';

/**
 * Severity level for audit findings.
 */
export type AuditSeverity = 'error' | 'warning' | 'info';

/**
 * Individual audit finding.
 */
export interface AuditFinding {
  /**
   * Unique finding identifier (e.g., "COV-01", "FRE-02").
   */
  id: string;
  /**
   * Category of the finding.
   */
  category: AuditCategory;
  /**
   * Severity level.
   */
  severity: AuditSeverity;
  /**
   * Human-readable title.
   */
  title: string;
  /**
   * File path or location where issue was found.
   */
  location: string;
  /**
   * Detailed description of the issue.
   */
  message: string;
  /**
   * Suggested fix or action.
   */
  suggestion?: string;
}

/**
 * Coverage audit: Component specs vs. markdown files.
 */
export interface CoverageSpecVsMarkdown {
  /**
   * Specs without corresponding markdown.
   */
  specsWithoutMarkdown: string[];
  /**
   * Markdown files without corresponding spec.
   */
  markdownsWithoutSpec: string[];
}

/**
 * Coverage audit: Markdown files vs. overview links.
 */
export interface CoverageMarkdownVsOverview {
  /**
   * Markdown files not linked in overview.
   */
  unlinkedMarkdown: string[];
  /**
   * Broken links in overview (pointing to non-existent files).
   */
  brokenLinks: string[];
}

/**
 * Coverage audit: Token paths in docs vs. token registry.
 */
export interface CoverageTokenPaths {
  /**
   * Token paths referenced in docs but not in registry.
   */
  missingTokens: Array<{
    tokenPath: string;
    referencedIn: string;
  }>;
}

/**
 * Freshness audit results.
 */
export interface FreshnessAudit {
  /**
   * Component specs still in draft status.
   */
  draftSpecs: string[];
  /**
   * Markdown files flagged for review.
   */
  needsReview: string[];
  /**
   * Files with last_verified older than threshold days.
   */
  staleFiles: Array<{
    path: string;
    lastVerified: string;
    daysOld: number;
  }>;
}

/**
 * Completeness audit results.
 */
export interface CompletenessAudit {
  /**
   * Component specs with TBD values.
   */
  specsWithTbd: Array<{
    path: string;
    tbdFields: string[];
    tbdCount: number;
  }>;
  /**
   * Markdown files with ## Gaps / TBD section.
   */
  markdownsWithGaps: string[];
}

/**
 * Integrity audit results.
 */
export interface IntegrityAudit {
  /**
   * Token paths in docs not in registry.
   */
  missingTokenRefs: Array<{
    tokenPath: string;
    referencedIn: string;
  }>;
  /**
   * Overview links vs. actual files.
   */
  overviewMismatches: Array<{
    linkText: string;
    linkPath: string;
    issue: string;
  }>;
}

/**
 * QA Audit options.
 */
export interface QaAuditOptions {
  /**
   * Project root directory.
   */
  projectRoot?: string;
  /**
   * Path to specs directory.
   */
  specsDir?: string;
  /**
   * Path to components markdown directory.
   */
  componentsDir?: string;
  /**
   * Path to generated directory.
   */
  generatedDir?: string;
  /**
   * Days threshold for stale file detection.
   */
  staleThresholdDays?: number;
  /**
   * Whether to output JSON report.
   */
  outputReport?: boolean;
}

/**
 * QA Audit result.
 */
export interface QaAuditResult {
  /**
   * Overall audit summary.
   */
  summary: {
    totalFindings: number;
    errors: number;
    warnings: number;
    info: number;
  };
  /**
   * Coverage audit results.
   */
  coverage: {
    specVsMarkdown: CoverageSpecVsMarkdown;
    markdownVsOverview: CoverageMarkdownVsOverview;
    tokenPaths: CoverageTokenPaths;
  };
  /**
   * Freshness audit results.
   */
  freshness: FreshnessAudit;
  /**
   * Completeness audit results.
   */
  completeness: CompletenessAudit;
  /**
   * Integrity audit results.
   */
  integrity: IntegrityAudit;
  /**
   * All findings flattened.
   */
  findings: AuditFinding[];
  /**
   * Timestamp of audit execution.
   */
  timestamp: string;
}
