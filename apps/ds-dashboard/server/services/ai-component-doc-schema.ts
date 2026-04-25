/**
 * Component Documentation Output Schema
 * This defines the structured JSON output contract for AI-generated component documentation.
 */

import type { EditorialPatch } from './ai-editorial-patch-schema.js';

// Type for Figma component spec (used in orchestrator but schema doesn't need to import it)
export type FigmaComponentSpec = Record<string, unknown>;

export const COMPONENT_DOC_SCHEMA_VERSION = 2 as const;

/**
 * Variant definition for the component
 */
export interface ComponentDocVariant {
    /** Unique identifier for the variant */
    id: string;
    /** Human-readable name (e.g., "Primary/Default", "Secondary/Hover") */
    name: string;
    /** Description of what makes this variant different */
    description: string;
    /** The variant properties (e.g., { "variant": "Primary", "state": "Default" }) */
    properties: Record<string, string>;
}

/**
 * Visual state of a component variant
 */
export interface ComponentDocState {
    /** State name (e.g., "hover", "focus", "active", "disabled") */
    name: string;
    /** Description of what changes in this state */
    description: string;
    /** Visual properties that change (e.g., opacity, fill, border) */
    visualChanges?: Array<{
        /** Property name (e.g., "opacity", "fill") */
        property: string;
        /** Value in this state */
        value: string;
    }>;
}

/**
 * Verified accessibility fact about the component
 */
export interface AccessibilityFact {
    /** Description of the accessibility fact */
    fact: string;
    /** How it was determined: 'spec' (from Figma), 'inferred', or 'assumed' */
    source: 'spec' | 'inferred' | 'assumed';
    /** WCAG criterion reference if applicable */
    wcagCriterion?: string;
}

/**
 * Structural warning about the component output
 */
export interface StructureWarning {
    /** Brief description of the structural issue */
    message: string;
    /** Which section of the output is affected */
    section: string;
}

/**
 * Main output interface for AI-generated component documentation (v2)
 */
export interface ComponentDocOutput {
    /** Schema version for compatibility */
    schemaVersion: number;
    /** Figma component set node ID */
    componentId: string;
    /** Component display title */
    title: string;
    /** Brief summary of the component */
    summary: string;
    /** Available variants */
    variants: ComponentDocVariant[];
    /** Accessibility considerations */
    accessibilityNotes: string[];
    /** Generated markdown (filled by renderer) */
    markdown: string;
    /** Additional metadata */
    metadata?: {
        generatedAt: string;
        provider?: string;
        model?: string;
    };
    // ─── v2 fields ────────────────────────────────────────────────
    /** Visual states of the component */
    states: ComponentDocState[];
    /** Verified accessibility facts */
    accessibilityFacts: AccessibilityFact[];
    /** Structural warnings (populated by validation stage) */
    structureWarning?: StructureWarning;
    /** Confidence level of the extraction */
    confidence?: 'high' | 'medium' | 'low';
    /** Unresolved questions for human review */
    unresolvedQuestions?: string[];
}

/**
 * Structured extraction returned by the LLM before markdown rendering.
 * Keep this separate from ComponentDocOutput so the model does not need to
 * reason about renderer-owned fields.
 */
export interface ComponentDocModelOutput {
    /** Schema version for compatibility */
    schemaVersion: number;
    /** Figma component set node ID */
    componentId: string;
    /** Component display title */
    title: string;
    /** Brief summary of the component */
    summary: string;
    /** Available variants */
    variants: ComponentDocVariant[];
    /** Accessibility considerations */
    accessibilityNotes: string[];
    /** Visual states of the component */
    states: ComponentDocState[];
    /** Verified accessibility facts */
    accessibilityFacts: AccessibilityFact[];
    /** Additional metadata */
    metadata?: {
        generatedAt: string;
        provider?: string;
        model?: string;
    };
    /** Structural warnings (populated by validation stage) */
    structureWarning?: StructureWarning;
    /** Confidence level of the extraction */
    confidence?: 'high' | 'medium' | 'low';
    /** Unresolved questions for human review */
    unresolvedQuestions?: string[];
}

/**
 * Job status types
 */
export type AiJobStatus =
    | 'pending'
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled';

/**
 * Job event for auditability
 */
