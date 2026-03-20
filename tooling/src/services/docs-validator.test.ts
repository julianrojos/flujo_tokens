/**
 * Docs Validator Service Tests
 *
 * Parity tests for docs-validator.ts migration from docs-validator.mjs.
 * Ensures the TypeScript implementation maintains behavioral compatibility.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { validateDocs } from './docs-validator.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';

function resolveValidationRoots(): {
    docsRoot: string;
    specRoot: string;
    registryPath: string;
} {
    const ctx = resolveSystemContextSafe();
    const cwd = process.cwd();
    const fallback = {
        docsRoot: path.join(cwd, 'docs', 'components'),
        specRoot: path.join(cwd, 'docs', '_spec', 'components'),
        registryPath: path.join(cwd, 'docs', '_generated', 'token-registry.json'),
    };

    const hasMarkdownFiles = (dirPath: string): boolean => {
        if (!fs.existsSync(dirPath)) return false;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = path.join(dirPath, entry.name);
            if (entry.isDirectory() && hasMarkdownFiles(absolutePath)) return true;
            if (entry.isFile() && entry.name.endsWith('.md')) return true;
        }
        return false;
    };

    const docsRoot = hasMarkdownFiles(ctx.paths.docs) ? ctx.paths.docs : fallback.docsRoot;
    const specRoot = fs.existsSync(ctx.paths.specs) ? ctx.paths.specs : fallback.specRoot;
    const registryPath = fs.existsSync(ctx.paths.tokenRegistry) ? ctx.paths.tokenRegistry : fallback.registryPath;

    return { docsRoot, specRoot, registryPath };
}

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

            // Context-aware defaults should report REG01 only when registry is unusable
            // (missing/unreadable OR empty), and otherwise remain clean.
            const reg01Errors = report.errors.filter((e) => e.code === 'REG01');

            if (!fs.existsSync(ctx.paths.tokenRegistry)) {
                assert.ok(
                    reg01Errors.length > 0,
                    'Should report REG01 when context registry path does not exist.'
                );
                return;
            }

            let registryEmpty = false;
            try {
                const raw = fs.readFileSync(ctx.paths.tokenRegistry, 'utf8');
                const parsed = JSON.parse(raw);
                const byPath =
                    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                        ? (parsed.byPath && typeof parsed.byPath === 'object'
                            ? parsed.byPath
                            : parsed)
                        : {};
                registryEmpty = Object.keys(byPath).length === 0;
            } catch {
                registryEmpty = true;
            }

            if (registryEmpty) {
                assert.ok(
                    reg01Errors.length > 0,
                    'Should report REG01 when context registry is empty.'
                );
            } else {
                assert.ok(
                    reg01Errors.length === 0,
                    `Should not have REG01 errors when using context-aware defaults. Got: ${JSON.stringify(reg01Errors)}`
                );
            }
        });

        it('should return a valid report structure', () => {
            const roots = resolveValidationRoots();
            
            const report = validateDocs({
                docsRoot: roots.docsRoot,
                specRoot: roots.specRoot,
                registryPath: roots.registryPath,
                checkPairing: false,
                checkSpecs: false,
            });

            const hasReg01 = report.errors.some((e) => e.code === 'REG01');
            if (hasReg01) {
                assert.ok(
                    report.summary.filesChecked === 0,
                    'When registry precondition fails (REG01), validator should exit before scanning files.'
                );
            } else {
                assert.ok(report.summary.filesChecked > 0, 'Should check at least 1 file');
            }
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

    describe('Context resolution (system-agnostic)', () => {
        it('should resolve a context with a stable path structure', () => {
            const ctx = resolveSystemContextSafe();

            assert.ok(typeof ctx.id === 'string' && ctx.id.length > 0, 'Context id should be non-empty');
            assert.ok(path.isAbsolute(ctx.docsDir), 'docsDir should be absolute');
            assert.ok(path.isAbsolute(ctx.paths.docs), 'paths.docs should be absolute');
            assert.ok(path.isAbsolute(ctx.paths.specs), 'paths.specs should be absolute');
            assert.ok(path.isAbsolute(ctx.paths.tokenRegistry), 'paths.tokenRegistry should be absolute');

            assert.equal(path.basename(ctx.paths.docs), 'components');
            assert.equal(path.basename(ctx.paths.specs), 'components');
            assert.equal(path.basename(path.dirname(ctx.paths.specs)), '_spec');
            assert.equal(path.basename(ctx.paths.tokenRegistry), 'token-registry.json');
            assert.equal(path.basename(path.dirname(ctx.paths.tokenRegistry)), '_generated');
        });
    });
});
