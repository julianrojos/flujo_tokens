/**
 * Validation Report Schema
 *
 * Defines the structured JSON contract for the third LLM call in the pipeline.
 * The consistency checker validates the output of stages 1+2 against the
 * ai-context quality rules and produces a quality gate report.
 */

import type {
    ValidationSeverity,
    StructureWarning,
    MissingSection,
    UnsupportedClaim,
    EditorialConflict,
    TerminologyMismatch,
    A11yWarning,
    ValidationReport as SharedValidationReport,
} from '../../shared/ai-validation-types.js';

export const VALIDATION_REPORT_SCHEMA_VERSION = 1 as const;
export const VALID_SEVERITIES = ['blocking', 'warning', 'info'] as const;
export const VALID_SOURCES = ['extraction', 'editorial'] as const;
export type {
    ValidationSeverity,
    StructureWarning,
    MissingSection,
    UnsupportedClaim,
    EditorialConflict,
    TerminologyMismatch,
    A11yWarning,
};

/**
 * Validation report produced by stage 3 of the AI pipeline
 */
export interface ValidationReport extends SharedValidationReport {
    /** Schema version for compatibility */
    schemaVersion: typeof VALIDATION_REPORT_SCHEMA_VERSION;
}

// ─── JSON Schema (for runtime validation) ──────────────────────────────────

export const VALIDATION_REPORT_JSON_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    required: [
        'schemaVersion',
        'passes',
        'severity',
        'score',
        'structureWarnings',
        'missingSections',
        'unsupportedClaims',
        'editorialConflicts',
        'terminologyMismatches',
        'a11yWarnings',
        'notes',
    ],
    properties: {
        schemaVersion: {
            type: 'integer',
            const: VALIDATION_REPORT_SCHEMA_VERSION,
        },
        passes: { type: 'boolean' },
        severity: { type: 'string', enum: [...VALID_SEVERITIES] },
        score: { type: 'integer', minimum: 0, maximum: 100 },
        structureWarnings: {
            type: 'array',
            items: {
                type: 'object',
                required: ['message', 'severity', 'section'],
                properties: {
                    message: { type: 'string' },
                    severity: { type: 'string', enum: [...VALID_SEVERITIES] },
                    section: { type: 'string' },
                },
            },
        },
        missingSections: {
            type: 'array',
            items: {
                type: 'object',
                required: ['section', 'reason', 'severity'],
                properties: {
                    section: { type: 'string' },
                    reason: { type: 'string' },
                    severity: { type: 'string', enum: [...VALID_SEVERITIES] },
                },
            },
        },
        unsupportedClaims: {
            type: 'array',
            items: {
                type: 'object',
                required: ['claim', 'evidence', 'source', 'severity'],
                properties: {
                    claim: { type: 'string' },
                    evidence: { type: 'string' },
                    source: { type: 'string', enum: [...VALID_SOURCES] },
                    severity: { type: 'string', enum: [...VALID_SEVERITIES] },
                },
            },
        },
        editorialConflicts: {
            type: 'array',
            items: {
                type: 'object',
                required: ['extraction', 'editorial', 'severity'],
                properties: {
                    extraction: { type: 'string' },
                    editorial: { type: 'string' },
                    severity: { type: 'string', enum: [...VALID_SEVERITIES] },
                },
            },
        },
        terminologyMismatches: {
            type: 'array',
            items: {
                type: 'object',
                required: ['used', 'expected', 'location'],
                properties: {
                    used: { type: 'string' },
                    expected: { type: 'string' },
                    location: { type: 'string' },
                },
            },
        },
        a11yWarnings: {
            type: 'array',
            items: {
                type: 'object',
                required: ['message', 'severity'],
                properties: {
                    message: { type: 'string' },
                    severity: { type: 'string', enum: [...VALID_SEVERITIES] },
                    wcagCriterion: { type: 'string' },
                },
            },
        },
        notes: {
            type: 'array',
            items: { type: 'string' },
        },
    },
    additionalProperties: false,
} as const;

// ─── Runtime validator (no external dependency) ────────────────────────────

interface ValidationError {
    path: string;
    message: string;
}

function validateType(
    value: unknown,
    expected: string,
    path: string,
): ValidationError | null {
    const actual = typeof value;
    if (actual === expected) return null;
    return { path, message: `Expected ${expected}, got ${actual}` };
}

function validateStringArray(
    value: unknown,
    path: string,
): ValidationError | null {
    if (!Array.isArray(value)) {
        return { path, message: `Expected array, got ${typeof value}` };
    }
    for (let i = 0; i < value.length; i += 1) {
        const err = validateType(value[i], 'string', `${path}[${i}]`);
        if (err) return err;
    }
    return null;
}