export interface AiJobEvent {
    /** Sequential event number */
    seq: number;
    /** Event timestamp */
    ts: number;
    /** Event name */
    event: string;
    /** Optional event data */
    data?: unknown;
}

/**
 * Usage metrics from LLM response
 */
export interface AiUsageMetrics {
    /** Number of prompt tokens */
    promptTokens: number;
    /** Number of completion tokens */
    completionTokens: number;
    /** Duration in milliseconds */
    durationMs: number;
}

/**
 * Job input parameters
 */
export interface AiJobInput {
    /** Job type */
    type: 'GENERATE_COMPONENT_DOC';
    /** AI provider to use */
    provider: 'anthropic' | 'openai' | 'openrouter' | 'ollama' | 'gemini';
    /** Optional design system identifier used to resolve system-scoped docs paths */
    systemId?: string;
    /** Figma component ID */
    componentId: string;
    /** Optional Figma file key */
    fileKey?: string;
    /** Optional Figma URL */
    figmaUrl?: string;
    /** Optional model override */
    model?: string;
    /** Optional system prompt override */
    systemPrompt?: string;
    /** Optional user prompt override (supports placeholders) */
    userPrompt?: string;
    /** Run without making actual LLM call */
    dryRun?: boolean;
    /** Whether to run stage-3 quality validation */
    runValidation?: boolean;
    /**
     * Explicit idempotency key from caller intent.
     * In rerun flows this value is preserved as requested by the caller.
     */
    idempotencyKey?: string;
}

/**
 * Complete job state
 */
export interface AiJobState {
    /** Unique job ID */
    id: string;
    /** Job input parameters */
    input: AiJobInput;
    /** Current job status */
    status: AiJobStatus;
    /**
     * Effective idempotency key for this concrete job instance.
     * For reruns this may be a derived internal key (e.g. with :rerun: suffix)
     * and can differ from input.idempotencyKey.
     */
    idempotencyKey: string;
    /** Job events (ring buffer) */
    events: AiJobEvent[];
    /** Generated output (when completed) */
    output?: ComponentDocOutput;
    /** Usage metrics (when completed) */
    usage?: AiUsageMetrics;
    /** Structured editorial suggestion from LLM */
    editorialPatch?: EditorialPatch;
    /** Validation report from stage 3 */
    validationReport?: import('./ai-validation-report-schema.js').ValidationReport;
    /** Whether the job output can be published (gate from validation) */
    canPublish?: boolean;
    /** Current pipeline stage */
    pipelineStage?: 'extracting' | 'patching' | 'validating' | null;
    /** Highest severity found in validation */
    pipelineSeverity?: 'blocking' | 'warning' | 'info';
    /** Quality score from validation (0-100) */
    pipelineScore?: number;
    /** Error information (when failed) */
    error?: string;
    /** Error code (when failed) */
    errorCode?: string;
    /** Whether the error is retryable */
    retryable?: boolean;
    /** Created timestamp */
    createdAt: number;
    /** Updated timestamp */
    updatedAt: number;
}

/**
 * Error codes taxonomy
 */
export const AI_ERROR_CODES = {
    INPUT_INVALID: {
        code: 'ai.input.invalid',
        message: 'Bad request body',
        retryable: false,
    },
    INPUT_MISSING_PROVIDER_KEY: {
        code: 'ai.input.missing_provider_key',
        message: 'API key env var not set',
        retryable: false,
    },
    FIGMA_NO_CONNECTION: {
        code: 'ai.figma.no_connection',
        message: 'No plugin WebSocket',
        retryable: true,
    },
    FIGMA_SPEC_FAILED: {
        code: 'ai.figma.spec_failed',
        message: 'getComponentSpecDirect threw',
        retryable: true,
    },
    LLM_TIMEOUT: {
        code: 'ai.llm.timeout',
        message: 'LLM call exceeded timeout',
        retryable: true,
    },
    LLM_API_ERROR: {
        code: 'ai.llm.api_error',
        message: 'Provider API returned error',
        retryable: true,
    },
    LLM_RATE_LIMITED: {
        code: 'ai.llm.rate_limited',
        message: 'Provider 429',
        retryable: true,
    },
    AI_OLLAMA_UNAVAILABLE: {
        code: 'ai.ollama.unavailable',
        message: 'Ollama not reachable',
        retryable: true,
    },
    SCHEMA_INVALID: {
        code: 'ai.schema.invalid',
        message: 'LLM output failed validation',
        retryable: false,
    },
    JOB_NOT_FOUND: {
        code: 'ai.job.not_found',
        message: 'Job ID does not exist',
        retryable: false,
    },
    JOB_NOT_COMPLETED: {
        code: 'ai.job.not_completed',
        message: 'Apply on non-completed job',
        retryable: false,
    },
    JOB_NOT_CANCELABLE: {
        code: 'ai.job.not_cancelable',
        message: 'Cancel on running/completed',
        retryable: false,
    },
    JOB_QUEUE_FULL: {
        code: 'ai.job.queue_full',
        message: 'Store at capacity',
        retryable: true,
    },
    APPLY_FILE_EXISTS: {
        code: 'ai.apply.file_exists',
        message: 'File exists, overwrite=false',
        retryable: false,
    },
    APPLY_PATH_BLOCKED: {
        code: 'ai.apply.path_blocked',
        message: 'Path traversal detected',
        retryable: false,
    },
    VALIDATION_BLOCKED: {
        code: 'ai.validation.blocked',
        message: 'ValidationReport severity: blocking',
        retryable: false,
    },
} as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES]['code'];

