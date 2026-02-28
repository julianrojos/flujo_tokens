/**
 * Figma Traceability Validators
 *
 * Validate Figma traceability, visual proof, gaps section, and lifecycle consistency.
 * Migrated from tooling/scripts/lib/validators/figma.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { normalizeNodeId, isValidNodeId } from '../utils/figma-node-id.js';
import { isTbdMarker } from '../utils/tbd.js';
import { extractSectionBody } from './markdown-sections.js';
import { TRACEABILITY_CONTRACT_VERSION } from './docs-config.js';
import { deriveFigmaFrontmatterTraceability } from './figma-traceability.js';
import type { FigmaNode } from '../types/figma.js';
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
// Type Definitions
// ============================================================================

interface VisualProofSection {
  hasOverview: boolean;
  hasSection: boolean;
  headingOffset: number;
  body: string;
}

interface ComponentSpec {
  specPath: string;
  exists: boolean;
  status: string;
  componentSetNodeIdRaw: string;
  componentSetNodeId: string;
  parsed: Record<string, unknown> | null;
  parseError: string | null;
}

interface SpecResolution {
  specFilePath?: string;
}

// ============================================================================
// Constants
// ============================================================================

const HASH_RE = /^[a-f0-9]{64}$/i;
const FILE_HASH_CACHE = new Map<string, { digest: string; size: number; mtimeMs: number }>();
const FILE_HASH_CACHE_MAX_ENTRIES = 1_000;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert file path to CLI-friendly relative path.
 */
function toCliPath(filePath: string): string {
  const resolved = path.resolve(String(filePath || ''));
  const relative = path.relative(process.cwd(), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return resolved;
  }
  return relative;
}

/**
 * Build regeneration command for traceability issues.
 */
function buildTraceabilityRegenerationCommand(paths: {
  markdownPath: string;
  specPath: string;
  registryPath: string;
}): string {
  const specArg = JSON.stringify(toCliPath(paths.specPath));
  const outputArg = JSON.stringify(toCliPath(paths.markdownPath));
  const registryArg = JSON.stringify(toCliPath(paths.registryPath));
  return `npm run ds:component-doc -- --spec-file ${specArg} --output ${outputArg} --registry ${registryArg} --force true`;
}

/**
 * SHA256 hash of file with caching.
 */
function sha256FileCached(filePath: string): string {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  const size = Number(stat.size || 0);
  const mtimeMs = Number(stat.mtimeMs || 0);

  const cached = FILE_HASH_CACHE.get(resolved);
  if (
    cached &&
    cached.size === size &&
    cached.mtimeMs === mtimeMs &&
    typeof cached.digest === 'string'
  ) {
    return cached.digest;
  }

  if (
    !FILE_HASH_CACHE.has(resolved) &&
    FILE_HASH_CACHE.size >= FILE_HASH_CACHE_MAX_ENTRIES
  ) {
    const firstKey = FILE_HASH_CACHE.keys().next().value;
    if (typeof firstKey === 'string') FILE_HASH_CACHE.delete(firstKey);
  }

  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(resolved));
  const digest = hash.digest('hex');
  FILE_HASH_CACHE.set(resolved, { digest, size, mtimeMs });
  return digest;
}

/**
 * Escape special regex characters in string.
 */
function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract H2 section range from markdown.
 */
