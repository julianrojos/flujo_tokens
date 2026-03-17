import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AiJobsStore } from './ai-jobs-store.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  pruneSpecForPrompt,
  runGenerateComponentDoc,
} from './ai-orchestrator.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';

describe('ai-orchestrator preprocessing', () => {
  it('limits variants to 20 before truncation', () => {
    const variants = Array.from({ length: 25 }, (_, i) => ({ id: `v-${i}`, name: `V${i}` }));
    const result = pruneSpecForPrompt({ name: 'Button', variants });
    assert.equal(Array.isArray(result.pruned.variants), true);
    assert.equal((result.pruned.variants as unknown[]).length, 20);
  });

  it('sanitizes token binding internal id fields', () => {
    const result = pruneSpecForPrompt({
      name: 'Button',
      tokenBindings: [
        {
          name: 'Primary Fill',
          tokenName: 'color/primary',
          tokenValue: '#000000',
          variableId: 'var-123',
          collectionId: 'col-1',
          nodeId: '88:1',
        },
      ],
    });

    const first = (result.pruned.tokenBindings as Array<Record<string, unknown>>)[0];
    assert.equal(first.name, 'Primary Fill');
    assert.equal(first.tokenName, 'color/primary');
    assert.equal(first.variableId, undefined);
    assert.equal(first.collectionId, undefined);
    assert.equal(first.nodeId, undefined);
  });

  it('signals truncation for oversized specs', () => {
    const variants = Array.from({ length: 100 }, (_, i) => ({
      id: `v-${i}`,
      name: `Variant ${i}`,
      description: 'x'.repeat(4000),
    }));

    const result = pruneSpecForPrompt({ name: 'Huge', variants });
    assert.equal(result.truncated, true);
  });
});

