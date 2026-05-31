/**
 * Gemini AI Adapter
 * Implements AiProvider using Gemini REST API with JSON response mode.
 */

import type { AiProvider, AiProviderInput, AiProviderResult } from './ai-provider.js';
import type { AiUsageMetrics } from './ai-component-doc-schema.js';
import { getApiKey, resolveModel } from './ai-provider.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';

interface GeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
            }>;
        };
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
    };
}

export class GeminiAdapter implements AiProvider {
    readonly name = 'gemini' as const;

    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(apiKey?: string, baseUrl = 'https://generativelanguage.googleapis.com/v1beta') {
        this.apiKey = apiKey || getApiKey('gemini');
        this.baseUrl = baseUrl;
    }

    async generate(input: AiProviderInput): Promise<AiProviderResult> {
        const model = resolveModel('gemini', input.model);
        const startTime = Date.now();
        const endpoint = `${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
        const deadline = Date.now() + (input.timeoutMs ?? 90_000);

        try {
            const requestWithSchema = {
                systemInstruction: {
                    parts: [{ text: input.systemPrompt }],
                },
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: input.userPrompt }],
                    },
                ],
                generationConfig: {
                    responseMimeType: 'application/json',
                    // Best-effort schema constraint; some models/runtimes may not support it.
                    responseSchema: input.jsonSchema,
                },
            };

            const requestJsonOnly = {
                ...requestWithSchema,
                generationConfig: {
                    responseMimeType: 'application/json',
                },
            };

            const remainingMs = Math.max(1, deadline - Date.now());
            let response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey,
                },
                body: JSON.stringify(requestWithSchema),
                signal: AbortSignal.timeout(remainingMs),
            });
            // Fallback for providers/models that ignore or reject responseSchema.
            if (response.status === 400 || response.status === 422) {
                console.warn('[gemini-adapter] responseSchema rejected, falling back to JSON-only', {
                    model,
                    status: response.status,
                });
                const fallbackMs = Math.max(1, deadline - Date.now());
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': this.apiKey,
                    },
                    body: JSON.stringify(requestJsonOnly),
                    signal: AbortSignal.timeout(fallbackMs),
                });
            }

            if (!response.ok) {
                const message = await response.text().catch(() => '');
                if (response.status === 429) {
                    throw {
                        code: AI_ERROR_CODES.LLM_RATE_LIMITED.code,
                        message: message || 'Rate limited by Gemini',
                        retryable: true,
                    };
                }
                if (response.status === 401 || response.status === 403) {
                    throw {
                        code: AI_ERROR_CODES.INPUT_MISSING_PROVIDER_KEY.code,
                        message: message || 'Invalid Gemini API key',
                        retryable: false,
                    };
                }
                throw {
                    code: AI_ERROR_CODES.LLM_API_ERROR.code,
                    message: message || `Gemini API returned ${response.status}`,
                    retryable: response.status >= 500,
                };
            }

            const data = await response.json() as GeminiResponse;
            const rawText = String(
                data.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text || ''
            ).trim();

            if (!rawText) {
                throw {
                    code: AI_ERROR_CODES.LLM_API_ERROR.code,
                    message: 'Gemini returned empty response text',
                    retryable: false,
                };
            }

            let parsedJson: unknown;
            try {
                parsedJson = JSON.parse(rawText);
            } catch {
                throw {
                    code: AI_ERROR_CODES.SCHEMA_INVALID.code,
                    message: 'Failed to parse Gemini response as JSON',
                    retryable: false,
                };
            }

            const usage: AiUsageMetrics = {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
                durationMs: Date.now() - startTime,
            };

            return {
                rawText,
                parsedJson,
                usage,
            };
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error) {
                throw error;
            }

            throw {
                code: AI_ERROR_CODES.LLM_API_ERROR.code,
                message: error instanceof Error ? error.message : 'Unknown error',
                retryable: true,
            };
        }
    }
}

export function createGeminiAdapter(apiKey?: string): GeminiAdapter {
    return new GeminiAdapter(apiKey);
}
