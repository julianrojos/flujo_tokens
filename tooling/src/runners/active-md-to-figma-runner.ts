#!/usr/bin/env node

/**
 * Active Markdown to Figma Runner
 *
 * Render active markdown documentation to Figma using themed renderer.
 * TypeScript runner for ds-active-md-to-figma script.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseArgs } from '../utils/parse-args.js';
import { isMain } from '../utils/is-main.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { resolveSystemContextSafe, DEFAULT_THEME_PATH, PROJECT_ROOT } from '../utils/system-context.js';
import {
  normalizeComponentName,
  componentNameToSnakeCase,
} from '../utils/component-name.js';
import {
  computeFingerprint,
  loadSyncState,
  shouldSkipTask,
  updateTaskState,
} from '../utils/cache-utils.js';
import { runAgentPrompt } from '../services/agent-runner.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { normalizeNodeId, isValidNodeId } from '../utils/figma-node-id.js';
import { isTbdMarker } from '../utils/tbd.js';
import { runOrThrow } from '../utils/exec.js';
import { syncDocumentationIndices } from '../services/component-registry-index.js';
import { TempArtifactManager } from '../services/temp-artifacts.js';
import { validateDocs } from '../services/docs-validator.js';
import { DEFAULT_TOKEN_REGISTRY_PATH } from '../services/token-registry.js';
import { logger } from '../utils/logger.js';

/**
 * Validate spec pre-flight.
 */
function validateSpecPreflight(specPath: string, tokenRegistryPath: string): void {
  const report = validateDocs({
    docsRoot: path.join(PROJECT_ROOT, '__docs_validation_stub__'),
    registryPath: tokenRegistryPath,
    checkOverview: false,
    checkSpecs: true,
    checkPairing: false,
    specFilePath: specPath,
  });

  if (report.ok) return;

  const specErrors = report.errors.filter(
    (error: { file?: string }) =>
      path.resolve(String(error.file || '')) === path.resolve(specPath),
  );
  const payload = {
    file: specPath,
    errors: specErrors.length > 0 ? specErrors : report.errors,
  };
  throw new Error(
    'Spec validation failed. Rendering to Figma was blocked.\n' +
    `Run: npm run validate:docs -- --spec-file "${specPath}" --no-overview true\n` +
    `${JSON.stringify(payload, null, 2)}`,
  );
}

/**
 * Detect markdown staleness.
 */
function detectMarkdownStaleness({
  specPath,
  markdownPath,
  syncStatePath,
}: {
  specPath: string;
  markdownPath: string;
  syncStatePath?: string;
}): { stale: boolean; reason: string; taskId?: string } {
  const specPathResolved = path.resolve(specPath);
  const markdownPathResolved = path.resolve(markdownPath);
  const taskId = `ds-component-doc:${specPathResolved}->${markdownPathResolved}`;
  const state: { tasks?: Record<string, unknown> } = syncStatePath
    ? (loadSyncState(syncStatePath) || { tasks: {} })
    : { tasks: {} };
  const task = state.tasks?.[taskId] as Record<string, unknown> | undefined;
  const currentSpecHash = computeFingerprint({ files: [specPathResolved] });

  if (task && typeof task === 'object' && 'metadata' in task && task.metadata && typeof task.metadata === 'object' && 'specHashAtGeneration' in task.metadata) {
    const specHashAtGeneration = String((task.metadata as Record<string, unknown>).specHashAtGeneration);
    if (specHashAtGeneration === currentSpecHash) {
      return {
        stale: false,
        reason: 'spec_unchanged_since_markdown_generation',
      };
    }
    return {
      stale: true,
      reason: 'spec_changed_since_markdown_generation',
      taskId,
    };
  }

  // Backward-compatible fallback for older sync state entries.
  const specMtime = fs.statSync(specPathResolved).mtimeMs;
  const markdownMtime = fs.statSync(markdownPathResolved).mtimeMs;
  if (specMtime > markdownMtime) {
    return {
      stale: true,
      reason: 'spec_newer_than_markdown',
      taskId,
    };
  }

  return { stale: false, reason: 'timestamp_fallback_allows_render' };
}

/**
 * Extract JSON objects from text.
 */
