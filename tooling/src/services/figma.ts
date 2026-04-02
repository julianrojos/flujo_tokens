/**
 * Figma Traceability Validators
 *
 * Validate Figma traceability, visual proof, gaps section, and lifecycle consistency.
 * Migrated from tooling/scripts/lib/validators/figma.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { normalizeNodeId, isValidNodeId } from '../utils/figma-node-id.js';
import { isTbdMarker } from '../utils/tbd.js';
import { extractSectionBody } from './markdown-sections.js';
import { TRACEABILITY_CONTRACT_VERSION } from './docs-config.js';
import { deriveFigmaFrontmatterTraceability } from './figma-traceability.js';
import { sha256FileCached } from '../utils/file-hash.js';
import { escapeRegex, getH2SectionRange, findDiscrepancyStatuses, extractVisualProof } from './markdown-doc-parser.js';
import { toCliPath, buildTraceabilityRegenerationCommand } from './traceability-command.js';
import type { FigmaNode } from '../types/figma.js';
import { readComponentSpecByDocPath, type ComponentSpec, type SpecResolution } from './spec-loader.js';
import { bootstrapDatabase } from '../../../apps/ds-dashboard/server/db/db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import { PROJECT_ROOT, loadDesignSystemsConfig, resolveSystemContextSafe } from '../utils/system-context.js';
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

const HASH_RE = /^[a-f0-9]{64}$/i;
const dbSpecSnapshotBySystemAndSlugCache = new Map<string, Map<string, DbSpecSnapshot>>();
const systemIdBySpecRootCache = new Map<string, string | null>();
const dbSnapshotLoadErrorBySystem = new Map<string, string>();

type DbSpecSnapshot = {
  existsInDb: boolean;
  slug: string;
  componentSetNodeIdRaw: string;
  componentSetNodeId: string;
  componentStatus: string;
  editorialExists: boolean;
};

function loadDbSpecSnapshotBySlug(systemId: string): void {
  if (dbSpecSnapshotBySystemAndSlugCache.has(systemId)) return;
  try {
    const ctx = resolveSystemContextSafe({ system: systemId });
    const db = bootstrapDatabase({ dbPath: ctx.paths.registry });
    try {
      const repo = new ComponentRepository(db);
      const rows = repo.getAll(ctx.id);
      const bySlug = new Map<string, DbSpecSnapshot>();
      for (const row of rows) {
        const slug = String(row.slug || '').trim();
        if (!slug) continue;
        const componentSetNodeIdRaw = String(row.figmaComponentSetNodeId || '').trim();
        bySlug.set(slug, {
          existsInDb: true,
          slug,
          componentSetNodeIdRaw,
          componentSetNodeId: normalizeNodeId(componentSetNodeIdRaw),
          componentStatus: String(row.status || '').trim().toLowerCase(),
          editorialExists: Boolean(row.editorialExists),
        });
      }
      dbSpecSnapshotBySystemAndSlugCache.set(systemId, bySlug);
      dbSnapshotLoadErrorBySystem.delete(systemId);
    } finally {
      db.close();
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    dbSnapshotLoadErrorBySystem.set(systemId, reason);
  }
}

type DbSnapshotLookupResult = {
  snapshot: DbSpecSnapshot | null;
  dbUnavailableReason?: string;
};

function resolveSystemIdFromSpecRoot(specRoot?: string): string | null {
  const normalizedRoot = String(specRoot || "").trim();
  if (!normalizedRoot) return null;
  const absoluteSpecRoot = path.resolve(normalizedRoot);
  if (systemIdBySpecRootCache.has(absoluteSpecRoot)) {
    return systemIdBySpecRootCache.get(absoluteSpecRoot) || null;
  }
  try {
    const config = loadDesignSystemsConfig();
    for (const system of config.systems || []) {
      const candidateSpecRoot = path.resolve(PROJECT_ROOT, system.docsDir, "_spec", "components");
      if (candidateSpecRoot === absoluteSpecRoot) {
        systemIdBySpecRootCache.set(absoluteSpecRoot, system.id);
        return system.id;
      }
    }
  } catch {
    // Best-effort lookup; fall back to default system context.
  }
  systemIdBySpecRootCache.set(absoluteSpecRoot, null);
  return null;
}

function getDbSpecSnapshotByDocPath(componentDocPath: string, specRoot?: string): DbSnapshotLookupResult {
  const explicitSpecRoot = String(specRoot || "").trim();
  let systemId = resolveSystemIdFromSpecRoot(specRoot) || "";
  if (explicitSpecRoot && !systemId) {
    return {
      snapshot: null,
      dbUnavailableReason: `Spec root is not mapped to a configured design system: ${path.resolve(explicitSpecRoot)}`,
    };
  }
  try {
    if (!systemId) {
      const ctx = resolveSystemContextSafe();
      systemId = String(ctx.id || "").trim();
    }
  } catch {
    return { snapshot: null, dbUnavailableReason: "Unable to resolve system context." };
  }
  if (!systemId) return { snapshot: null, dbUnavailableReason: "System context is empty." };
  loadDbSpecSnapshotBySlug(systemId);
  const dbUnavailableReason = dbSnapshotLoadErrorBySystem.get(systemId);
  if (dbUnavailableReason) {
    return { snapshot: null, dbUnavailableReason };
  }
  const slug = path.basename(componentDocPath, path.extname(componentDocPath));
  const normalized = String(slug || '').trim();
  if (!normalized) return { snapshot: null };
  return { snapshot: dbSpecSnapshotBySystemAndSlugCache.get(systemId)?.get(normalized) || null };
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
    const lookup = getDbSpecSnapshotByDocPath(filePath, specRoot);
    const dbSpec = lookup.snapshot;
    if (lookup.dbUnavailableReason) {
      report.errors.push({
        code: 'TRACE01',
        file: filePath,
        message:
          `Traceability check requires DB snapshot but it is unavailable: ${lookup.dbUnavailableReason}`,
      });
      return;
    }
    if (!dbSpec?.existsInDb) {
      report.errors.push({
        code: 'TRACE01',
        file: filePath,
        message:
          'Traceability mismatch: markdown declares figma.component_set_node_id but no DB component entry was found.',
      });
      return;
    }

    if (!dbSpec.componentSetNodeIdRaw || isTbdMarker(dbSpec.componentSetNodeIdRaw)) {
      report.errors.push({
        code: 'TRACE01',
        file: filePath,
        message:
          'Traceability mismatch: markdown declares figma.component_set_node_id but DB component has no concrete figma_component_set_node_id.',
      });
      return;
    }

    if (dbSpec.componentSetNodeId !== markdownNodeId) {
      report.errors.push({
        code: 'TRACE01',
        file: filePath,
        message:
          `Traceability mismatch: markdown figma.component_set_node_id (${markdownNodeId}) ` +
          `differs from DB value (${dbSpec.componentSetNodeId}).`,
      });
    }
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
      const lookup = getDbSpecSnapshotByDocPath(filePath, specRoot);
      const dbSpec = lookup.snapshot;
      if (lookup.dbUnavailableReason) {
        report.errors.push({
          code: 'READY01',
          file: filePath,
          message:
            `Lifecycle validation requires DB snapshot but it is unavailable: ${lookup.dbUnavailableReason}`,
        });
        return;
      }
      if (!dbSpec?.existsInDb) {
        report.errors.push({
          code: 'READY01',
          file: filePath,
          message:
            'Component markdown is `ready` but no DB component entry was found for lifecycle validation.',
        });
      } else if (dbSpec.componentStatus !== 'ready') {
        report.errors.push({
          code: 'READY01',
          file: filePath,
          message:
            `Component markdown is \`ready\` but DB component status is \`${dbSpec.componentStatus || 'missing'}\`.`,
        });
      }
    }
    if (spec.exists && spec.parseError) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: 'Component markdown is `ready` but linked spec could not be parsed.',
        suggested: path.relative(process.cwd(), spec.specPath),
      });
      return;
    }
    if (spec.exists && specStatus !== 'ready') {
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
