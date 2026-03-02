/**
 * Render Report Parser
 *
 * Parses and normalizes render report from agent output.
 */

import type {
  RenderReport,
  RenderAuditReport,
  RenderExpectations,
  RenderReportValidationResult,
  RenderAuditValidationResult,
  ValidateRenderReportOptions,
  ValidatePrimaryRenderReportOptions,
} from '../types/render-report.js';

export type {
  RenderReport,
  RenderAuditReport,
  RenderExpectations,
  RenderReportValidationResult,
  RenderAuditValidationResult,
  ValidateRenderReportOptions,
  ValidatePrimaryRenderReportOptions,
};

/**
 * Get first non-empty value from a list of candidates.
 */
function firstPresent(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
}

/**
 * Extract string field from object with robust coercion.
 */
function extractStringField(
  obj: Record<string, unknown>,
  key: string,
  fallback: string | null = null,
): string | null {
  const value = obj[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' ? trimmed : fallback;
  }
  // Coerce non-string values to string
  const stringValue = String(value).trim();
  return stringValue !== '' ? stringValue : fallback;
}

/**
 * Extract number field from object with robust coercion.
 */
function extractNumberField(
  obj: Record<string, unknown>,
  key: string,
  fallback: number | null = null,
): number | null {
  const value = obj[key];
  if (value === undefined || value === null) return fallback;
  
  // Handle string numbers
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  
  // Handle boolean coercion (true -> 1, false -> 0)
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  
  // Handle number
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  
  return fallback;
}

/**
 * Extract JSON objects from text.
 */