describe('ai-orchestrator prompts', () => {
  it('system prompt includes structured output guidance', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /JSON object/);
    assert.match(prompt, /schema/);
  });

  it('user prompt includes component id and json block', () => {
    const prompt = buildUserPrompt({ name: 'Button' }, '68:4097');
    assert.match(prompt, /68:4097/);
    assert.match(prompt, /```json/);
  });
});

describe('ai-orchestrator pipeline', () => {
  it('completes dryRun without provider call', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: true,
    });

    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    await runGenerateComponentDoc(
      job,
      store,
      undefined,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' })
    );

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.usage?.promptTokens, 0);
    assert.match(completed?.output?.title ?? '', /^\[DRY RUN\]/);
  });

  it('maps invalid provider payload to ai.schema.invalid', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
    });

    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const badAdapter = {
      generate: async () => ({
        rawText: '{}',
        parsedJson: { schemaVersion: 1, componentId: '68:4097' },
        usage: { promptTokens: 10, completionTokens: 5, durationMs: 30 },
      }),
    };

    await runGenerateComponentDoc(
      job,
      store,
      badAdapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' })
    );

    const failed = store.findById(job.id);
    assert.ok(failed);
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.errorCode, AI_ERROR_CODES.SCHEMA_INVALID.code);
    assert.equal(failed?.retryable, false);
  });

  it('maps timeout to ai.llm.timeout', async () => {
    const prev = process.env.AI_JOB_TIMEOUT_MS;
    process.env.AI_JOB_TIMEOUT_MS = '5';

    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
    });

    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const slowAdapter = {
      generate: async () => new Promise(() => {
        // intentionally unresolved
      }),
    };

    await runGenerateComponentDoc(
      job,
      store,
      slowAdapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' })
    );

    const failed = store.findById(job.id);
    assert.ok(failed);
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.errorCode, AI_ERROR_CODES.LLM_TIMEOUT.code);
    assert.equal(failed?.retryable, true);

    if (prev === undefined) {
      delete process.env.AI_JOB_TIMEOUT_MS;
    } else {
      process.env.AI_JOB_TIMEOUT_MS = prev;
    }
  });

  it('maps ollama timeout to ai.llm.timeout with AI_OLLAMA_TIMEOUT_MS', async () => {
    const prevJobTimeout = process.env.AI_JOB_TIMEOUT_MS;
    const prevOllamaTimeout = process.env.AI_OLLAMA_TIMEOUT_MS;
    process.env.AI_JOB_TIMEOUT_MS = '5000'; // 5s fallback
    process.env.AI_OLLAMA_TIMEOUT_MS = '5'; // 5ms for ollama

    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'ollama',
      componentId: '68:4097',
      dryRun: false,
    });

    const dequeued = store.tryDequeue('ollama');
    assert.ok(dequeued);

    const slowAdapter = {
      generate: async () => new Promise(() => {
        // intentionally unresolved
      }),
    };

    await runGenerateComponentDoc(
      job,
      store,
      slowAdapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' })
    );

    const failed = store.findById(job.id);
    assert.ok(failed);
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.errorCode, AI_ERROR_CODES.LLM_TIMEOUT.code);
    assert.equal(failed?.retryable, true);

    if (prevJobTimeout === undefined) {
      delete process.env.AI_JOB_TIMEOUT_MS;
    } else {
      process.env.AI_JOB_TIMEOUT_MS = prevJobTimeout;
    }
    if (prevOllamaTimeout === undefined) {
      delete process.env.AI_OLLAMA_TIMEOUT_MS;
    } else {
      process.env.AI_OLLAMA_TIMEOUT_MS = prevOllamaTimeout;
    }
  });

  it('ollama completes successfully within default timeout', async () => {
    const prevOllamaTimeout = process.env.AI_OLLAMA_TIMEOUT_MS;
    delete process.env.AI_OLLAMA_TIMEOUT_MS; // Use default 120000ms

    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'ollama',
      componentId: '68:4097',
      dryRun: false,
    });

    const dequeued = store.tryDequeue('ollama');
    assert.ok(dequeued);

    const fastAdapter = {
      generate: async () => ({
        rawText: '{...}',
        parsedJson: {
          schemaVersion: 1,
          componentId: '68:4097',
          title: 'Button',
          summary: 'Summary',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          markdown: '',
        },
        usage: { promptTokens: 10, completionTokens: 20, durationMs: 100 },
      }),
    };

    await runGenerateComponentDoc(
      job,
      store,
      fastAdapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' })
    );

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.usage?.promptTokens, 10);

    if (prevOllamaTimeout === undefined) {
      delete process.env.AI_OLLAMA_TIMEOUT_MS;
    } else {
      process.env.AI_OLLAMA_TIMEOUT_MS = prevOllamaTimeout;
    }
  });

  it('stores real usage metrics from provider result', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'openai',
      componentId: '68:4097',
      dryRun: false,
    });

    const dequeued = store.tryDequeue('openai');
    assert.ok(dequeued);

    const goodAdapter = {
      generate: async () => ({
        rawText: '{...}',
        parsedJson: {
          schemaVersion: 1,
          componentId: '68:4097',
          title: 'Button',
          summary: 'Summary',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          markdown: '',
        },
        usage: { promptTokens: 123, completionTokens: 45, durationMs: 678 },
      }),
    };

    await runGenerateComponentDoc(
      job,
      store,
      goodAdapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' })
    );

    const completed = store.findById(job.id);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.usage?.promptTokens, 123);
    assert.equal(completed?.usage?.completionTokens, 45);
    assert.equal(completed?.usage?.durationMs, 678);
  });

  it('continues processing queued jobs via onJobStarted callback', async () => {
    const store = new AiJobsStore();
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    store.setOnJobStarted((startedJob) => {
      runGenerateComponentDoc(
        startedJob,
        store,
        undefined,
        async () => ({ name: 'Button', type: 'COMPONENT_SET' })
      ).catch(() => {
        // test asserts final statuses below
      });
    });

    const job1 = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: true,
    });
    const job2 = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4098',
      dryRun: true,
    });

    store.tryDequeue('anthropic');

    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
      const first = store.findById(job1.id);
      const second = store.findById(job2.id);
      if (first?.status === 'completed' && second?.status === 'completed') {
        break;
      }
      await sleep(20);
    }

    assert.equal(store.findById(job1.id)?.status, 'completed');
    assert.equal(store.findById(job2.id)?.status, 'completed');
  });
});
