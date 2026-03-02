/**
 * Render Report Types
 *
 * Type definitions for render report structure and validation.
 */

/**
 * Render report structure from agent execution.
 */
export interface RenderReport {
  ok: boolean;
  targetSectionId: string | null;
  targetSectionName: string | null;
  themeName: string | null;
  offsetXApplied: number | null;
  unsupportedBlocks: unknown[];
  unsupportedBlocksCount: number;
  componentSetId: string | null;
  componentSectionId: string | null;
  renderedCount: {
    table: number | null;
    card: number | null;
    section: number | null;
  } | null;
}

/**
 * Render audit report structure from audit agent.
 */
export interface RenderAuditReport {
  ok: boolean;
  pass: boolean | null;
  targetSectionId: string | null;
  targetSectionName: string | null;
  hasDocCanvas: boolean | null;
  cardCount: number | null;
  tableContainerCount: number | null;
  headerRowCount: number | null;
  bodyRowCount: number | null;
  reasons: unknown[];
}

/**
 * Render expectations extracted from payload.
 */
export interface RenderExpectations {
  expectedCardCount: number;
  expectedTableCount: number;
  expectedSectionName: string;
}

/**
 * Result of render report validation.
 */
export interface RenderReportValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Result of render audit validation.
 */
export interface RenderAuditValidationResult {
  ok: boolean;
  issues: string[];
}

/**
 * Options for validating render report.
 */
export interface ValidateRenderReportOptions {
  report: RenderReport;
  expectedThemeName?: string;
  expectedOffsetX?: number;
  force?: boolean;
}

/**
 * Options for validating primary render report.
 */
export interface ValidatePrimaryRenderReportOptions {
  renderReport: RenderReport;
  expectations: RenderExpectations;
}
