/**
 * AI Orchestrator
 * Implements the deterministic pipeline for generating component documentation
 */

import type { AiProvider, AiProviderResult, AiProviderName } from './ai-provider.js';
import { createAnthropicAdapter } from './ai-anthropic-adapter.js';
import { createOpenAiAdapter } from './ai-openai-adapter.js';
import { createOllamaAdapter } from './ai-ollama-adapter.js';
import { createGeminiAdapter } from './ai-gemini-adapter.js';
import type {
    AiJobState,
    ComponentDocOutput,
} from './ai-component-doc-schema.js';
import {
    validateComponentDocOutput,
    COMPONENT_DOC_JSON_SCHEMA,
    AI_ERROR_CODES,
} from './ai-component-doc-schema.js';
import { renderComponentDoc } from './ai-component-doc-renderer.js';
import type { AiJobsStore } from './ai-jobs-store.js';
import { getComponentSpecDirect } from './figma-direct-bridge-service.js';

/**
 * Maximum prompt characters (approximately 8k tokens)
 */
const MAX_PROMPT_CHARS = 32000;

/**
 * Default job timeout in milliseconds (90 seconds)
 */
const DEFAULT_JOB_TIMEOUT_MS = 90000;

/**
 * Default Ollama job timeout in milliseconds (120 seconds)
 */
const DEFAULT_OLLAMA_TIMEOUT_MS = 120000;

/**
 * Get job timeout from environment based on provider
 * @param provider - Provider name
 * @returns Timeout in milliseconds
 */
