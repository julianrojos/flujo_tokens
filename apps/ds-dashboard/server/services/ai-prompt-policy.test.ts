import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    parseMdcSection,
    buildPromptPolicyContext,
    resetPromptPolicyCacheForTests,
    MAX_POLICY_CHARS_BY_STAGE,
    POLICY_FILES_BY_STAGE,
} from './ai-prompt-policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const originalFsReadFile = fsPromises.readFile;

// ---------------------------------------------------------------------------
// S-03: parseMdcSection unit tests (pure, no I/O)
// ---------------------------------------------------------------------------

describe('parseMdcSection', () => {
    it('returns content for heading found in the middle of the file', () => {
        const content = `---
description: test
---

# Some title

## First section

Content one.

## Target section

This is the target content.
It spans multiple lines.

## Next section

Content three.
`;
        const result = parseMdcSection(content, 'Target section');
        assert.equal(result, 'This is the target content.\nIt spans multiple lines.');
    });

    it('returns content for heading at end of file (until EOF)', () => {
        const content = `## Last section

Content at the end.
No more headings after this.
`;
        const result = parseMdcSection(content, 'Last section');
        assert.equal(result, 'Content at the end.\nNo more headings after this.');
    });

    it('returns null when heading is not found', () => {
        const content = `## Heading one

Some content.

## Heading two

More content.
`;
        const result = parseMdcSection(content, 'Nonexistent heading');
        assert.equal(result, null);
    });

    it('matches heading case-insensitively', () => {
        const content = `## Tone policy

Technical content here.
`;
        assert.equal(parseMdcSection(content, 'Tone policy'), 'Technical content here.');
        assert.equal(parseMdcSection(content, 'tone policy'), 'Technical content here.');
        assert.equal(parseMdcSection(content, 'TONE POLICY'), 'Technical content here.');
    });

    it('handles content with BOM', () => {
        const content = `\uFEFF## Heading with BOM

Content after BOM.
`;
        const result = parseMdcSection(content, 'Heading with BOM');
        assert.equal(result, 'Content after BOM.');
    });

    it('handles content with CRLF line endings', () => {
        const content = `## CRLF section\r\n\r\nContent with CRLF.\r\n\r\n## Next section\r\n`;
        const result = parseMdcSection(content, 'CRLF section');
        assert.equal(result, 'Content with CRLF.');
    });

    it('returns only the requested section when multiple sections exist', () => {
        const content = `## Alpha

Alpha content.

## Beta

Beta content.

## Gamma

Gamma content.
`;
        const alpha = parseMdcSection(content, 'Alpha');
        const beta = parseMdcSection(content, 'Beta');
        const gamma = parseMdcSection(content, 'Gamma');

        assert.equal(alpha, 'Alpha content.');
        assert.equal(beta, 'Beta content.');
        assert.equal(gamma, 'Gamma content.');
    });

    it('includes sub-headings (###) in the section content', () => {
        const content = `## Parent section

Intro text.

### Sub heading

Sub content.

### Another sub

More sub content.

## Next parent

End.
`;
        const result = parseMdcSection(content, 'Parent section');
        assert.ok(result?.includes('Intro text.'));
        assert.ok(result?.includes('### Sub heading'));
        assert.ok(result?.includes('### Another sub'));
        assert.ok(result?.includes('More sub content.'));
    });
});

// ---------------------------------------------------------------------------
// S-04 & S-05: buildPromptPolicyContext behavior tests
// (Tests warn-once, cache, fallback, truncation via real/invalid paths)
// ---------------------------------------------------------------------------

