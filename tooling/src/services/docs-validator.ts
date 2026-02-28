/**
 * Documentation Validator Service
 *
 * Validates documentation integrity, structure, and token references.
 * Full TypeScript implementation (migrated from docs-validator.mjs).
 *
 * @module tooling/src/services/docs-validator
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// Import from existing TypeScript utilities
import { isPlainObject } from '../utils/is-plain-object.js';
import { isTbdMarker } from '../utils/tbd.js';
import {
  componentNameToSnakeCase,
  isSnakeCaseFileSlug,
} from '../utils/component-name.js';
import {
  parseYamlDocument,
  parseMarkdownFrontmatter,
} from '../utils/parse-frontmatter.js';
import {
  FIGMA_NODE_ID_RE,
  normalizeNodeId,
  isValidNodeId,
} from '../utils/figma-node-id.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';

// Import shared types (single source of truth for validator types)
import type {
  DocsValidatorIssue,
  DocsValidationSummary,
  DocsValidationGovernance,
  DocsValidationReport,
  DocsValidatorOptions,
} from './docs-validator-types.js';

// Import from newly created services
import {
  SPEC_ALLOWED_STATUS,
  SPEC_REQUIRED_TOP_LEVEL_FIELDS,
  TRACEABILITY_CONTRACT_VERSION,
  TOKEN_COLLECTION_PREFIXES,
} from './docs-config.js';
import { deriveFigmaFrontmatterTraceability } from './figma-traceability.js';
import { extractSectionBody } from './markdown-sections.js';
import {
  SPEC_PROPERTY_ALLOWED_TYPES,
  getSpecPropertyTypeInfo,
  normalizeSpecPropertyType,
  PROPERTY_FIELD_ORDER,
  hasCanonicalPropertyFieldOrder,
} from './spec-property-types.js';
import {
  GAP_TYPE,
  GAP_TYPE_ORDER,
  GAP_ERROR_CODES,
  GAP_CHECK_MESSAGES,
  GAPS_VALIDATION,
  type GapItem,
} from './gaps-contract.js';
import {
  extractGapsFromSpec,
  buildGapsChecklistLines,
  extractGapsSection,
  extractNonEmptySectionLines,
} from './gaps.js';

// Import extracted validator modules (FULLY WIRED - single source of truth)
import {
  validateComponentFrontmatter,
  validateOverviewFrontmatter,
  validateWorkflowOrFoundationFrontmatter,
} from './frontmatter.js';
import { validateOverviewLinks, validateSpecMarkdownPairing } from './linking.js';
import { validateSpecYamlFiles } from './yaml.js';
import {
  buildRegistryIndexes,
  validateTokenReferences,
  validateTokenFallbacks,
} from './token-references.js';
import {
  validateSectionOrder,
  validateComponentDocFileName,
  validateVariableIds,
  validateEditorialPlaceholders,
  validateInternalLinks,
} from './markdown-quality.js';
import {
  buildLineStarts,
  lineFromOffset,
  collectMarkdownFiles,
  collectSpecFiles,
} from './runtime-utils.js';
import { loadRuleManifest, annotateFindingsWithManifest, createBaseReport } from './governance.js';

// ============================================================================
// Internal Type Definitions (not exported - use docs-validator-types.ts for public API)
// ============================================================================

interface RegistryIndexes {
  keySet: Set<string>;
  lowerMap: Map<string, string>;
  dotRoots: Set<string>;
  slashRoots: Set<string>;
  entriesByKey: Map<string, unknown>;
}

interface TokenResolution {
  ok: boolean;
  resolvedAs?: string;
  suggested?: string;
  message?: string;
}

interface ManifestInfo {
  path: string;
  checks: Record<string, { rule_ids?: string[]; blocking?: boolean }>;
  loaded: boolean;
  error: string | null;
}

interface SpecResolution {
  specPath: string;
  exists: boolean;
  status: string;
  componentSetNodeIdRaw: string;
  componentSetNodeId: string;
  parsed: Record<string, unknown> | null;
  parseError: string | null;
}

interface VisualProofSection {
  hasOverview: boolean;
  hasSection: boolean;
  headingOffset: number;
  body: string;
}

interface MarkdownTable {
  headerCells: string[];
  headerOffset: number;
  rows: { cells: string[]; offset: number }[];
}

// ============================================================================
// Constants
// ============================================================================

const HASH_RE = /^[a-f0-9]{64}$/i;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CANONICAL_COMPONENT_LIST_HEADING = 'component list';
const OVERVIEW_ENTRY_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
const OVERVIEW_TARGET_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*\.md$/;

const FILE_HASH_CACHE = new Map<string, { digest: string; size: number; mtimeMs: number }>();
const FILE_HASH_CACHE_MAX_ENTRIES = 1_000;

// Get system context for default paths (context-aware, supports active system)
const _defaultCtx = resolveSystemContextSafe();
const PROJECT_ROOT = process.cwd();
const DEFAULT_SPEC_COMPONENTS_DIR = path.resolve(PROJECT_ROOT, _defaultCtx.paths.specs);
const DEFAULT_TOKEN_REGISTRY_PATH = path.resolve(PROJECT_ROOT, _defaultCtx.paths.tokenRegistry);
const RULE_MANIFEST_PATH = path.join(PROJECT_ROOT, '.agents', 'rules', '_manifest.yml');

// ============================================================================
// Utility Functions
// ============================================================================

function toCliPath(filePath: string): string {
  const resolved = path.resolve(String(filePath || ''));
  const relative = path.relative(process.cwd(), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return resolved;
  }
  return relative;
}

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

function sha256FileCached(filePath: string): string {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  const size = Number(stat.size || 0);
  const mtimeMs = Number(stat.mtimeMs || 0);

  const cached = FILE_HASH_CACHE.get(resolved);
  if (cached && cached.size === size && cached.mtimeMs === mtimeMs && typeof cached.digest === 'string') {
    return cached.digest;
  }

  if (!FILE_HASH_CACHE.has(resolved) && FILE_HASH_CACHE.size >= FILE_HASH_CACHE_MAX_ENTRIES) {
    const firstKey = FILE_HASH_CACHE.keys().next().value;
    if (firstKey) FILE_HASH_CACHE.delete(firstKey);
  }

  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(resolved));
  const digest = hash.digest('hex');
  FILE_HASH_CACHE.set(resolved, { digest, size, mtimeMs });
  return digest;
}

function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHeadingText(text: string): string {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeMarkdownAnchor(value: string): string {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function slugifyHeading(text: string): string {
  const normalized = String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[`*_~()[\]{}!?.:,;'"\\/<>@#$%^&+=|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized;
}

function normalizeLinkTarget(rawTarget: string): string {
  let target = String(rawTarget || '').trim();
  if (!target) return '';
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }
  const whitespaceIndex = target.search(/\s/);
  if (whitespaceIndex > 0) {
    target = target.slice(0, whitespaceIndex).trim();
  }
  return target;
}

function isExternalLinkTarget(target: string): boolean {
  const value = String(target || '').trim();
  if (!value) return false;
  if (value.startsWith('#')) return false;
  if (value.startsWith('//')) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function resolveInternalLink(filePath: string, target: string): {
  resolvedPath: string;
  anchor: string;
} {
  const hashIndex = target.indexOf('#');
  const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const anchorPart = hashIndex >= 0 ? target.slice(hashIndex + 1) : '';

  const resolvedPath = pathPart
    ? pathPart.startsWith('/')
      ? path.resolve(process.cwd(), pathPart.slice(1))
      : path.resolve(path.dirname(filePath), pathPart)
    : path.resolve(filePath);

  return {
    resolvedPath,
    anchor: normalizeMarkdownAnchor(anchorPart),
  };
}

// ============================================================================
// Spec Reading and Traceability
// ============================================================================

function readComponentSpecByDocPath(
  componentDocPath: string,
  specRoot: string,
  options: { specFilePath?: string } = {}
): SpecResolution {
  const explicitSpecFilePath = options.specFilePath ? path.resolve(options.specFilePath) : '';
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

  const absoluteHeadingOffset = overview.headingOffset + headingMatch.index;
  const afterHeadingRaw = overview.body.slice(
    headingMatch.index + headingMatch[0].length
  );
  const afterHeading = afterHeadingRaw.replace(/^\n+/, '');
  const nextH3Match = /^###\s+/m.exec(afterHeading);
  const body = (
    nextH3Match ? afterHeading.slice(0, nextH3Match.index) : afterHeading
  ).trim();

  return {
    hasOverview: true,
    hasSection: true,
    headingOffset: absoluteHeadingOffset,
    body,
  };
}

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

// ============================================================================
// Figma Traceability Validators
// ============================================================================

function validateMarkdownTraceabilityNodeId(
  filePath: string,
  frontmatter: Record<string, unknown>,
  specRoot: string,
  report: DocsValidationReport,
  specResolution: { specFilePath?: string }
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

function validateGeneratedTraceability(
  filePath: string,
  frontmatter: Record<string, unknown>,
  specRoot: string,
  registryPath: string,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  specResolution: { specFilePath?: string }
): void {
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  if (!spec.exists || spec.parseError) return;
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
}

function validateReadyLifecycleConsistency(
  filePath: string,
  rawMarkdown: string,
  frontmatter: Record<string, unknown>,
  specRoot: string,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  specResolution: { specFilePath?: string }
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

function validateVisualProofSection(
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
      message: 'Component markdown is `ready` but missing `### Visual Proof` under `## Overview`.',
    });
    return;
  }

  if (/\bTBD\b/i.test(visualProof.body)) {
    report.errors.push({
      code: 'VIS01',
      file: filePath,
      line: lineFromOffsetFn(lineStarts, fallbackOffset),
      message: 'Component markdown is `ready` but `### Visual Proof` still contains `TBD`.',
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

// ============================================================================
// Gaps Section Validator
// ============================================================================

function validateGapsSectionContract(
  filePath: string,
  rawMarkdown: string,
  specRoot: string,
  registry: Record<string, unknown>,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  specResolution: { specFilePath?: string }
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
  const sameOrder = sameLength && actualLines.every((line, index) => line === expectedLines[index]);
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

// ============================================================================
// Main validateDocs Export
// ============================================================================

/**
 * Validates documentation integrity, structure, and token references.
 *
 * @param options - Validation options
 * @returns Validation report with errors, warnings, and summary
 */
