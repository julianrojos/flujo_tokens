/**
 * QA Audit Service
 *
 * Performs comprehensive quality assurance audits on design system documentation.
 * Checks coverage, freshness, completeness, and integrity across the docs pipeline.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../utils/logger.js';
import { requireNonEmptyPathOption } from '../utils/path-guards.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { buildFindings } from './qa-audit-findings.js';
import type {
  QaAuditOptions,
  QaAuditResult,
  CoverageSpecVsMarkdown,
  CoverageMarkdownVsOverview,
  CoverageTokenPaths,
  FreshnessAudit,
  CompletenessAudit,
  IntegrityAudit,
} from '../types/qa-audit.js';

/**
 * Load token registry and extract all token paths.
 * Returns both dotted and slash formats for matching.
 */
function loadTokenPaths(tokenRegistryPath: string): { dotted: Set<string>; slash: Set<string> } {
  try {
    const content = fs.readFileSync(tokenRegistryPath, 'utf8');
    const registry = JSON.parse(content) as { entries: Array<{ path: string; slashPath: string }> };

    const dotted = new Set<string>();
    const slash = new Set<string>();

    for (const entry of registry.entries || []) {
      if (entry.path) dotted.add(entry.path);
      if (entry.slashPath) slash.add(entry.slashPath);
    }

    return { dotted, slash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`loadTokenPaths: failed to load token registry: ${message}`);
    return { dotted: new Set(), slash: new Set() };
  }
}

/**
 * Extract token paths from a text content (spec or markdown).
 * Matches both dotted (A11y.A11y.Dimension.Min-Hit-Area) and slash (Color/Border/Feedback) formats.
 * Excludes URLs, code blocks, and generic terms to avoid false positives.
 */