function extractJsonObjects(rawText: string): Record<string, unknown>[] {
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

  const fencedMatches = text.matchAll(/```json\s*([\s\S]*?)```/gi);
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
 * Get first non-empty value.
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
 * Extract string field from object safely.
 */
function extractStringField(
  obj: Record<string, unknown>,
  key: string,
  fallback: string | null = null,
): string | null {
  const value = obj[key];
  if (typeof value === 'string') return value.trim();
  return fallback;
}

/**
 * Extract number field from object safely.
 */
function extractNumberField(
  obj: Record<string, unknown>,
  key: string,
  fallback: number | null = null,
): number | null {
  const value = obj[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

/**
 * Get value from path expression.
 */
function getPathValue(
  source: unknown,
  pathExpression: string,
  fallbackValue: unknown = null,
): unknown {
  const root = source && typeof source === 'object' ? source : null;
  if (!root) return fallbackValue;
  const pathParts = String(pathExpression || '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  let current: unknown = root;
  for (const part of pathParts) {
    if (
      !current ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return fallbackValue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current == null ? fallbackValue : current;
}

/**
 * Parse as finite number.
 */
function asFiniteNumber(rawValue: unknown): number | null {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse as boolean.
 */
function asBoolean(rawValue: unknown): boolean | null {
  if (typeof rawValue === 'boolean') return rawValue;
  if (typeof rawValue === 'number') return rawValue !== 0;
  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return null;
}

/**
 * Normalize render report.
 */
interface RenderReport {
  ok: boolean;
  raw: Record<string, unknown>;
  targetSectionId: unknown;
  targetSectionName: unknown;
  themeName: unknown;
  offsetXApplied: number | null;
  unsupportedBlocks: unknown[];
  unsupportedBlocksCount: number;
  componentSetId: unknown;
  componentSectionId: unknown;
  renderedCount: Record<string, unknown> | null;
}

function normalizeRenderReport(raw: Record<string, unknown>): RenderReport {
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

  const renderedCountRaw = firstPresent(
    report.renderedCount,
    report.rendered_count,
  );
  const renderedCount =
    renderedCountRaw && typeof renderedCountRaw === 'object'
      ? (renderedCountRaw as Record<string, unknown>)
      : null;

  return {
    ok: report.ok !== false,
    raw: report,
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
 * Parse render report from output.
 */
function parseRenderReportFromOutput(rawText: string): RenderReport | null {
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
 * Read theme name from theme file.
 */
function readThemeName(themePath: string): string {
  const parsed = parseYamlDocument(
    fs.readFileSync(themePath, 'utf8'),
    `theme YAML (${path.basename(themePath)})`,
  );
  const name = String((parsed as Record<string, unknown>)?.name || '').trim();
  if (!name) {
    throw new Error(
      `Missing required theme name in ${themePath}. Expected top-level "name".`,
    );
  }
  return name;
}

/**
 * Write agent output file.
 */
function writeAgentOutput({
  tempArtifacts,
  generatedDir,
  fileBase,
  suffix,
  content,
}: {
  tempArtifacts: TempArtifactManager;
  generatedDir: string;
  fileBase: string;
  suffix: string;
  content: string;
}): string {
  const safeSuffix = String(suffix || 'agent-output').trim();
  const outputPath = path.resolve(generatedDir, `${fileBase}.${safeSuffix}.txt`);
  return tempArtifacts.writeTrackedFile(outputPath, content, 'utf8');
}

/**
 * Cleanup legacy temp outputs.
 */
function cleanupLegacyTempOutputs({
  tempArtifacts,
  generatedDir,
  fileBase,
}: {
  tempArtifacts: TempArtifactManager;
  generatedDir: string;
  fileBase: string;
}): string[] {
  const allowedNames = new Set([
    `${fileBase}.render-agent-output.txt`,
    `${fileBase}.render-audit-output.txt`,
  ]);
  return tempArtifacts.purgeMatching({
    dir: generatedDir,
    matcher: (name: string, _absolutePath: string) => allowedNames.has(name),
  });
}

/**
 * Read render expectations from payload.
 */
function readRenderExpectations({
  payloadPath,
  componentName,
}: {
  payloadPath: string;
  componentName: string;
}): {
  expectedCardCount: number;
  expectedTableCount: number;
  expectedSectionName: string;
} {
  if (!fs.existsSync(payloadPath)) {
    throw new Error(
      'Missing render payload for structural checks.\n' +
      `Expected: ${path.resolve(payloadPath)}`,
    );
  }

  let parsed: unknown;
  try {
    const content = fs.readFileSync(payloadPath, 'utf8');
    parsed = JSON.parse(content);
  } catch (error) {
    const content = fs.readFileSync(payloadPath, 'utf8');
    const truncated = content.slice(0, 200).replace(/\n/g, '\\n');
    throw new Error(
      `Failed to parse render payload JSON at ${path.resolve(payloadPath)}.\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}\n` +
      `Content (first 200 chars): ${truncated}...`
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(
      `Invalid render payload structure at ${path.resolve(payloadPath)} (expected object).`
    );
  }

  const model = isPlainObject(parsed.model) ? parsed.model : {};
  const blocks = Array.isArray((model as Record<string, unknown>).blocks)
    ? ((model as Record<string, unknown>).blocks as Record<string, unknown>[])
    : [];
  const expectedCardCount = blocks.filter(
    (block) => block?.type === 'heading' && Number(block.level) === 2,
  ).length;
  const expectedTableCount = blocks.filter(
    (block) => block?.type === 'table',
  ).length;
  const sectionNamePattern = String(
    getPathValue(parsed, 'theme.layout.target.section_name_pattern', 'Doc/{component_name}'),
  ).trim();
  const expectedSectionName = sectionNamePattern.includes('{component_name}')
    ? sectionNamePattern.replace(new RegExp('{component_name}', 'g'), componentName)
    : sectionNamePattern || `Doc/${componentName}`;

  return {
    expectedCardCount,
    expectedTableCount,
    expectedSectionName,
  };
}

/**
 * Validate primary render report.
 */
function validatePrimaryRenderReport({
  renderReport,
  expectations,
}: {
  renderReport: RenderReport;
  expectations: { expectedCardCount: number; expectedTableCount: number };
}): { ok: boolean; issues: string[] } {
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
    const renderedTableCount = asFiniteNumber(renderReport.renderedCount.table);
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
 * Build render audit prompt.
 */
function buildRenderAuditPrompt({
  figmaUrl,
  targetSectionId,
  targetSectionName,
  expectedSectionName,
  expectedCardCount,
  expectedTableCount,
}: {
  figmaUrl: string;
  targetSectionId: string;
  targetSectionName: string;
  expectedSectionName: string;
  expectedCardCount: number;
  expectedTableCount: number;
}): string {
  return [
    'Context',
    '- Validate that the Figma documentation section was rendered by the themed markdown renderer (not a fallback renderer).',
    '',
    'Sources',
    figmaUrl ? `- Figma URL (if connection needed): ${figmaUrl}` : '',
    `- Target section id: ${targetSectionId}`,
    `- Target section name from render report: ${targetSectionName}`,
    `- Expected section name: ${expectedSectionName}`,
    `- Expected H2 card count: ${expectedCardCount}`,
    `- Expected table count: ${expectedTableCount}`,
    '',
    'Constraints',
    '- Read-only audit: do not modify any node.',
    '- Use figma_execute to inspect only descendants of the target section id.',
    '- has_doc_canvas: true only if a direct child FRAME named "Doc Canvas" exists.',
    '- card_count: number of descendant FRAME nodes with names starting with "Card/".',
    '- table_container_count: number of descendant FRAME nodes named exactly "Table".',
    '- header_row_count: number of descendant FRAME nodes named exactly "Header Row".',
    '- body_row_count: number of descendant FRAME nodes named exactly "Body Row".',
    "- pass must be true only when the structure is consistent with the expected themed renderer output.",
    '- Return exactly one JSON object and no prose.',
    '',
    'Expected Output',
    '- JSON keys: ok, pass, target_section_id, target_section_name, has_doc_canvas, card_count, table_container_count, header_row_count, body_row_count, reasons.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Normalize render audit report.
 */
interface RenderAuditReport {
  ok: boolean;
  pass: boolean | null;
  targetSectionId: unknown;
  targetSectionName: unknown;
  hasDocCanvas: boolean | null;
  cardCount: number | null;
  tableContainerCount: number | null;
  headerRowCount: number | null;
  bodyRowCount: number | null;
  reasons: unknown[];
  raw: Record<string, unknown>;
}

function normalizeRenderAuditReport(raw: Record<string, unknown>): RenderAuditReport {
  const report = raw && typeof raw === 'object' ? raw : {};
  return {
    ok: report.ok !== false,
    pass: asBoolean(firstPresent(report.pass, report.valid, report.is_valid)),
    targetSectionId: firstPresent(
      report.target_section_id,
      report.targetSectionId,
    ),
    targetSectionName: firstPresent(
      report.target_section_name,
      report.targetSectionName,
    ),
    hasDocCanvas: asBoolean(
      firstPresent(report.has_doc_canvas, report.hasDocCanvas),
    ),
    cardCount: asFiniteNumber(firstPresent(report.card_count, report.cardCount)),
    tableContainerCount: asFiniteNumber(
      firstPresent(report.table_container_count, report.tableContainerCount),
    ),
    headerRowCount: asFiniteNumber(
      firstPresent(report.header_row_count, report.headerRowCount),
    ),
    bodyRowCount: asFiniteNumber(
      firstPresent(report.body_row_count, report.bodyRowCount),
    ),
    reasons: Array.isArray(report.reasons) ? report.reasons : [],
    raw: report,
  };
}

/**
 * Parse render audit from output.
 */
function parseRenderAuditFromOutput(rawText: string): RenderAuditReport | null {
  const candidates = extractJsonObjects(rawText);
  if (candidates.length === 0) return null;
  const withAuditKeys = candidates.filter((candidate) =>
    Object.prototype.hasOwnProperty.call(candidate, 'has_doc_canvas') ||
    Object.prototype.hasOwnProperty.call(candidate, 'hasDocCanvas') ||
    Object.prototype.hasOwnProperty.call(candidate, 'card_count') ||
    Object.prototype.hasOwnProperty.call(candidate, 'cardCount'),
  );
  const selected =
    withAuditKeys.length > 0
      ? withAuditKeys[withAuditKeys.length - 1]
      : candidates[candidates.length - 1];
  return normalizeRenderAuditReport(selected);
}

/**
 * Validate render audit.
 */
function validateRenderAudit({
  audit,
  renderReport,
  expectations,
}: {
  audit: RenderAuditReport;
  renderReport: RenderReport;
  expectations: {
    expectedCardCount: number;
    expectedTableCount: number;
    expectedSectionName: string;
  };
}): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!audit.ok) {
    issues.push('Audit report marked the run as not ok.');
  }
  if (audit.pass !== true) {
    issues.push('Audit report did not pass structural validation.');
  }
  if (!audit.targetSectionId) {
    issues.push('Audit report is missing target_section_id.');
  }
  if (!audit.targetSectionName) {
    issues.push('Audit report is missing target_section_name.');
  }
  if (
    audit.targetSectionId &&
    renderReport.targetSectionId &&
    String(audit.targetSectionId) !== String(renderReport.targetSectionId)
  ) {
    issues.push('Audit target_section_id does not match render report.');
  }
  if (audit.hasDocCanvas !== true) {
    issues.push('Missing direct "Doc Canvas" frame in rendered section.');
  }
  if (audit.cardCount == null || audit.cardCount < expectations.expectedCardCount) {
    issues.push(
      `Card count below expected H2 sections (expected >= ${expectations.expectedCardCount}, got ${String(audit.cardCount)}).`,
    );
  }
  if (
    expectations.expectedSectionName &&
    audit.targetSectionName &&
    String(audit.targetSectionName) !== String(expectations.expectedSectionName)
  ) {
    issues.push(
      `Section name mismatch (expected "${expectations.expectedSectionName}", got "${audit.targetSectionName}").`,
    );
  }
  if (expectations.expectedTableCount > 0) {
    if (
      audit.tableContainerCount == null ||
      audit.tableContainerCount < expectations.expectedTableCount
    ) {
      issues.push(
        `Table container count below expected tables (expected >= ${expectations.expectedTableCount}, got ${String(audit.tableContainerCount)}).`,
      );
    }
    if (
      audit.headerRowCount == null ||
      audit.headerRowCount < expectations.expectedTableCount
    ) {
      issues.push(
        `Header row count below expected tables (expected >= ${expectations.expectedTableCount}, got ${String(audit.headerRowCount)}).`,
      );
    }
    if (
      audit.bodyRowCount == null ||
      audit.bodyRowCount < expectations.expectedTableCount
    ) {
      issues.push(
        `Body row count below expected tables (expected >= ${expectations.expectedTableCount}, got ${String(audit.bodyRowCount)}).`,
      );
    }
  }
  return {
    ok: issues.length === 0,
    issues,
  };
}

/**
 * Active markdown to Figma arguments.
 */
export interface ActiveMdToFigmaArgs {
  markdown?: string;
  'component-name'?: string;
  'spec-file'?: string;
  'skip-validation'?: string;
  force?: string;
  'sync-state'?: string;
  'token-registry'?: string;
  'capture-proof'?: string;
  'capture-proof-strict'?: string;
  'component-set-id'?: string;
  theme?: string;
  'generated-dir'?: string;
  'offset-x'?: string;
  url?: string;
  agent?: string;
  system?: string;
}

/**
 * Main active markdown to Figma function.
 */
export async function runActiveMdToFigma(
  args: ActiveMdToFigmaArgs = {},
): Promise<void> {
  const activeMarkdown =
    args.markdown ||
    process.env.ANTIGRAVITY_ACTIVE_FILE ||
    process.env.ACTIVE_FILE ||
    process.env.AG_ACTIVE_FILE;

  if (!activeMarkdown) {
    logger.error(
      'Missing active markdown path.\nUse --markdown <path> (and optionally --agent codex|claude|gemini) or export ANTIGRAVITY_ACTIVE_FILE.',
    );
    process.exit(1);
  }

  const markdownPath = path.resolve(activeMarkdown);
  if (!fs.existsSync(markdownPath)) {
    logger.error(`Markdown file not found: ${markdownPath}`);
    process.exit(1);
  }
  const ctx = resolveSystemContextSafe({ system: args.system });

  const fileBase = path.basename(markdownPath, path.extname(markdownPath));
  const normalizedName = normalizeComponentName(
    args['component-name'] || fileBase,
  );
  const componentName = normalizedName.displayName || 'Component';
  const componentSlug =
    normalizedName.fileSlug || componentNameToSnakeCase(fileBase);
  const specPath = path.resolve(
    args['spec-file'] ||
    path.join(ctx.paths.specs, `${componentSlug}.yml`),
  );

  if (!fs.existsSync(specPath)) {
    logger.error(
      'Missing required spec file.\n' +
      `Spec: ${specPath}\n` +
      `Run: npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}"`,
    );
    process.exit(1);
  }

  const skipValidation = String(args['skip-validation'] || 'false') === 'true';
  const force = String(args.force || 'false') === 'true';
  const syncStatePath = args['sync-state'] || undefined;
  const tokenRegistryPath =
    args['token-registry'] || ctx.paths.tokenRegistry;
  const captureProof = String(args['capture-proof'] || 'true') !== 'false';
  const captureProofStrict = String(args['capture-proof-strict'] || 'false') === 'true';

  if (skipValidation && !force) {
    logger.error(
      'Validation gate bypass requires explicit force.\n' +
      'Use `--skip-validation true --force true` only for exceptional cases.',
    );
    process.exit(1);
  }

  let specStatus = 'draft';
  let specNodeId = '';
  try {
    const specParsed = parseYamlDocument(
      fs.readFileSync(specPath, 'utf8'),
      `spec YAML (${path.basename(specPath)})`,
    ) as Record<string, unknown>;
    specStatus = String(specParsed.status || 'draft')
      .trim()
      .toLowerCase();
    const specFigma =
      specParsed && typeof specParsed.figma === 'object'
        ? (specParsed.figma as Record<string, unknown>)
        : {};
    const specNodeIdRaw = String(specFigma?.component_set_node_id || '').trim();
    if (specNodeIdRaw && !isTbdMarker(specNodeIdRaw)) {
      const normalizedSpecNodeId = normalizeNodeId(specNodeIdRaw);
      if (!isValidNodeId(normalizedSpecNodeId)) {
        if (specStatus === 'ready') {
          logger.error(
            'Invalid figma.component_set_node_id in ready spec.\n' +
            `Spec: ${specPath}\n` +
            'Expected format: 123:456',
          );
          process.exit(1);
        }
        logger.warn(
          `Warning: ignoring invalid figma.component_set_node_id in spec (${specNodeIdRaw}).`,
        );
      } else {
        specNodeId = normalizedSpecNodeId;
      }
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const cliNodeIdRaw = String(args['component-set-id'] || '').trim();
  const cliNodeId = cliNodeIdRaw ? normalizeNodeId(cliNodeIdRaw) : '';
  if (cliNodeId && !isValidNodeId(cliNodeId)) {
    logger.error(
      'Invalid --component-set-id format.\n' +
      `Provided: ${cliNodeIdRaw}\n` +
      'Expected format: 123:456',
    );
    process.exit(1);
  }

  if (cliNodeId && specNodeId && cliNodeId !== specNodeId && !force) {
    logger.error(
      'Traceability mismatch between CLI and spec.\n' +
      `CLI --component-set-id: ${cliNodeId}\n` +
      `Spec figma.component_set_node_id: ${specNodeId}\n` +
      'Use --force true only if you intentionally want to override the spec.',
    );
    process.exit(1);
  }

  const resolvedComponentSetId = cliNodeId || specNodeId || '';
  if (!resolvedComponentSetId) {
    if (specStatus === 'ready') {
      logger.error(
        'Missing figma.component_set_node_id for ready spec.\n' +
        `Spec: ${specPath}\n` +
        'Add figma.component_set_node_id to the spec to keep Figma placement deterministic.',
      );
      process.exit(1);
    }
    logger.warn(
      'Warning: component_set_node_id not available. Falling back to name-based lookup (non-deterministic).',
    );
  }

  if (!skipValidation) {
    const validationReport = validateDocs({
      filePath: markdownPath,
      specFilePath: specPath,
      checkOverview: false,
      registryPath: tokenRegistryPath,
    });
    if (!validationReport.ok) {
      logger.error(
        'Documentation validation failed. Rendering to Figma was blocked.',
      );
      process.stdout.write(`${JSON.stringify(validationReport, null, 2)}\n`);
      process.exit(1);
    }

    try {
      validateSpecPreflight(specPath, tokenRegistryPath);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  if (!force) {
    const staleness = detectMarkdownStaleness({
      specPath,
      markdownPath,
      syncStatePath,
    });
    if (staleness.stale) {
      logger.error(
        'Markdown is stale relative to its source spec. Rendering to Figma was blocked.\n' +
        `Reason: ${staleness.reason}\n` +
        `Spec: ${specPath}\n` +
        `Markdown: ${markdownPath}\n` +
        `Run: npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}"\n` +
        'Use --force true only if you intentionally want to render without regenerating markdown.',
      );
      process.exit(1);
    }
  }

  const agent = args.agent || 'auto';
  const generatedDir = args['generated-dir'] || path.join(ctx.paths.generated, 'figma_doc_models');
  const tempArtifacts = new TempArtifactManager();
  tempArtifacts.attachProcessHooks();
  const staleArtifacts = cleanupLegacyTempOutputs({
    tempArtifacts,
    generatedDir,
    fileBase,
  });
  if (staleArtifacts.length > 0) {
    logger.warn(
      `Removed stale temporary artifacts for ${fileBase}: ${staleArtifacts
        .map((artifactPath) => path.basename(artifactPath))
        .join(', ')}`,
    );
  }
  const themePath = args.theme || DEFAULT_THEME_PATH;
  const expectedThemeName = readThemeName(themePath);
  const docModelPath = path.join(generatedDir, `${fileBase}.doc-model.json`);
  const executePath = path.join(generatedDir, `${fileBase}.figma-execute.js`);
  const payloadPath = path.join(
    generatedDir,
    `${fileBase}.render-payload.json`,
  );
  const offsetX = args['offset-x'] || '200';
  const figmaUrl = args.url || '';
  const markdownToModelScriptPath = path.resolve(
    '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/markdown_to_doc_model.mjs',
  );
  const modelToExecuteScriptPath = path.resolve(
    '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/build_figma_execute_code.mjs',
  );

  fs.mkdirSync(path.resolve(generatedDir), { recursive: true });

  const modelTaskId = `ds-markdown-to-figma:model:${path.resolve(markdownPath)}`;
  const modelFingerprint = computeFingerprint({
    files: [markdownPath, markdownToModelScriptPath],
    values: {
      componentName,
      docModelPath: path.resolve(docModelPath),
    },
  });
  const modelSync = shouldSkipTask({
    taskId: modelTaskId,
    fingerprint: modelFingerprint,
    outputs: [docModelPath],
    force,
    statePath: syncStatePath,
  });

  if (!modelSync.skip) {
    runOrThrow('node', [
      '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/markdown_to_doc_model.mjs',
      '--markdown',
      markdownPath,
      '--component-name',
      componentName,
      '--out',
      docModelPath,
    ]);
    updateTaskState({
      taskId: modelTaskId,
      fingerprint: modelFingerprint,
      outputs: [docModelPath],
      metadata: {
        command: 'markdown_to_doc_model',
      },
      statePath: syncStatePath,
    });
  }

  const stepBArgs: string[] = [
    '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/build_figma_execute_code.mjs',
    '--model',
    docModelPath,
    '--theme',
    themePath,
    '--component-name',
    componentName,
    '--offset-x',
    String(offsetX),
    '--out',
    executePath,
    '--payload-out',
    payloadPath,
  ];

  if (resolvedComponentSetId) {
    stepBArgs.push('--component-set-id', resolvedComponentSetId);
  }
  stepBArgs.push('--token-registry', tokenRegistryPath);

  const executeTaskId = `ds-markdown-to-figma:execute:${path.resolve(markdownPath)}`;
  const executeFingerprint = computeFingerprint({
    files: [
      docModelPath,
      themePath,
      modelToExecuteScriptPath,
      tokenRegistryPath,
    ],
    values: {
      componentName,
      componentSetId: resolvedComponentSetId,
      offsetX: String(offsetX),
      executePath: path.resolve(executePath),
      payloadPath: path.resolve(payloadPath),
    },
  });
  const executeSync = shouldSkipTask({
    taskId: executeTaskId,
    fingerprint: executeFingerprint,
    outputs: [executePath, payloadPath],
    force,
    statePath: syncStatePath,
  });

  if (!executeSync.skip) {
    runOrThrow('node', stepBArgs);
    updateTaskState({
      taskId: executeTaskId,
      fingerprint: executeFingerprint,
      outputs: [executePath, payloadPath],
      metadata: {
        command: 'build_figma_execute_code',
      },
      statePath: syncStatePath,
    });
  }

  const renderTaskId = `ds-markdown-to-figma:render:${path.resolve(markdownPath)}`;
  const renderFingerprint = computeFingerprint({
    files: [executePath, payloadPath],
    values: {
      componentName,
      componentSetId: resolvedComponentSetId,
      figmaUrl,
      offsetX: String(offsetX),
    },
  });
  const renderSync = shouldSkipTask({
    taskId: renderTaskId,
    fingerprint: renderFingerprint,
    outputs: [executePath, payloadPath],
    force,
    statePath: syncStatePath,
  });

  if (renderSync.skip) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: renderSync.reason,
          markdownPath,
          componentName,
          outputs: {
            docModelPath,
            executePath,
            payloadPath,
          },
          hint: 'Use --force true to regenerate and re-render in Figma.',
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  let renderExpectations: {
    expectedCardCount: number;
    expectedTableCount: number;
    expectedSectionName: string;
  };
  try {
    renderExpectations = readRenderExpectations({
      payloadPath,
      componentName,
    });
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const prompt = [
    'Context',
    '- Render markdown documentation into a Figma section using generated script artifacts.',
    '',
    'Sources',
    figmaUrl ? `- Figma URL (if connection needed): ${figmaUrl}` : '',
    `- Markdown source: ${markdownPath}`,
    `- Generated figma_execute script: ${path.resolve(executePath)}`,
    '',
    'Constraints',
    '- Read the generated figma_execute script from disk.',
    '- Execute that exact script with figma_execute (no reimplementation, no manual fallback rendering).',
    `- Keep section idempotent and place it ${String(offsetX)}px to the right of the component section.`,
    '- Do not alter unrelated components/sections.',
    '- Report unsupported markdown blocks if any.',
    '- Return exactly one JSON object and no prose.',
    '',
    'Expected Output',
    '- JSON keys: target_section_id, target_section_name, offset_x_applied, theme_name, unsupported_blocks_count, component_set_id, component_section_id, rendered_count.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const agentResponse = runAgentPrompt({
      prompt,
      agent: agent as 'codex' | 'claude' | 'gemini' | 'auto',
      label: `active-md-to-figma-${fileBase}`,
      passthrough: false,
    });
    const renderReport = parseRenderReportFromOutput(agentResponse.stdout);
    if (!renderReport) {
      const outputPath = writeAgentOutput({
        tempArtifacts,
        generatedDir,
        fileBase,
        suffix: 'render-agent-output',
        content: agentResponse.stdout,
      });
      throw new Error(
        'Unable to parse render report JSON from agent output.\n' +
        `Expected keys: target_section_id, target_section_name, offset_x_applied, theme_name.\n` +
        `Saved raw agent output: ${outputPath}`,
      );
    }
    if (!renderReport.targetSectionId || !renderReport.targetSectionName) {
      const outputPath = writeAgentOutput({
        tempArtifacts,
        generatedDir,
        fileBase,
        suffix: 'render-agent-output',
        content: agentResponse.stdout,
      });
      throw new Error(
        'Render report is missing target section identifiers.\n' +
        `Saved raw agent output: ${outputPath}`,
      );
    }
    if (!renderReport.themeName) {
      const outputPath = writeAgentOutput({
        tempArtifacts,
        generatedDir,
        fileBase,
        suffix: 'render-agent-output',
        content: agentResponse.stdout,
      });
      throw new Error(
        'Render report is missing theme_name. This usually means the generated themed renderer was not executed.\n' +
        `Expected theme: ${expectedThemeName}\n` +
        `Saved raw agent output: ${outputPath}`,
      );
    }
    if (renderReport.themeName !== expectedThemeName) {
      const message =
        'Theme mismatch detected in render report.\n' +
        `Expected theme: ${expectedThemeName}\n` +
        `Reported theme: ${renderReport.themeName}`;
      if (!force) {
        throw new Error(`${message}\nUse --force true only for explicit emergency bypass.`);
      }
      logger.warn(`${message}\nWarning: continuing because --force true was provided.`);
    }
    const expectedOffsetX = Number(offsetX);
    if (
      Number.isFinite(expectedOffsetX) &&
      renderReport.offsetXApplied !== null &&
      Number.isFinite(renderReport.offsetXApplied) &&
      Math.abs(renderReport.offsetXApplied - expectedOffsetX) > 1
    ) {
      const message =
        'Unexpected render offset reported by agent.\n' +
        `Expected offset_x: ${expectedOffsetX}\n` +
        `Reported offset_x: ${renderReport.offsetXApplied}`;
      if (!force) {
        throw new Error(`${message}\nUse --force true only for explicit emergency bypass.`);
      }
      logger.warn(`${message}\nWarning: continuing because --force true was provided.`);
    }

    const primaryReportValidation = validatePrimaryRenderReport({
      renderReport,
      expectations: renderExpectations,
    });
    if (!primaryReportValidation.ok) {
      const outputPath = writeAgentOutput({
        tempArtifacts,
        generatedDir,
        fileBase,
        suffix: 'render-agent-output',
        content: agentResponse.stdout,
      });
      throw new Error(
        'Render report failed strict primary validation.\n' +
        primaryReportValidation.issues.map((issue) => `- ${issue}`).join('\n') +
        '\n' +
        `Saved raw agent output: ${outputPath}`,
      );
    }

    const auditPrompt = buildRenderAuditPrompt({
      figmaUrl,
      targetSectionId: String(renderReport.targetSectionId),
      targetSectionName: String(renderReport.targetSectionName),
      expectedSectionName: renderExpectations.expectedSectionName,
      expectedCardCount: renderExpectations.expectedCardCount,
      expectedTableCount: renderExpectations.expectedTableCount,
    });
    const auditResponse = runAgentPrompt({
      prompt: auditPrompt,
      agent: agent as 'codex' | 'claude' | 'gemini' | 'auto',
      label: `active-md-to-figma-audit-${fileBase}`,
      passthrough: false,
    });
    const auditReport = parseRenderAuditFromOutput(auditResponse.stdout);
    if (!auditReport) {
      const outputPath = writeAgentOutput({
        tempArtifacts,
        generatedDir,
        fileBase,
        suffix: 'render-audit-output',
        content: auditResponse.stdout,
      });
      throw new Error(
        'Unable to parse render structure audit report JSON from agent output.\n' +
        'Expected keys: has_doc_canvas, card_count, table_container_count, header_row_count, body_row_count.\n' +
        `Saved raw audit output: ${outputPath}`,
      );
    }
    const auditValidation = validateRenderAudit({
      audit: auditReport,
      renderReport,
      expectations: renderExpectations,
    });
    if (!auditValidation.ok) {
      const outputPath = writeAgentOutput({
        tempArtifacts,
        generatedDir,
        fileBase,
        suffix: 'render-audit-output',
        content: auditResponse.stdout,
      });
      throw new Error(
        'Render structure audit failed. Themed renderer output is inconsistent; fallback-like render blocked.\n' +
        auditValidation.issues.map((issue) => `- ${issue}`).join('\n') +
        '\n' +
        `Saved raw audit output: ${outputPath}`,
      );
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          markdownPath,
          target_section_id: renderReport.targetSectionId,
          target_section_name: renderReport.targetSectionName,
          offset_x_applied: renderReport.offsetXApplied,
          theme_name: renderReport.themeName,
          unsupported_blocks_count: renderReport.unsupportedBlocksCount,
        },
        null,
        2,
      )}\n`,
    );

    updateTaskState({
      taskId: renderTaskId,
      fingerprint: renderFingerprint,
      outputs: [executePath, payloadPath],
      metadata: {
        command: 'figma_execute_render',
        targetSectionId: renderReport.targetSectionId,
        targetSectionName: renderReport.targetSectionName,
        themeName: renderReport.themeName,
        unsupportedBlocksCount: renderReport.unsupportedBlocksCount,
        structureAudit: {
          hasDocCanvas: true,
          cardCount: auditReport.cardCount,
          tableContainerCount: auditReport.tableContainerCount,
          headerRowCount: auditReport.headerRowCount,
          bodyRowCount: auditReport.bodyRowCount,
        },
      },
      statePath: syncStatePath,
    });

    if (captureProof) {
      if (!resolvedComponentSetId) {
        const message =
          'Visual proof capture skipped: no deterministic component_set_node_id available.';
        if (captureProofStrict) {
          throw new Error(message);
        }
        logger.warn(message);
      } else {
        const proofArgs = [
          'tooling/scripts/ds-capture-visual-proof.mjs',
          '--markdown',
          markdownPath,
          '--spec-file',
          specPath,
          '--component-set-id',
          resolvedComponentSetId,
          '--agent',
          agent,
        ];
        if (args.system) {
          proofArgs.push('--system', args.system);
        }
        if (figmaUrl) {
          proofArgs.push('--url', figmaUrl);
        }
        try {
          runOrThrow('node', proofArgs);
        } catch (error) {
          const message = `Visual proof capture failed: ${error instanceof Error ? error.message : String(error)
            }`;
          if (captureProofStrict) {
            throw new Error(message);
          }
          logger.warn(message);
        }
      }
    }

    syncDocumentationIndices({
      docsDir: ctx.paths.docs,
      overviewPath: path.join(ctx.paths.docs, 'overview.md'),
      specsDir: ctx.paths.specs,
      proofsDir: path.join(ctx.paths.generated, 'visual-proofs'),
      renderDir: path.join(ctx.paths.generated, 'figma_doc_models'),
      registryPath: ctx.paths.registry,
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args) as ActiveMdToFigmaArgs;
  runActiveMdToFigma(parsed).catch((error) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
