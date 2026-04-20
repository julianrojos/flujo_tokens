import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { main } from './sync-openrouter-model-suggestions.mjs';

const tempDirs = [];

after(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }),
  );
});

describe('sync-openrouter-model-suggestions smoke test', () => {
  it('writes the generated suggestions file', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'openrouter-sync-'));
    tempDirs.push(tempDir);
    const outputFile = path.join(tempDir, 'openrouter-model-suggestions.ts');
    const originalFetch = global.fetch;
    const originalConsoleLog = console.log;
    const originalOutputFile = process.env.OPENROUTER_SUGGESTIONS_OUTPUT_FILE;

    global.fetch = (async (input) => {
      const url = String(input);
      if (url === 'https://openrouter.ai/rankings') {
        return new Response(
          '<a href="/models/anthropic/claude-opus-4.6">Claude Opus 4.6</a><a href="/models/qwen/qwen3.6-plus%3Afree">Qwen</a>',
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        );
      }
      if (url === 'https://openrouter.ai/api/v1/models') {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6' },
              { id: 'qwen/qwen3.6-plus:free', name: 'Qwen 3.6 Plus Free' },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      return new Response('not found', { status: 404 });
    });
    console.log = () => {};
    process.env.OPENROUTER_SUGGESTIONS_OUTPUT_FILE = outputFile;

    try {
      await main();

      const content = await readFile(outputFile, 'utf8');
      assert.ok(content.includes('OPENROUTER_RANKED_MODEL_SUGGESTIONS'));
      assert.ok(content.length > 0);
    } finally {
      global.fetch = originalFetch;
      console.log = originalConsoleLog;
      if (originalOutputFile === undefined) {
        delete process.env.OPENROUTER_SUGGESTIONS_OUTPUT_FILE;
      } else {
        process.env.OPENROUTER_SUGGESTIONS_OUTPUT_FILE = originalOutputFile;
      }
    }
  });
});
