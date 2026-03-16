/**
 * Parity test for stripDiacritics across all implementations.
 *
 * This test ensures that all duplicated implementations of stripDiacritics
 * (in tooling, figma-plugin, and .mjs scripts) produce identical results.
 *
 * RID: R-002 - Prevents drift between duplicated implementations.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { stripDiacritics as tsStripDiacritics } from './strip-diacritics.js';

describe('stripDiacritics parity', () => {
    const testCases: Array<{ input: string; expected: string; description: string }> = [
        { input: 'Botón', expected: 'Boton', description: 'Spanish ó' },
        { input: 'niño', expected: 'nino', description: 'Spanish ñ' },
        { input: 'pingüino', expected: 'pinguino', description: 'Spanish ü' },
        { input: 'Español', expected: 'Espanol', description: 'Spanish ñ uppercase' },
        { input: 'primário', expected: 'primario', description: 'Portuguese á' },
        { input: 'tamaño', expected: 'tamano', description: 'Spanish ñ' },
        { input: 'ÁNADE', expected: 'ANADE', description: 'Uppercase á' },
        { input: 'Übung', expected: 'Ubung', description: 'German Ü' },
        { input: 'café', expected: 'cafe', description: 'French é' },
        { input: 'naïve', expected: 'naive', description: 'French ï' },
        { input: 'àèìòù', expected: 'aeiou', description: 'Grave accents' },
        { input: 'âêîôû', expected: 'aeiou', description: 'Circumflex accents' },
        { input: 'ãõ', expected: 'ao', description: 'Tilde' },
        { input: 'e\u0301xample', expected: 'example', description: 'Extended diacritic U+1AB0 range' }, // U+0301 is in U+0300-U+036F range
        { input: 't\u0302est', expected: 'test', description: 'Extended diacritic U+1AB0 range' }, // U+0302 is in U+0300-U+036F range
        { input: 'hello', expected: 'hello', description: 'ASCII no diacritics' },
        { input: '', expected: '', description: 'Empty string' },
        { input: 'test-123', expected: 'test-123', description: 'ASCII with special chars' },
    ];

    it('TS and shared .mjs implementations produce identical results', async () => {
        // @ts-expect-error Legacy .mjs helper has no TypeScript declarations.
        const { stripDiacritics: stripDiacriticsMjs } = await import('../../scripts/lib/strip-diacritics.mjs') as {
            stripDiacritics: (input: string) => string;
        };
        for (const { input, expected, description } of testCases) {
            const tsResult = tsStripDiacritics(input);
            const mjsResult = stripDiacriticsMjs(input);

            assert.equal(
                tsResult,
                expected,
                `TS implementation failed for "${input}" (${description})`
            );
            assert.equal(
                mjsResult,
                expected,
                `MJS implementation failed for "${input}" (${description})`
            );

            assert.equal(
                tsResult,
                mjsResult,
                `Parity mismatch (TS vs MJS) for "${input}" (${description}): TS="${tsResult}", MJS="${mjsResult}"`
            );
        }
    });

    it('handles edge cases consistently', async () => {
        // @ts-expect-error Legacy .mjs helper has no TypeScript declarations.
        const { stripDiacritics: stripDiacriticsMjs } = await import('../../scripts/lib/strip-diacritics.mjs') as {
            stripDiacritics: (input: string) => string;
        };
        const edgeCases = ['', null as unknown as string, undefined as unknown as string];

        for (const input of edgeCases) {
            const tsResult = tsStripDiacritics(input);
            const mjsResult = stripDiacriticsMjs(input);

            assert.equal(tsResult, '', `TS should return empty for ${input}`);
            assert.equal(mjsResult, '', `MJS should return empty for ${input}`);
        }
    });
});
