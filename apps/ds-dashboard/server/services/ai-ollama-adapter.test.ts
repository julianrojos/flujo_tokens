/**
 * Ollama Adapter Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaAdapter, createOllamaAdapter } from './ai-ollama-adapter.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';

/**
 * Type guard for error objects with code and retryable properties
 */
function isAiError(err: unknown): err is { code: string; message: string; retryable: boolean } {
    return typeof err === 'object' && err !== null &&
        'code' in err && typeof (err as Record<string, unknown>).code === 'string' &&
        'retryable' in err && typeof (err as Record<string, unknown>).retryable === 'boolean';
}

describe('ai-ollama-adapter', () => {
    let originalFetch: typeof globalThis.fetch;
    let mockFetch: typeof globalThis.fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('should parse valid JSON response with usage metrics', async () => {
        const validComponentDoc = {
            schemaVersion: 1,
            componentId: '68:4097',
            title: 'Button',
            summary: 'A button component',
            variants: [],
            accessibilityNotes: [],
            markdown: '',
        };

        mockFetch = async () => Response.json({
            message: { content: JSON.stringify(validComponentDoc) },
            prompt_eval_count: 10,
            eval_count: 20,
            total_duration: 5e9, // 5 seconds in nanoseconds
        });
        globalThis.fetch = mockFetch;

        const adapter = createOllamaAdapter('http://localhost:11434');
        const result = await adapter.generate({
            systemPrompt: 'You are a helpful assistant.',
            userPrompt: 'Generate component doc',
            jsonSchema: { type: 'object' },
        });

        assert.deepStrictEqual(result.parsedJson, validComponentDoc);
        assert.equal(result.usage.promptTokens, 10);
        assert.equal(result.usage.completionTokens, 20);
        assert.equal(result.usage.durationMs, 5000);
    });

    it('should throw ai.schema.invalid for invalid JSON response', async () => {
        mockFetch = async () => Response.json({
            message: { content: 'not valid json' },
        });
        globalThis.fetch = mockFetch;

        const adapter = createOllamaAdapter('http://localhost:11434');

        await assert.rejects(
            async () => adapter.generate({
                systemPrompt: 'You are a helpful assistant.',
                userPrompt: 'Generate component doc',
                jsonSchema: { type: 'object' },
            }),
            (err: unknown) => {
                if (!isAiError(err)) throw new Error('Expected AI error');
                assert.equal(err.code, AI_ERROR_CODES.SCHEMA_INVALID.code);
                assert.equal(err.retryable, false);
                return true;
            }
        );
    });

    it('should throw ai.llm.api_error (retryable) for network failure', async () => {
        mockFetch = async () => {
            throw new TypeError('fetch failed');
        };
        globalThis.fetch = mockFetch;

        const adapter = createOllamaAdapter('http://localhost:11434');

        await assert.rejects(
            async () => adapter.generate({
                systemPrompt: 'You are a helpful assistant.',
                userPrompt: 'Generate component doc',
                jsonSchema: { type: 'object' },
            }),
            (err: unknown) => {
                if (!isAiError(err)) throw new Error('Expected AI error');
                assert.equal(err.code, AI_ERROR_CODES.LLM_API_ERROR.code);
                assert.equal(err.retryable, true);
                return true;
            }
        );
    });

    it('should throw ai.llm.timeout (retryable) for timeout/abort failures', async () => {
        mockFetch = async () => {
            const timeoutError = new Error('The operation was aborted due to timeout');
            timeoutError.name = 'TimeoutError';
            throw timeoutError;
        };
        globalThis.fetch = mockFetch;

        const adapter = createOllamaAdapter('http://localhost:11434');

        await assert.rejects(
            async () => adapter.generate({
                systemPrompt: 'You are a helpful assistant.',
                userPrompt: 'Generate component doc',
                jsonSchema: { type: 'object' },
                timeoutMs: 120000,
            }),
            (err: unknown) => {
                if (!isAiError(err)) throw new Error('Expected AI error');
                assert.equal(err.code, AI_ERROR_CODES.LLM_TIMEOUT.code);
                assert.equal(err.retryable, true);
                return true;
            }
        );
    });

    it('should throw ai.llm.api_error (non-retryable) for 404 model not found', async () => {
        const mockResponse = new Response('Model not found', { status: 404 });
        mockFetch = async () => mockResponse;
        globalThis.fetch = mockFetch;

        const adapter = createOllamaAdapter('http://localhost:11434');

        await assert.rejects(
            async () => adapter.generate({
                systemPrompt: 'You are a helpful assistant.',
                userPrompt: 'Generate component doc',
                jsonSchema: { type: 'object' },
                model: 'nonexistent-model',
            }),
            (err: unknown) => {
                if (!isAiError(err)) throw new Error('Expected AI error');
                assert.equal(err.code, AI_ERROR_CODES.LLM_API_ERROR.code);
                assert.equal(err.retryable, false);
                assert.match(err.message, /not found/);
                return true;
            }
        );
    });

    it('should throw ai.llm.api_error (retryable) for 500 server error', async () => {
        const mockResponse = new Response('Internal server error', { status: 500 });
        mockFetch = async () => mockResponse;
        globalThis.fetch = mockFetch;

        const adapter = createOllamaAdapter('http://localhost:11434');

        await assert.rejects(
            async () => adapter.generate({
                systemPrompt: 'You are a helpful assistant.',
                userPrompt: 'Generate component doc',
                jsonSchema: { type: 'object' },
            }),
            (err: unknown) => {
                if (!isAiError(err)) throw new Error('Expected AI error');
                assert.equal(err.code, AI_ERROR_CODES.LLM_API_ERROR.code);
                assert.equal(err.retryable, true);
                return true;
            }
        );
    });

    it('should default usage metrics to 0 when not provided', async () => {
        const validComponentDoc = {
            schemaVersion: 1,
            componentId: '68:4097',
            title: 'Button',
            summary: 'A button component',
            variants: [],
            accessibilityNotes: [],
            markdown: '',
        };

        mockFetch = async () => Response.json({
            message: { content: JSON.stringify(validComponentDoc) },
            // No usage metrics
        });
        globalThis.fetch = mockFetch;

        const adapter = createOllamaAdapter('http://localhost:11434');
        const result = await adapter.generate({
            systemPrompt: 'You are a helpful assistant.',
            userPrompt: 'Generate component doc',
            jsonSchema: { type: 'object' },
        });

        assert.equal(result.usage.promptTokens, 0);
        assert.equal(result.usage.completionTokens, 0);
        // durationMs should be >= 0 (elapsed time)
        assert.ok(result.usage.durationMs >= 0);
    });
});
