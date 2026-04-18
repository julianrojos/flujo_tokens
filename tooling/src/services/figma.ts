import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { normalizeNodeId } from '../utils/figma-node-id.js';
import { type SpecResolution } from './spec-loader.js';
import {
  extractGapsFromSpec,
  buildGapsChecklistLines,
  extractGapsSection,
  extractNonEmptySectionLines,
} from './gaps.js';
import {
  GAP_ERROR_CODES,
  GAP_CHECK_MESSAGES,
  GAPS_VALIDATION,
} from './gaps-contract.js';
import type { DocsValidationReport } from './docs-validator-types.js';

// ============================================================================
// Type Definitions (Local)
// ============================================================================

// ============================================================================
// Constants
// ============================================================================
type ComponentSpecLookup = {
  specPath: string;
  exists: boolean;
  status: string;
  componentSetNodeIdRaw: string;
  componentSetNodeId: string;
  parsed: Record<string, unknown> | null;
  parseError?: string | null;
};

function readComponentSpecByDocPath(
  componentDocPath: string,
  specRoot: string,
  options: SpecResolution = {},
): ComponentSpecLookup {
  const explicitSpecFilePath = options.specFilePath
    ? path.resolve(String(options.specFilePath))
    : '';
  const fileBase = path.basename(
    componentDocPath,
    path.extname(componentDocPath),
  );
  const specPath = explicitSpecFilePath || path.join(specRoot, `${fileBase}.yml`);
  if (!fs.existsSync(specPath)) {
    return {
      specPath,
      exists: false,
      status: '',
      componentSetNodeIdRaw: '',
      componentSetNodeId: '',
      parsed: null,
    };
  }

  try {
    const parsed = parseYamlDocument(
      fs.readFileSync(specPath, 'utf8'),
      `spec YAML (${path.basename(specPath)})`,
    ) as Record<string, unknown>;
    const status = String(parsed.status || '').trim().toLowerCase();
    const figma = isPlainObject(parsed.figma) ? (parsed.figma as Record<string, unknown>) : {};
    const componentSetNodeIdRaw = String(figma.component_set_node_id || '').trim();
    return {
      specPath,
      exists: true,
      status,
      componentSetNodeIdRaw,
      componentSetNodeId: normalizeNodeId(componentSetNodeIdRaw),
      parsed,
      parseError: null,
    };
  } catch (error) {
    return {
      specPath,
      exists: true,
      status: '',
      componentSetNodeIdRaw: '',
      componentSetNodeId: '',
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Validate Gaps section contract.
 */
export function validateGapsSectionContract(
  filePath: string,
  rawMarkdown: string,
  specRoot: string,
  registry: Record<string, unknown>,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  specResolution: SpecResolution = {},
): void {
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  const section = extractGapsSection(rawMarkdown);

  if (!spec.exists) {
    if (section) {
      report.warnings.push({
        code: GAP_ERROR_CODES.GAP00,
        file: filePath,
        line: section ? lineFromOffsetFn(lineStarts, section.start) : undefined,
        message: GAP_CHECK_MESSAGES.GAP00,
      });
    }
    return;
  }

  if (spec.parseError || !spec.parsed) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      message: `${GAP_CHECK_MESSAGES.GAP01_spec_parse_error}: ${spec.parseError}`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  const gaps = extractGapsFromSpec({ spec: spec.parsed, registry });
  const expectedLines = buildGapsChecklistLines(gaps);
  const hasReadyStatusWithGaps = spec.status === 'ready' && gaps.length > 0;
  const readyStatusWithGapsNote = hasReadyStatusWithGaps
    ? GAP_CHECK_MESSAGES.GAP02_note
    : '';

  if (hasReadyStatusWithGaps) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP02,
      file: spec.specPath,
      message: GAP_CHECK_MESSAGES.GAP02_ready_with_gaps,
    });
  }

  if (expectedLines.length === 0) {
    if (!section) return;
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      line: lineFromOffsetFn(lineStarts, section.start),
      message: GAP_CHECK_MESSAGES.GAP01_section_not_needed,
    });
    return;
  }

  if (!section) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      message: `${GAP_CHECK_MESSAGES.GAP01_section_missing}${readyStatusWithGapsNote}`,
    });
    return;
  }

  const rawSectionLines = extractNonEmptySectionLines(section.body);
  if (rawSectionLines.length === 0) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      line: lineFromOffsetFn(lineStarts, section.start),
      message: `${GAP_CHECK_MESSAGES.GAP01_section_empty}${readyStatusWithGapsNote}`,
    });
    return;
  }

  const invalidLine = rawSectionLines.find(
    (line) => !GAPS_VALIDATION.checkboxFormatRegex.test(line),
  );
  if (invalidLine) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      line: lineFromOffsetFn(lineStarts, section.start),
      message: `${GAP_CHECK_MESSAGES.GAP01_invalid_item_format}${readyStatusWithGapsNote}`,
      details: invalidLine,
    });
    return;
  }

  const actualLines = rawSectionLines;
  const sameLength = actualLines.length === expectedLines.length;
  const sameOrder =
    sameLength &&
    actualLines.every((line, index) => line === expectedLines[index]);
  if (sameOrder) return;

  report.errors.push({
    code: GAP_ERROR_CODES.GAP01,
    file: filePath,
    line: lineFromOffsetFn(lineStarts, section.start),
    message: `${GAP_CHECK_MESSAGES.GAP01_content_mismatch}${readyStatusWithGapsNote}`,
    expected: expectedLines,
    actual: actualLines,
  });
}