describe('loadMdcSections behavior (via buildPromptPolicyContext)', async () => {
    beforeEach(() => {
        resetPromptPolicyCacheForTests();
    });

    it('warns once per key across repeated calls', async () => {
        resetPromptPolicyCacheForTests();

        let warnCount = 0;
        const originalWarn = console.warn;
        try {
            console.warn = (...args: unknown[]) => {
                if (String(args[0]).includes('[ai-prompt-policy]')) warnCount++;
                return originalWarn.apply(console, args);
            };

            // Call with invalid repo root twice
            await buildPromptPolicyContext('/nonexistent/path/that/does/not/exist');
            const count1 = warnCount;
            await buildPromptPolicyContext('/nonexistent/path/that/does/not/exist');
            const count2 = warnCount;

            // Second call should not increment warn count (cache hit)
            assert.ok(count1 >= 1, 'First call should have warned');
            assert.equal(count2, count1, 'Second call should not warn again (cache hit)');
        } finally {
            console.warn = originalWarn;
        }
    });

    it('warns again after resetPromptPolicyCacheForTests', async () => {
        resetPromptPolicyCacheForTests();

        let warnCount = 0;
        const originalWarn = console.warn;
        try {
            console.warn = (...args: unknown[]) => {
                if (String(args[0]).includes('[ai-prompt-policy]')) warnCount++;
                return originalWarn.apply(console, args);
            };

            await buildPromptPolicyContext('/nonexistent/reset/test');
            const countBefore = warnCount;

            resetPromptPolicyCacheForTests();
            await buildPromptPolicyContext('/nonexistent/reset/test');
            const countAfter = warnCount;

            assert.ok(countAfter > countBefore, 'Should warn again after reset');
        } finally {
            console.warn = originalWarn;
        }
    });
});

