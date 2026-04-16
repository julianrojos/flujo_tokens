/**
 * AI Provider Interface and Shared Types
 * Defines the common interface for AI providers (Anthropic, OpenAI, Ollama, Gemini, OpenCode)
 */

import type { AiUsageMetrics } from './ai-component-doc-schema.js';

/**
 * Supported AI provider names
 */
export type AiProviderName =
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'gemini'
  | 'opencode';

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
  /** Optional timeout in milliseconds for this call */
  timeoutMs?: number;
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
  /** Default Ollama model */
  ollamaModel: string;
  /** Default Gemini model */
  geminiModel: string;
  /** Default OpenCode model */
  opencodeModel: string;
  /** Ollama base URL */
  ollamaBaseUrl: string;
  /** OpenCode base URL */
  opencodeBaseUrl: string;
  /** Allowed Anthropic models */
  anthropicAllowlist: string[];
  /** Allowed OpenAI models */
  openaiAllowlist: string[];
  /** Allowed Gemini models */
  geminiAllowlist: string[];
  /** Allowed OpenCode models */
  opencodeAllowlist: string[];
}

/**
 * Default provider configuration
 */
const DEFAULT_CONFIG: AiProviderConfig = {
  anthropicModel: 'claude-sonnet-4-20250514',
  openaiModel: 'gpt-4o-mini-2024-07-18',
  ollamaModel: 'qwen2.5:7b-instruct',
  geminiModel: 'gemini-2.0-flash',
  opencodeModel: 'qwen2.5-coder:7b',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  opencodeBaseUrl: 'https://opencode.ai/v1',
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
  geminiAllowlist: [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  opencodeAllowlist: [
    'qwen2.5-coder:7b',
    'qwen2.5:7b',
    'qwen2.5:14b',
    'qwen2.5:32b',
  ],
};

/**
 * Resolve provider configuration from environment variables
 * @returns Provider configuration with defaults and validated models
 */
export function resolveProviderConfig(): AiProviderConfig {
  const anthropicModel =
    process.env.AI_ANTHROPIC_MODEL || DEFAULT_CONFIG.anthropicModel;
  const openaiModel = process.env.AI_OPENAI_MODEL || DEFAULT_CONFIG.openaiModel;
  const ollamaModel = process.env.AI_OLLAMA_MODEL || DEFAULT_CONFIG.ollamaModel;
  const geminiModel = process.env.AI_GEMINI_MODEL || DEFAULT_CONFIG.geminiModel;
  const opencodeModel =
    process.env.AI_OPENCODE_MODEL || DEFAULT_CONFIG.opencodeModel;
  const ollamaBaseUrl =
    process.env.OLLAMA_BASE_URL || DEFAULT_CONFIG.ollamaBaseUrl;
  const opencodeBaseUrl =
    process.env.OPENCODE_BASE_URL || DEFAULT_CONFIG.opencodeBaseUrl;

  const validatedAnthropicModel = DEFAULT_CONFIG.anthropicAllowlist.includes(
    anthropicModel,
  )
    ? anthropicModel
    : DEFAULT_CONFIG.anthropicModel;

  const validatedOpenaiModel = DEFAULT_CONFIG.openaiAllowlist.includes(
    openaiModel,
  )
    ? openaiModel
    : DEFAULT_CONFIG.openaiModel;
  const validatedGeminiModel = DEFAULT_CONFIG.geminiAllowlist.includes(
    geminiModel,
  )
    ? geminiModel
    : DEFAULT_CONFIG.geminiModel;
  const validatedOpencodeModel = DEFAULT_CONFIG.opencodeAllowlist.includes(
    opencodeModel,
  )
    ? opencodeModel
    : DEFAULT_CONFIG.opencodeModel;

  return {
    anthropicModel: validatedAnthropicModel,
    openaiModel: validatedOpenaiModel,
    ollamaModel,
    geminiModel: validatedGeminiModel,
    opencodeModel: validatedOpencodeModel,
    ollamaBaseUrl,
    opencodeBaseUrl,
    anthropicAllowlist: DEFAULT_CONFIG.anthropicAllowlist,
    openaiAllowlist: DEFAULT_CONFIG.openaiAllowlist,
    geminiAllowlist: DEFAULT_CONFIG.geminiAllowlist,
    opencodeAllowlist: DEFAULT_CONFIG.opencodeAllowlist,
  };
}

/**
 * Get the appropriate model for a provider
 * @param provider - Provider name
 * @param explicitModel - Optional explicit model override
 * @returns Model string to use
 */
export function resolveModel(
  provider: AiProviderName,
  explicitModel?: string,
): string {
  const config = resolveProviderConfig();

  if (explicitModel) {
    if (provider === 'ollama') {
      return explicitModel;
    }

    const allowlist =
      provider === 'anthropic'
        ? config.anthropicAllowlist
        : provider === 'gemini'
          ? config.geminiAllowlist
          : provider === 'opencode'
            ? config.opencodeAllowlist
            : config.openaiAllowlist;
    if (allowlist.includes(explicitModel)) {
      return explicitModel;
    }
    console.warn(
      `[ai-provider] Model "${explicitModel}" not in allowlist for ${provider}, using default`,
    );
  }

  if (provider === 'ollama') {
    return config.ollamaModel;
  }
  if (provider === 'gemini') {
    return config.geminiModel;
  }
  if (provider === 'opencode') {
    return config.opencodeModel;
  }

  return provider === 'anthropic' ? config.anthropicModel : config.openaiModel;
}

/**
 * Check if an API key is available for a provider
 * @param provider - Provider name
 * @returns true if API key is set
 */
export function hasApiKey(provider: AiProviderName): boolean {
  if (provider === 'ollama') {
    return true;
  }
  if (provider === 'anthropic') {
    return !!process.env.ANTHROPIC_API_KEY;
  }
  if (provider === 'gemini') {
    return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  }
  if (provider === 'opencode') {
    return !!process.env.OPENCODE_API_KEY;
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
  if (provider === 'ollama') {
    return '';
  }
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    return key;
  }
  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set',
      );
    }
    return key;
  }
  if (provider === 'opencode') {
    const key = process.env.OPENCODE_API_KEY;
    if (!key) {
      throw new Error('OPENCODE_API_KEY environment variable is not set');
    }
    return key;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return key;
}
