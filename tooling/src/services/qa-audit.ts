/**
 * QA Audit Service
 * 
 * Performs comprehensive quality assurance audits on design system documentation.
 * Checks coverage, freshness, completeness, and integrity across the docs pipeline.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { logger } from '../utils/logger.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import type {
  QaAuditOptions,
  QaAuditResult,
  AuditFinding,
  CoverageSpecVsMarkdown,
  CoverageMarkdownVsOverview,
  CoverageTokenPaths,
  FreshnessAudit,
  CompletenessAudit,
  IntegrityAudit,
} from '../types/qa-audit.js';

/**
 * Extract frontmatter YAML from markdown content.
 */
function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yamlContent = match[1];
  try {
    return yaml.load(yamlContent) as Record<string, unknown> || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`extractFrontmatter: failed to parse frontmatter YAML: ${message}`);
    return null;
  }
}

/**
 * Load and parse a YAML file (simple parser for spec files).
 * Returns null if the YAML is not a plain object (arrays, primitives, invalid syntax).
 */
export function loadYamlFile(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(content) as unknown;
    if (!isPlainObject(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`loadYamlFile: failed to read ${filePath}: ${message}`);
    return null;
  }
}

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
    const spec = loadYamlFile(filePath);

    if (spec?.status === 'draft') {
      draftSpecs.push(filePath);
    }
  }

  // Check markdown files for needs-review and stale last_verified
  for (const file of fs.readdirSync(componentsDir)) {
    if (!file.endsWith('.md') || file === 'overview.md') continue;

    const filePath = path.join(componentsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter) continue;

    // Check doc_status
    if (frontmatter.doc_status === 'needs-review') {
      needsReview.push(filePath);
    }

    // Check last_verified
    const lastVerified = frontmatter.last_verified as string | undefined;
    if (lastVerified) {
      const verifiedDate = new Date(lastVerified).getTime();
      const daysOld = Math.floor((now - verifiedDate) / msPerDay);

      if (daysOld > staleThresholdDays) {
        staleFiles.push({
          path: filePath,
          lastVerified,
          daysOld,
        });
      }
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
    const content = fs.readFileSync(filePath, 'utf8');
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
    const content = fs.readFileSync(filePath, 'utf8');

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
  const validTokens = loadTokenPaths(tokenRegistryPath);
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
 * Build audit findings from audit results.
 */
function buildFindings(
  coverage: {
    specVsMarkdown: CoverageSpecVsMarkdown;
    markdownVsOverview: CoverageMarkdownVsOverview;
    tokenPaths: CoverageTokenPaths;
  },
  freshness: FreshnessAudit,
  completeness: CompletenessAudit,
  integrity: IntegrityAudit,
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // COV-01: Spec YAMLs vs. markdown files
  for (const spec of coverage.specVsMarkdown.specsWithoutMarkdown) {
    findings.push({
      id: 'COV-01',
      category: 'coverage',
      severity: 'error',
      title: 'Spec without markdown',
      location: `docs/_spec/components/${spec}.yml`,
      message: `Spec YAML exists but no corresponding markdown file`,
      suggestion: `Run ds-spec-to-markdown to generate markdown from spec`,
    });
  }

  for (const md of coverage.specVsMarkdown.markdownsWithoutSpec) {
    findings.push({
      id: 'COV-01',
      category: 'coverage',
      severity: 'warning',
      title: 'Markdown without spec',
      location: `docs/components/${md}.md`,
      message: `Markdown file exists but no corresponding spec YAML`,
      suggestion: `Create spec YAML or regenerate markdown from Figma`,
    });
  }

  // COV-02: Markdown files vs. overview links
  for (const link of coverage.markdownVsOverview.brokenLinks) {
    findings.push({
      id: 'COV-02',
      category: 'coverage',
      severity: 'error',
      title: 'Broken overview link',
      location: 'docs/components/overview.md',
      message: `Overview links to non-existent file: ${link}`,
      suggestion: `Remove broken link or restore the missing file`,
    });
  }

  // COV-03: Token paths in docs vs. token registry
  for (const { tokenPath, referencedIn } of coverage.tokenPaths.missingTokens) {
    findings.push({
      id: 'COV-03',
      category: 'coverage',
      severity: 'error',
      title: 'Missing token reference',
      location: referencedIn,
      message: `Token path not found in registry: ${tokenPath}`,
      suggestion: `Verify token path or run ds-tokens-sync to update registry`,
    });
  }

  // FRE-01: Draft specs
  for (const spec of freshness.draftSpecs) {
    findings.push({
      id: 'FRE-01',
      category: 'freshness',
      severity: 'info',
      title: 'Draft spec',
      location: spec,
      message: 'Spec is still in draft status',
      suggestion: 'Review and update spec status to ready when complete',
    });
  }

  // FRE-02: Needs review
  for (const md of freshness.needsReview) {
    findings.push({
      id: 'FRE-02',
      category: 'freshness',
      severity: 'warning',
      title: 'Needs review',
      location: md,
      message: 'Markdown marked as needs-review',
      suggestion: 'Review and update doc_status to ready',
    });
  }

  // FRE-03: Stale files
  for (const { path: filePath, lastVerified, daysOld } of freshness.staleFiles) {
    findings.push({
      id: 'FRE-03',
      category: 'freshness',
      severity: 'warning',
      title: 'Stale documentation',
      location: filePath,
      message: `File not verified in ${daysOld} days (last: ${lastVerified})`,
      suggestion: 'Verify documentation is still accurate and update last_verified',
    });
  }

  // COM-01: Spec YAMLs with TBD values
  for (const { path: filePath, tbdFields, tbdCount } of completeness.specsWithTbd) {
    findings.push({
      id: 'COM-01',
      category: 'completeness',
      severity: 'info',
      title: 'Incomplete spec',
      location: filePath,
      message: `Spec has ${tbdCount} TBD field(s): ${tbdFields.join(', ')}`,
      suggestion: 'Fill in TBD fields with actual values',
    });
  }

  // COM-02: Markdowns with Gaps / TBD section
  for (const md of completeness.markdownsWithGaps) {
    findings.push({
      id: 'COM-02',
      category: 'completeness',
      severity: 'info',
      title: 'Documentation gaps',
      location: md,
      message: 'Markdown contains ## Gaps / TBD section',
      suggestion: 'Address gaps and remove TBD section',
    });
  }

  // INT-01: Missing token refs (duplicate of COV-03, keeping for integrity category)
  // Already covered above

  // INT-02: Overview mismatches
  for (const { linkText, linkPath, issue } of integrity.overviewMismatches) {
    findings.push({
      id: 'INT-02',
      category: 'integrity',
      severity: 'error',
      title: 'Overview link mismatch',
      location: 'docs/components/overview.md',
      message: `Overview link "${linkText}" -> ${linkPath}: ${issue}`,
      suggestion: 'Fix or remove broken link',
    });
  }

  return findings;
}

/**
 * Run comprehensive QA audit on design system documentation.
 */
export function runQaAudit(options: QaAuditOptions = {}): QaAuditResult {
  const {
    projectRoot = process.cwd(),
    specsDir = path.join(projectRoot, 'docs/_spec/components'),
    componentsDir = path.join(projectRoot, 'docs/components'),
    generatedDir = path.join(projectRoot, 'docs/_generated'),
    tokenRegistryPath = path.join(generatedDir, 'token-registry.json'),
    staleThresholdDays = 30,
    outputReport = false,
  } = options;

  logger.info('Running QA audit...');

  // Run audits
  const specVsMarkdown = auditSpecVsMarkdown(specsDir, componentsDir);
  const markdownVsOverview = auditMarkdownVsOverview(componentsDir);
  const tokenPaths = auditTokenPaths(specsDir, componentsDir, tokenRegistryPath);
  const freshness = auditFreshness(specsDir, componentsDir, staleThresholdDays);
  const completeness = auditCompleteness(specsDir, componentsDir);
  const integrity = auditIntegrity(specsDir, componentsDir, tokenRegistryPath);

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
    const reportPath = path.join(generatedDir, 'qa-report.json');
    fs.mkdirSync(generatedDir, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    logger.info(`QA report written to ${reportPath}`);
  }

  return result;
}

/**
 * Format audit results for console output.
 */
export function formatAuditReport(result: QaAuditResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════╗');
  lines.push('║           DESIGN SYSTEM QA AUDIT REPORT                 ║');
  lines.push('╚══════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Timestamp: ${result.timestamp}`);
  lines.push('');
  lines.push('┌──────────────────────────────────────────────────────────┐');
  lines.push('│ SUMMARY                                                  │');
  lines.push('└──────────────────────────────────────────────────────────┘');
  lines.push(`  Total findings: ${result.summary.totalFindings}`);
  lines.push(`  Errors:   ${result.summary.errors}`);
  lines.push(`  Warnings: ${result.summary.warnings}`);
  lines.push(`  Info:     ${result.summary.info}`);
  lines.push('');

  if (result.findings.length === 0) {
    lines.push('✅ No issues found!');
    return lines.join('\n');
  }

  // Group findings by category
  const byCategory: Record<string, AuditFinding[]> = {};
  for (const finding of result.findings) {
    if (!byCategory[finding.category]) {
      byCategory[finding.category] = [];
    }
    byCategory[finding.category].push(finding);
  }

  // Output by category
  const categoryOrder = ['coverage', 'freshness', 'completeness', 'integrity'];
  const categoryTitles: Record<string, string> = {
    coverage: 'COVERAGE',
    freshness: 'FRESHNESS',
    completeness: 'COMPLETENESS',
    integrity: 'INTEGRITY',
  };

  for (const category of categoryOrder) {
    const categoryFindings = byCategory[category] || [];
    if (categoryFindings.length === 0) continue;

    lines.push(`┌──────────────────────────────────────────────────────────┐`);
    lines.push(`│ ${categoryTitles[category]}`.padEnd(59) + '│');
    lines.push(`└──────────────────────────────────────────────────────────┘`);

    for (const finding of categoryFindings) {
      const severityIcon = {
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️',
      }[finding.severity];

      lines.push('');
      lines.push(`  ${severityIcon} [${finding.id}] ${finding.title}`);
      lines.push(`     Location: ${finding.location}`);
      lines.push(`     ${finding.message}`);
      if (finding.suggestion) {
        lines.push(`     → ${finding.suggestion}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
