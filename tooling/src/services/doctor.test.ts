/**
 * Tests for the Design System Doctor Service
 *
 * These tests validate the pure logic functions in doctor.ts
 * without any filesystem or I/O dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  createCheck,
  sortUniqueStrings,
  normalizeRuleId,
  collectRequiresRuleIds,
  hasValidSkillContext,
  collectManifestRuleFiles,
  collectDeprecatedRulesFromManifest,
  collectAllowedContextValues,
  validateSkillVersioning,
  validateDeprecatedRuleReferences,
  computeSummary,
  buildDoctorReport,
  validateRuleCoverage,
} from './doctor.js';

import type {
  ManifestDocument,
  SkillFrontmatter,
} from './doctor-types.js';

describe('doctor service', () => {
  describe('createCheck', () => {
    it('creates a valid check object', () => {
      const check = createCheck({
        id: 'TEST_CHECK',
        status: 'pass',
        message: 'Test passed',
        details: { foo: 'bar' },
      });

      assert.strictEqual(check.id, 'TEST_CHECK');
      assert.strictEqual(check.status, 'pass');
      assert.strictEqual(check.message, 'Test passed');
      assert.deepStrictEqual(check.details, { foo: 'bar' });
    });

    it('normalizes invalid status to fail', () => {
      const check = createCheck({
        id: 'TEST',
        status: 'invalid' as any,
        message: 'Test',
      });

      assert.strictEqual(check.status, 'fail');
    });

    it('accepts empty details', () => {
      const check = createCheck({
        id: 'TEST',
        status: 'warn',
        message: 'Test warning',
      });

      assert.deepStrictEqual(check.details, {});
    });
  });

  describe('sortUniqueStrings', () => {
    it('removes duplicates and sorts', () => {
      const result = sortUniqueStrings(['c', 'a', 'b', 'a', 'c']);
      assert.deepStrictEqual(result, ['a', 'b', 'c']);
    });

    it('handles empty array', () => {
      const result = sortUniqueStrings([]);
      assert.deepStrictEqual(result, []);
    });

    it('sorts case-insensitively', () => {
      const result = sortUniqueStrings(['Zebra', 'apple', 'Banana']);
      assert.deepStrictEqual(result, ['apple', 'Banana', 'Zebra']);
    });
  });

  describe('normalizeRuleId', () => {
    it('removes .mdc extension', () => {
      assert.strictEqual(normalizeRuleId('component-doc.mdc'), 'component-doc');
    });

    it('extracts basename from path', () => {
      assert.strictEqual(normalizeRuleId('rules/component-doc.mdc'), 'component-doc');
    });

    it('handles empty input', () => {
      assert.strictEqual(normalizeRuleId(''), '');
      assert.strictEqual(normalizeRuleId('  '), '');
    });

    it('trims whitespace', () => {
      assert.strictEqual(normalizeRuleId('  component-doc.mdc  '), 'component-doc');
    });
  });

  describe('collectRequiresRuleIds', () => {
    it('extracts string rule IDs', () => {
      const frontmatter: SkillFrontmatter = {
        requires_rules: ['component-doc.mdc', 'token-references'],
      };

      const ids = collectRequiresRuleIds(frontmatter);
      assert.deepStrictEqual(ids, ['component-doc', 'token-references']);
    });

    it('extracts rule IDs from object format', () => {
      const frontmatter: SkillFrontmatter = {
        requires_rules: [
          { 'component-doc.mdc': '>=1.0.0' },
          { 'token-references': '>=1.1.0' },
        ],
      };

      const ids = collectRequiresRuleIds(frontmatter);
      assert.deepStrictEqual(ids, ['component-doc', 'token-references']);
    });

    it('returns empty array for missing requires_rules', () => {
      const frontmatter: SkillFrontmatter = {};
      const ids = collectRequiresRuleIds(frontmatter);
      assert.deepStrictEqual(ids, []);
    });

    it('deduplicates and sorts', () => {
      const frontmatter: SkillFrontmatter = {
        requires_rules: ['zebra.mdc', 'apple', 'zebra'],
      };

      const ids = collectRequiresRuleIds(frontmatter);
      assert.deepStrictEqual(ids, ['apple', 'zebra']);
    });
  });

  describe('hasValidSkillContext', () => {
    it('returns true for valid context', () => {
      const frontmatter: SkillFrontmatter = {
        context: {
          doc_type: 'component',
          stage: 'spec',
        },
      };

      assert.strictEqual(hasValidSkillContext(frontmatter), true);
    });

    it('returns false for missing context', () => {
      const frontmatter: SkillFrontmatter = {};
      assert.strictEqual(hasValidSkillContext(frontmatter), false);
    });

    it('returns false for missing doc_type', () => {
      const frontmatter: SkillFrontmatter = {
        context: {
          stage: 'spec',
        },
      };

      assert.strictEqual(hasValidSkillContext(frontmatter), false);
    });

    it('returns false for null frontmatter', () => {
      assert.strictEqual(hasValidSkillContext(null), false);
    });
  });

  describe('collectManifestRuleFiles', () => {
    it('extracts non-deprecated rule files', () => {
      const manifest: ManifestDocument = {
        rules: [
          { file: 'component-doc.mdc', id: 'component-doc' },
          { file: 'token-references.mdc', id: 'token-references' },
          { file: 'deprecated.mdc', id: 'deprecated', deprecated: true },
        ],
      };

      const files = collectManifestRuleFiles(manifest);
      assert.deepStrictEqual(files, ['component-doc.mdc', 'token-references.mdc']);
    });

    it('handles empty manifest', () => {
      const files = collectManifestRuleFiles(null);
      assert.deepStrictEqual(files, []);
    });

    it('sorts and deduplicates', () => {
      const manifest: ManifestDocument = {
        rules: [
          { file: 'zebra.mdc' },
          { file: 'apple.mdc' },
          { file: 'zebra.mdc' },
        ],
      };

      const files = collectManifestRuleFiles(manifest);
      assert.deepStrictEqual(files, ['apple.mdc', 'zebra.mdc']);
    });
  });

  describe('collectDeprecatedRulesFromManifest', () => {
    it('extracts deprecated rules with superseded_by', () => {
      const manifest: ManifestDocument = {
        rules: [
          { id: 'old-rule.mdc', deprecated: true, superseded_by: 'new-rule.mdc' },
          { id: 'another-old.mdc', deprecated: true, superseded_by: '' },
        ],
      };

      const deprecated = collectDeprecatedRulesFromManifest(manifest);
      assert.strictEqual(deprecated.get('old-rule'), 'new-rule');
      assert.strictEqual(deprecated.get('another-old'), null);
    });

    it('returns empty map for no deprecated rules', () => {
      const manifest: ManifestDocument = {
        rules: [
          { id: 'active-rule.mdc', deprecated: false },
        ],
      };

      const deprecated = collectDeprecatedRulesFromManifest(manifest);
      assert.strictEqual(deprecated.size, 0);
    });
  });

  describe('collectAllowedContextValues', () => {
    it('extracts allowed doc_types and stages from matrix', () => {
      const manifest: ManifestDocument = {
        matrix: {
          by_doc_type: {
            component: {},
            pattern: {},
          },
          by_stage: {
            spec: {},
            markdown: {},
          },
        },
      };

      const allowed = collectAllowedContextValues(manifest);
      assert.deepStrictEqual(
        Array.from(allowed.docTypes).sort(),
        ['component', 'pattern'],
      );
      assert.deepStrictEqual(
        Array.from(allowed.stages).sort(),
        ['markdown', 'spec'],
      );
    });

    it('returns empty sets for missing matrix', () => {
      const allowed = collectAllowedContextValues(null);
      assert.strictEqual(allowed.docTypes.size, 0);
      assert.strictEqual(allowed.stages.size, 0);
    });
  });

  describe('validateSkillVersioning', () => {
    it('returns no issues for valid skills', () => {
      const skills = [
        {
          filePath: '/skills/test/SKILL.md',
          frontmatter: {
            version: '1.0.0',
            context: {
              doc_type: 'component',
              stage: 'spec',
            },
            compatible_agents: ['claude'],
          },
        },
      ];

      const result = validateSkillVersioning(skills);
      assert.strictEqual(result.issues.length, 0);
      assert.strictEqual(result.checked, 1);
    });

    it('reports missing version', () => {
      const skills = [
        {
          filePath: '/skills/test/SKILL.md',
          frontmatter: {
            context: {
              doc_type: 'component',
              stage: 'spec',
            },
            compatible_agents: ['claude'],
          },
        },
      ];

      const result = validateSkillVersioning(skills);
      assert.strictEqual(result.issues.length, 1);
      assert.deepStrictEqual(result.issues[0].missing, ['version']);
    });

    it('reports missing context', () => {
      const skills = [
        {
          filePath: '/skills/test/SKILL.md',
          frontmatter: {
            version: '1.0.0',
            compatible_agents: ['claude'],
          },
        },
      ];

      const result = validateSkillVersioning(skills);
      assert.strictEqual(result.issues.length, 1);
      assert.deepStrictEqual(result.issues[0].missing, ['context']);
    });

    it('reports invalid context values when allowed values provided', () => {
      const skills = [
        {
          filePath: '/skills/test/SKILL.md',
          frontmatter: {
            version: '1.0.0',
            context: {
              doc_type: 'invalid-type',
              stage: 'spec',
            },
            compatible_agents: ['claude'],
          },
        },
      ];

      const result = validateSkillVersioning(skills, {
        allowedDocTypes: new Set(['component', 'pattern']),
        allowedStages: new Set(['spec', 'markdown']),
      });

      assert.strictEqual(result.issues.length, 1);
      assert.deepStrictEqual(result.issues[0].invalid_context, ['doc_type:invalid-type']);
    });

    it('handles parsing errors', () => {
      const skills = [
        {
          filePath: '/skills/test/SKILL.md',
          frontmatter: null,
          error: 'Missing YAML frontmatter block.',
        },
      ];

      const result = validateSkillVersioning(skills);
      assert.strictEqual(result.issues.length, 1);
      assert.strictEqual(result.issues[0].error, 'Missing YAML frontmatter block.');
    });
  });

  describe('validateDeprecatedRuleReferences', () => {
    it('returns no issues for skills without deprecated references', () => {
      const skills = [
        {
          filePath: '/skills/test/SKILL.md',
          frontmatter: {
            requires_rules: ['active-rule.mdc'],
          },
        },
      ];

      const deprecatedRules = new Map([['old-rule', null]]);
      const result = validateDeprecatedRuleReferences(skills, deprecatedRules);
      assert.strictEqual(result.issues.length, 0);
    });

    it('reports deprecated rule references', () => {
      const skills = [
        {
          filePath: '/skills/test/SKILL.md',
          frontmatter: {
            requires_rules: ['old-rule.mdc', 'active-rule'],
          },
        },
      ];

      const deprecatedRules = new Map([['old-rule', 'new-rule']]);
      const result = validateDeprecatedRuleReferences(skills, deprecatedRules);

      assert.strictEqual(result.issues.length, 1);
      assert.deepStrictEqual(result.issues[0].deprecated_requires_rules, [
        {
          rule_id: 'old-rule',
          superseded_by: 'new-rule',
        },
      ]);
    });
  });

  describe('computeSummary', () => {
    it('computes correct counts', () => {
      const checks = [
        { id: '1', status: 'pass' as const, message: '', details: {} },
        { id: '2', status: 'pass' as const, message: '', details: {} },
        { id: '3', status: 'warn' as const, message: '', details: {} },
        { id: '4', status: 'fail' as const, message: '', details: {} },
        { id: '5', status: 'fail' as const, message: '', details: {} },
      ];

      const summary = computeSummary(checks);
      assert.strictEqual(summary.passes, 2);
      assert.strictEqual(summary.warnings, 1);
      assert.strictEqual(summary.fails, 2);
    });
  });

  describe('buildDoctorReport', () => {
    it('creates a complete report', () => {
      const checks = [
        { id: 'TEST', status: 'pass' as const, message: 'Test', details: {} },
      ];

      const report = buildDoctorReport(checks);

      assert.strictEqual(report.ok, true);
      assert.strictEqual(report.summary.passes, 1);
      assert.strictEqual(report.summary.warnings, 0);
      assert.strictEqual(report.summary.fails, 0);
      assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.deepStrictEqual(report.checks, checks);
    });

    it('sets ok to false when there are failures', () => {
      const checks = [
        { id: 'FAIL', status: 'fail' as const, message: 'Failed', details: {} },
      ];

      const report = buildDoctorReport(checks);
      assert.strictEqual(report.ok, false);
    });
  });

  describe('validateRuleCoverage', () => {
    it('returns complete when lists match', () => {
      const result = validateRuleCoverage(
        ['a.mdc', 'b.mdc'],
        ['a.mdc', 'b.mdc'],
      );

      assert.strictEqual(result.isComplete, true);
      assert.deepStrictEqual(result.missingInManifest, []);
      assert.deepStrictEqual(result.missingOnDisk, []);
    });

    it('detects missing in manifest', () => {
      const result = validateRuleCoverage(
        ['a.mdc'],
        ['a.mdc', 'b.mdc'],
      );

      assert.strictEqual(result.isComplete, false);
      assert.deepStrictEqual(result.missingInManifest, ['b.mdc']);
      assert.deepStrictEqual(result.missingOnDisk, []);
    });

    it('detects missing on disk', () => {
      const result = validateRuleCoverage(
        ['a.mdc', 'b.mdc'],
        ['a.mdc'],
      );

      assert.strictEqual(result.isComplete, false);
      assert.deepStrictEqual(result.missingInManifest, []);
      assert.deepStrictEqual(result.missingOnDisk, ['b.mdc']);
    });
  });
});
