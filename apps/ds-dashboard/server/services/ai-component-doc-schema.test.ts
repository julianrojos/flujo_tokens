/**
 * Schema validation tests for AI component documentation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateComponentDocModelOutput,
    createValidComponentDocModelFixture,
    COMPONENT_DOC_SCHEMA_VERSION,
    AI_ERROR_CODES,
} from './ai-component-doc-schema.js';

describe('ai-component-doc-schema', () => {
    describe('validateComponentDocModelOutput', () => {
        it('should accept valid fixture', () => {
            const fixture = createValidComponentDocModelFixture();
            const result = validateComponentDocModelOutput(fixture);
            assert.equal(result.schemaVersion, COMPONENT_DOC_SCHEMA_VERSION);
            assert.equal(result.componentId, '68:4097');
            assert.equal(result.title, 'Button');
            assert.equal('markdown' in result, false);
        });

        it('should accept fixture with v2 states field', () => {
            const fixture = createValidComponentDocModelFixture({
                states: [
                    { name: 'hover', description: 'Hover state' },
                    { name: 'focus', description: 'Focus state', visualChanges: [{ property: 'outline', value: '2px solid blue' }] },
                ],
            });
            const result = validateComponentDocModelOutput(fixture);
            assert.equal(result.states.length, 2);
            assert.equal(result.states[0].name, 'hover');
            assert.equal(result.states[1].visualChanges?.[0].property, 'outline');
        });

        it('should accept fixture with v2 accessibilityFacts field', () => {
            const fixture = createValidComponentDocModelFixture({
                accessibilityFacts: [
                    { fact: 'Has accessible name', source: 'spec', wcagCriterion: 'WCAG 2.1 4.1.2' },
                    { fact: 'Supports keyboard', source: 'inferred' },
                ],
            });
            const result = validateComponentDocModelOutput(fixture);
            assert.equal(result.accessibilityFacts.length, 2);
            assert.equal(result.accessibilityFacts[0].source, 'spec');
            assert.equal(result.accessibilityFacts[1].wcagCriterion, undefined);
        });

        it('should reject missing states array (v2)', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                accessibilityFacts: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /Missing required field: states/);
        });

        it('should reject missing accessibilityFacts array (v2)', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /Missing required field: accessibilityFacts/);
        });

        it('should reject states item with missing name', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [{ description: 'Missing name' }],
                accessibilityFacts: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /states\[0\]: missing or invalid 'name' field/);
        });

        it('should reject accessibilityFacts item with missing source', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [{ fact: 'Has accessible name' }],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /accessibilityFacts\[0\]: missing or invalid 'source' field/);
        });

        it('should reject accessibilityFacts source outside allowed enum', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [{ fact: 'Has accessible name', source: 'verified' }],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /accessibilityFacts\[0\]\.source: must be one of spec\|inferred\|assumed/);
        });

        it('should reject invalid confidence value', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
                confidence: 'certain',
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /confidence: must be one of high\|medium\|low/);
        });

        it('should reject unresolvedQuestions when not an array of strings', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
                unresolvedQuestions: ['ok', 123],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /unresolvedQuestions\[1\]: must be a string/);
        });

        it('should drop malformed structureWarning instead of failing the job', () => {
            // Models may return null/missing fields in structureWarning (especially local models).
            // The validator must drop the field gracefully so the job succeeds rather than
            // throwing ai.schema.invalid for a purely informational field.
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
                structureWarning: { message: 'Missing section' }, // section missing
            };
            const result = validateComponentDocModelOutput(fixture);
            assert.equal(result.structureWarning, undefined, 'malformed structureWarning should be dropped, not throw');
        });

        it('should reject non-object input', () => {
            assert.throws(() => {
                validateComponentDocModelOutput(null);
            }, /Output must be an object/);
        });

        it('should reject missing schemaVersion', () => {
            const fixture: Record<string, unknown> = {
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /Missing required field: schemaVersion/);
        });

        it('should reject wrong schemaVersion', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 999,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /Invalid schemaVersion/);
        });

        it('should reject missing componentId', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /Missing required field: componentId/);
        });

        it('should reject missing title', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /Missing required field: title/);
        });

        it('should reject missing summary', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /Missing required field: summary/);
        });

        it('accepts payload without deprecated sections', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
            };
            const result = validateComponentDocModelOutput(fixture);
            assert.equal(result.title, 'Button');
        });

        it('should reject missing variants array', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /Missing required field: variants/);
        });

        it('accepts payload without removed extra sections', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
            };
            validateComponentDocModelOutput(fixture);
        });

        it('should reject missing accessibilityNotes array', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                states: [],
                accessibilityFacts: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /Missing required field: accessibilityNotes/);
        });

        it('should accept empty arrays as valid', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
            };
            const result = validateComponentDocModelOutput(fixture);
            assert.deepEqual(result.variants, []);
            assert.deepEqual(result.accessibilityNotes, []);
            assert.deepEqual(result.states, []);
            assert.deepEqual(result.accessibilityFacts, []);
        });

        it('should tolerate extra fields', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
                extraField: 'should be tolerated',
                nested: { extra: 'also tolerated' },
            };
            const result = validateComponentDocModelOutput(fixture);
            assert.equal(result.title, 'Button');
        });

        it('tolerates extra unknown fields in payload', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
            };
            const result = validateComponentDocModelOutput({ ...fixture, removedLegacyField: { anything: true } });
            assert.equal(result.title, 'Button');
        });

        it('should reject variant with missing properties', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [{ id: 'v1', name: 'Primary', description: 'Missing properties' }],
                accessibilityNotes: [],
                states: [],
                accessibilityFacts: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /variants\[0\]: missing or invalid 'properties' field/);
        });

        it('should reject accessibility note that is not a string', () => {
            const fixture: Record<string, unknown> = {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [123],
                states: [],
                accessibilityFacts: [],
            };
            assert.throws(() => {
                validateComponentDocModelOutput(fixture);
            }, /accessibilityNotes\[0\]: must be a string/);
        });
    });

    describe('AI_ERROR_CODES', () => {
        it('should have all required error codes', () => {
            assert.equal(AI_ERROR_CODES.INPUT_INVALID.code, 'ai.input.invalid');
            assert.equal(AI_ERROR_CODES.INPUT_MISSING_PROVIDER_KEY.code, 'ai.input.missing_provider_key');
            assert.equal(AI_ERROR_CODES.FIGMA_NO_CONNECTION.code, 'ai.figma.no_connection');
            assert.equal(AI_ERROR_CODES.FIGMA_SPEC_FAILED.code, 'ai.figma.spec_failed');
            assert.equal(AI_ERROR_CODES.LLM_TIMEOUT.code, 'ai.llm.timeout');
            assert.equal(AI_ERROR_CODES.LLM_API_ERROR.code, 'ai.llm.api_error');
            assert.equal(AI_ERROR_CODES.LLM_RATE_LIMITED.code, 'ai.llm.rate_limited');
            assert.equal(AI_ERROR_CODES.SCHEMA_INVALID.code, 'ai.schema.invalid');
            assert.equal(AI_ERROR_CODES.JOB_NOT_FOUND.code, 'ai.job.not_found');
            assert.equal(AI_ERROR_CODES.JOB_NOT_COMPLETED.code, 'ai.job.not_completed');
            assert.equal(AI_ERROR_CODES.JOB_NOT_CANCELABLE.code, 'ai.job.not_cancelable');
            assert.equal(AI_ERROR_CODES.JOB_QUEUE_FULL.code, 'ai.job.queue_full');
            assert.equal(AI_ERROR_CODES.APPLY_FILE_EXISTS.code, 'ai.apply.file_exists');
            assert.equal(AI_ERROR_CODES.APPLY_PATH_BLOCKED.code, 'ai.apply.path_blocked');
        });

        it('should have correct retryable flags', () => {
            assert.equal(AI_ERROR_CODES.INPUT_INVALID.retryable, false);
            assert.equal(AI_ERROR_CODES.LLM_TIMEOUT.retryable, true);
            assert.equal(AI_ERROR_CODES.LLM_RATE_LIMITED.retryable, true);
            assert.equal(AI_ERROR_CODES.SCHEMA_INVALID.retryable, false);
        });
    });
});