function getH2SectionRange(
  rawMarkdown: string,
  headingTitle: string
): { headingOffset: number; bodyStart: number; end: number; body: string } | null {
  const raw = String(rawMarkdown || '');
  const headingRegex = new RegExp(`^##\\s+${escapeRegex(headingTitle)}\\s*$`, 'm');
  const headingMatch = headingRegex.exec(raw);
  if (!headingMatch) return null;

  const headingLineEnd = raw.indexOf('\n', headingMatch.index);
  const bodyStart = headingLineEnd === -1 ? raw.length : headingLineEnd + 1;
  const rest = raw.slice(bodyStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch ? bodyStart + nextHeadingMatch.index : raw.length;

  return {
    headingOffset: headingMatch.index,
    bodyStart,
    end,
    body: raw.slice(bodyStart, end),
  };
}

/**
 * Find discrepancy statuses in Design-Token Discrepancies section.
 */
function findDiscrepancyStatuses(rawMarkdown: string): string[] {
  const body = extractSectionBody(rawMarkdown, 'Design–Token Discrepancies');
  if (!body) return [];
  const matches: string[] = [];
  const statusCellRegex = /\|\s*`?(open|accepted|resolved)`?\s*\|/gi;
  let match: RegExpExecArray | null;
  while ((match = statusCellRegex.exec(body)) !== null) {
    matches.push(String(match[1] || '').toLowerCase());
  }
  return matches;
}

/**
 * Extract Visual Proof section from markdown.
 */
function extractVisualProof(rawMarkdown: string): VisualProofSection {
  const overview = getH2SectionRange(rawMarkdown, 'Overview');
  if (!overview) {
    return {
      hasOverview: false,
      hasSection: false,
      headingOffset: -1,
      body: '',
    };
  }

  const visualHeadingRegex = /^###\s+Visual Proof\s*$/m;
  const headingMatch = visualHeadingRegex.exec(overview.body);
  if (!headingMatch) {
    return {
      hasOverview: true,
      hasSection: false,
      headingOffset: overview.headingOffset,
      body: '',
    };
  }

  const absoluteHeadingOffset = overview.bodyStart + headingMatch.index;
  const afterHeadingRaw = overview.body.slice(headingMatch.index + headingMatch[0].length);
  const afterHeading = afterHeadingRaw.replace(/^\n+/, '');
  const nextH3Match = /^###\s+/m.exec(afterHeading);
  const body = (nextH3Match
    ? afterHeading.slice(0, nextH3Match.index)
    : afterHeading
  ).trim();

  return {
    hasOverview: true,
    hasSection: true,
    headingOffset: absoluteHeadingOffset,
    body,
  };
}

/**
 * Read component spec by doc path.
 */
function readComponentSpecByDocPath(
  componentDocPath: string,
  specRoot: string,
  options: SpecResolution = {}
): ComponentSpec {
  const explicitSpecFilePath = options.specFilePath
    ? path.resolve(String(options.specFilePath))
    : '';
  const fileBase = path.basename(componentDocPath, path.extname(componentDocPath));
  const specPath = explicitSpecFilePath || path.join(specRoot, `${fileBase}.yml`);

  if (!fs.existsSync(specPath)) {
    return {
      specPath,
      exists: false,
      status: '',
      componentSetNodeIdRaw: '',
      componentSetNodeId: '',
      parsed: null,
      parseError: null,
    };
  }

  try {
    const parsed = parseYamlDocument<Record<string, unknown>>(
      fs.readFileSync(specPath, 'utf8'),
      `spec YAML (${path.basename(specPath)})`
    );
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

// ============================================================================
// Public API - Figma Traceability Validators
// ============================================================================

/**
 * Validate markdown traceability node ID matches spec.
 */
export function validateMarkdownTraceabilityNodeId(
  filePath: string,
  frontmatter: Record<string, unknown>,
  specRoot: string,
  report: DocsValidationReport,
  specResolution: SpecResolution = {}
): void {
  const figma = isPlainObject(frontmatter.figma) ? (frontmatter.figma as Record<string, unknown>) : {};
  const markdownNodeIdRaw = String(figma.component_set_node_id || '').trim();
  if (!markdownNodeIdRaw) return;

  if (isTbdMarker(markdownNodeIdRaw)) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message: 'Frontmatter figma.component_set_node_id must not be `TBD` when declared.',
    });
    return;
  }

  const markdownNodeId = normalizeNodeId(markdownNodeIdRaw);
  if (!isValidNodeId(markdownNodeId)) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message: 'Frontmatter figma.component_set_node_id must use Figma node-id format `123:456`.',
    });
    return;
  }

  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  if (!spec.exists) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message:
        'Traceability mismatch: markdown declares figma.component_set_node_id but linked spec file is missing.',
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  if (spec.parseError) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message: `Linked spec cannot be parsed for traceability check: ${spec.parseError}`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  if (!spec.componentSetNodeIdRaw || isTbdMarker(spec.componentSetNodeIdRaw)) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message:
        'Traceability mismatch: markdown has figma.component_set_node_id but spec does not declare a concrete figma.component_set_node_id.',
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  if (spec.componentSetNodeId !== markdownNodeId) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message:
        `Traceability mismatch: markdown figma.component_set_node_id (${markdownNodeId}) ` +
        `differs from spec value (${spec.componentSetNodeId}).`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
  }
}

