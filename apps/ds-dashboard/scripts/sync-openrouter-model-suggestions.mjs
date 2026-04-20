import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  MAX_OPENROUTER_SUGGESTIONS,
  extractTopOpenRouterModelSlugs,
  fallbackLabelFromSlug,
} from '../server/lib/openrouter-model-slug-utils.mjs';

const RANKINGS_URL =
  process.env.OPENROUTER_RANKINGS_URL ?? 'https://openrouter.ai/rankings';
const MODELS_URL =
  process.env.OPENROUTER_MODELS_URL ?? 'https://openrouter.ai/api/v1/models';
const EXTRA_MODEL_SUGGESTIONS = [
  'stepfun/step-3.5-flash',
  'nvidia/nemotron-3-super-120b-a12b',
  'google/gemini-3.1-pro-preview',
  'qwen/qwen3.6-plus',
  'qwen/qwen3.6-plus:free',
  'openrouter/hunter-alpha',
  'openrouter/healer-alpha',
  'openrouter/elephant-alpha',
  'openrouter/aurora-alpha',
  'openrouter/pony-alpha',
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputFile = path.resolve(
  scriptDir,
  '../src/data/openrouter-model-suggestions.ts',
);

function resolveOutputFile() {
  return process.env.OPENROUTER_SUGGESTIONS_OUTPUT_FILE ?? outputFile;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function main() {
  const resolvedOutputFile = resolveOutputFile();
  const rankingsResponse = await fetch(RANKINGS_URL, {
    headers: {
      Accept: 'text/html',
    },
  });

  if (!rankingsResponse.ok) {
    throw new Error(
      `Failed to fetch rankings page: ${rankingsResponse.status} ${rankingsResponse.statusText}`,
    );
  }

  const rankingsHtml = await rankingsResponse.text();
  const slugs = extractTopOpenRouterModelSlugs(rankingsHtml);

  if (slugs.length === 0) {
    throw new Error(
      'Expected at least one model slug on the rankings page.',
    );
  }

  const modelsResponse = await fetchJson(MODELS_URL);
  const models = Array.isArray(modelsResponse?.data) ? modelsResponse.data : [];
  const modelById = new Map();

  for (const model of models) {
    if (typeof model?.id === 'string') {
      modelById.set(model.id, model);
    }
    if (typeof model?.canonical_slug === 'string') {
      modelById.set(model.canonical_slug, model);
    }
  }

  const suggestions = slugs.map((slug, index) => {
    const model = modelById.get(slug);
    const label = typeof model?.name === 'string'
      ? model.name
      : fallbackLabelFromSlug(slug) ?? slug;

    return {
      value: slug,
      label,
      hint: `OpenRouter ranking #${index + 1}`,
    };
  });

  const rankedValues = new Set(suggestions.map((item) => item.value));
  const extraSuggestions = EXTRA_MODEL_SUGGESTIONS
    .filter((slug) => !rankedValues.has(slug))
    .map((slug, index) => {
      const model = modelById.get(slug);
      const label = typeof model?.name === 'string'
        ? model.name
        : fallbackLabelFromSlug(slug) ?? slug;

      return {
        value: slug,
        label,
        hint: `OpenRouter suggestion #${index + 11}`,
      };
    });
  const mergedSuggestions = [...suggestions, ...extraSuggestions].slice(
    0,
    MAX_OPENROUTER_SUGGESTIONS,
  );

  const content = `import type { OpenRouterModelSuggestion } from '../../shared/openrouter-types';

/**
 * Generated from OpenRouter rankings.
 * Keep this file in sync with \`scripts/sync-openrouter-model-suggestions.mjs\`.
 */
export const OPENROUTER_RANKED_MODEL_SUGGESTIONS: OpenRouterModelSuggestion[] = ${JSON.stringify(
    mergedSuggestions,
    null,
    2,
  )};
`;

  await writeFile(resolvedOutputFile, `${content}\n`, 'utf8');
  console.log(
    `Wrote ${mergedSuggestions.length} OpenRouter model suggestions to ${path.relative(
      process.cwd(),
      resolvedOutputFile,
    )}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
