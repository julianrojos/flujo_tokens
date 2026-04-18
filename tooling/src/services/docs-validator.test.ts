/**
 * Docs Validator Service Tests
 *
 * Parity tests for docs-validator.ts migration from docs-validator.mjs.
 * Ensures the TypeScript implementation maintains behavioral compatibility.
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { validateDocs } from './docs-validator.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';

type ValidationRoots = {
    docsRoot: string;
    specRoot: string;
    registryPath: string;
};

let fallbackRoots: ValidationRoots | null = null;
let fallbackTempRoot: string | null = null;

function createFallbackValidationRoots(): ValidationRoots {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-validator-fallback-'));
  fallbackTempRoot = tempRoot;
    const docsRoot = path.join(tempRoot, 'design-systems', 'sys-test', 'docs', 'components');
    const specRoot = path.join(tempRoot, 'design-systems', 'sys-test', 'docs', '_spec', 'components');
    const registryPath = path.join(
        tempRoot,
        'design-systems',
        'sys-test',
        'docs',
        '_generated',
        'token-registry.json',
    );

    fs.mkdirSync(docsRoot, { recursive: true });
    fs.mkdirSync(specRoot, { recursive: true });
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(
        path.join(docsRoot, 'button.md'),
        [
            '# Button',
            '',
            '## Overview',
            '',
            'Token ref: `color.primary`',
            '',
        ].join('\n'),
        'utf8',
    );
    fs.writeFileSync(
        path.join(specRoot, 'button.yml'),
        [
            'name: button',
            'status: draft',
            'description: Button component',
        ].join('\n'),
        'utf8',
    );
    fs.writeFileSync(
        registryPath,
        JSON.stringify(
            {
                entries: [{ path: 'color.primary', slashPath: 'color/primary' }],
                byPath: { 'color.primary': { value: '#000000' } },
                bySlashPath: { 'color/primary': { value: '#000000' } },
            },
            null,
            2,
        ),
        'utf8',
    );

    return { docsRoot, specRoot, registryPath };
}

afterEach(() => {
  if (!fallbackTempRoot) return;
  fs.rmSync(fallbackTempRoot, { recursive: true, force: true });
  fallbackTempRoot = null;
  fallbackRoots = null;
});

function resolveValidationRoots(): {
    docsRoot: string;
    specRoot: string;
    registryPath: string;
} {
    try {
        const ctx = resolveSystemContextSafe();
        return {
            docsRoot: ctx.paths.docs,
            specRoot: ctx.paths.specs,
            registryPath: ctx.paths.tokenRegistry,
        };
    } catch {
        if (!fallbackRoots) fallbackRoots = createFallbackValidationRoots();
        return fallbackRoots;
    }
}

describe('docs-validator', () => {
    describe('validateDocs()', () => {
        it('should return a stable report shape', () => {
            const roots = resolveValidationRoots();
            const report = validateDocs({
                docsRoot: roots.docsRoot,
                registryPath: roots.registryPath,
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
            const roots = resolveValidationRoots();
            const report = validateDocs({
                docsRoot: roots.docsRoot,
                registryPath: path.join(process.cwd(), '__nonexistent__', 'token-registry.json'),
            });

            assert.equal(report.ok, false);
            assert.ok(report.errors.some((item) => item?.code === 'REG01'));
        });

        it('should report TOK01 for unresolved token references in markdown', () => {
            const roots = resolveValidationRoots();
            const filePath = path.join(roots.docsRoot, 'bad-token.md');
            fs.writeFileSync(
                filePath,
                [
                    '# Bad Token',
                    '',
                    'Token ref: `color.missing`',
                    '',
                ].join('\n'),
                'utf8',
            );

            const report = validateDocs({
                docsRoot: roots.docsRoot,
                registryPath: roots.registryPath,
                checkOverview: false,
            });

            assert.equal(report.ok, false);
            assert.ok(
                report.errors.some(
                    (item) => item?.code === 'TOK01' && item?.file === filePath,
                ),
            );
        });

        it('should use context-aware default paths when no options provided', () => {
            // This test ensures the migration maintains context-aware defaults
            // rather than hardcoded paths
            const roots = resolveValidationRoots();
            const report = validateDocs();
            const hasSystemContext = (() => {
                try {
                    resolveSystemContextSafe();
                    return true;
                } catch {
                    return false;
                }
            })();

            if (!hasSystemContext) {
                assert.ok(
                    report.errors.some((e) => e.code === 'DOC01'),
                    'Should report DOC01 when no system context is available and no explicit paths are provided.',
                );
                return;
            }

            // Context-aware defaults should report REG01 only when registry is unusable
            // (missing/unreadable OR empty), and otherwise remain clean.
            const reg01Errors = report.errors.filter((e) => e.code === 'REG01');

            if (!fs.existsSync(roots.registryPath)) {
                assert.ok(
                    reg01Errors.length > 0,
                    'Should report REG01 when context registry path does not exist.'
                );
                return;
            }

            let registryEmpty = false;
            try {
                const raw = fs.readFileSync(roots.registryPath, 'utf8');
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
                registryPath: roots.registryPath,
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

        it('does not require spec-only options when only docs and registry checks are requested', () => {
            const roots = resolveValidationRoots();
            const report = validateDocs({
                docsRoot: roots.docsRoot,
                registryPath: roots.registryPath,
                checkOverview: false,
            });

            assert.ok(
                !report.errors.some((e) => e.code === 'DOC01'),
                'Should not require spec-only options when only docs and registry checks are requested.',
            );
        });
    });

    describe('DocsValidatorIssue type', () => {
        it('should support string[] for expected and actual fields', () => {
            // This test ensures the type fix for GAP01 validation
            const roots = resolveValidationRoots();
            const report = validateDocs({
                docsRoot: roots.docsRoot,
                registryPath: roots.registryPath,
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
            const roots = resolveValidationRoots();

            assert.ok(path.isAbsolute(roots.docsRoot), 'docsRoot should be absolute');
            assert.ok(path.isAbsolute(roots.specRoot), 'specRoot should be absolute');
            assert.ok(path.isAbsolute(roots.registryPath), 'registryPath should be absolute');

            assert.equal(path.basename(roots.docsRoot), 'components');
            assert.equal(path.basename(roots.specRoot), 'components');
            assert.equal(path.basename(path.dirname(roots.specRoot)), '_spec');
            assert.equal(path.basename(roots.registryPath), 'token-registry.json');
            assert.equal(path.basename(path.dirname(roots.registryPath)), '_generated');
        });
    });
});