/**
 * Validate generated traceability metadata (hashes, contract version).
 */
export function validateGeneratedTraceability(
  filePath: string,
  frontmatter: Record<string, unknown>,
  specRoot: string,
  registryPath: string,
  report: DocsValidationReport,
  specResolution: SpecResolution = {}
): void {
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  if (!spec.exists || spec.parseError) return;

  const compareOptionalCount = (fieldName: string, expectedValue: number) => {
    const raw = figma[fieldName];
    if (raw === undefined || raw === null || raw === '') return;
    const parsed = Number(String(raw).trim());
    if (!Number.isInteger(parsed)) return;
    if (parsed !== expectedValue) {
      report.errors.push({
        code: 'TRACE03',
        file: filePath,
        message: `Traceability drift in figma.${fieldName}. Regenerate markdown using the suggested command.`,
        expected: String(expectedValue),
        actual: String(parsed),
        suggested: regenerateCommand,
      });
    }
  };

  const regenerateCommand = buildTraceabilityRegenerationCommand({
    markdownPath: filePath,
    specPath: spec.specPath,
    registryPath,
  });

  const pipeline = isPlainObject(frontmatter.pipeline)
    ? (frontmatter.pipeline as Record<string, unknown>)
    : null;
  const dsDoc =
    pipeline && isPlainObject(pipeline.ds_component_doc)
      ? (pipeline.ds_component_doc as Record<string, unknown>)
      : null;

  if (!dsDoc) {
    report.errors.push({
      code: 'TRACE02',
      file: filePath,
      message:
        'Missing frontmatter `pipeline.ds_component_doc` traceability block. Regenerate markdown using the suggested command.',
      suggested: regenerateCommand,
    });
    return;
  }

  const contractVersion = String(dsDoc.contract_version || '').trim();
  if (contractVersion !== TRACEABILITY_CONTRACT_VERSION) {
    report.errors.push({
      code: 'TRACE02',
      file: filePath,
      message:
        `Unsupported traceability contract version: \`${contractVersion || '<missing>'}\`. ` +
        `Expected \`${TRACEABILITY_CONTRACT_VERSION}\`. Regenerate markdown using the suggested command.`,
      suggested: regenerateCommand,
    });
  }

  const expected = {
    spec_sha256: sha256FileCached(spec.specPath),
    token_registry_sha256: sha256FileCached(registryPath),
  };

  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = String((dsDoc as Record<string, unknown>)[field] || '').trim();
    if (!actualValue) {
      report.errors.push({
        code: 'TRACE02',
        file: filePath,
        message:
          `Missing frontmatter traceability field: pipeline.ds_component_doc.${field}. ` +
          'Regenerate markdown using the suggested command.',
        suggested: regenerateCommand,
      });
      continue;
    }
    if (!HASH_RE.test(actualValue)) {
      report.errors.push({
        code: 'TRACE02',
        file: filePath,
        message:
          `Invalid hash format in pipeline.ds_component_doc.${field}; expected a 64-char sha256 hex string. ` +
          'Regenerate markdown using the suggested command.',
        suggested: regenerateCommand,
      });
      continue;
    }
    if (expectedValue && actualValue !== expectedValue) {
      report.errors.push({
        code: 'TRACE02',
        file: filePath,
        message: `Traceability drift in pipeline.ds_component_doc.${field}. Regenerate markdown using the suggested command.`,
        expected: expectedValue,
        actual: actualValue,
        suggested: regenerateCommand,
      });
    }
  }

  const figma = isPlainObject(frontmatter.figma) ? (frontmatter.figma as Record<string, unknown>) : {};
  const expectedFigma = deriveFigmaFrontmatterTraceability(spec.parsed);

  const componentHash = String(figma.component_hash || '').trim();
  if (componentHash && componentHash !== expectedFigma.componentHash) {
    report.errors.push({
      code: 'TRACE03',
      file: filePath,
      message:
        'Traceability drift in figma.component_hash. Regenerate markdown using the suggested command.',
      expected: expectedFigma.componentHash,
      actual: componentHash,
      suggested: regenerateCommand,
    });
  }

  compareOptionalCount('properties_count', expectedFigma.propertiesCount);
  compareOptionalCount('variants_count', expectedFigma.variantsCount);
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
  specResolution: SpecResolution = {}
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
  const readyStatusWithGapsNote = hasReadyStatusWithGaps ? GAP_CHECK_MESSAGES.GAP02_note : '';

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
    (line) => !GAPS_VALIDATION.checkboxFormatRegex.test(line)
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
    sameLength && actualLines.every((line, index) => line === expectedLines[index]);
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