export function extractJsonObjects(rawText: string): Record<string, unknown>[] {
  const text = String(rawText || '').trim();
  if (!text) return [];

  const objects: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const pushCandidate = (candidate: string) => {
    const normalized = String(candidate || '').trim();
    if (!normalized || seen.has(normalized)) return;
    try {
      const parsed = JSON.parse(normalized);
      if (parsed && typeof parsed === 'object') {
        objects.push(parsed);
        seen.add(normalized);
      }
    } catch {
      // Ignore invalid JSON candidates.
    }
  };

  pushCandidate(text);

  const fencedMatches = Array.from(text.matchAll(/```json\s*([\s\S]*?)```/gi));
  for (const match of fencedMatches) {
    pushCandidate(match[1] || '');
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start !== -1) {
        pushCandidate(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

/**
 * Normalize render report from raw JSON with robust coercion.
 */
export function normalizeRenderReport(raw: Record<string, unknown>): RenderReport {
  const report = raw && typeof raw === 'object' ? raw : {};
  const unsupportedBlocksRaw = firstPresent(
    report.unsupported_blocks,
    report.unsupportedBlocks,
  );
  const unsupportedBlocks = Array.isArray(unsupportedBlocksRaw)
    ? unsupportedBlocksRaw
    : [];
  const unsupportedBlocksCount = Number.isFinite(Number(unsupportedBlocksRaw))
    ? Number(unsupportedBlocksRaw)
    : unsupportedBlocks.length;

  const offsetXApplied = extractNumberField(report, 'offset_x_applied') ??
    extractNumberField(report, 'offsetXApplied');

  // Robust renderedCount extraction with nested field support
  const renderedCountRaw = firstPresent(
    report.renderedCount,
    report.rendered_count,
  );
  const renderedCount: { table: number | null; card: number | null; section: number | null } | null = renderedCountRaw && typeof renderedCountRaw === 'object'
    ? {
        table: extractNumberField(renderedCountRaw as Record<string, unknown>, 'table') ?? null,
        card: extractNumberField(renderedCountRaw as Record<string, unknown>, 'card') ?? null,
        section: extractNumberField(renderedCountRaw as Record<string, unknown>, 'section') ?? null,
      }
    : null;

  return {
    ok: report.ok !== false,
    targetSectionId: extractStringField(report, 'target_section_id') ??
      extractStringField(report, 'targetSectionId'),
    targetSectionName: extractStringField(report, 'target_section_name') ??
      extractStringField(report, 'targetSectionName'),
    themeName: extractStringField(report, 'theme_name') ??
      extractStringField(report, 'themeName'),
    offsetXApplied,
    unsupportedBlocks,
    unsupportedBlocksCount,
    componentSetId: extractStringField(report, 'component_set_id') ??
      extractStringField(report, 'componentSetId'),
    componentSectionId: extractStringField(report, 'component_section_id') ??
      extractStringField(report, 'componentSectionId'),
    renderedCount,
  };
}

/**
 * Parse render report from agent output.
 */
export function parseRenderReportFromOutput(rawText: string): RenderReport | null {
  const candidates = extractJsonObjects(rawText);
  if (candidates.length === 0) return null;

  const withRenderKeys = candidates.filter((candidate) => {
    const normalized = normalizeRenderReport(candidate);
    return Boolean(
      normalized.targetSectionId ||
      normalized.targetSectionName ||
      normalized.themeName,
    );
  });
  const selected =
    withRenderKeys.length > 0
      ? withRenderKeys[withRenderKeys.length - 1]
      : candidates[candidates.length - 1];
  return normalizeRenderReport(selected);
}

/**
 * Validate render report against expectations.
 */
export function validateRenderReport(options: ValidateRenderReportOptions): RenderReportValidationResult {
  const { report, expectedThemeName, expectedOffsetX, force = false } = options;
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!report.targetSectionId || !report.targetSectionName) {
    errors.push('Render report is missing target section identifiers.');
  }
  if (!report.themeName) {
    errors.push('Render report is missing theme_name.');
  }
  if (expectedThemeName && report.themeName && report.themeName !== expectedThemeName) {
    const message = `Theme mismatch (expected "${expectedThemeName}", got "${report.themeName}")`;
    if (!force) {
      errors.push(`${message}. Use --force true only for explicit emergency bypass.`);
    } else {
      warnings.push(`${message}. Continuing because --force true was provided.`);
    }
  }
  if (
    expectedOffsetX !== undefined &&
    report.offsetXApplied !== null &&
    Math.abs(report.offsetXApplied - expectedOffsetX) > 1
  ) {
    const message = `Unexpected render offset (expected ${expectedOffsetX}, got ${report.offsetXApplied})`;
    if (!force) {
      errors.push(`${message}. Use --force true only for explicit emergency bypass.`);
    } else {
      warnings.push(`${message}. Continuing because --force true was provided.`);
    }
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate primary render report against expectations.
 */
export function validatePrimaryRenderReport(options: ValidatePrimaryRenderReportOptions): { ok: boolean; issues: string[] } {
  const { renderReport, expectations } = options;
  const issues: string[] = [];

  if (!renderReport.ok) {
    issues.push('Render report marked the run as not ok.');
  }
  if (!renderReport.componentSetId) {
    issues.push('Missing component_set_id in render report.');
  }
  if (!renderReport.componentSectionId) {
    issues.push('Missing component_section_id in render report.');
  }
  if (!renderReport.renderedCount) {
    issues.push('Missing rendered_count block in render report.');
  } else {
    const renderedTableCount = renderReport.renderedCount.table;
    if (renderedTableCount == null) {
      issues.push('Missing rendered_count.table in render report.');
    } else if (renderedTableCount !== expectations.expectedTableCount) {
      issues.push(
        `Rendered table count mismatch (expected ${expectations.expectedTableCount}, got ${renderedTableCount}).`,
      );
    }
  }
  return {
    ok: issues.length === 0,
    issues,
  };
}

/**
 * Normalize render audit report from raw JSON.
 */
export function normalizeRenderAuditReport(raw: Record<string, unknown>): RenderAuditReport {
  const report = raw && typeof raw === 'object' ? raw : {};
  return {
    ok: report.ok !== false,
    pass: report.pass === true || report.pass === 'true' || report.pass === 1,
    targetSectionId: extractStringField(report, 'target_section_id') ??
      extractStringField(report, 'targetSectionId'),
    targetSectionName: extractStringField(report, 'target_section_name') ??
      extractStringField(report, 'targetSectionName'),
    hasDocCanvas: report.has_doc_canvas === true || report.hasDocCanvas === true ||
      report.has_doc_canvas === 'true' || report.hasDocCanvas === 'true',
    cardCount: extractNumberField(report, 'card_count') ?? extractNumberField(report, 'cardCount'),
    tableContainerCount: extractNumberField(report, 'table_container_count') ??
      extractNumberField(report, 'tableContainerCount'),
    headerRowCount: extractNumberField(report, 'header_row_count') ??
      extractNumberField(report, 'headerRowCount'),
    bodyRowCount: extractNumberField(report, 'body_row_count') ??
      extractNumberField(report, 'bodyRowCount'),
    reasons: Array.isArray(report.reasons) ? report.reasons : [],
  };
}
