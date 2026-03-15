/**
 * Ollama AI Adapter
 * Implements AiProvider using native fetch to Ollama REST API
 */

import type { AiProvider, AiProviderInput, AiProviderResult } from './ai-provider.js';
import type { AiUsageMetrics } from './ai-component-doc-schema.js';
import { resolveProviderConfig } from './ai-provider.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';

/**
 * Ollama Adapter implementing the AiProvider interface
 */
export class OllamaAdapter implements AiProvider {
    readonly name = 'ollama' as const;

    private readonly baseUrl: string;
    private readonly defaultModel: string;

    constructor(baseUrl?: string) {
        const config = resolveProviderConfig();
        const resolvedUrl = baseUrl || config.ollamaBaseUrl;
        // Validate URL format
        try {
            new URL(resolvedUrl);
        } catch {
            throw new Error(`Invalid Ollama base URL: ${resolvedUrl}`);
        }
        this.baseUrl = resolvedUrl;
        this.defaultModel = config.ollamaModel;
    }

    /**
     * Check if Ollama is available and responsive
     * @param timeoutMs - Timeout in milliseconds (default: 3000)
     * @returns True if Ollama is reachable, false otherwise
     */
    static async isAvailable(timeoutMs = 3000): Promise<boolean> {
        try {
            const response = await fetch(`${OllamaAdapter.configuredBaseUrl}/api/tags`, {
                signal: AbortSignal.timeout(timeoutMs),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Get the resolved base URL for Ollama
     * @returns The configured base URL with fallback
     */
    static get configuredBaseUrl(): string {
        const config = resolveProviderConfig();
        return config.ollamaBaseUrl;
    }

    /**
     * Generate structured output using Ollama's chat API with JSON format
     * @param input - Provider input with prompts and schema
     * @returns Generated result with parsed JSON and usage metrics
     */
    async generate(input: AiProviderInput): Promise<AiProviderResult> {
        const model = input.model || this.defaultModel;
        const startTime = Date.now();

        try {
            const body = {
                model,
                messages: [
                    { role: 'system', content: input.systemPrompt },
                    { role: 'user', content: input.userPrompt },
                ],
                format: 'json' as const,
                stream: false,
            };

            const res = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            // Handle HTTP errors
            if (!res.ok) {
                if (res.status === 404) {
                    throw {
                        code: AI_ERROR_CODES.LLM_API_ERROR.code,
                        message: `Model "${model}" not found`,
                        retryable: false,
                    };
                }
                throw {
                    code: AI_ERROR_CODES.LLM_API_ERROR.code,
                    message: `Ollama API returned ${res.status}`,
                    retryable: res.status >= 500,
                };
            }

            const data = await res.json() as {
                message: { content: string };
                prompt_eval_count?: number;
                eval_count?: number;
                total_duration?: number;
            };

            // Parse the JSON content from the message
            let parsedJson: unknown;
            try {
                parsedJson = JSON.parse(data.message.content);
            } catch (parseError) {
                throw {
                    code: AI_ERROR_CODES.SCHEMA_INVALID.code,
                    message: 'Failed to parse Ollama response as JSON',
                    retryable: false,
                };
            }

            const durationMs = Date.now() - startTime;

            // Build usage metrics from Ollama's native fields
            const usage: AiUsageMetrics = {
                promptTokens: typeof data.prompt_eval_count === 'number' ? data.prompt_eval_count : 0,
                completionTokens: typeof data.eval_count === 'number' ? data.eval_count : 0,
                durationMs: typeof data.total_duration === 'number'
                    ? Math.round(data.total_duration / 1e6)
                    : durationMs,
            };

            return {
                rawText: data.message.content,
                parsedJson,
                usage,
            };
        } catch (error) {
            // Re-throw known errors with code
            if (error && typeof error === 'object' && 'code' in error) {
                throw error;
            }

            // Handle fetch errors (network issues, connection refused, etc.)
            if (error instanceof Error) {
                throw {
                    code: AI_ERROR_CODES.LLM_API_ERROR.code,
                    message: error.message,
                    retryable: true,
                };
            }

            // Unknown error
            throw {
                code: AI_ERROR_CODES.LLM_API_ERROR.code,
                message: 'Unknown error',
                retryable: true,
            };
        }
    }
}

/**
 * Create an Ollama adapter instance
 * @param baseUrl - Optional base URL override
 * @returns OllamaAdapter instance
 */
export function createOllamaAdapter(baseUrl?: string): OllamaAdapter {
    return new OllamaAdapter(baseUrl);
}
