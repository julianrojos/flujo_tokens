/**
 * OpenAI Adapter Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createOpenAiAdapter } from './ai-openai-adapter.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';

type CompletionCreateOptions = {
  response_format?: { type: string; json_schema?: Record<string, unknown> };
};

describe('ai-openai-adapter', () => {
  it('retries OpenRouter with json_object after a strict schema rejection', async () => {
    const calls: CompletionCreateOptions[] = [];
    const adapter = createOpenAiAdapter('openrouter', 'test-openrouter-key', 'https://example.invalid');

    (adapter as any).client = {
      chat: {
        completions: {
          create: async (options: CompletionCreateOptions) => {
            calls.push(options);
            if (calls.length === 1) {
              throw {
                status: 400,
                message: 'unsupported response_format',
                code: 'unsupported',
              };
            }

            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({ schemaVersion: 1, title: 'Button' }),
                  },
                },
              ],
              usage: {
                prompt_tokens: 4,
                completion_tokens: 6,
              },
            };
          },
        },
      },
    };

    const result = await adapter.generate({
      systemPrompt: 'system',
      userPrompt: 'user',
      jsonSchema: { type: 'object' },
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0]?.response_format, {
      type: 'json_schema',
      json_schema: {
        name: 'component_doc',
        strict: true,
        schema: { type: 'object' },
      },
    });
    assert.deepEqual(calls[1]?.response_format, { type: 'json_object' });
    assert.deepEqual(result.parsedJson, { schemaVersion: 1, title: 'Button' });
    assert.equal(result.usage.promptTokens, 4);
    assert.equal(result.usage.completionTokens, 6);
  });

  it('retries OpenRouter with json_object after a SyntaxError', async () => {
    const calls: CompletionCreateOptions[] = [];
    const adapter = createOpenAiAdapter('openrouter', 'test-openrouter-key', 'https://example.invalid');

    (adapter as any).client = {
      chat: {
        completions: {
          create: async (options: CompletionCreateOptions) => {
            calls.push(options);
            if (calls.length === 1) {
              throw new SyntaxError('Unexpected token < in JSON');
            }

            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({ schemaVersion: 1, title: 'Button' }),
                  },
                },
              ],
              usage: {
                prompt_tokens: 2,
                completion_tokens: 3,
              },
            };
          },
        },
      },
    };

    const result = await adapter.generate({
      systemPrompt: 'system',
      userPrompt: 'user',
      jsonSchema: { type: 'object' },
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1]?.response_format, { type: 'json_object' });
    assert.deepEqual(result.parsedJson, { schemaVersion: 1, title: 'Button' });
    assert.equal(result.usage.promptTokens, 2);
    assert.equal(result.usage.completionTokens, 3);
  });

  it('retries OpenRouter with json_object when the error message indicates unsupported schema formatting', async () => {
    const calls: CompletionCreateOptions[] = [];
    const adapter = createOpenAiAdapter('openrouter', 'test-openrouter-key', 'https://example.invalid');

    (adapter as any).client = {
      chat: {
        completions: {
          create: async (options: CompletionCreateOptions) => {
            calls.push(options);
            if (calls.length === 1) {
              throw {
                message: 'unsupported response_format for this model',
                code: 'bad_request',
              };
            }

            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({ schemaVersion: 1, title: 'Button' }),
                  },
                },
              ],
              usage: {
                prompt_tokens: 5,
                completion_tokens: 7,
              },
            };
          },
        },
      },
    };

    const result = await adapter.generate({
      systemPrompt: 'system',
      userPrompt: 'user',
      jsonSchema: { type: 'object' },
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1]?.response_format, { type: 'json_object' });
    assert.deepEqual(result.parsedJson, { schemaVersion: 1, title: 'Button' });
    assert.equal(result.usage.promptTokens, 5);
    assert.equal(result.usage.completionTokens, 7);
  });

  it('does not retry non-OpenRouter providers on strict schema rejection', async () => {
    const calls: CompletionCreateOptions[] = [];
    const adapter = createOpenAiAdapter('openai', 'test-openai-key', 'https://example.invalid');

    (adapter as any).client = {
      chat: {
        completions: {
          create: async (options: CompletionCreateOptions) => {
            calls.push(options);
            throw {
              status: 400,
              message: 'invalid_json_schema',
              code: 'invalid_json_schema',
            };
          },
        },
      },
    };

    await assert.rejects(
      async () =>
        adapter.generate({
          systemPrompt: 'system',
          userPrompt: 'user',
          jsonSchema: { type: 'object' },
        }),
      (err: unknown) => {
        assert.deepEqual(err, {
          code: AI_ERROR_CODES.SCHEMA_INVALID.code,
          message: 'Invalid JSON schema provided to OpenAI',
          retryable: false,
        });
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.response_format, {
      type: 'json_schema',
      json_schema: {
        name: 'component_doc',
        strict: true,
        schema: { type: 'object' },
      },
    });
  });

  it('does not retry OpenRouter when the API explicitly rejects the schema', async () => {
    const calls: CompletionCreateOptions[] = [];
    const adapter = createOpenAiAdapter('openrouter', 'test-openrouter-key', 'https://example.invalid');

    (adapter as any).client = {
      chat: {
        completions: {
          create: async (options: CompletionCreateOptions) => {
            calls.push(options);
            throw {
              status: 400,
              message: 'invalid_json_schema',
              code: 'invalid_json_schema',
            };
          },
        },
      },
    };

    await assert.rejects(
      async () =>
        adapter.generate({
          systemPrompt: 'system',
          userPrompt: 'user',
          jsonSchema: { type: 'object' },
        }),
      (err: unknown) => {
        assert.deepEqual(err, {
          code: AI_ERROR_CODES.SCHEMA_INVALID.code,
          message: 'Invalid JSON schema provided to OpenAI',
          retryable: false,
        });
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.response_format, {
      type: 'json_schema',
      json_schema: {
        name: 'component_doc',
        strict: true,
        schema: { type: 'object' },
      },
    });
  });
});
