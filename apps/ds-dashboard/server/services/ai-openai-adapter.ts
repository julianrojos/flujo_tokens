/**
 * OpenAI Adapter
 * Implements AiProvider using OpenAI SDK with strict json_schema response format
 * Supports custom baseUrl for OpenAI-compatible APIs
 * Note: Ollama-compatible backends may not support json_schema strict mode
 */

import OpenAI from 'openai';
import type {
  AiProvider,
  AiProviderInput,
  AiProviderResult,
  AiProviderName,
} from './ai-provider.js';
import type { AiUsageMetrics } from './ai-component-doc-schema.js';
import { getApiKey, resolveModel } from './ai-provider.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';

/**
 * OpenAI Adapter implementing the AiProvider interface
 */
export class OpenAiAdapter implements AiProvider {
  readonly name: AiProviderName;

  private client: OpenAI | null = null;
  private apiKey: string;
  private baseUrl: string;
  private defaultHeaders?: Record<string, string>;

  constructor(
    providerName: AiProviderName = 'openai',
    apiKey?: string,
    baseUrl?: string,
    defaultHeaders?: Record<string, string>,
  ) {
    this.name = providerName;
    this.apiKey = apiKey || getApiKey(providerName);
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
    this.defaultHeaders = defaultHeaders;
  }

  /**
   * Get or create the OpenAI client
   */
  private getClient(): OpenAI {
    if (!this.client) {
      const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
      };
      if (this.defaultHeaders && Object.keys(this.defaultHeaders).length > 0) {
        clientOptions.defaultHeaders = this.defaultHeaders;
      }
      this.client = new OpenAI({
        ...clientOptions,
      });
    }
    return this.client;
  }

  /**
   * Check if provider supports strict json_schema structured outputs
   * Ollama-compatible backends typically don't support json_schema.
   * OpenRouter is best-effort and may fall back per model.
   */
  private shouldAttemptJsonSchema(): boolean {
    return this.name !== 'ollama';
  }

  private shouldFallbackToJsonObject(
    error: unknown,
    responseFormat:
      | OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['response_format']
      | undefined,
  ): boolean {
    if (this.name !== 'openrouter') return false;
    if (!responseFormat || responseFormat.type !== 'json_schema') return false;

    if (this.isInvalidJsonSchemaError(error)) {
      return false;
    }

    if (error instanceof SyntaxError) {
      return true;
    }

    if (!error || typeof error !== 'object') {
      return false;
    }

    const record = error as {
      status?: number;
      code?: string;
      message?: string;
    };
    const status = record.status;
    const message = `${record.code || ''} ${record.message || ''}`.toLowerCase();

    if (status === 400 || status === 422) {
      return true;
    }

    return (
      message.includes('json_schema') ||
      message.includes('response_format') ||
      message.includes('schema') ||
      message.includes('json object') ||
      message.includes('unsupported')
    );
  }

  private isInvalidJsonSchemaError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const record = error as {
      code?: string;
      message?: string;
    };
    const code = String(record.code || '').trim().toLowerCase();
    const message = String(record.message || '').trim().toLowerCase();

    return code === 'invalid_json_schema' || message.includes('invalid_json_schema');
  }

  private async runCompletion(
    client: OpenAI,
    model: string,
    input: AiProviderInput,
    responseFormat:
      | OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['response_format']
      | undefined,
    startTime: number,
  ): Promise<AiProviderResult> {
    const createOptions: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
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
      max_tokens: 4096,
    };

    if (responseFormat) {
      createOptions.response_format = responseFormat;
    }

    const response = await client.chat.completions.create(createOptions);
    const durationMs = Date.now() - startTime;

    const choice = response.choices[0];
    if (!choice || !choice.message.content) {
      throw new Error('No content in OpenAI response');
    }

    const parsedJson = JSON.parse(choice.message.content);

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
  }

  /**
   * Generate structured output using OpenAI's strict json_schema
   * @param input - Provider input with prompts and schema
   * @returns Generated result with parsed JSON and usage metrics
   */
  async generate(input: AiProviderInput): Promise<AiProviderResult> {
    const client = this.getClient();
    const model = resolveModel(this.name, input.model);
    const startTime = Date.now();
    const shouldAttemptJsonSchema = this.shouldAttemptJsonSchema();

    try {
      // Use json_schema for providers that usually support it.
      if (shouldAttemptJsonSchema) {
        const strictResponseFormat = {
          type: 'json_schema',
          json_schema: {
            name: 'component_doc',
            strict: true,
            schema: input.jsonSchema,
          },
        } as const;

        try {
          return await this.runCompletion(
            client,
            model,
            input,
            strictResponseFormat,
            startTime,
          );
        } catch (error) {
          if (!this.shouldFallbackToJsonObject(error, strictResponseFormat)) {
            throw error;
          }

          console.warn(
            '[ai-openai-adapter] OpenRouter strict schema rejected, retrying with json_object',
            {
              model,
            },
            error,
          );

          return await this.runCompletion(
            client,
            model,
            input,
            { type: 'json_object' },
            startTime,
          );
        }
      }

      return await this.runCompletion(
        client,
        model,
        input,
        { type: 'json_object' },
        startTime,
      );
    } catch (error) {
      const normalizedError: unknown = error;

      if (
        normalizedError &&
        typeof normalizedError === 'object' &&
        'status' in normalizedError &&
        'message' in normalizedError
      ) {
        const err = normalizedError as {
          status?: number;
          message?: string;
          code?: string;
        };
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

      if (normalizedError instanceof SyntaxError) {
        throw {
          code: AI_ERROR_CODES.SCHEMA_INVALID.code,
          message: 'Failed to parse OpenAI response as JSON',
          retryable: false,
        };
      }

      if (normalizedError && typeof normalizedError === 'object' && 'code' in normalizedError) {
        throw normalizedError;
      }

      throw {
        code: AI_ERROR_CODES.LLM_API_ERROR.code,
        message:
          normalizedError instanceof Error
            ? normalizedError.message
            : 'Unknown error',
        retryable: false,
      };
    }
  }
}

/**
 * Create an OpenAI adapter instance
 * @param providerName - Provider name (openai, openrouter, etc.)
 * @param apiKey - Optional API key override
 * @param baseUrl - Optional base URL override
 * @returns OpenAiAdapter instance
 */
export function createOpenAiAdapter(
  providerName: AiProviderName = 'openai',
  apiKey?: string,
  baseUrl?: string,
  defaultHeaders?: Record<string, string>,
): OpenAiAdapter {
  return new OpenAiAdapter(providerName, apiKey, baseUrl, defaultHeaders);
}
