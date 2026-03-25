/**
 * Component Documentation Output Schema
 * This defines the structured JSON output contract for AI-generated component documentation.
 */

// Type for Figma component spec (used in orchestrator but schema doesn't need to import it)
export type FigmaComponentSpec = Record<string, unknown>;

export const COMPONENT_DOC_SCHEMA_VERSION = 1 as const;

/**
 * Individual anatomy item describing a part of the component
 */
export interface ComponentDocAnatomy {
    /** Name of the anatomy part (e.g., "Primary Button", "Icon Container") */
    name: string;
    /** Type of the part (e.g., "FRAME", "TEXT", "INSTANCE") */
    type: string;
    /** Description of what this part does */
    description: string;
    /** Whether this part is optional */
    optional?: boolean;
    /** Child anatomy items (recursive, limited depth) */
    children?: ComponentDocAnatomy[];
}

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
 * Design token reference used by the component
 */
export interface ComponentDocToken {
    /** Token name (e.g., "primary-fill") */
    name: string;
    /** Token value or reference (e.g., "#007AFF" or "{colors.blue.500}") */
    value: string;
    /** Token type (e.g., "color", "spacing", "typography") */
    type: string;
    /** Description of how this token is used */
    description?: string;
}

/**
 * Main output interface for AI-generated component documentation
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
    /** Anatomy breakdown */
    anatomy: ComponentDocAnatomy[];
    /** Available variants */
    variants: ComponentDocVariant[];
    /** Design tokens used */
    tokens: ComponentDocToken[];
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
 * Job event for traceability
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
    provider: 'anthropic' | 'openai' | 'ollama' | 'gemini';
    /** Figma component ID */
    componentId: string;
    /** Optional Figma file key */
    fileKey?: string;
    /** Optional Figma URL */
    figmaUrl?: string;
    /** Optional model override */
    model?: string;
    /** Run without making actual LLM call */
    dryRun?: boolean;
    /** Explicit idempotency key */
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
    /** Idempotency key */
    idempotencyKey: string;
    /** Job events (ring buffer) */
    events: AiJobEvent[];
    /** Generated output (when completed) */
    output?: ComponentDocOutput;
    /** Usage metrics (when completed) */
    usage?: AiUsageMetrics;
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
} as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES]['code'];

/**
 * JSON Schema representation for LLM structured output
 */
export const COMPONENT_DOC_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: [
        'schemaVersion',
        'componentId',
        'title',
        'summary',
        'anatomy',
        'variants',
        'tokens',
        'accessibilityNotes',
        'markdown',
    ],
    properties: {
        schemaVersion: {
            type: 'integer',
            const: COMPONENT_DOC_SCHEMA_VERSION,
            description: 'Schema version number',
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
        anatomy: {
            type: 'array',
            description: 'Anatomy breakdown of the component',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'type', 'description'],
                properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    description: { type: 'string' },
                    optional: { type: 'boolean' },
                    children: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['name', 'type', 'description'],
                            properties: {
                                name: { type: 'string' },
                                type: { type: 'string' },
                                description: { type: 'string' },
                                optional: { type: 'boolean' },
                            },
                        },
                    },
                },
            },
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
        tokens: {
            type: 'array',
            description: 'Design tokens used',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'value', 'type'],
                properties: {
                    name: { type: 'string' },
                    value: { type: 'string' },
                    type: { type: 'string' },
                    description: { type: 'string' },
                },
            },
        },
        accessibilityNotes: {
            type: 'array',
            description: 'Accessibility considerations',
            items: { type: 'string' },
        },
        markdown: {
            type: 'string',
            description: 'Markdown content. Must be empty string from model output.',
        },
    },
} as const;

/**
 * Validate raw output from LLM
 */
export function validateComponentDocOutput(raw: unknown): ComponentDocOutput {
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
    const requiredStrings = ['componentId', 'title', 'summary', 'markdown'] as const;
    for (const field of requiredStrings) {
        if (typeof obj[field] !== 'string') {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    // Validate required array fields
    const requiredArrays = ['anatomy', 'variants', 'tokens', 'accessibilityNotes'] as const;
    for (const field of requiredArrays) {
        if (!Array.isArray(obj[field])) {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    // Validate nested anatomy items
    const anatomy = obj.anatomy as unknown[];
    for (let i = 0; i < anatomy.length; i++) {
        const item = anatomy[i];
        if (!item || typeof item !== 'object') {
            throw new Error(`anatomy[${i}]: must be an object`);
        }
        const anatomyItem = item as Record<string, unknown>;
        if (typeof anatomyItem.name !== 'string') {
            throw new Error(`anatomy[${i}]: missing or invalid 'name' field`);
        }
        if (typeof anatomyItem.type !== 'string') {
            throw new Error(`anatomy[${i}]: missing or invalid 'type' field`);
        }
        if (typeof anatomyItem.description !== 'string') {
            throw new Error(`anatomy[${i}]: missing or invalid 'description' field`);
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

    // Validate nested token items
    const tokens = obj.tokens as unknown[];
    for (let i = 0; i < tokens.length; i++) {
        const item = tokens[i];
        if (!item || typeof item !== 'object') {
            throw new Error(`tokens[${i}]: must be an object`);
        }
        const token = item as Record<string, unknown>;
        if (typeof token.name !== 'string') {
            throw new Error(`tokens[${i}]: missing or invalid 'name' field`);
        }
        if (typeof token.value !== 'string') {
            throw new Error(`tokens[${i}]: missing or invalid 'value' field`);
        }
        if (typeof token.type !== 'string') {
            throw new Error(`tokens[${i}]: missing or invalid 'type' field`);
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

    // Build and return validated output
    const output: ComponentDocOutput = {
        schemaVersion,
        componentId: obj.componentId as string,
        title: obj.title as string,
        summary: obj.summary as string,
        anatomy: obj.anatomy as ComponentDocAnatomy[],
        variants: obj.variants as ComponentDocVariant[],
        tokens: obj.tokens as ComponentDocToken[],
        accessibilityNotes: obj.accessibilityNotes as string[],
        markdown: obj.markdown as string,
    };

    if (obj.metadata) {
        output.metadata = obj.metadata as ComponentDocOutput['metadata'];
    }

    return output;
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
        anatomy: [
            {
                name: 'Container',
                type: 'FRAME',
                description: 'Main button container',
                children: [
                    {
                        name: 'Label',
                        type: 'TEXT',
                        description: 'Button text label',
                    },
                ],
            },
        ],
        variants: [
            {
                id: 'variant-1',
                name: 'Primary/Default',
                description: 'Default primary button state',
                properties: { variant: 'Primary', state: 'Default' },
            },
        ],
        tokens: [
            {
                name: 'primary-fill',
                value: '#007AFF',
                type: 'color',
                description: 'Background fill color',
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
    };

    return { ...fixture, ...overrides };
}
