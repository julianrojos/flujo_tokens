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
import { parseMarkdownFrontmatter } from '../utils/parse-frontmatter.js';
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

// Import extracted validator modules (FULLY WIRED - single source of truth)
import {
  validateComponentFrontmatter,
  validateOverviewFrontmatter,
  validateWorkflowOrFoundationFrontmatter,
} from './frontmatter.js';
import {
  validateOverviewLinks,
  validateSpecMarkdownPairing,
} from './linking.js';
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
import {
  loadRuleManifest,
  annotateFindingsWithManifest,
  createBaseReport,
} from './governance.js';

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

const PROJECT_ROOT = process.cwd();
const RULE_MANIFEST_PATH = path.join(
  PROJECT_ROOT,
  '.agents',
  'rules',
  '_manifest.yml',
);
const TOKEN_LIKE_CODE_SPAN_RE =
  /`[^`\n]*(?:[A-Za-z][A-Za-z0-9-]*(?:[./][A-Za-z0-9-]+)+)[^`\n]*`/;

type IndexedRegistryShape = {
  entries: unknown[];
  byPath: Record<string, unknown>;
  bySlashPath?: Record<string, unknown>;
};

function resolveDocsValidatorDefaults() {
  try {
    const ctx = resolveSystemContextSafe();
    return {
      docsRoot: ctx.paths.docs,
      specRoot: ctx.paths.specs,
      registryPath: ctx.paths.tokenRegistry,
      contextError: null as string | null,
    };
  } catch (error) {
    return {
      docsRoot: '',
      specRoot: '',
      registryPath: '',
      contextError:
        error instanceof Error
          ? error.message
          : 'Unable to resolve design system context.',
    };
  }
}

function isIndexedRegistryShape(
  parsed: unknown,
): parsed is IndexedRegistryShape {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return false;
  const candidate = parsed as Record<string, unknown>;
  if (!Array.isArray(candidate.entries)) return false;
  if (
    !candidate.entries.every(
      (entry) => entry && typeof entry === 'object' && !Array.isArray(entry),
    )
  ) {
    return false;
  }
  if (
    !candidate.byPath ||
    typeof candidate.byPath !== 'object' ||
    Array.isArray(candidate.byPath)
  ) {
    return false;
  }
  if (candidate.bySlashPath !== undefined) {
    if (
      !candidate.bySlashPath ||
      typeof candidate.bySlashPath !== 'object' ||
      Array.isArray(candidate.bySlashPath)
    ) {
      return false;
    }
  }
  return true;
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
export function validateDocs(
  options: DocsValidatorOptions = {},
): DocsValidationReport {
  const defaults = resolveDocsValidatorDefaults();
  const explicitDocsRoot = String(options.docsRoot || '').trim();
  const explicitSpecRoot = String(options.specRoot || '').trim();
  const explicitRegistryPath = String(options.registryPath || '').trim();
  const explicitFilePath = String(options.filePath || '').trim();
  const explicitSpecFilePath = String(options.specFilePath || '').trim();
  const checkPairing = options.checkPairing !== false;
  const checkOverview = explicitFilePath
    ? false
    : options.checkOverview !== false;
  const checkSpecs =
    options.checkSpecs !== false &&
    (!explicitFilePath || Boolean(explicitSpecFilePath));
  const needsSpecRoot = checkPairing || checkSpecs;
  const hasRequiredExplicitPaths =
    Boolean(explicitDocsRoot) &&
    Boolean(explicitRegistryPath) &&
    (!needsSpecRoot || Boolean(explicitSpecRoot));

  if (defaults.contextError && !hasRequiredExplicitPaths) {
    const report = createBaseReport({ manifestPath: RULE_MANIFEST_PATH });
    report.ok = false;
    const missing: string[] = [];
    if (!explicitDocsRoot) missing.push('--docs-root');
    if (!explicitRegistryPath) missing.push('--registry');
    if (needsSpecRoot && !explicitSpecRoot) missing.push('--spec-root');
    report.errors.push({
      code: 'DOC01',
      file: 'design-system-context',
      message: `Design system context is required when docs/spec/registry paths are not provided. ${defaults.contextError}`,
      suggested:
        missing.length > 0
          ? `Pass --system <id> or provide ${missing.join(', ')} explicitly. ` +
            'To verify context: `npm run ds:doctor -- --system <id>`.'
          : 'Pass --system <id> or provide required path flags explicitly. ' +
            'To verify context: `npm run ds:doctor -- --system <id>`.',
    });
    report.summary.errors = report.errors.length;
    return report;
  }
  const docsRoot = path.resolve(options.docsRoot || defaults.docsRoot);
  const specRoot = path.resolve(options.specRoot || defaults.specRoot);
  const resolvedSpecFilePath = options.specFilePath
    ? path.resolve(options.specFilePath)
    : null;
  const registryPath = path.resolve(
    options.registryPath || defaults.registryPath,
  );
  const resolvedFilePath = options.filePath
    ? path.resolve(options.filePath)
    : null;
  const allowExtraH2 = options.allowExtraH2 === true;

  const report = createBaseReport({ manifestPath: RULE_MANIFEST_PATH });
  const manifestInfo = loadRuleManifest(
    options.manifestPath || RULE_MANIFEST_PATH,
  );
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

    // Indexed format: { entries: [...], byPath: {...}, bySlashPath: {...} }
    if (!isIndexedRegistryShape(parsed)) {
      throw new Error(
        'Invalid format: expected { entries, byPath, bySlashPath }. Regenerate it with: npm run generate:registry',
      );
    }

    registry = { ...parsed.byPath, ...(parsed.bySlashPath ?? {}) };
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

  // Guardrail: an empty registry gives false-green validations (0 token refs checked).
  if (Object.keys(registry).length === 0) {
    report.errors.push({
      code: 'REG01',
      file: registryPath,
      message:
        'Token registry is empty (0 token entries). Run token sync/generation before validating docs.',
      suggested: 'npm run ds:tokens-sync',
    });
    report.ok = false;
    report.summary.errors = report.errors.length;
    return report;
  }

  const registryIndexes = buildRegistryIndexes(registry);
  const markdownFiles = collectMarkdownFiles(docsRoot, resolvedFilePath);
  const componentFiles: string[] = [];
  let componentFilesWithTokenLikeSpans = 0;

  const specResolution: { specFilePath?: string } =
    resolvedFilePath && resolvedSpecFilePath
      ? { specFilePath: resolvedSpecFilePath }
      : {};

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

    const docType = String(frontmatter.doc_type || '')
      .trim()
      .toLowerCase();
    const treatAsComponent = docType === 'component' || !docType;

    if (treatAsComponent) {
      componentFiles.push(filePath);
      if (TOKEN_LIKE_CODE_SPAN_RE.test(content)) {
        componentFilesWithTokenLikeSpans += 1;
      }

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
        { allowExtraH2 },
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
        contentOffset,
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
        contentOffset,
      );

      // Validate token fallbacks
      validateTokenFallbacks(
        filePath,
        content,
        registryIndexes,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset,
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
        specResolution,
      );

      // Validate visual proof section
      validateVisualProofSection(
        filePath,
        raw,
        frontmatter,
        report,
        lineStarts,
        lineFromOffset,
      );

      // Validate traceability node ID
      validateMarkdownTraceabilityNodeId(
        filePath,
        frontmatter,
        specRoot,
        report,
        specResolution,
      );

      // Validate generated traceability
      validateGeneratedTraceability(
        filePath,
        frontmatter,
        specRoot,
        registryPath,
        report,
        specResolution,
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
        specResolution,
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
      explicitSpecFilePath: resolvedSpecFilePath,
      explicitFilePath: resolvedFilePath,
      report,
    });
  }

  // Validate spec YAML files
  if (checkSpecs) {
    validateSpecYamlFiles({
      specRoot,
      report,
      explicitSpecFilePath: resolvedSpecFilePath,
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

  if (
    componentFilesWithTokenLikeSpans > 0 &&
    report.summary.tokenRefsChecked === 0
  ) {
    report.warnings.push({
      code: 'TOK01',
      file: docsRoot,
      message:
        'Token reference validation coverage is zero despite token-like references in component docs. Check token registry integrity and token path formats.',
      suggested: 'npm run ds:tokens-sync',
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