describe('buildPromptPolicyContext', () => {
    beforeEach(() => {
        resetPromptPolicyCacheForTests();
    });

    afterEach(() => {
        // Ensure tests cannot leak fs.readFile mocks between cases.
        (fsPromises as unknown as { readFile: typeof fsPromises.readFile }).readFile = originalFsReadFile;
    });

    it('happy path: returns non-empty string with real .mdc files', async () => {
        const result = await buildPromptPolicyContext(repoRoot);
        assert.ok(result.length > 0, 'Should return non-empty string');
    });

    it('includes source markers', async () => {
        resetPromptPolicyCacheForTests();
        const result = await buildPromptPolicyContext(repoRoot);
        assert.ok(result.includes('[source:'), 'Should include source markers');
        assert.ok(
            result.includes('figma-component-extractor.SKILL.md') || result.includes('RULES.md'),
            'Should reference stage files from ai-context',
        );
    });

    it('includes expected extraction-stage policy keywords', async () => {
        resetPromptPolicyCacheForTests();
        const result = await buildPromptPolicyContext(repoRoot);
        assert.ok(
            result.includes('Nada que no sea visible o trazable') || result.includes('Clasificar primero. Documentar después.'),
            'Should include extraction stage policy content',
        );
    });

    it('result length does not exceed extraction stage budget', async () => {
        resetPromptPolicyCacheForTests();
        const result = await buildPromptPolicyContext(repoRoot);
        assert.ok(
            result.length <= MAX_POLICY_CHARS_BY_STAGE.extraction,
            `Result (${result.length} chars) should not exceed extraction budget (${MAX_POLICY_CHARS_BY_STAGE.extraction})`,
        );
    });

    it('returns empty string for invalid repo root', async () => {
        resetPromptPolicyCacheForTests();
        const result = await buildPromptPolicyContext('/nonexistent/repo/root/path');
        assert.equal(result, '', 'Should return empty string for invalid root');
    });

    it('retries loading after a transient read failure (does not cache empty fallback)', async () => {
        resetPromptPolicyCacheForTests();
        const originalReadFile = fsPromises.readFile;
        let shouldFailReads = true;

        try {
            (fsPromises as unknown as { readFile: typeof fsPromises.readFile }).readFile = (async (...args: Parameters<typeof fsPromises.readFile>) => {
                const target = String(args[0]);
                if (
                    shouldFailReads
                    && target.includes('/ai-context/')
                ) {
                    throw new Error('transient fs failure');
                }
                return originalReadFile(...args);
            }) as typeof fsPromises.readFile;

            const firstResult = await buildPromptPolicyContext(repoRoot);
            assert.equal(firstResult, '', 'First call should fallback to empty context on transient read failure');

            shouldFailReads = false;
            const secondResult = await buildPromptPolicyContext(repoRoot);
            assert.ok(secondResult.length > 0, 'Second call should retry and recover once reads succeed');
        } finally {
            (fsPromises as unknown as { readFile: typeof fsPromises.readFile }).readFile = originalReadFile;
        }
    });

    it('cache hit: second call does not re-read files', async () => {
        resetPromptPolicyCacheForTests();
        let warnCount = 0;
        const originalWarn = console.warn;
        try {
            console.warn = (...args: unknown[]) => {
                if (String(args[0]).includes('[ai-prompt-policy]')) warnCount++;
                return originalWarn.apply(console, args);
            };

            const result1 = await buildPromptPolicyContext(repoRoot);
            const warnsAfterFirstCall = warnCount;
            const result2 = await buildPromptPolicyContext(repoRoot);

            assert.equal(result1, result2, 'Cache hit should return same result');
            assert.equal(
                warnCount,
                warnsAfterFirstCall,
                'Second call should be served from cache without recomputing warnings',
            );
        } finally {
            console.warn = originalWarn;
        }
    });

    it('sections are ordered by priority (highest priority first)', async () => {
        resetPromptPolicyCacheForTests();
        const result = await buildPromptPolicyContext(repoRoot);

        const topPriorityPos = result.indexOf('[source: figma-component-extractor.SKILL.md > Regla madre');
        const lowerPriorityPos = result.indexOf('[source: RULES.md > 4. Estado visual ≠ comportamiento real');

        assert.ok(topPriorityPos >= 0, 'Top-priority extraction rule should be present');
        if (lowerPriorityPos >= 0) {
            assert.ok(
                topPriorityPos < lowerPriorityPos,
                'Priority-1 rules should appear before lower-priority rules',
            );
        }
    });

    it('loads policy files in parallel (Promise.all)', async () => {
        resetPromptPolicyCacheForTests();
        const originalReadFile = fsPromises.readFile;
        let inFlight = 0;
        let maxInFlight = 0;
        let interceptedReads = 0;

        try {
            (fsPromises as unknown as { readFile: typeof fsPromises.readFile }).readFile = (async (...args: Parameters<typeof fsPromises.readFile>) => {
                const target = String(args[0]);
                if (target.includes('/ai-context/')) {
                    interceptedReads += 1;
                    inFlight += 1;
                    maxInFlight = Math.max(maxInFlight, inFlight);
                    await new Promise((resolve) => setTimeout(resolve, 25));
                    try {
                        return await originalReadFile(...args);
                    } finally {
                        inFlight -= 1;
                    }
                }
                return originalReadFile(...args);
            }) as typeof fsPromises.readFile;

            await buildPromptPolicyContext(repoRoot);
            assert.ok(interceptedReads >= 2, `Expected test spy to intercept reads; intercepted=${interceptedReads}`);
            assert.ok(maxInFlight >= 2, `Expected parallel reads; maxInFlight=${maxInFlight}`);
        } finally {
            (fsPromises as unknown as { readFile: typeof fsPromises.readFile }).readFile = originalReadFile;
        }
    });
});

// ---------------------------------------------------------------------------
// S-06: Contract CI test — verifies headings exist in real .mdc files
// ---------------------------------------------------------------------------

describe('Contract CI: .mdc headings exist', () => {
    it('[contract] all configured headings are present in real .mdc files', () => {
        const failures: string[] = [];

        // Iterate over all stages
        const allFiles = Object.values(POLICY_FILES_BY_STAGE).flat();
        for (const fileConfig of allFiles) {
            const filePath = path.resolve(repoRoot, fileConfig.relativePath);
            let content: string;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch {
                failures.push(`File not found: ${fileConfig.relativePath}`);
                continue;
            }

            for (const section of fileConfig.sections) {
                const extracted = parseMdcSection(content, section.heading);
                if (extracted === null) {
                    failures.push(
                        `Heading "${section.heading}" not found in ${fileConfig.relativePath}. `
                        + `Expected: "## ${section.heading}"`,
                    );
                }
            }
        }

        if (failures.length > 0) {
            assert.fail(
                `Contract violation — configured headings not found in .mdc files:\n`
                + failures.map((f) => `  - ${f}`).join('\n'),
            );
        }
    });
});
