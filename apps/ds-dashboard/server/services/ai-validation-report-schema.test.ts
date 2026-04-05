/**
 * AI Validation Report Schema Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    validateValidationReport,
    VALIDATION_REPORT_SCHEMA_VERSION,
    createValidValidationReportFixture,
} from './ai-validation-report-schema.js';

describe('ai-validation-report-schema', () => {
    describe('validateValidationReport', () => {
        it('passes with a valid fixture', () => {
            const fixture = createValidValidationReportFixture();
            const result = validateValidationReport(fixture);
            assert.ok(result.valid);
        });

        it('passes with empty arrays', () => {
            const result = validateValidationReport({
                schemaVersion: VALIDATION_REPORT_SCHEMA_VERSION,
                passes: true,
                severity: 'info',
                score: 100,
                structureWarnings: [],
                missingSections: [],
                unsupportedClaims: [],
                editorialConflicts: [],
                terminologyMismatches: [],
                a11yWarnings: [],
                tokenWarnings: [],
                notes: [],
            });
            assert.ok(result.valid);
        });

        it('fails when schemaVersion is wrong', () => {
            const fixture = createValidValidationReportFixture();
            const result = validateValidationReport({ ...fixture, schemaVersion: 99 });
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'schemaVersion'));
        });

        it('fails when schemaVersion is missing', () => {
            const fixture = createValidValidationReportFixture();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { schemaVersion: _, ...withoutSchema } = fixture as Record<string, unknown>;
            const result = validateValidationReport(withoutSchema);
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'schemaVersion'));
        });

        it('fails when severity is unknown', () => {
            const result = validateValidationReport({
                schemaVersion: VALIDATION_REPORT_SCHEMA_VERSION,
                passes: true,
                severity: 'critical',
                score: 50,
                structureWarnings: [],
                missingSections: [],
                unsupportedClaims: [],
                editorialConflicts: [],
                terminologyMismatches: [],
                a11yWarnings: [],
                tokenWarnings: [],
                notes: [],
            });
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'severity'));
        });

        it('fails when score is out of range (negative)', () => {
            const result = validateValidationReport({
                schemaVersion: VALIDATION_REPORT_SCHEMA_VERSION,
                passes: true,
                severity: 'info',
                score: -1,
                structureWarnings: [],
                missingSections: [],
                unsupportedClaims: [],
                editorialConflicts: [],
                terminologyMismatches: [],
                a11yWarnings: [],
                tokenWarnings: [],
                notes: [],
            });
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'score'));
        });

        it('fails when score is out of range (> 100)', () => {
            const result = validateValidationReport({
                schemaVersion: VALIDATION_REPORT_SCHEMA_VERSION,
                passes: true,
                severity: 'info',
                score: 101,
                structureWarnings: [],
                missingSections: [],
                unsupportedClaims: [],
                editorialConflicts: [],
                terminologyMismatches: [],
                a11yWarnings: [],
                tokenWarnings: [],
                notes: [],
            });
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'score'));
        });

        it('fails when passes is not boolean', () => {
            const result = validateValidationReport({
                schemaVersion: VALIDATION_REPORT_SCHEMA_VERSION,
                passes: 'yes',
                severity: 'info',
                score: 50,
                structureWarnings: [],
                missingSections: [],
                unsupportedClaims: [],
                editorialConflicts: [],
                terminologyMismatches: [],
                a11yWarnings: [],
                tokenWarnings: [],
                notes: [],
            });
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'passes'));
        });

        it('fails when input is not an object', () => {
            const result = validateValidationReport(null);
            assert.ok(!result.valid);
            assert.equal(result.errors[0].path, '$');
        });

        it('fails when input is an array', () => {
            const result = validateValidationReport([]);
            assert.ok(!result.valid);
        });

        it('fails when a required array field is missing', () => {
            const fixture = createValidValidationReportFixture();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { structureWarnings: _, ...withoutField } = fixture as Record<string, unknown>;
            const result = validateValidationReport(withoutField);
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'structureWarnings'));
        });

        it('passes with blocking severity', () => {
            const fixture = createValidValidationReportFixture({
                passes: false,
                severity: 'blocking',
                score: 10,
                structureWarnings: [{ message: 'Missing summary', severity: 'blocking', section: 'summary' }],
                notes: ['Blocking issues found'],
            });
            const result = validateValidationReport(fixture);
            assert.ok(result.valid);
        });

        it('rejects unknown top-level keys', () => {
            const fixture = createValidValidationReportFixture();
            const result = validateValidationReport({ ...fixture, unknownField: 'oops' });
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'unknownField'));
        });

        it('fails when nested severity enum is invalid', () => {
            const fixture = createValidValidationReportFixture({
                structureWarnings: [{ message: 'Bad severity', severity: 'critical' as any, section: 'summary' }],
            });
            const result = validateValidationReport(fixture);
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'structureWarnings[0].severity'));
        });

        it('fails when unsupportedClaims source enum is invalid', () => {
            const fixture = createValidValidationReportFixture({
                unsupportedClaims: [{
                    claim: 'Claim',
                    evidence: 'Evidence',
                    source: 'spec' as any,
                    severity: 'warning',
                }],
            });
            const result = validateValidationReport(fixture);
            assert.ok(!result.valid);
            assert.ok(result.errors.some(e => e.path === 'unsupportedClaims[0].source'));
        });
    });
});