export function validateDocs(options: DocsValidatorOptions = {}): DocsValidationReport {
  // Use system context for default paths (context-aware, supports active system)
  const ctx = resolveSystemContextSafe();
  const docsRoot = path.resolve(options.docsRoot || ctx.paths.docs);
  const specRoot = path.resolve(options.specRoot || ctx.paths.specs);
  const explicitSpecFilePath = options.specFilePath ? path.resolve(options.specFilePath) : null;
  const registryPath = path.resolve(options.registryPath || ctx.paths.tokenRegistry);
  const explicitFilePath = options.filePath ? path.resolve(options.filePath) : null;
  const allowExtraH2 = options.allowExtraH2 === true;
  const checkPairing = options.checkPairing !== false;
  const checkOverview = explicitFilePath ? false : options.checkOverview !== false;
  const checkSpecs =
    options.checkSpecs !== false && (!explicitFilePath || Boolean(explicitSpecFilePath));

  const report = createBaseReport({ manifestPath: RULE_MANIFEST_PATH });
  const manifestInfo = loadRuleManifest(options.manifestPath || RULE_MANIFEST_PATH);
  report.governance.manifestPath = manifestInfo.path;
  report.governance.manifestLoaded = manifestInfo.loaded;
  if (manifestInfo.error) {
    report.errors.push({
      code: 'GOV01',
      file: manifestInfo.path,
      message: `Failed to parse rule manifest: ${manifestInfo.error}`,
    });
  }

  let registry: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(raw);
    
    // Normalize registry structure: support both legacy and new indexed format
    // New format: { entries: [...], byPath: {...}, bySlashPath: {...} }
    // Legacy format: [{ path, ... }, ...] or direct Record<string, entry>
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.entries) && parsed.byPath) {
        // New indexed format: merge byPath and bySlashPath
        registry = { ...parsed.byPath, ...parsed.bySlashPath };
      } else {
        // Already a Record or legacy format
        registry = parsed as Record<string, unknown>;
      }
    } else if (Array.isArray(parsed)) {
      // Legacy array format: convert to Record
      registry = Object.fromEntries(
        parsed
          .filter((entry: Record<string, unknown>) => entry && typeof entry === 'object')
          .map((entry: Record<string, unknown>) => {
            const pathKey = String(entry.path || '').trim();
            const slashKey = String(entry.slashPath || '').trim();
            return pathKey ? [pathKey, entry] : slashKey ? [slashKey, entry] : null;
          })
          .filter(Boolean) as Array<[string, Record<string, unknown>]>
      );
    } else {
      registry = parsed as Record<string, unknown>;
    }
  } catch (error) {
    report.errors.push({
      code: 'REG01',
      file: registryPath,
      message:
        `${error instanceof Error ? error.message : String(error)}. ` +
        'Run `npm run generate:registry` before validating docs.',
    });
    report.ok = false;
    report.summary.errors = report.errors.length;
    return report;
  }

  const registryIndexes = buildRegistryIndexes(registry);
  const markdownFiles = collectMarkdownFiles(docsRoot, explicitFilePath);
  const componentFiles: string[] = [];

  const specResolution: { specFilePath?: string } =
    explicitFilePath && explicitSpecFilePath ? { specFilePath: explicitSpecFilePath } : {};

  // Process each markdown file
  for (const filePath of markdownFiles) {
    if (!fs.existsSync(filePath)) {
      report.errors.push({
        code: 'DOC01',
        file: filePath,
        message: 'Markdown file not found.',
      });
      continue;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const lineStarts = buildLineStarts(raw);
    let frontmatter: Record<string, unknown> = {};
    let content = raw;
    try {
      const parsed = parseMarkdownFrontmatter(raw);
      frontmatter = parsed.frontmatter as Record<string, unknown>;
      content = parsed.content;
    } catch (error) {
      report.errors.push({
        code: 'FM01',
        file: filePath,
        message: `Invalid markdown frontmatter: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    const contentOffset = raw.length - content.length;
    const isOverview = path.basename(filePath) === 'overview.md';

    report.summary.filesChecked += 1;
    if (isOverview) {
      // Validate overview frontmatter
      validateOverviewFrontmatter(filePath, frontmatter, report);
      continue;
    }

    const docType = String(frontmatter.doc_type || '').trim().toLowerCase();
    const treatAsComponent = docType === 'component' || !docType;

    if (treatAsComponent) {
      componentFiles.push(filePath);

      // Validate component filename
      validateComponentDocFileName(filePath, report);

      // Validate component frontmatter
      validateComponentFrontmatter(filePath, frontmatter, report);

      // Validate section order
      validateSectionOrder(
        filePath,
        content,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset,
        { allowExtraH2 }
      );

      // Validate variable IDs
      validateVariableIds(filePath, raw, report, lineStarts, lineFromOffset);

      // Validate editorial placeholders
      validateEditorialPlaceholders(
        filePath,
        content,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset
      );

      // Validate internal links
      validateInternalLinks(filePath, raw, report, lineStarts, lineFromOffset);

      // Validate token references
      validateTokenReferences(
        filePath,
        content,
        registryIndexes,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset
      );

      // Validate token fallbacks
      validateTokenFallbacks(
        filePath,
        content,
        registryIndexes,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset
      );

      // Validate gaps section contract
      validateGapsSectionContract(
        filePath,
        raw,
        specRoot,
        registry,
        report,
        lineStarts,
        lineFromOffset,
        specResolution
      );

      // Validate visual proof section
      validateVisualProofSection(
        filePath,
        raw,
        frontmatter,
        report,
        lineStarts,
        lineFromOffset
      );

      // Validate traceability node ID
      validateMarkdownTraceabilityNodeId(
        filePath,
        frontmatter,
        specRoot,
        report,
        specResolution
      );

      // Validate generated traceability
      validateGeneratedTraceability(
        filePath,
        frontmatter,
        specRoot,
        registryPath,
        report,
        lineStarts,
        lineFromOffset,
        specResolution
      );

      // Validate ready lifecycle consistency
      validateReadyLifecycleConsistency(
        filePath,
        raw,
        frontmatter,
        specRoot,
        report,
        lineStarts,
        lineFromOffset,
        specResolution
      );
    } else {
      // Validate workflow/foundation frontmatter
      validateWorkflowOrFoundationFrontmatter(filePath, frontmatter, report);
    }
  }

  // Validate spec-markdown pairing
  if (checkPairing) {
    validateSpecMarkdownPairing({
      componentFiles,
      docsRoot,
      specRoot,
      checkSpecs,
      explicitSpecFilePath,
      explicitFilePath,
      report,
    });
  }

  // Validate spec YAML files
  if (checkSpecs) {
    validateSpecYamlFiles({
      specRoot,
      report,
      explicitSpecFilePath,
      collectSpecFiles,
    });
  }

  // Validate overview links
  if (checkOverview) {
    validateOverviewLinks({
      docsRoot,
      componentFiles,
      report,
    });
  }

  // Annotate findings with manifest
  annotateFindingsWithManifest(report.errors, manifestInfo.checks);
  annotateFindingsWithManifest(report.warnings, manifestInfo.checks);

  report.summary.errors = report.errors.length;
  report.summary.warnings = report.warnings.length;
  report.ok = report.summary.errors === 0;
  return report;
}

/**
 * Re-export for backwards compatibility.
 */
export { validateDocs as validateDocsJs };