function getJobTimeout(provider: AiProviderName): number {
    if (provider === 'ollama') {
        const ollamaTimeout = process.env.AI_OLLAMA_TIMEOUT_MS;
        if (ollamaTimeout) {
            const parsed = parseInt(ollamaTimeout, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
        // Fallback to global, then to ollama default
        const globalTimeout = process.env.AI_JOB_TIMEOUT_MS;
        if (globalTimeout) {
            const parsed = parseInt(globalTimeout, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
        return DEFAULT_OLLAMA_TIMEOUT_MS;
    }

    const envTimeout = process.env.AI_JOB_TIMEOUT_MS;
    if (envTimeout) {
        const parsed = parseInt(envTimeout, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_JOB_TIMEOUT_MS;
}

/**
 * Sanitize token bindings by removing internal IDs while preserving useful names
 * @param tokenBindings - Raw token bindings from Figma spec
 * @returns Sanitized token bindings
 */
function sanitizeTokenBindings(tokenBindings: unknown): unknown {
    if (!Array.isArray(tokenBindings)) {
        return tokenBindings;
    }

    return tokenBindings.map((binding) => {
        if (!binding || typeof binding !== 'object') {
            return binding;
        }

        const b = binding as Record<string, unknown>;
        const sanitized: Record<string, unknown> = {};

        // Preserve useful fields
        if (typeof b.name === 'string') sanitized.name = b.name;
        if (typeof b.tokenName === 'string') sanitized.tokenName = b.tokenName;
        if (typeof b.tokenValue === 'string') sanitized.tokenValue = b.tokenValue;
        if (typeof b.type === 'string') sanitized.type = b.type;
        if (typeof b.description === 'string') sanitized.description = b.description;

        // Strip internal IDs (common patterns in Figma API)
        // Fields like: id, fileId, nodeId, variableId, collectionId, etc.
        const internalIdPatterns = ['Id', 'ID', 'id', 'Key', 'key', 'Hash', 'hash'];
        for (const key of Object.keys(b)) {
            if (internalIdPatterns.some((pattern) => key.includes(pattern))) {
                continue; // Skip internal ID fields
            }
            if (!sanitized[key]) {
                sanitized[key] = b[key];
            }
        }

        return sanitized;
    });
}

/**
 * Prune Figma spec for LLM prompt
 * Removes deep children, internal IDs, and truncates if needed
 * @param spec - Raw Figma component spec
 * @returns Pruned spec object
 */
export function pruneSpecForPrompt(spec: Record<string, unknown>): {
    pruned: Record<string, unknown>;
    truncated: boolean;
} {
    // Extract relevant fields
    const cleaned: Record<string, unknown> = {
        name: spec.name,
        type: spec.type,
        description: spec.description,
        // Limit variant axes
        variantAxes: spec.variantAxes,
        // Limit variants to 20
        variants:
            Array.isArray(spec.variants) && spec.variants.length > 20
                ? (spec.variants as unknown[]).slice(0, 20)
                : spec.variants,
        // Keep other fields as-is
        props: spec.props,
        states: spec.states,
        // Sanitize token bindings to remove internal IDs
        tokenBindings: sanitizeTokenBindings(spec.tokenBindings),
    };

    // Handle anatomy - limit depth and children
    if (spec.anatomy && Array.isArray(spec.anatomy)) {
        cleaned.anatomy = pruneAnatomyDepth(spec.anatomy as Record<string, unknown>[], 4);
    }

    // Serialize and check size
    const serialized = JSON.stringify(cleaned, null, 2);

    if (serialized.length <= MAX_PROMPT_CHARS) {
        return { pruned: cleaned, truncated: false };
    }

    // Progressive truncation: reduce variants first
    if (cleaned.variants && Array.isArray(cleaned.variants)) {
        cleaned.variants = (cleaned.variants as unknown[]).slice(0, 10);
        const reducedSerialized = JSON.stringify(cleaned, null, 2);
        if (reducedSerialized.length <= MAX_PROMPT_CHARS) {
            return { pruned: cleaned, truncated: true };
        }
    }

    // Further reduce
    if (cleaned.variants && Array.isArray(cleaned.variants)) {
        cleaned.variants = (cleaned.variants as unknown[]).slice(0, 5);
    }

    return { pruned: cleaned, truncated: true };
}

/**
 * Prune anatomy depth recursively
 */
function pruneAnatomyDepth(
    anatomy: Record<string, unknown>[],
    maxDepth: number,
    currentDepth = 0
): Record<string, unknown>[] {
    if (currentDepth >= maxDepth || !anatomy) {
        return [];
    }

    return anatomy.map((item) => {
        const pruned: Record<string, unknown> = {
            name: item.name,
            type: item.type,
            description: item.description,
            optional: item.optional,
        };

        // Recursively prune children
        if (item.children && Array.isArray(item.children) && currentDepth + 1 < maxDepth) {
            pruned.children = pruneAnatomyDepth(
                item.children as Record<string, unknown>[],
                maxDepth,
                currentDepth + 1
            );
        }

        return pruned;
    });
}

/**
 * Build system prompt for component documentation
 * @returns System prompt string
 */
export function buildSystemPrompt(): string {
    return `You are an expert design system documentation assistant. Your task is to generate structured component documentation based on Figma component specifications.

Generate a JSON object that matches the provided schema exactly. Follow these guidelines:

1. TITLE: Create a clear, human-readable title for the component
2. SUMMARY: Write a 1-2 sentence summary of what this component does
3. ANATOMY: Break down the component into its visual parts. Include:
   - Name: descriptive name for each part
   - Type: the Figma node type (FRAME, TEXT, INSTANCE, etc.)
   - Description: what this part does
   - Optional: whether this part can be hidden/removed
   - Children: nested parts if applicable
4. VARIANTS: Document all variants with:
   - A unique ID and descriptive name
   - Description of what makes this variant different
   - Properties: the variant properties (e.g., variant: Primary, state: Hover)
5. TOKENS: List design tokens used:
   - Name: token name
   - Value: token value or reference
   - Type: color, spacing, typography, etc.
   - Description: how the token is used
6. ACCESSIBILITY: Document accessibility considerations:
   - Keyboard navigation support
   - Screen reader considerations
   - Focus states
   - Any ARIA attributes needed

IMPORTANT:
- Populate all fields in the schema
- Use empty arrays "[]" if no items exist (not null)
- Keep descriptions concise but informative
- The "markdown" field should be empty string - it will be filled by a renderer
- Ensure JSON is valid and matches the schema exactly`;
}

/**
 * Build user prompt with component spec
 * @param spec - Pruned Figma component spec
 * @param componentId - Figma component ID
 * @returns User prompt string
 */
export function buildUserPrompt(
    spec: Record<string, unknown>,
    componentId: string
): string {
    return `Generate component documentation for Figma component ID: ${componentId}

Component Specification:
\`\`\`json
${JSON.stringify(spec, null, 2)}
\`\`\`

Please generate the documentation following the schema provided in the system prompt.`;
}

/**
 * Resolve adapter for provider
 * @param provider - Provider name
 * @returns AiProvider instance
 */
export function resolveAdapter(provider: AiProviderName): AiProvider {
    if (provider === 'anthropic') {
        return createAnthropicAdapter();
    }
    if (provider === 'ollama') {
        return createOllamaAdapter();
    }
    if (provider === 'gemini') {
        return createGeminiAdapter();
    }
    return createOpenAiAdapter();
}

/**
 * Create placeholder output for dry-run mode
 * @param componentId - Component ID
 * @param name - Component name from spec
 * @returns Placeholder ComponentDocOutput
 */
function createDryRunOutput(componentId: string, name?: string): ComponentDocOutput {
    return {
        schemaVersion: 1,
        componentId,
        title: `[DRY RUN] ${name || 'Unknown Component'}`,
        summary: 'This is a dry-run placeholder output - no actual LLM call was made.',
        anatomy: [],
        variants: [],
        tokens: [],
        accessibilityNotes: [],
        markdown: '',
        metadata: {
            generatedAt: new Date().toISOString(),
            provider: 'dry-run',
        },
    };
}

/**
 * Run the component documentation generation pipeline
 * @param job - Job state
 * @param store - Jobs store
 * @param adapterOverride - Optional adapter override for testing
 * @param getSpecOverride - Optional spec fetcher override for testing
 */
export async function runGenerateComponentDoc(
    job: AiJobState,
    store: AiJobsStore,
    adapterOverride?: { generate: (input: any) => Promise<any> },
    getSpecOverride?: (fileKey: string | null, nodeId: string) => Promise<Record<string, unknown>>
): Promise<void> {
    const jobTimeout = getJobTimeout(job.input.provider);

    try {
        // Push initial event
        store.pushEvent(job.id, 'pipeline.started', { componentId: job.input.componentId });

        // Step 1: Extract spec from Figma using real service or override
        const fileKey = job.input.fileKey || null;
        store.pushEvent(job.id, 'figma.spec.fetching', { fileKey });

        let spec: Record<string, unknown>;
        try {
            if (getSpecOverride) {
                spec = await getSpecOverride(fileKey, job.input.componentId);
            } else {
                spec = await getComponentSpecDirect(fileKey, {
                    nodeId: job.input.componentId,
                    depth: 4,
                }) as unknown as Record<string, unknown>;
            }
        } catch (error) {
            // Classify error with granularity: connection issues vs other spec failures
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isConnectionError = errorMessage.includes('no_socket') || errorMessage.includes('connection') || errorMessage.includes('network');
            throw {
                code: isConnectionError ? AI_ERROR_CODES.FIGMA_NO_CONNECTION.code : AI_ERROR_CODES.FIGMA_SPEC_FAILED.code,
                message: errorMessage,
                retryable: true,
            };
        }

        store.pushEvent(job.id, 'figma.spec.fetched', { hasSpec: !!spec.name });

        // Step 2: Preprocess spec
        const { pruned, truncated } = pruneSpecForPrompt(spec);
        store.pushEvent(job.id, 'context.prepared', {
            charCount: JSON.stringify(pruned).length,
            truncated,
        });
        if (truncated) {
            store.pushEvent(job.id, 'context.truncated', {
                charCount: JSON.stringify(pruned).length,
            });
        }

        // Step 3: Build prompts
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(pruned, job.input.componentId);

        // Store redacted prompt (no secrets)
        store.setPrompt(job.id, userPrompt.slice(0, 500) + '...');

        let output: ComponentDocOutput;
        let usage: { promptTokens: number; completionTokens: number; durationMs: number };

        // Step 4: LLM call (or skip for dry-run)
        if (job.input.dryRun) {
            store.pushEvent(job.id, 'llm.skipped', { reason: 'dryRun=true' });
            output = createDryRunOutput(job.input.componentId, String(spec.name || ''));
            usage = { promptTokens: 0, completionTokens: 0, durationMs: 0 };
        } else {
            const adapter = adapterOverride ?? resolveAdapter(job.input.provider);
            store.pushEvent(job.id, 'llm.calling', {
                provider: job.input.provider,
                model: job.input.model,
            });

            try {
                let timeoutId: ReturnType<typeof setTimeout> | null = null;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('LLM call timed out')), jobTimeout);
                });

                const result = await Promise.race([
                    adapter.generate({
                        systemPrompt,
                        userPrompt,
                        jsonSchema: COMPONENT_DOC_JSON_SCHEMA as Record<string, unknown>,
                        model: job.input.model,
                    }) as Promise<AiProviderResult>,
                    timeoutPromise,
                ]).finally(() => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                });

                store.pushEvent(job.id, 'llm.completed', {
                    durationMs: result.usage.durationMs,
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                });

                // Step 5: Validate output
                store.pushEvent(job.id, 'schema.validating', {});
                try {
                    output = validateComponentDocOutput(result.parsedJson);
                    store.pushEvent(job.id, 'schema.validated', { schemaVersion: output.schemaVersion });
                } catch (validationError) {
                    // Schema validation failure is non-retryable
                    throw {
                        code: AI_ERROR_CODES.SCHEMA_INVALID.code,
                        message: validationError instanceof Error ? validationError.message : 'Schema validation failed',
                        retryable: false,
                    };
                }

                // Capture real usage metrics from provider
                usage = {
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    durationMs: result.usage.durationMs,
                };
            } catch (error) {
                // Check if it's a timeout
                if (error instanceof Error && error.message === 'LLM call timed out') {
                    throw {
                        code: AI_ERROR_CODES.LLM_TIMEOUT.code,
                        message: `LLM call exceeded timeout of ${jobTimeout}ms`,
                        retryable: true,
                    };
                }

                // Re-throw known errors with code
                if (error && typeof error === 'object' && 'code' in error) {
                    throw error;
                }

                throw {
                    code: AI_ERROR_CODES.LLM_API_ERROR.code,
                    message: error instanceof Error ? error.message : 'LLM call failed',
                    retryable: false,
                };
            }
        }

        // Step 6: Render markdown
        const rendered = renderComponentDoc(output);
        output.markdown = rendered;
        store.pushEvent(job.id, 'render.completed', { charCount: rendered.length });

        // Step 7: Complete with usage metrics
        store.complete(job.id, output, usage);
        store.pushEvent(job.id, 'job.completed', { hasOutput: !!output, usage });
    } catch (error) {
        // Classify error
        const err = error as { code?: string; message?: string; retryable?: boolean };
        const code = err.code || AI_ERROR_CODES.LLM_API_ERROR.code;
        const retryable = err.retryable ?? false;
        const message = err.message || 'Unknown error';

        store.pushEvent(job.id, 'job.failed', { code, message, retryable });
        store.fail(job.id, message, code, retryable);
    } finally {
        // Try to dequeue next job
        store.tryDequeueNext(job.input.provider);
    }
}
