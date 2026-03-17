/**
 * QA Audit Findings Builder
 *
 * Transforms audit results into standardized findings.
 */

import type {
  AuditFinding,
  CoverageSpecVsMarkdown,
  CoverageMarkdownVsOverview,
  CoverageTokenPaths,
  FreshnessAudit,
  CompletenessAudit,
  IntegrityAudit,
} from '../types/qa-audit.js';

/**
 * Build audit findings from audit results.
 */
export function buildFindings(
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