function normalizeAccessibilityFactSource(value: unknown): AccessibilityFact['source'] | null {
    const source = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!source) return null;

    if (source === 'spec' || source === 'verified' || source === 'observed') {
        return 'spec';
    }
    if (source === 'inferred' || source === 'inference' || source === 'derived') {
        return 'inferred';
    }
    if (
        source === 'assumed' ||
        source === 'assumption' ||
        source === 'likely' ||
        source === 'guessed' ||
        source === 'guess'
    ) {
        return 'assumed';
    }

    return null;
}

/**
 * JSON Schema representation for LLM structured output
 */
export const COMPONENT_DOC_MODEL_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: [
        'schemaVersion',
        'componentId',
        'title',
        'summary',
        'variants',
        'accessibilityNotes',
        'states',
        'accessibilityFacts',
    ],
    properties: {
        schemaVersion: {
            type: 'integer',
            const: COMPONENT_DOC_SCHEMA_VERSION,
            description: 'Schema version number. CRITICAL: MUST be exactly 2.',
        },
        componentId: {
            type: 'string',
            description: 'Figma component set node ID',
        },
        title: {
            type: 'string',
            description: 'Component display title',
        },
        summary: {
            type: 'string',
            description: 'Brief summary of the component',
        },
        variants: {
            type: 'array',
            description: 'Available variants',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'name', 'description', 'properties'],
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    properties: {
                        type: 'object',
                        additionalProperties: { type: 'string' },
                    },
                },
            },
        },
        accessibilityNotes: {
            type: 'array',
            description: 'Accessibility considerations',
            items: { type: 'string' },
        },
        states: {
            type: 'array',
            description: 'Visual states of the component',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'description'],
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    visualChanges: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['property', 'value'],
                            properties: {
                                property: { type: 'string' },
                                value: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
        accessibilityFacts: {
            type: 'array',
            description: 'Verified accessibility facts',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['fact', 'source'],
                properties: {
                    fact: { type: 'string' },
                    source: { type: 'string', enum: ['spec', 'inferred', 'assumed'] },
                    wcagCriterion: { type: 'string' },
                },
            },
        },
        structureWarning: {
            type: 'object',
            description: 'Structural warning about the component output',
            additionalProperties: false,
            required: ['message', 'section'],
            properties: {
                message: { type: 'string' },
                section: { type: 'string' },
            },
        },
        confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Confidence level of the extraction',
        },
        unresolvedQuestions: {
            type: 'array',
            description: 'Unresolved questions for human review',
            items: { type: 'string' },
        },
    },
} as const;

/**
 * Validate raw output from LLM
 */
