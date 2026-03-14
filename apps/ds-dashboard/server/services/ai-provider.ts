/**
 * AI Provider Interface and Shared Types
 * Defines the common interface for AI providers (Anthropic, OpenAI)
 */

import type { AiUsageMetrics } from './ai-component-doc-schema.js';

/**
 * Supported AI provider names
 */
export type AiProviderName = 'anthropic' | 'openai';

/**
 * Input for AI provider generation
 */
export interface AiProviderInput {
    /** System prompt to set context */
    systemPrompt: string;
    /** User prompt with the actual request */
    userPrompt: string;
    /** JSON Schema for structured output */
    jsonSchema: Record<string, unknown>;
    /** Optional model override */
    model?: string;
}

/**
 * Result from AI provider generation
 */
export interface AiProviderResult {
    /** Raw text response from the provider */
    rawText: string;
    /** Parsed JSON output */
    parsedJson: unknown;
    /** Usage metrics */
    usage: AiUsageMetrics;
}

/**
 * AI Provider interface
 * All AI adapters must implement this interface
 */
export interface AiProvider {
    /** Provider name */
    readonly name: AiProviderName;
    /**
     * Generate structured output from the AI provider
     * @param input - Provider input with prompts and schema
     * @returns Generated result with parsed JSON and usage metrics
     */
    generate(input: AiProviderInput): Promise<AiProviderResult>;
}

/**
 * AI Provider configuration
 */
export interface AiProviderConfig {
    /** Default Anthropic model */
    anthropicModel: string;
    /** Default OpenAI model */
    openaiModel: string;
    /** Allowed Anthropic models */
    anthropicAllowlist: string[];
    /** Allowed OpenAI models */
    openaiAllowlist: string[];
}

/**
 * Default provider configuration
 */
const DEFAULT_CONFIG: AiProviderConfig = {
    anthropicModel: 'claude-sonnet-4-20250514',
    openaiModel: 'gpt-4o-mini-2024-07-18',
    anthropicAllowlist: [
        'claude-sonnet-4-20250514',
        'claude-sonnet-4-6',
        'claude-3-5-sonnet-20240620',
        'claude-3-opus-20240229',
        'claude-3-haiku-20240307',
    ],
    openaiAllowlist: [
        'gpt-4o-mini-2024-07-18',
        'gpt-4o-2024-08-06',
        'gpt-4o',
        'gpt-4-turbo-2024-04-09',
        'gpt-3.5-turbo-0125',
    ],
};

/**
 * Resolve provider configuration from environment variables
 * @returns Provider configuration with defaults and validated models
 */
export function resolveProviderConfig(): AiProviderConfig {
    const anthropicModel = process.env.AI_ANTHROPIC_MODEL || DEFAULT_CONFIG.anthropicModel;
    const openaiModel = process.env.AI_OPENAI_MODEL || DEFAULT_CONFIG.openaiModel;

    // Validate models against allowlists
    const validatedAnthropicModel = DEFAULT_CONFIG.anthropicAllowlist.includes(anthropicModel)
        ? anthropicModel
        : DEFAULT_CONFIG.anthropicModel;

    const validatedOpenaiModel = DEFAULT_CONFIG.openaiAllowlist.includes(openaiModel)
        ? openaiModel
        : DEFAULT_CONFIG.openaiModel;

    return {
        anthropicModel: validatedAnthropicModel,
        openaiModel: validatedOpenaiModel,
        anthropicAllowlist: DEFAULT_CONFIG.anthropicAllowlist,
        openaiAllowlist: DEFAULT_CONFIG.openaiAllowlist,
    };
}

/**
 * Get the appropriate model for a provider
 * @param provider - Provider name
 * @param explicitModel - Optional explicit model override
 * @returns Model string to use
 */
export function resolveModel(provider: AiProviderName, explicitModel?: string): string {
    const config = resolveProviderConfig();

    if (explicitModel) {
        // Validate the explicit model
        const allowlist = provider === 'anthropic' ? config.anthropicAllowlist : config.openaiAllowlist;
        if (allowlist.includes(explicitModel)) {
            return explicitModel;
        }
        // If not in allowlist, fall back to default
        console.warn(
            `[ai-provider] Model "${explicitModel}" not in allowlist for ${provider}, using default`
        );
    }

    return provider === 'anthropic' ? config.anthropicModel : config.openaiModel;
}

/**
 * Check if an API key is available for a provider
 * @param provider - Provider name
 * @returns true if API key is set
 */
export function hasApiKey(provider: AiProviderName): boolean {
    if (provider === 'anthropic') {
        return !!process.env.ANTHROPIC_API_KEY;
    }
    return !!process.env.OPENAI_API_KEY;
}

/**
 * Get API key for a provider
 * @param provider - Provider name
 * @returns API key string
 * @throws Error if API key is not set
 */
export function getApiKey(provider: AiProviderName): string {
    if (provider === 'anthropic') {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) {
            throw new Error('ANTHROPIC_API_KEY environment variable is not set');
        }
        return key;
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    return key;
}
