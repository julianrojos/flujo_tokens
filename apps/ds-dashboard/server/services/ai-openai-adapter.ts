/**
 * OpenAI Adapter
 * Implements AiProvider using OpenAI SDK with strict json_schema response format
 * Supports custom baseUrl for OpenAI-compatible APIs (e.g., OpenCode, LiteLLM)
 * Note: OpenCode (and similar Ollama-compatible backends) may not support json_schema strict mode
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

  constructor(
    providerName: AiProviderName = 'openai',
    apiKey?: string,
    baseUrl?: string,
  ) {
    this.name = providerName;
    this.apiKey = apiKey || getApiKey(providerName);
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  /**
   * Get or create the OpenAI client
   */
  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
      });
    }
    return this.client;
  }

  /**
   * Check if provider supports strict json_schema structured outputs
   * OpenCode and Ollama-compatible backends typically don't support json_schema
   */
  private supportsJsonSchema(): boolean {
    return this.name !== 'opencode' && this.name !== 'ollama';
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

    try {
      const createOptions: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming =
        {
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

      // Use json_schema only for providers that support it (openai, anthropic, gemini)
      // For opencode and ollama-compatible, use json_object and parse manually
      if (this.supportsJsonSchema()) {
        createOptions.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'component_doc',
            strict: true,
            schema: input.jsonSchema,
          },
        };
      } else {
        createOptions.response_format = { type: 'json_object' };
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
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'status' in error &&
        'message' in error
      ) {
        const err = error as {
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

      if (error instanceof SyntaxError) {
        throw {
          code: AI_ERROR_CODES.SCHEMA_INVALID.code,
          message: 'Failed to parse OpenAI response as JSON',
          retryable: false,
        };
      }

      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }

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
 * @param providerName - Provider name (openai, opencode, etc.)
 * @param apiKey - Optional API key override
 * @param baseUrl - Optional base URL override (e.g., for OpenCode)
 * @returns OpenAiAdapter instance
 */
export function createOpenAiAdapter(
  providerName: AiProviderName = 'openai',
  apiKey?: string,
  baseUrl?: string,
): OpenAiAdapter {
  return new OpenAiAdapter(providerName, apiKey, baseUrl);
}
