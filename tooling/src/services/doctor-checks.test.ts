/**
 * Tests for Doctor Checks
 *
 * Tests for the extracted doctor check functions.
 * Focus on I/O-heavy logic: path resolution, manifest parsing, filesystem checks.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveDoctorContext,
  checkRuleManifest,
  checkComponentByName,
  checkValidateDocs,
  checkPaths,
} from './doctor-checks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_FIXTURES_DIR = path.join(__dirname, '__fixtures__', 'doctor-checks');

// Setup and cleanup fixtures directory
describe('doctor-checks', () => {
  before(() => {
    fs.mkdirSync(TEST_FIXTURES_DIR, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(TEST_FIXTURES_DIR, { recursive: true, force: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`doctor-checks.test: Failed to cleanup fixtures directory: ${message}`);
    }
  });

  describe('resolveDoctorContext', () => {
    const mockSystemCtx = {
      paths: {
        docs: '/default/docs',
        specs: '/default/specs',
        tokenRegistry: '/default/token-registry.json',
        registry: '/default/registry.json',
        generated: '/default/generated',
      },
    };

    it('uses defaults when no args provided', () => {
      const ctx = resolveDoctorContext({}, mockSystemCtx, '/project');

      assert.strictEqual(ctx.docsRoot, '/default/docs');
      assert.strictEqual(ctx.specRoot, '/default/specs');
      assert.strictEqual(ctx.registryPath, '/default/token-registry.json');
      assert.strictEqual(ctx.componentRegistryPath, '/default/registry.json');
      assert.strictEqual(ctx.manifestPath, '/project/.agents/rules/_manifest.yml');
      assert.strictEqual(ctx.rawComponentName, '');
      assert.strictEqual(ctx.skipValidate, false);
      assert.strictEqual(ctx.skillsRoot, '/project/.agents/skills');
    });

    it('uses provided args over defaults', () => {
      const ctx = resolveDoctorContext({
        'docs-root': '/custom/docs',
        'spec-root': '/custom/specs',
        registry: '/custom/registry.json',
        'component-registry': '/custom/component-registry.json',
        manifest: '/custom/manifest.yml',
        'component-name': 'Button',
        'skip-validate': 'true',
      }, mockSystemCtx, '/project');

      assert.strictEqual(ctx.docsRoot, '/custom/docs');
      assert.strictEqual(ctx.specRoot, '/custom/specs');
      assert.strictEqual(ctx.registryPath, '/custom/registry.json');
      assert.strictEqual(ctx.componentRegistryPath, '/custom/component-registry.json');
      assert.strictEqual(ctx.manifestPath, '/custom/manifest.yml');
      assert.strictEqual(ctx.rawComponentName, 'Button');
      assert.strictEqual(ctx.skipValidate, true);
    });

    it('handles boolean skip-validate correctly', () => {
      const ctxFalse = resolveDoctorContext({ 'skip-validate': 'false' }, mockSystemCtx, '/project');
      const ctxTrue = resolveDoctorContext({ 'skip-validate': 'true' }, mockSystemCtx, '/project');

      assert.strictEqual(ctxFalse.skipValidate, false);
      assert.strictEqual(ctxTrue.skipValidate, true);
    });
  });

  describe('checkPaths', () => {
    it('returns pass for existing directories', () => {
      const ctx = {
        docsRoot: __dirname,
        specRoot: __dirname,
      } as any;

      const checks = checkPaths(ctx);

      assert.strictEqual(checks.length, 2);
      assert.strictEqual(checks[0].id, 'PATH_DOCS');
      assert.strictEqual(checks[0].status, 'pass');
      assert.strictEqual(checks[1].id, 'PATH_SPECS');
      assert.strictEqual(checks[1].status, 'pass');
    });

    it('returns fail for missing directories', () => {
      const ctx = {
        docsRoot: '/nonexistent/docs',
        specRoot: '/nonexistent/specs',
      } as any;

      const checks = checkPaths(ctx);

      assert.strictEqual(checks.length, 2);
      assert.strictEqual(checks[0].id, 'PATH_DOCS');
      assert.strictEqual(checks[0].status, 'fail');
      assert.strictEqual(checks[1].id, 'PATH_SPECS');
      assert.strictEqual(checks[1].status, 'fail');
    });
  });

  describe('checkRuleManifest', () => {
    it('returns fail for missing manifest', () => {
      const ctx = {
        manifestPath: '/nonexistent/manifest.yml',
      } as any;

      const result = checkRuleManifest(ctx);

      assert.strictEqual(result.checks.length, 1);
      assert.strictEqual(result.checks[0].id, 'RULE_MANIFEST');
      assert.strictEqual(result.checks[0].status, 'fail');
      assert.strictEqual(result.manifest, null);
    });

    it('returns pass for valid manifest (parse only)', () => {
      const manifestPath = path.join(TEST_FIXTURES_DIR, 'valid-manifest.yml');
      fs.writeFileSync(manifestPath, `
rules:
  - id: test-rule
    file: test-rule.mdc
`, 'utf8');

      const ctx = { manifestPath } as any;
      const result = checkRuleManifest(ctx);

      // This test only verifies YAML parsing, not coverage
      // Coverage is tested separately in "checks RULE_MANIFEST_COVERAGE when manifest is valid"
      const manifestCheck = result.checks.find((c) => c.id === 'RULE_MANIFEST');
      assert.ok(manifestCheck);
      assert.strictEqual(manifestCheck.status, 'pass');
      assert.ok(result.manifest !== null);
    });

    it('returns fail for invalid YAML', () => {
      const manifestPath = path.join(TEST_FIXTURES_DIR, 'invalid-manifest.yml');
      fs.writeFileSync(manifestPath, 'invalid: yaml: content: [', 'utf8');

      const ctx = { manifestPath } as any;
      const result = checkRuleManifest(ctx);

      assert.strictEqual(result.checks.length, 1);
      assert.strictEqual(result.checks[0].id, 'RULE_MANIFEST');
      assert.strictEqual(result.checks[0].status, 'fail');
      assert.ok(result.checks[0].details?.error);
      assert.strictEqual(result.manifest, null);
    });

    it('checks RULE_MANIFEST_COVERAGE when manifest is valid', () => {
      const rulesDir = path.join(TEST_FIXTURES_DIR, 'rules-coverage');
      const manifestPath = path.join(rulesDir, '_manifest.yml');
      fs.mkdirSync(rulesDir, { recursive: true });

      // Create manifest that references a rule file
      fs.writeFileSync(manifestPath, `
rules:
  - id: test-rule
    file: test-rule.mdc
`, 'utf8');

      // Create the rule file on disk (in same directory as manifest)
      fs.writeFileSync(path.join(rulesDir, 'test-rule.mdc'), `
---
id: test-rule
---
Test rule content
`, 'utf8');

      const ctx = { manifestPath } as any;
      const result = checkRuleManifest(ctx);

      // Should have RULE_MANIFEST + RULE_MANIFEST_COVERAGE checks
      assert.ok(result.checks.length >= 2);
      const coverageCheck = result.checks.find((c) => c.id === 'RULE_MANIFEST_COVERAGE');
      assert.ok(coverageCheck);
      assert.strictEqual(coverageCheck?.status, 'pass');
    });
  });

  describe('checkComponentByName', () => {
    it('returns empty array when no component name provided', () => {
      const ctx = {
        rawComponentName: '',
        docsRoot: '/docs',
        specRoot: '/specs',
      } as any;

      const checks = checkComponentByName(ctx);

      assert.strictEqual(checks.length, 0);
    });

    it('returns fail for unnormalizable component name', () => {
      const ctx = {
        rawComponentName: '!!!',
        docsRoot: '/docs',
        specRoot: '/specs',
      } as any;

      const checks = checkComponentByName(ctx);

      assert.strictEqual(checks.length, 1);
      assert.strictEqual(checks[0].id, 'COMPONENT_NAME');
      assert.strictEqual(checks[0].status, 'fail');
    });

    it('returns pass for existing component files', () => {
      const docsRoot = path.join(TEST_FIXTURES_DIR, 'component-docs');
      const specRoot = path.join(TEST_FIXTURES_DIR, 'component-specs');
      fs.mkdirSync(docsRoot, { recursive: true });
      fs.mkdirSync(specRoot, { recursive: true });

      // Create component files
      fs.writeFileSync(path.join(docsRoot, 'button.md'), '# Button', 'utf8');
      fs.writeFileSync(path.join(specRoot, 'button.yml'), 'name: Button', 'utf8');

      const ctx = {
        rawComponentName: 'Button',
        docsRoot,
        specRoot,
      } as any;

      const checks = checkComponentByName(ctx);

      assert.strictEqual(checks.length, 2);
      assert.strictEqual(checks[0].id, 'COMPONENT_MD');
      assert.strictEqual(checks[0].status, 'pass');
      assert.strictEqual(checks[1].id, 'COMPONENT_SPEC');
      assert.strictEqual(checks[1].status, 'pass');
    });

    it('returns fail for missing component files', () => {
      const docsRoot = path.join(TEST_FIXTURES_DIR, 'missing-docs');
      const specRoot = path.join(TEST_FIXTURES_DIR, 'missing-specs');
      fs.mkdirSync(docsRoot, { recursive: true });
      fs.mkdirSync(specRoot, { recursive: true });

      const ctx = {
        rawComponentName: 'Button',
        docsRoot,
        specRoot,
      } as any;

      const checks = checkComponentByName(ctx);

      assert.strictEqual(checks.length, 2);
      assert.strictEqual(checks[0].id, 'COMPONENT_MD');
      assert.strictEqual(checks[0].status, 'fail');
      assert.strictEqual(checks[1].id, 'COMPONENT_SPEC');
      assert.strictEqual(checks[1].status, 'fail');
    });
  });

  describe('checkValidateDocs', () => {
    it('returns warn when skipValidate is true', () => {
      const ctx = {
        skipValidate: true,
        docsRoot: '/docs',
        specRoot: '/specs',
        registryPath: '/registry.json',
      } as any;

      const checks = checkValidateDocs(ctx);

      assert.strictEqual(checks.length, 1);
      assert.strictEqual(checks[0].id, 'VALIDATE_DOCS');
      assert.strictEqual(checks[0].status, 'warn');
      assert.ok(checks[0].message?.includes('skipped'));
    });

    it('returns pass or fail (not warn) when skipValidate is false', () => {
      // This test validates that checkValidateDocs properly delegates to validateDocs
      // and translates the result to a DoctorCheck. The actual validation logic
      // is tested in doctor.test.ts.
      const ctx = {
        skipValidate: false,
        docsRoot: __dirname,
        specRoot: __dirname,
        registryPath: path.join(__dirname, '__fixtures__', 'empty-registry.json'),
      } as any;

      // Create empty registry for test
      const registryPath = path.join(__dirname, '__fixtures__', 'empty-registry.json');
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(registryPath, '{}', 'utf8');

      const checks = checkValidateDocs(ctx);

      assert.strictEqual(checks.length, 1);
      assert.strictEqual(checks[0].id, 'VALIDATE_DOCS');
      // When skipValidate is false, status should be 'pass' or 'fail', NOT 'warn'
      // 'warn' is only for when skipValidate is true
      assert.ok(checks[0].status === 'pass' || checks[0].status === 'fail');
      assert.ok(!checks[0].message?.includes('skipped'));
    });
  });
});
