/**
 * Anthropic AI Adapter
 * Implements AiProvider using Anthropic SDK with submit_component_doc tool pattern
 * for structured output enforcement
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider, AiProviderInput, AiProviderResult } from './ai-provider.js';
import type { AiUsageMetrics } from './ai-component-doc-schema.js';
import { getApiKey, resolveModel } from './ai-provider.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';
import type { Tool } from '@anthropic-ai/sdk/resources/messages/messages';

function toAnthropicInputSchema(schema: Record<string, unknown>): Tool.InputSchema {
    if (schema.type === 'object') {
        return schema as Tool.InputSchema;
    }
    return {
        ...schema,
        type: 'object',
    };
}

/**
 * Anthropic Adapter implementing the AiProvider interface
 */
export class AnthropicAdapter implements AiProvider {
    readonly name = 'anthropic' as const;

    private client: Anthropic | null = null;
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || getApiKey('anthropic');
    }

    /**
     * Get or create the Anthropic client
     */
    private getClient(): Anthropic {
        if (!this.client) {
            this.client = new Anthropic({
                apiKey: this.apiKey,
            });
        }
        return this.client;
    }

    /**
     * Generate structured output using Anthropic's tool_use mechanism
     * @param input - Provider input with prompts and schema
     * @returns Generated result with parsed JSON and usage metrics
     */
    async generate(input: AiProviderInput): Promise<AiProviderResult> {
        const client = this.getClient();
        const model = resolveModel('anthropic', input.model);
        const startTime = Date.now();

        try {
            // Use the submit_component_doc tool to force structured JSON output
            const response = await client.messages.create({
                model,
                max_tokens: 4096,
                system: input.systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: input.userPrompt,
                    },
                ],
                tools: [
                    {
                        name: 'submit_component_doc',
                        description: 'Submit the generated component documentation as structured JSON',
                        input_schema: toAnthropicInputSchema(input.jsonSchema),
                    },
                ],
                // Force tool use to ensure structured output
                tool_choice: {
                    type: 'tool' as const,
                    name: 'submit_component_doc',
                },
            });

            const durationMs = Date.now() - startTime;

            // Extract the tool_use block content - use type assertion for flexibility
            const content = response.content as Array<{ type: string; name?: string; input?: unknown }>;
            const toolUse = content.find(
                (block) => block.type === 'tool_use' && block.name === 'submit_component_doc'
            );

            if (!toolUse || !toolUse.input) {
                throw new Error('Model did not use the submit_component_doc tool');
            }

            // The tool_use.input is already a parsed object
            const parsedJson = toolUse.input;

            // Build usage metrics
            const usage: AiUsageMetrics = {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                durationMs,
            };

            return {
                rawText: JSON.stringify(parsedJson),
                parsedJson,
                usage,
            };
        } catch (error) {
            // Handle API errors - check for Anthropic error structure
            if (
                error &&
                typeof error === 'object' &&
                'status' in error &&
                'message' in error
            ) {
                const err = error as { status?: number; message?: string; name?: string };
                if (err.status === 429) {
                    throw {
                        code: AI_ERROR_CODES.LLM_RATE_LIMITED.code,
                        message: err.message || 'Rate limited by Anthropic',
                        retryable: true,
                    };
                }
                if (err.status === 401 || err.status === 403 || err.name === 'AuthenticationError') {
                    throw {
                        code: AI_ERROR_CODES.INPUT_MISSING_PROVIDER_KEY.code,
                        message: err.message || 'Invalid API key',
                        retryable: false,
                    };
                }
                throw {
                    code: AI_ERROR_CODES.LLM_API_ERROR.code,
                    message: err.message || 'Anthropic API error',
                    retryable: err.status !== undefined && err.status >= 500,
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
 * Create an Anthropic adapter instance
 * @param apiKey - Optional API key override
 * @returns AnthropicAdapter instance
 */
export function createAnthropicAdapter(apiKey?: string): AnthropicAdapter {
    return new AnthropicAdapter(apiKey);
}