/**
 * Validate Visual Proof section for ready components.
 */
export function validateVisualProofSection(
  filePath: string,
  rawMarkdown: string,
  frontmatter: Record<string, unknown>,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number
): void {
  const docStatus = String(frontmatter.doc_status || '').trim().toLowerCase();
  if (docStatus !== 'ready') return;

  const visualProof = extractVisualProof(rawMarkdown);
  const fallbackOffset = visualProof.headingOffset >= 0 ? visualProof.headingOffset : 0;

  if (!visualProof.hasOverview || !visualProof.hasSection) {
    report.errors.push({
      code: 'VIS01',
      file: filePath,
      line: lineFromOffsetFn(lineStarts, fallbackOffset),
      message:
        'Component markdown is `ready` but missing `### Visual Proof` under `## Overview`.',
    });
    return;
  }

  if (/\bTBD\b/i.test(visualProof.body)) {
    report.errors.push({
      code: 'VIS01',
      file: filePath,
      line: lineFromOffsetFn(lineStarts, fallbackOffset),
      message:
        'Component markdown is `ready` but `### Visual Proof` still contains `TBD`.',
    });
  }

  const hasHttpScreenshotLink = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/i.test(visualProof.body);
  const hasLocalProofImage = /!\[[^\]]*\]\((?:\.\.?\/|docs\/)[^)]+visual-proofs\/images\/[^)\s]+\)/i.test(
    visualProof.body
  );

  if (!hasHttpScreenshotLink && !hasLocalProofImage) {
    report.errors.push({
      code: 'VIS01',
      file: filePath,
      line: lineFromOffsetFn(lineStarts, fallbackOffset),
      message:
        'Component markdown is `ready` but `### Visual Proof` has no concrete screenshot reference (URL or local image).',
    });
  }
}

/**
 * Validate lifecycle consistency between spec and markdown.
 */
export function validateReadyLifecycleConsistency(
  filePath: string,
  rawMarkdown: string,
  frontmatter: Record<string, unknown>,
  specRoot: string,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  specResolution: SpecResolution = {}
): void {
  const docStatus = String(frontmatter.doc_status || '').trim().toLowerCase();
  const figma = isPlainObject(frontmatter.figma) ? (frontmatter.figma as Record<string, unknown>) : {};
  const lastVerified = String(figma.last_verified || '').trim();
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  const specStatus = String(spec.status || '').trim().toLowerCase();

  if (docStatus === 'ready') {
    if (!spec.exists) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: 'Component markdown is `ready` but linked spec file is missing.',
        suggested: path.relative(process.cwd(), spec.specPath),
      });
      return;
    }
    if (spec.parseError) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: 'Component markdown is `ready` but linked spec could not be parsed.',
        suggested: path.relative(process.cwd(), spec.specPath),
      });
      return;
    }
    if (specStatus !== 'ready') {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: `Component markdown is \`ready\` but spec status is \`${specStatus || 'missing'}\`.`,
        suggested: path.relative(process.cwd(), spec.specPath),
      });
    }
    if (!lastVerified || isTbdMarker(lastVerified)) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: 'Component markdown is `ready` but figma.last_verified is missing or `TBD`.',
      });
    }
    if (/\bTBD\b/i.test(rawMarkdown)) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: 'Component markdown is `ready` but still contains `TBD` markers.',
      });
    }
    const discrepancyStatuses = findDiscrepancyStatuses(rawMarkdown);
    if (discrepancyStatuses.some((status) => status === 'open' || status === 'accepted')) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        line: lineFromOffsetFn(
          lineStarts,
          rawMarkdown.indexOf('## Design–Token Discrepancies')
        ),
        message:
          'Component markdown is `ready` but has unresolved Design–Token Discrepancies (`open` or `accepted`).',
      });
    }
  }

  if (spec.exists && !spec.parseError && specStatus === 'ready' && docStatus !== 'ready') {
    report.errors.push({
      code: 'READY01',
      file: filePath,
      message: `Spec status is \`ready\` but component markdown doc_status is \`${docStatus || 'missing'}\`.`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
  }
}