export function validateComponentDocModelOutput(raw: unknown): ComponentDocModelOutput {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Output must be an object');
    }

    const obj = raw as Record<string, unknown>;

    // Validate schemaVersion
    const schemaVersion = obj.schemaVersion;
    if (typeof schemaVersion !== 'number') {
        throw new Error('Missing required field: schemaVersion');
    }
    if (schemaVersion !== COMPONENT_DOC_SCHEMA_VERSION) {
        throw new Error(
            `Invalid schemaVersion: expected ${COMPONENT_DOC_SCHEMA_VERSION}, got ${schemaVersion}`
        );
    }

    // Validate required string fields
    const requiredStrings = ['componentId', 'title', 'summary'] as const;
    for (const field of requiredStrings) {
        if (typeof obj[field] !== 'string') {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    // Validate required array fields
    const requiredArrays = ['variants', 'accessibilityNotes', 'states', 'accessibilityFacts'] as const;
    for (const field of requiredArrays) {
        if (!Array.isArray(obj[field])) {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    // Validate nested variant items
    const variants = obj.variants as unknown[];
    for (let i = 0; i < variants.length; i++) {
        const item = variants[i];
        if (!item || typeof item !== 'object') {
            throw new Error(`variants[${i}]: must be an object`);
        }
        const variant = item as Record<string, unknown>;
        if (typeof variant.id !== 'string') {
            throw new Error(`variants[${i}]: missing or invalid 'id' field`);
        }
        if (typeof variant.name !== 'string') {
            throw new Error(`variants[${i}]: missing or invalid 'name' field`);
        }
        if (typeof variant.description !== 'string') {
            throw new Error(`variants[${i}]: missing or invalid 'description' field`);
        }
        if (!variant.properties || typeof variant.properties !== 'object') {
            throw new Error(`variants[${i}]: missing or invalid 'properties' field`);
        }
    }

    // Validate accessibilityNotes are strings
    const accessibilityNotes = obj.accessibilityNotes as unknown[];
    for (let i = 0; i < accessibilityNotes.length; i++) {
        const note = accessibilityNotes[i];
        if (typeof note !== 'string') {
            throw new Error(`accessibilityNotes[${i}]: must be a string`);
        }
    }

    // Validate states array
    const states = obj.states as unknown[];
    for (let i = 0; i < states.length; i++) {
        const item = states[i];
        if (!item || typeof item !== 'object') {
            throw new Error(`states[${i}]: must be an object`);
        }
        const stateItem = item as Record<string, unknown>;
        if (typeof stateItem.name !== 'string') {
            throw new Error(`states[${i}]: missing or invalid 'name' field`);
        }
        if (typeof stateItem.description !== 'string') {
            throw new Error(`states[${i}]: missing or invalid 'description' field`);
        }
    }

    // Validate accessibilityFacts array
    const accessibilityFacts = obj.accessibilityFacts as unknown[];
    for (let i = 0; i < accessibilityFacts.length; i++) {
        const item = accessibilityFacts[i];
        if (!item || typeof item !== 'object') {
            throw new Error(`accessibilityFacts[${i}]: must be an object`);
        }
        const fact = item as Record<string, unknown>;
        if (typeof fact.fact !== 'string') {
            throw new Error(`accessibilityFacts[${i}]: missing or invalid 'fact' field`);
        }
        if (typeof fact.source !== 'string') {
            throw new Error(`accessibilityFacts[${i}]: missing or invalid 'source' field`);
        }
        const normalizedSource = normalizeAccessibilityFactSource(fact.source);
        if (!normalizedSource) {
            throw new Error(`accessibilityFacts[${i}].source: must be one of spec|inferred|assumed`);
        }
        fact.source = normalizedSource;
    }

    if (obj.structureWarning !== undefined) {
        if (!obj.structureWarning || typeof obj.structureWarning !== 'object') {
            // Model returned a non-object — drop silently rather than failing the job.
            console.warn('[ai-schema] structureWarning is not an object, dropping:', obj.structureWarning);
            delete (obj as Record<string, unknown>).structureWarning;
        } else {
            const warning = obj.structureWarning as Record<string, unknown>;
            const messageOk = typeof warning.message === 'string';
            const sectionOk = typeof warning.section === 'string';
            if (!messageOk || !sectionOk) {
                // Model returned null/non-string fields — drop the whole field rather than
                // failing the job with ai.schema.invalid. structureWarning is informational only.
                console.warn('[ai-schema] structureWarning has invalid fields, dropping:', warning);
                delete (obj as Record<string, unknown>).structureWarning;
            }
        }
    }

    if (obj.confidence !== undefined) {
        if (
            typeof obj.confidence !== 'string'
            || !['high', 'medium', 'low'].includes(obj.confidence)
        ) {
            throw new Error('confidence: must be one of high|medium|low');
        }
    }

    if (obj.unresolvedQuestions !== undefined) {
        if (!Array.isArray(obj.unresolvedQuestions)) {
            throw new Error('unresolvedQuestions: must be an array of strings');
        }
        const unresolvedQuestions = obj.unresolvedQuestions as unknown[];
        for (let i = 0; i < unresolvedQuestions.length; i++) {
            if (typeof unresolvedQuestions[i] !== 'string') {
                throw new Error(`unresolvedQuestions[${i}]: must be a string`);
            }
        }
    }

    // Build and return validated output
    const output: ComponentDocModelOutput = {
        schemaVersion,
        componentId: obj.componentId as string,
        title: obj.title as string,
        summary: obj.summary as string,
        variants: obj.variants as ComponentDocVariant[],
        accessibilityNotes: obj.accessibilityNotes as string[],
        states: obj.states as ComponentDocState[],
        accessibilityFacts: obj.accessibilityFacts as AccessibilityFact[],
    };

    if (obj.metadata) {
        output.metadata = obj.metadata as ComponentDocModelOutput['metadata'];
    }
    if (obj.structureWarning) {
        output.structureWarning = obj.structureWarning as StructureWarning;
    }
    if (obj.confidence) {
        output.confidence = obj.confidence as 'high' | 'medium' | 'low';
    }
    if (obj.unresolvedQuestions) {
        output.unresolvedQuestions = obj.unresolvedQuestions as string[];
    }

    return output;
}

export function toComponentDocOutput(
    modelOutput: ComponentDocModelOutput,
    markdown: string,
): ComponentDocOutput {
    return {
        ...modelOutput,
        markdown,
    };
}

/**
 * Create a valid fixture for testing
 */
export function createValidComponentDocFixture(
    overrides?: Partial<ComponentDocOutput>
): ComponentDocOutput {
    const fixture: ComponentDocOutput = {
        schemaVersion: COMPONENT_DOC_SCHEMA_VERSION,
        componentId: '68:4097',
        title: 'Button',
        summary: 'A button component for triggering actions',
        variants: [
            {
                id: 'variant-1',
                name: 'Primary/Default',
                description: 'Default primary button state',
                properties: { variant: 'Primary', state: 'Default' },
            },
        ],
        accessibilityNotes: [
            'Button has accessible name from label text',
            'Supports keyboard navigation',
        ],
        markdown: '',
        metadata: {
            generatedAt: new Date().toISOString(),
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
        },
        states: [
            {
                name: 'hover',
                description: 'Slightly darker background on hover',
                visualChanges: [{ property: 'opacity', value: '0.9' }],
            },
            {
                name: 'focus',
                description: 'Visible focus ring for keyboard users',
                visualChanges: [{ property: 'outline', value: '2px solid blue' }],
            },
        ],
        accessibilityFacts: [
            {
                fact: 'Button has accessible name from visible label text',
                source: 'spec',
                wcagCriterion: 'WCAG 2.1 4.1.2',
            },
        ],
    };

    return { ...fixture, ...overrides };
}

export function createValidComponentDocModelFixture(
    overrides?: Partial<ComponentDocModelOutput>,
): ComponentDocModelOutput {
    const fixture: ComponentDocModelOutput = {
        schemaVersion: COMPONENT_DOC_SCHEMA_VERSION,
        componentId: '68:4097',
        title: 'Button',
        summary: 'A button component for triggering actions',
        variants: [
            {
                id: 'variant-1',
                name: 'Primary/Default',
                description: 'Default primary button state',
                properties: { variant: 'Primary', state: 'Default' },
            },
        ],
        accessibilityNotes: [
            'Button has accessible name from label text',
            'Supports keyboard navigation',
        ],
        metadata: {
            generatedAt: new Date().toISOString(),
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
        },
        states: [
            {
                name: 'hover',
                description: 'Slightly darker background on hover',
                visualChanges: [{ property: 'opacity', value: '0.9' }],
            },
            {
                name: 'focus',
                description: 'Visible focus ring for keyboard users',
                visualChanges: [{ property: 'outline', value: '2px solid blue' }],
            },
        ],
        accessibilityFacts: [
            {
                fact: 'Button has accessible name from visible label text',
                source: 'spec',
                wcagCriterion: 'WCAG 2.1 4.1.2',
            },
        ],
    };
    return { ...fixture, ...overrides };
}
