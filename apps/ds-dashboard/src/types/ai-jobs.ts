/**
 * Frontend types for AI Jobs
 * Mirrors the backend types from ai-component-doc-schema.ts
 */
import type {
    ValidationSeverity,
    ValidationReport,
} from '../../shared/ai-validation-types';

// ============================================================================
// Base Types
// ============================================================================

/**
 * Supported AI provider names
 */
export type AiProviderName = 'anthropic' | 'openai' | 'ollama' | 'gemini';

/**
 * Job status types
 */
export type AiJobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

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
    provider: AiProviderName;
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

// ============================================================================
// Component Documentation Output
// ============================================================================

/**
 * Individual anatomy item describing a part of the component
 */
export interface ComponentDocAnatomy {
    /** Name of the anatomy part */
    name: string;
    /** Type of the part */
    type: string;
    /** Description of what this part does */
    description: string;
    /** Whether this part is optional */
    optional?: boolean;
    /** Child anatomy items */
    children?: ComponentDocAnatomy[];
}

/**
 * Variant definition for the component
 */
export interface ComponentDocVariant {
    /** Unique identifier for the variant */
    id: string;
    /** Human-readable name */
    name: string;
    /** Description of what makes this variant different */
    description: string;
    /** The variant properties */
    properties: Record<string, string>;
}

/**
 * Design token reference used by the component
 */
export interface ComponentDocToken {
    /** Token name */
    name: string;
    /** Token value or reference */
    value: string;
    /** Token type */
    type: string;
    /** Description of how this token is used */
    description?: string;
}

export interface ComponentDocState {
    name: string;
    description: string;
}

export interface AccessibilityFact {
    fact: string;
    source: 'spec' | 'inferred' | 'assumed';
    wcagCriterion?: string;
}

export interface ComponentDocStructureWarning {
    message: string;
    section: string;
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
    /** Generated markdown */
    markdown: string;
    /** Visual states of the component */
    states: ComponentDocState[];
    /** Verified accessibility facts */
    accessibilityFacts: AccessibilityFact[];
    /** Structural warning from extraction/validation */
    structureWarning?: ComponentDocStructureWarning;
    /** Confidence level of extraction */
    confidence?: 'high' | 'medium' | 'low';
    /** Unresolved questions for human review */
    unresolvedQuestions?: string[];
    /** Additional metadata */
    metadata?: {
        generatedAt: string;
        provider?: string;
        model?: string;
    };
}

export type { ValidationSeverity, ValidationReport };

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Job state response from GET /api/ai/jobs/:id
 */
export interface AiJobResponse {
    ok: boolean;
    id: string;
    status: AiJobStatus;
    input: AiJobInput;
    output?: ComponentDocOutput;
    error?: string;
    errorCode?: string;
    retryable?: boolean;
    events: AiJobEvent[];
    usage?: AiUsageMetrics;
    hasEditorialPatch: boolean;
    validationReport?: ValidationReport;
    canPublish?: boolean;
    pipelineStage?: 'extracting' | 'patching' | 'validating' | null;
    pipelineSeverity?: ValidationSeverity;
    pipelineScore?: number;
    /** Composite markdown (factual + editorial) for preview display only. Falls back to output.markdown. */
    previewMarkdown?: string;
    createdAt: number;
    updatedAt: number;
    done: boolean;
    nextCursor: string | null;
}

/**
 * Editorial patch payload from GET /api/ai/jobs/:id/editorial-patch
 */
export interface AiJobEditorialPatchResponse {
    ok: boolean;
    id: string;
    editorialPatch: Record<string, unknown>;
}

/**
 * Create job request body
 */
export interface CreateAiJobRequest {
    type: 'GENERATE_COMPONENT_DOC';
    provider: AiProviderName;
    componentId: string;
    figmaUrl?: string;
    model?: string;
    systemPrompt?: string;
    userPrompt?: string;
    dryRun?: boolean;
    runValidation?: boolean;
    idempotencyKey?: string;
}

/**
 * Create job response
 */
export interface CreateAiJobResponse {
    ok: boolean;
    jobId: string;
    status: AiJobStatus;
}

export interface AiProviderConfiguredResponse {
    ok: boolean;
    configuredProviders: AiProviderName[];
    defaultProvider: AiProviderName | null;
}

export type AiHealthStatus = 'ready' | 'warning' | 'error';

export interface AiProviderHealthCheck {
    status: AiHealthStatus;
    ready: boolean;
    message: string;
}

export interface AiFigmaHealthCheck extends AiProviderHealthCheck {
    fileKey: string | null;
}

export interface AiProviderHealthResponse {
    ok: boolean;
    provider: AiProviderName;
    model: string;
    checks: {
        figma: AiFigmaHealthCheck;
        provider: AiProviderHealthCheck;
        model: AiProviderHealthCheck;
    };
    overallReady: boolean;
    checkedAt: number;
}

export interface AiPromptDefaultsResponse {
    ok: boolean;
    systemPrompt: string;
    userPrompt: string;
    placeholders: string[];
}

export interface AiPromptPreviewResponse {
    ok: boolean;
    systemPrompt: string;
    userPrompt: string;
    componentId: string;
    specSource: 'figma' | 'fallback';
    warning?: string;
}

// ============================================================================
// Staleness Types
// ============================================================================

/**
 * Source scope for staleness computation
 */
export type DocStatusSourceScope = 'docs_only' | 'docs_plus_recent_changes';

/**
 * Component documentation status origin
 */
export type DocStatusOrigin = 'from_doc' | 'from_change_event';

/**
 * Document status for staleness checking
 */
export type DocStatus = 'fresh' | 'stale' | 'missing';

/**
 * Component documentation status
 */
export interface DocComponentStatus {
    componentId: string;
    slug: string;
    status: DocStatus;
    generatedAt?: string;
    lastChangeAt?: number;
    filePath?: string;
    origin: DocStatusOrigin;
}

/**
 * Staleness response from GET /api/ai/docs/status
 */
export interface AiDocStatusResponse {
    connected: boolean;
    sourceScope: DocStatusSourceScope;
    components: DocComponentStatus[];
}

// ============================================================================
// Diff Types
// ============================================================================

/**
 * Diff statistics
 */
export interface DiffStats {
    added: number;
    removed: number;
    unchanged: number;
}

/**
 * Diff result from GET /api/ai/jobs/:id/diff
 */
export interface DiffResult {
    hasPrevious: boolean;
    previousPath?: string;
    diff?: string;
    stats: DiffStats;
}

// ============================================================================
// Event Source Types
// ============================================================================

/**
 * SSE event for job progress
 */
export interface AiJobSseEvent {
    seq: number;
    ts: number;
    event: string;
    data?: unknown;
}

/**
 * SSE done event when job reaches terminal state
 */
export interface AiJobSseDone {
    status: AiJobStatus;
}

/**
 * Build the SSE events URL
 * 
 * Note: For EventSource, the browser automatically handles Last-Event-ID header
 * for reconnection. The cursor param is used as fallback for manual polling.
 * Server precedence: Last-Event-ID header > cursor query param > default 0
 */
export function buildAiJobEventsUrl(jobId: string, cursor?: number): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = new URL(`/api/ai/jobs/${jobId}/events`, origin);
    if (cursor !== undefined && cursor > 0) {
        url.searchParams.set('cursor', String(cursor));
    }
    return url.toString();
}
