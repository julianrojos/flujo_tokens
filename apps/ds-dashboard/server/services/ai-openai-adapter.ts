/**
 * OpenAI Adapter
 * Implements AiProvider using OpenAI SDK with strict json_schema response format
 */

import OpenAI from 'openai';
import type { AiProvider, AiProviderInput, AiProviderResult } from './ai-provider.js';
import type { AiUsageMetrics } from './ai-component-doc-schema.js';
import { getApiKey, resolveModel } from './ai-provider.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';

/**
 * OpenAI Adapter implementing the AiProvider interface
 */
export class OpenAiAdapter implements AiProvider {
    readonly name = 'openai' as const;

    private client: OpenAI | null = null;
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || getApiKey('openai');
    }

    /**
     * Get or create the OpenAI client
     */
    private getClient(): OpenAI {
        if (!this.client) {
            this.client = new OpenAI({
                apiKey: this.apiKey,
            });
        }
        return this.client;
    }

    /**
     * Generate structured output using OpenAI's strict json_schema
     * @param input - Provider input with prompts and schema
     * @returns Generated result with parsed JSON and usage metrics
     */
    async generate(input: AiProviderInput): Promise<AiProviderResult> {
        const client = this.getClient();
        const model = resolveModel('openai', input.model);
        const startTime = Date.now();

        try {
            // Use strict json_schema for structured output
            const response = await client.chat.completions.create({
                model,
                messages: [
                    {
                        role: 'system',
                        content: input.systemPrompt,
                    },
                    {
                        role: 'user',
                        content: input.userPrompt,
                    },
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'component_doc',
                        strict: true,
                        schema: input.jsonSchema,
                    },
                },
                max_tokens: 4096,
            });

            const durationMs = Date.now() - startTime;

            const choice = response.choices[0];
            if (!choice || !choice.message.content) {
                throw new Error('No content in OpenAI response');
            }

            // Parse the JSON response - guaranteed valid by strict mode
            const parsedJson = JSON.parse(choice.message.content);

            // Build usage metrics
            const usage: AiUsageMetrics = {
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                durationMs,
            };

            return {
                rawText: choice.message.content,
                parsedJson,
                usage,
            };
        } catch (error) {
            // Handle API errors
            if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
                const err = error as { status?: number; message?: string; code?: string };
                if (err.status === 429) {
                    throw {
                        code: AI_ERROR_CODES.LLM_RATE_LIMITED.code,
                        message: err.message || 'Rate limited by OpenAI',
                        retryable: true,
                    };
                }
                if (err.status === 401 || err.status === 403) {
                    throw {
                        code: AI_ERROR_CODES.INPUT_MISSING_PROVIDER_KEY.code,
                        message: err.message || 'Invalid API key',
                        retryable: false,
                    };
                }
                // Handle OpenAI-specific error codes
                if (err.code === 'invalid_json_schema') {
                    throw {
                        code: AI_ERROR_CODES.SCHEMA_INVALID.code,
                        message: 'Invalid JSON schema provided to OpenAI',
                        retryable: false,
                    };
                }
                throw {
                    code: AI_ERROR_CODES.LLM_API_ERROR.code,
                    message: err.message || 'OpenAI API error',
                    retryable: err.status !== undefined && err.status >= 500,
                };
            }

            // Handle JSON parse errors
            if (error instanceof SyntaxError) {
                throw {
                    code: AI_ERROR_CODES.SCHEMA_INVALID.code,
                    message: 'Failed to parse OpenAI response as JSON',
                    retryable: false,
                };
            }

            // Re-throw known errors
            if (error && typeof error === 'object' && 'code' in error) {
                throw error;
            }

            // Unknown error
            throw {
                code: AI_ERROR_CODES.LLM_API_ERROR.code,
                message: error instanceof Error ? error.message : 'Unknown error',
                retryable: false,
            };
        }
    }
}

/**
 * Create an OpenAI adapter instance
 * @param apiKey - Optional API key override
 * @returns OpenAiAdapter instance
 */
export function createOpenAiAdapter(apiKey?: string): OpenAiAdapter {
    return new OpenAiAdapter(apiKey);
}
