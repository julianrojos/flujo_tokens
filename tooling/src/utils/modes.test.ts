import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
    formatModeLabel,
    matchesPreferredMode,
    normalizePreferredMode,
} from './modes.js';

describe('modes helpers', () => {
    describe('normalizePreferredMode()', () => {
        it('normalizes raw mode labels into compact comparison keys', () => {
            assert.equal(normalizePreferredMode('Mode Dark'), 'dark');
            assert.equal(normalizePreferredMode('  mode--High Contrast  '), 'highcontrast');
            assert.equal(normalizePreferredMode('modern'), 'modern');
            assert.equal(normalizePreferredMode(''), undefined);
        });
    });

    describe('matchesPreferredMode()', () => {
        it('accepts raw preferred labels and normalized preferred keys', () => {
            assert.equal(matchesPreferredMode('Mode Dark', 'Mode Dark'), true);
            assert.equal(matchesPreferredMode('mode_dark', 'dark'), true);
            assert.equal(matchesPreferredMode('  --Mode Dark  ', '  mode--dark  '), true);
            assert.equal(matchesPreferredMode('modern', 'modern'), true);
            assert.equal(matchesPreferredMode('Mode Light', 'dark'), false);
        });
    });

    describe('formatModeLabel()', () => {
        it('formats labels consistently for display', () => {
            assert.equal(formatModeLabel('Mode Dark'), 'DARK');
            assert.equal(formatModeLabel('dark'), 'DARK');
            assert.equal(formatModeLabel('modern'), 'MODERN');
            assert.equal(formatModeLabel(undefined), '');
        });
    });
});
