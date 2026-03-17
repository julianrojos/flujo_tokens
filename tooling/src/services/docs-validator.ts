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

// Import from existing TypeScript utilities
import { isPlainObject } from '../utils/is-plain-object.js';
import { isTbdMarker } from '../utils/tbd.js';
import {
  parseMarkdownFrontmatter,
} from '../utils/parse-frontmatter.js';
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
import { extractSectionBody } from './markdown-sections.js';
import {
  GAP_ERROR_CODES,
  GAP_CHECK_MESSAGES,
  GAPS_VALIDATION,
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

// Import Figma traceability validators (single source of truth)
import {
  validateMarkdownTraceabilityNodeId,
  validateGeneratedTraceability,
  validateGapsSectionContract,
  validateVisualProofSection,
  validateReadyLifecycleConsistency,
} from './figma.js';

// ============================================================================
// Constants
// ============================================================================

// Get system context for default paths (context-aware, supports active system)
const _defaultCtx = resolveSystemContextSafe();
const PROJECT_ROOT = process.cwd();
const RULE_MANIFEST_PATH = path.join(PROJECT_ROOT, '.agents', 'rules', '_manifest.yml');

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
