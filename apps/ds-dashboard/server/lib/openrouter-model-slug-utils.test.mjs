import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_OPENROUTER_SUGGESTIONS,
  decodeOpenRouterSlug,
  extractTopOpenRouterModelSlugs,
  fallbackLabelFromSlug,
  isValidOpenRouterModelSlug,
} from './openrouter-model-slug-utils.mjs';

describe('openrouter-model-slug-utils', () => {
  it('decodes and validates model slugs', () => {
    assert.equal(decodeOpenRouterSlug('qwen/qwen3.6-plus%3Afree'), 'qwen/qwen3.6-plus:free');
    assert.equal(decodeOpenRouterSlug('  anthropic/claude-opus-4.6  '), 'anthropic/claude-opus-4.6');
    assert.equal(decodeOpenRouterSlug(''), '');

    assert.equal(isValidOpenRouterModelSlug('anthropic/claude-opus-4.6'), true);
    assert.equal(isValidOpenRouterModelSlug('openrouter/pony-alpha'), true);
    assert.equal(isValidOpenRouterModelSlug('invalid'), false);
    assert.equal(isValidOpenRouterModelSlug('provider/model/extra'), false);
  });

  it('extracts ranked slugs up to the configured maximum', () => {
    const html = [
      '<a href="/models/qwen/qwen3.6-plus%3Afree">Qwen</a>',
      '<a href="/models/openrouter/pony-alpha">Pony</a>',
      '<a href="/models/invalid">Invalid</a>',
    ]
      .concat(
        Array.from({ length: MAX_OPENROUTER_SUGGESTIONS + 4 }, (_, index) =>
          `<a href="/models/provider/model-${index}">Model ${index}</a>`,
        ),
      )
      .join('');

    const slugs = extractTopOpenRouterModelSlugs(html);

    assert.equal(slugs[0], 'qwen/qwen3.6-plus:free');
    assert.equal(slugs[1], 'openrouter/pony-alpha');
    assert.equal(slugs.length, MAX_OPENROUTER_SUGGESTIONS);
    assert.equal(slugs.at(-1), `provider/model-${MAX_OPENROUTER_SUGGESTIONS - 3}`);
  });

  it('builds readable fallback labels from slugs', () => {
    assert.equal(fallbackLabelFromSlug('qwen/qwen3.6-plus:free'), 'Qwen3.6 Plus Free');
    assert.equal(fallbackLabelFromSlug('openrouter/hunter-alpha'), 'Hunter Alpha');
  });
});
