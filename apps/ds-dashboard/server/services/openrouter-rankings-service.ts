import { resolveProviderConfig } from './ai-provider.ts';
import {
  extractTopOpenRouterModelSlugs,
} from '../lib/openrouter-model-slug-utils.mjs';

const OPENROUTER_RANKINGS_URL =
  'https://openrouter.ai/rankings';
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const OPENROUTER_RANKING_VIEWS = ['day', 'week'] as const;

type CachedOpenRouterModel = {
  model: string;
  source: string;
  fetchedAt: number;
};

let cachedTopModel: CachedOpenRouterModel | null = null;

async function fetchTopModelForView(options: {
  fetchFn: typeof fetch;
  view: (typeof OPENROUTER_RANKING_VIEWS)[number];
}): Promise<string> {
  const response = await options.fetchFn(`${OPENROUTER_RANKINGS_URL}?view=${options.view}`, {
    headers: {
      Accept: 'text/html',
    },
  });
  if (!response.ok) {
    return '';
  }

  const html = await response.text();
  return extractTopOpenRouterModelSlugs(html, 1)[0] || '';
}

export async function getOpenRouterTopModelSlug(options?: {
  fetchFn?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}): Promise<{ model: string; source: string }> {
  const fetchFn = options?.fetchFn ?? fetch;
  const now = options?.now ?? (() => Date.now());
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const currentTime = now();

  if (
    cachedTopModel &&
    currentTime - cachedTopModel.fetchedAt < cacheTtlMs &&
    cachedTopModel.model
  ) {
    return {
      model: cachedTopModel.model,
      source: cachedTopModel.source,
    };
  }

  for (const view of OPENROUTER_RANKING_VIEWS) {
    try {
      const topModel = await fetchTopModelForView({ fetchFn, view });
      if (topModel) {
        const source = `openrouter/rankings?view=${view}`;
        cachedTopModel = {
          model: topModel,
          source,
          fetchedAt: currentTime,
        };
        return { model: topModel, source };
      }
    } catch {
      // Try the next ranking view before falling back to the configured default.
    }
  }

  const fallback = resolveProviderConfig().openrouterModel;
  cachedTopModel = {
    model: fallback,
    source: 'openrouter/config',
    fetchedAt: currentTime,
  };
  return {
    model: fallback,
    source: 'openrouter/config',
  };
}

export function clearOpenRouterTopModelCache(): void {
  cachedTopModel = null;
}
