/**
 * Docs Validator Service Tests
 *
 * Parity tests for docs-validator.ts migration from docs-validator.mjs.
 * Ensures the TypeScript implementation maintains behavioral compatibility.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateDocs } from './docs-validator.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';

describe('docs-validator', () => {
    describe('validateDocs()', () => {
        it('should return a stable report shape', () => {
            const ctx = resolveSystemContextSafe();
            const report = validateDocs({
                docsRoot: ctx.paths.docs,
                specRoot: ctx.paths.specs,
                registryPath: ctx.paths.tokenRegistry,
                checkPairing: false,
                checkSpecs: false,
                checkOverview: false,
            });

            assert.equal(typeof report, 'object');
            assert.equal(typeof report.ok, 'boolean');
            assert.equal(typeof report.generatedAt, 'string');
            assert.equal(typeof report.governance, 'object');
            assert.equal(typeof report.governance.manifestPath, 'string');
            assert.equal(typeof report.governance.manifestLoaded, 'boolean');
            assert.equal(typeof report.summary, 'object');
            assert.equal(typeof report.summary.filesChecked, 'number');
            assert.equal(typeof report.summary.errors, 'number');
            assert.equal(typeof report.summary.warnings, 'number');
            assert.ok(Array.isArray(report.errors));
            assert.ok(Array.isArray(report.warnings));
        });

        it('should return REG01 when token registry path is invalid', () => {
            const ctx = resolveSystemContextSafe();
            const report = validateDocs({
                docsRoot: ctx.paths.docs,
                registryPath: path.join(process.cwd(), '__nonexistent__', 'token-registry.json'),
            });

            assert.equal(report.ok, false);
            assert.ok(report.errors.some((item) => item?.code === 'REG01'));
        });

        it('should use context-aware default paths when no options provided', () => {
            // This test ensures the migration maintains context-aware defaults
            // rather than hardcoded paths
            const ctx = resolveSystemContextSafe();
            const report = validateDocs();

            // Should not fail with REG01 if context provides valid paths
            const reg01Errors = report.errors.filter((e) => e.code === 'REG01');
            
            // If registry exists at context path, should have no REG01 errors
            if (ctx.paths.tokenRegistry) {
                assert.ok(
                    reg01Errors.length === 0,
                    `Should not have REG01 errors when using context-aware defaults. Got: ${JSON.stringify(reg01Errors)}`
                );
            }
        });

        it('should return a valid report structure', () => {
            const ctx = resolveSystemContextSafe();
            
            const report = validateDocs({
                docsRoot: ctx.paths.docs,
                specRoot: ctx.paths.specs,
                registryPath: ctx.paths.tokenRegistry,
                checkPairing: false,
                checkSpecs: false,
            });

            // Should have checked files
            assert.ok(report.summary.filesChecked > 0, 'Should check at least 1 file');
        });
    });

    describe('DocsValidatorIssue type', () => {
        it('should support string[] for expected and actual fields', () => {
            // This test ensures the type fix for GAP01 validation
            const ctx = resolveSystemContextSafe();
            const report = validateDocs({
                docsRoot: ctx.paths.docs,
                specRoot: ctx.paths.specs,
                registryPath: ctx.paths.tokenRegistry,
            });

            // Check that any GAP01 errors have proper array types
            const gap01Errors = report.errors.filter((e) => e.code === 'GAP01');
            for (const error of gap01Errors) {
                // Should accept both string and string[]
                assert.ok(
                    error.expected === undefined ||
                    typeof error.expected === 'string' ||
                    Array.isArray(error.expected),
                    'expected should be string | string[]'
                );
                assert.ok(
                    error.actual === undefined ||
                    typeof error.actual === 'string' ||
                    Array.isArray(error.actual),
                    'actual should be string | string[]'
                );
            }
        });
    });

    describe('Context resolution (active system)', () => {
        it('should resolve to active system (iter), not legacy', () => {
            const ctx = resolveSystemContextSafe();
            
            // Verify we're using the active system
            assert.notEqual(ctx.id, '_legacy', 'Should use active system, not legacy');
            assert.ok(ctx.id === 'iter', 'Active system should be iter');
        });

        it('should use iter-specific paths, not hardcoded legacy', () => {
            const ctx = resolveSystemContextSafe();
            
            // Paths should point to docs/iter/*, not docs/*
            assert.ok(ctx.docsDir.includes('docs/iter'), 'docsDir should include docs/iter');
            assert.ok(ctx.paths.docs.includes('docs/iter/components'), 'paths.docs should be iter-specific');
            assert.ok(ctx.paths.specs.includes('docs/iter/_spec'), 'paths.specs should be iter-specific');
            assert.ok(ctx.paths.tokenRegistry.includes('docs/iter/_generated'), 'paths.tokenRegistry should be iter-specific');
        });
    });
});