export function extractTokenPathsFromText(content: string): string[] {
  const tokens: string[] = [];

  // Remove URLs and code blocks to avoid false positives
  const contentNoUrls = content.replace(/https?:\/\/[^\s\)]+/g, '');
  const contentNoCode = contentNoUrls.replace(/`[^`]*`/g, '');

  // Match dotted paths: Collection.Subcollection.Type.Variant (minimum 3 segments)
  // Examples: A11y.A11y.Dimension.Min-Hit-Area, Semantic.Color.Focus-Outline.Inner, Primitives.Color.Blue.100
  // Note: segments can start with letters or digits (for numeric variants like .100, .200)
  const dottedRegex = /[A-Z][a-zA-Z0-9]*(?:\.(?:[A-Z][a-zA-Z0-9-]*|\d+)){2,}/g;

  // Match slash paths: Collection/Type/Variant (minimum 2 segments)
  // Must start with capital letter, exclude common false positives
  const slashRegex = /(?:[A-Z][a-zA-Z0-9-]*\/)+[A-Z][a-zA-Z0-9-]*/g;

  const dottedMatches = contentNoCode.match(dottedRegex);
  if (dottedMatches) {
    tokens.push(...dottedMatches);
  }

  const slashMatches = contentNoCode.match(slashRegex);
  if (slashMatches) {
    tokens.push(...slashMatches);
  }

  // Filter out common false positives
  const filtered = tokens.filter((token) => {
    // Exclude if it looks like a file path or URL fragment
    if (token.includes('www') || token.includes('http') || token.includes('figma')) {
      return false;
    }
    // Exclude if it's ONLY a generic term (exactly 2 segments where first is generic)
    // e.g., "Font/Size", "Color/Red" but NOT "Color/Border/Feedback"
    if (/^(Font|Dimension|Color|Size|Radius|Width|Height|Spacing|Padding|Margin)\/[A-Z][a-zA-Z0-9-]*$/i.test(token)) {
      return false;
    }
    return true;
  });

  // Remove duplicates
  return [...new Set(filtered)];
}

/**
 * Get component slug from file path (without extension).
 */
function getSlug(filePath: string): string {
  const basename = path.basename(filePath);
  return basename.replace(/\.(yml|md)$/, '');
}

/**
 * Audit: Spec YAMLs vs. markdown files (COV-01).
 */
function auditSpecVsMarkdown(
  specsDir: string,
  componentsDir: string,
): CoverageSpecVsMarkdown {
  const specFiles = Array.from(fs.readdirSync(specsDir))
    .filter((f) => f.endsWith('.yml') && f !== '_template.yml')
    .map((f) => getSlug(path.join(specsDir, f)));

  const markdownFiles = Array.from(fs.readdirSync(componentsDir))
    .filter((f) => f.endsWith('.md') && f !== 'overview.md')
    .map((f) => getSlug(path.join(componentsDir, f)));

  const specSet = new Set(specFiles);
  const markdownSet = new Set(markdownFiles);

  const specsWithoutMarkdown = specFiles.filter((slug) => !markdownSet.has(slug));
  const markdownsWithoutSpec = markdownFiles.filter((slug) => !specSet.has(slug));

  return { specsWithoutMarkdown, markdownsWithoutSpec };
}

/**
 * Audit: Markdown files vs. overview links (COV-02).
 */
function auditMarkdownVsOverview(componentsDir: string): CoverageMarkdownVsOverview {
  const overviewPath = path.join(componentsDir, 'overview.md');

  if (!fs.existsSync(overviewPath)) {
    return { unlinkedMarkdown: [], brokenLinks: [] };
  }

  const overviewContent = fs.readFileSync(overviewPath, 'utf8');
  const markdownFiles = Array.from(fs.readdirSync(componentsDir))
    .filter((f) => f.endsWith('.md') && f !== 'overview.md');

  // Extract links from overview (markdown links: [text](./file.md))
  const linkRegex = /\[([^\]]+)\]\(\.\/([^)]+)\)/g;
  const linkedFiles = new Set<string>();

  let match;
  while ((match = linkRegex.exec(overviewContent)) !== null) {
    linkedFiles.add(match[2]);
  }

  const unlinkedMarkdown = markdownFiles.filter((f) => !linkedFiles.has(f));

  // Check for broken links
  const brokenLinks: string[] = [];
  for (const link of linkedFiles) {
    const fullPath = path.join(componentsDir, link);
    if (!fs.existsSync(fullPath)) {
      brokenLinks.push(link);
    }
  }

  return { unlinkedMarkdown, brokenLinks };
}

/**
 * Audit: Token paths in docs vs. token registry (COV-03).
 */
function auditTokenPaths(
  specsDir: string,
  componentsDir: string,
  tokenRegistryPath: string,
): CoverageTokenPaths {
  const validTokens = loadTokenPaths(tokenRegistryPath);
  const missingTokens: Array<{ tokenPath: string; referencedIn: string }> = [];

  // Scan spec files
  for (const file of fs.readdirSync(specsDir)) {
    if (!file.endsWith('.yml')) continue;

    const filePath = path.join(specsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const tokens = extractTokenPathsFromText(content);

    for (const token of tokens) {
      // Check if token exists in either format
      const exists = token.includes('/')
        ? validTokens.slash.has(token)
        : validTokens.dotted.has(token);

      if (!exists) {
        missingTokens.push({
          tokenPath: token,
          referencedIn: filePath,
        });
      }
    }
  }

  // Scan markdown files
  for (const file of fs.readdirSync(componentsDir)) {
    if (!file.endsWith('.md') || file === 'overview.md') continue;

    const filePath = path.join(componentsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const tokens = extractTokenPathsFromText(content);

    for (const token of tokens) {
      // Check if token exists in either format
      const exists = token.includes('/')
        ? validTokens.slash.has(token)
        : validTokens.dotted.has(token);

      if (!exists) {
        missingTokens.push({
          tokenPath: token,
          referencedIn: filePath,
        });
      }
    }
  }

  return { missingTokens };
}

/**
 * Audit: Freshness checks (FRE-01, FRE-02, FRE-03).
 */
function auditFreshness(
  specsDir: string,
  componentsDir: string,
  staleThresholdDays: number,
): FreshnessAudit {
  const draftSpecs: string[] = [];
  const needsReview: string[] = [];
  const staleFiles: Array<{ path: string; lastVerified: string; daysOld: number }> = [];

  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  // Check spec files for draft status
  for (const file of fs.readdirSync(specsDir)) {
    if (!file.endsWith('.yml')) continue;

    const filePath = path.join(specsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const spec = parseYamlDocument<Record<string, unknown>>(content, filePath);

      if (spec?.status === 'draft') {
        draftSpecs.push(filePath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`auditFreshness: failed to parse ${filePath}: ${message}`);
    }
  }

  // Check markdown files for filesystem staleness.
  for (const file of fs.readdirSync(componentsDir)) {
    if (!file.endsWith('.md') || file === 'overview.md') continue;

    const filePath = path.join(componentsDir, file);
    const stats = fs.statSync(filePath);
    const daysOld = Math.floor((now - stats.mtimeMs) / msPerDay);

    if (daysOld > staleThresholdDays) {
      staleFiles.push({
        path: filePath,
        lastVerified: new Date(stats.mtimeMs).toISOString(),
        daysOld,
      });
    }
  }

  return { draftSpecs, needsReview, staleFiles };
}

/**
 * Audit: Completeness checks (COM-01, COM-02).
 */
function auditCompleteness(specsDir: string, componentsDir: string): CompletenessAudit {
  const specsWithTbd: Array<{ path: string; tbdFields: string[]; tbdCount: number }> = [];
  const markdownsWithGaps: string[] = [];

  // Check spec files for TBD values
  for (const file of fs.readdirSync(specsDir)) {
    if (!file.endsWith('.yml')) continue;

    const filePath = path.join(specsDir, file);

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`auditCompleteness: failed to read ${filePath}: ${message}`);
      continue;
    }

    const tbdFields: string[] = [];

    // Look for lines with TBD values
    const lines = content.split('\n');
    for (const line of lines) {
      if (/\bTBD\b/i.test(line)) {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const fieldName = line.slice(0, colonIndex).trim();
          tbdFields.push(fieldName);
        }
      }
    }

    if (tbdFields.length > 0) {
      specsWithTbd.push({
        path: filePath,
        tbdFields,
        tbdCount: tbdFields.length,
      });
    }
  }

  // Check markdown files for ## Gaps / TBD section
  for (const file of fs.readdirSync(componentsDir)) {
    if (!file.endsWith('.md') || file === 'overview.md') continue;

    const filePath = path.join(componentsDir, file);

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`auditCompleteness: failed to read ${filePath}: ${message}`);
      continue;
    }

    if (/^##\s+Gaps\s*\/\s*TBD\b/im.test(content)) {
      markdownsWithGaps.push(filePath);
    }
  }

  return { specsWithTbd, markdownsWithGaps };
}

/**
 * Audit: Integrity checks (INT-01, INT-02).
 */
function auditIntegrity(
  specsDir: string,
  componentsDir: string,
  tokenRegistryPath: string,
): IntegrityAudit {
  const missingTokenRefs: Array<{ tokenPath: string; referencedIn: string }> = [];
  const overviewMismatches: Array<{ linkText: string; linkPath: string; issue: string }> = [];

  // Reuse token path audit for INT-01
  const tokenPathResult = auditTokenPaths(specsDir, componentsDir, tokenRegistryPath);
  missingTokenRefs.push(...tokenPathResult.missingTokens);

  // INT-02: Overview links vs. actual files
  const overviewPath = path.join(componentsDir, 'overview.md');
  if (fs.existsSync(overviewPath)) {
    const overviewContent = fs.readFileSync(overviewPath, 'utf8');
    const linkRegex = /\[([^\]]+)\]\(\.\/([^)]+)\)/g;

    let match;
    while ((match = linkRegex.exec(overviewContent)) !== null) {
      const linkText = match[1];
      const linkPath = match[2];
      const fullPath = path.join(componentsDir, linkPath);

      if (!fs.existsSync(fullPath)) {
        overviewMismatches.push({
          linkText,
          linkPath,
          issue: `Link target does not exist: ${linkPath}`,
        });
      }
    }
  }

  return { missingTokenRefs, overviewMismatches };
}

/**
 * Run comprehensive QA audit on design system documentation.
 */
export function runQaAudit(options: QaAuditOptions = {}): QaAuditResult {
  const {
    specsDir,
    componentsDir,
    generatedDir,
    tokenRegistryPath,
    staleThresholdDays = 30,
    outputReport = false,
  } = options;
  const resolvedSpecsDir = path.resolve(requireNonEmptyPathOption(specsDir, 'specsDir'));
  const resolvedComponentsDir = path.resolve(requireNonEmptyPathOption(componentsDir, 'componentsDir'));
  const resolvedGeneratedDir = path.resolve(requireNonEmptyPathOption(generatedDir, 'generatedDir'));
  const resolvedTokenRegistryPath = path.resolve(
    String(tokenRegistryPath || path.join(resolvedGeneratedDir, 'token-registry.json')),
  );

  logger.info('Running QA audit...');

  // Run audits
  const specVsMarkdown = auditSpecVsMarkdown(resolvedSpecsDir, resolvedComponentsDir);
  const markdownVsOverview = auditMarkdownVsOverview(resolvedComponentsDir);
  const tokenPaths = auditTokenPaths(
    resolvedSpecsDir,
    resolvedComponentsDir,
    resolvedTokenRegistryPath,
  );
  const freshness = auditFreshness(resolvedSpecsDir, resolvedComponentsDir, staleThresholdDays);
  const completeness = auditCompleteness(resolvedSpecsDir, resolvedComponentsDir);
  const integrity = auditIntegrity(
    resolvedSpecsDir,
    resolvedComponentsDir,
    resolvedTokenRegistryPath,
  );

  const coverage = {
    specVsMarkdown,
    markdownVsOverview,
    tokenPaths,
  };

  // Build findings
  const findings = buildFindings(coverage, freshness, completeness, integrity);

  // Calculate summary
  const summary = {
    totalFindings: findings.length,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  const timestamp = new Date().toISOString();

  const result: QaAuditResult = {
    summary,
    coverage,
    freshness,
    completeness,
    integrity,
    findings,
    timestamp,
  };

  // Output JSON report if requested
  if (outputReport) {
    const reportPath = path.join(resolvedGeneratedDir, 'qa-report.json');
    fs.mkdirSync(resolvedGeneratedDir, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    logger.info(`QA report written to ${reportPath}`);
  }

  return result;
}