function validateObjectArray(
    value: unknown,
    requiredKeys: string[],
    path: string,
    enumFields?: Record<string, string[]>,
): ValidationError | null {
    if (!Array.isArray(value)) {
        return { path, message: `Expected array, got ${typeof value}` };
    }
    for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (!item || typeof item !== 'object') {
            return { path: `${path}[${i}]`, message: 'Expected object' };
        }
        const obj = item as Record<string, unknown>;
        for (const key of requiredKeys) {
            if (typeof obj[key] !== 'string') {
                return { path: `${path}[${i}].${key}`, message: `Missing or invalid string field: ${key}` };
            }
        }
        if (enumFields) {
            for (const [field, allowedValues] of Object.entries(enumFields)) {
                const rawValue = obj[field];
                if (typeof rawValue === 'string' && !allowedValues.includes(rawValue)) {
                    return {
                        path: `${path}[${i}].${field}`,
                        message: `Must be one of: ${allowedValues.join(', ')}`,
                    };
                }
            }
        }
    }
    return null;
}

export function validateValidationReport(
    raw: unknown,
): { valid: true; report: ValidationReport } | { valid: false; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { valid: false, errors: [{ path: '$', message: 'Expected object' }] };
    }

    const report = raw as Record<string, unknown>;

    // schemaVersion is required
    if (report.schemaVersion !== VALIDATION_REPORT_SCHEMA_VERSION) {
        errors.push({
            path: 'schemaVersion',
            message: `Must be ${VALIDATION_REPORT_SCHEMA_VERSION}, got ${report.schemaVersion}`,
        });
    }

    // passes is required
    if (typeof report.passes !== 'boolean') {
        errors.push({ path: 'passes', message: 'Expected boolean' });
    }

    // severity is required and must be valid
    if (typeof report.severity !== 'string') {
        errors.push({ path: 'severity', message: 'Expected string' });
    } else if (!(VALID_SEVERITIES as readonly string[]).includes(report.severity)) {
        errors.push({ path: 'severity', message: `Must be one of: ${VALID_SEVERITIES.join(', ')}` });
    }

    // score is required and must be 0-100
    if (typeof report.score !== 'number') {
        errors.push({ path: 'score', message: 'Expected number' });
    } else if (report.score < 0 || report.score > 100) {
        errors.push({ path: 'score', message: 'Must be between 0 and 100' });
    }

    // All array fields are required
    const arrayFields: Array<{ key: string; requiredKeys?: string[]; enumFields?: Record<string, string[]> }> = [
        {
            key: 'structureWarnings',
            requiredKeys: ['message', 'severity', 'section'],
            enumFields: { severity: [...VALID_SEVERITIES] },
        },
        {
            key: 'missingSections',
            requiredKeys: ['section', 'reason', 'severity'],
            enumFields: { severity: [...VALID_SEVERITIES] },
        },
        {
            key: 'unsupportedClaims',
            requiredKeys: ['claim', 'evidence', 'source', 'severity'],
            enumFields: {
                source: [...VALID_SOURCES],
                severity: [...VALID_SEVERITIES],
            },
        },
        {
            key: 'editorialConflicts',
            requiredKeys: ['extraction', 'editorial', 'severity'],
            enumFields: { severity: [...VALID_SEVERITIES] },
        },
        { key: 'terminologyMismatches', requiredKeys: ['used', 'expected', 'location'] },
        {
            key: 'a11yWarnings',
            requiredKeys: ['message', 'severity'],
            enumFields: { severity: [...VALID_SEVERITIES] },
        },
    ];

    for (const field of arrayFields) {
        const val = report[field.key];
        if (!Array.isArray(val)) {
            errors.push({ path: field.key, message: `Expected array, got ${typeof val}` });
        } else if (field.requiredKeys) {
            const arrErr = validateObjectArray(val, field.requiredKeys, field.key, field.enumFields);
            if (arrErr) errors.push(arrErr);
        }
    }

    // notes[] must be an array of strings
    const notesErr = validateStringArray(report.notes, 'notes');
    if (notesErr) {
        errors.push(notesErr);
    }

    // Check for unknown top-level keys
    const allowedTopLevel = [
        'schemaVersion',
        'passes',
        'severity',
        'score',
        'structureWarnings',
        'missingSections',
        'unsupportedClaims',
        'editorialConflicts',
        'terminologyMismatches',
        'a11yWarnings',
        'notes',
    ];
    for (const key of Object.keys(report)) {
        if (!allowedTopLevel.includes(key)) {
            errors.push({ path: key, message: `Unknown property "${key}"` });
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return { valid: true, report: report as ValidationReport };
}

/**
 * Create a valid fixture for testing
 */
export function createValidValidationReportFixture(
    overrides?: Partial<ValidationReport>,
): ValidationReport {
    const fixture: ValidationReport = {
        schemaVersion: VALIDATION_REPORT_SCHEMA_VERSION,
        passes: true,
        severity: 'info',
        score: 85,
        structureWarnings: [],
        missingSections: [],
        unsupportedClaims: [],
        editorialConflicts: [],
        terminologyMismatches: [],
        a11yWarnings: [],
        notes: ['No critical issues found'],
    };

    return { ...fixture, ...overrides };
}
