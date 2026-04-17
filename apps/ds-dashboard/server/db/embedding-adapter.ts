/**
 * Embedding Adapter
 *
 * Multi-provider interface for generating embeddings (RAG on tokens/components/docs).
 */

import OpenAI from 'openai';

export interface EmbeddingAdapter {
  readonly providerName: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingAdapterOptions {
  provider?: string;
  dimensions?: number;
  openaiApiKey?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  opencodeBaseUrl?: string;
}

function truncateAndNormalize(vec: number[], dims: number): number[] {
  if (vec.length < dims) {
    throw new Error(
      `Ollama model produced ${vec.length} dimensions but EMBEDDING_DIMENSIONS=${dims} requires more. ` +
        `Use a model with at least ${dims} dimensions or adjust EMBEDDING_DIMENSIONS.`,
    );
  }
  const truncated = vec.slice(0, dims);
  const norm = Math.sqrt(truncated.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? truncated : truncated.map((v) => v / norm);
}

export class OpenAiEmbeddingAdapter implements EmbeddingAdapter {
  readonly providerName = 'openai';
  readonly dimensions: number;
  private client: OpenAI;

  constructor(dimensions: number, apiKey?: string) {
    this.dimensions = dimensions;
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      dimensions: this.dimensions,
      input: texts,
    });
    return response.data.map((item) => item.embedding);
  }
}

export class GeminiEmbeddingAdapter implements EmbeddingAdapter {
  readonly providerName = 'gemini';
  readonly dimensions: number;
  private apiKey: string;

  constructor(dimensions: number, apiKey?: string) {
    this.dimensions = dimensions;
    this.apiKey =
      apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is required');
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`;
    const results: number[][] = [];

    for (const text of texts) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { role: 'user', parts: [{ text }] },
          outputDimensionality: this.dimensions,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Gemini API error: ${response.status} ${response.statusText}`,
        );
      }
      const data = (await response.json()) as {
        embedding: { values: number[] };
      };
      results.push(data.embedding.values);
    }

    return results;
  }
}

export class OllamaEmbeddingAdapter implements EmbeddingAdapter {
  readonly providerName = 'ollama';
  readonly dimensions: number;
  private baseUrl: string;
  private model: string;

  constructor(dimensions: number, baseUrl?: string) {
    this.dimensions = dimensions;
    this.baseUrl =
      baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
    this.model =
      process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: text }),
      });
      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`,
        );
      }
      const data = (await response.json()) as { embeddings: number[][] };
      if (!data.embeddings || data.embeddings.length === 0) {
        throw new Error('Ollama returned no embeddings');
      }
      const vec = data.embeddings[0];
      results.push(truncateAndNormalize(vec, this.dimensions));
    }

    return results;
  }
}

export class OpenCodeEmbeddingAdapter implements EmbeddingAdapter {
  readonly providerName = 'opencode';
  readonly dimensions: number;
  private client: OpenAI;

  constructor(dimensions: number, baseUrl?: string) {
    this.dimensions = dimensions;
    this.client = new OpenAI({
      baseURL:
        baseUrl ?? process.env.OPENCODE_BASE_URL ?? 'https://opencode.ai/v1',
      apiKey: process.env.OPENCODE_API_KEY ?? 'dummy',
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      dimensions: this.dimensions,
      input: texts,
    });
    return response.data.map((item) => item.embedding);
  }
}

export function resolveEmbeddingAdapter(
  options?: EmbeddingAdapterOptions,
): EmbeddingAdapter {
  const provider =
    options?.provider ?? process.env.EMBEDDING_PROVIDER ?? 'openai';
  const dims =
    options?.dimensions ??
    parseInt(process.env.EMBEDDING_DIMENSIONS ?? '1536', 10);

  switch (provider.toLowerCase()) {
    case 'openai':
      return new OpenAiEmbeddingAdapter(dims, options?.openaiApiKey);
    case 'gemini':
      return new GeminiEmbeddingAdapter(dims, options?.geminiApiKey);
    case 'ollama':
      return new OllamaEmbeddingAdapter(dims, options?.ollamaBaseUrl);
    case 'opencode':
      return new OpenCodeEmbeddingAdapter(dims, options?.opencodeBaseUrl);
    default:
      throw new Error(
        `Unknown EMBEDDING_PROVIDER: ${provider}. Supported: openai, gemini, ollama, opencode`,
      );
  }
}
