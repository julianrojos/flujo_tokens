/**
 * Gemini Adapter Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiAdapter } from './ai-gemini-adapter.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';

type FetchArgs = [RequestInfo | URL, RequestInit | undefined];

function isAiError(err: unknown): err is { code: string; message: string; retryable: boolean } {
    return typeof err === 'object' && err !== null &&
        'code' in err && typeof (err as Record<string, unknown>).code === 'string' &&
        'retryable' in err && typeof (err as Record<string, unknown>).retryable === 'boolean';
}

describe('ai-gemini-adapter', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('sends API key in header (not query string) and includes timeout signal', async () => {
        const calls: FetchArgs[] = [];
        globalThis.fetch = async (...args: FetchArgs) => {
            calls.push(args);
            return Response.json({
                candidates: [
                    { content: { parts: [{ text: '{"schemaVersion":1}' }] } },
                ],
                usageMetadata: {
                    promptTokenCount: 3,
                    candidatesTokenCount: 7,
                },
            });
        };

        const adapter = createGeminiAdapter('test-gemini-key');
        await adapter.generate({
            systemPrompt: 'system',
            userPrompt: 'user',
            jsonSchema: { type: 'object' },
        });

        assert.equal(calls.length, 1);
        const [requestUrl, init] = calls[0];
        const url = String(requestUrl);
        assert.ok(url.includes(':generateContent'));
        assert.ok(!url.includes('?key='), 'API key must not be present in URL query string');

        assert.ok(init, 'fetch init is required');
        const headers = new Headers(init.headers);
        assert.equal(headers.get('x-goog-api-key'), 'test-gemini-key');
        assert.equal(headers.get('content-type'), 'application/json');
        assert.ok(init.signal, 'fetch signal should be set');
    });

    it('maps 429 responses to ai.llm.rate_limited', async () => {
        globalThis.fetch = async () => new Response('rate limit', { status: 429 });
        const adapter = createGeminiAdapter('test-gemini-key');

        await assert.rejects(
            async () => adapter.generate({
                systemPrompt: 'system',
                userPrompt: 'user',
                jsonSchema: { type: 'object' },
            }),
            (err: unknown) => {
                if (!isAiError(err)) throw new Error('Expected AI error');
                assert.equal(err.code, AI_ERROR_CODES.LLM_RATE_LIMITED.code);
                assert.equal(err.retryable, true);
                return true;
            },
        );
    });

    it('maps 401 responses to ai.input.missing_provider_key', async () => {
        globalThis.fetch = async () => new Response('unauthorized', { status: 401 });
        const adapter = createGeminiAdapter('test-gemini-key');

        await assert.rejects(
            async () => adapter.generate({
                systemPrompt: 'system',
                userPrompt: 'user',
                jsonSchema: { type: 'object' },
            }),
            (err: unknown) => {
                if (!isAiError(err)) throw new Error('Expected AI error');
                assert.equal(err.code, AI_ERROR_CODES.INPUT_MISSING_PROVIDER_KEY.code);
                assert.equal(err.retryable, false);
                return true;
            },
        );
    });

    it('maps non-JSON candidate payloads to ai.schema.invalid', async () => {
        globalThis.fetch = async () =>
            Response.json({
                candidates: [
                    { content: { parts: [{ text: 'not-json' }] } },
                ],
            });

        const adapter = createGeminiAdapter('test-gemini-key');

        await assert.rejects(
            async () => adapter.generate({
                systemPrompt: 'system',
                userPrompt: 'user',
                jsonSchema: { type: 'object' },
            }),
            (err: unknown) => {
                if (!isAiError(err)) throw new Error('Expected AI error');
                assert.equal(err.code, AI_ERROR_CODES.SCHEMA_INVALID.code);
                assert.equal(err.retryable, false);
                return true;
            },
        );
    });
});

