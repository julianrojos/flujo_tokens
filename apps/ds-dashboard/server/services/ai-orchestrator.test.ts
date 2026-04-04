import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { AiJobsStore } from './ai-jobs-store.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  pruneSpecForPrompt,
  runGenerateComponentDoc,
} from './ai-orchestrator.js';
import { AI_ERROR_CODES } from './ai-component-doc-schema.js';
import { resetPromptPolicyCacheForTests } from './ai-prompt-policy.js';

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

  it('user prompt includes existing editorial context when provided', () => {
    const prompt = buildUserPrompt(
      { name: 'Button' },
      '68:4097',
      { summary: { purpose: 'Existing purpose' } },
    );
    assert.match(prompt, /EXISTING EDITORIAL DATA/);
    assert.match(prompt, /Existing purpose/);
  });

  it('user prompt truncation preserves editorial JSON shape without metadata wrapper', () => {
    const prompt = buildUserPrompt(
      { name: 'Button' },
      '68:4097',
      {
        summary: {
          purpose: 'A'.repeat(10_000),
          when_to_use: 'B'.repeat(10_000),
          when_not_to_use: 'C'.repeat(10_000),
        },
      },
    );
    assert.match(prompt, /EXISTING EDITORIAL DATA/);
    assert.match(prompt, /"summary"/);
    assert.doesNotMatch(prompt, /"truncated"\s*:\s*true/);
    assert.doesNotMatch(prompt, /"preview"\s*:/);
  });

  it('throws when custom user prompt template omits required componentSpecJson placeholder', () => {
    assert.throws(() => {
      buildUserPrompt(
        { name: 'Button' },
        '68:4097',
        null,
        'Generate docs for {{componentId}} without component spec placeholder.',
      );
    }, /must include \{\{componentSpecJson\}\}/);
  });

  it('throws when custom user prompt template omits required componentId placeholder', () => {
    assert.throws(() => {
      buildUserPrompt(
        { name: 'Button' },
        '68:4097',
        null,
        'Generate docs from this spec only:\n{{componentSpecJson}}',
      );
    }, /must include \{\{componentId\}\}/);
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

  it('loads existing editorial once and reuses the same snapshot in the pipeline', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
    });

    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    let editorialCalls = 0;
    let adapterCalls = 0;
    const adapter = {
      generate: async () => {
        adapterCalls += 1;
        if (adapterCalls === 1) {
          return {
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
            usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: { schemaVersion: 1, summary: { purpose: 'Enhanced summary' } },
          usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
        };
      },
    };

    await runGenerateComponentDoc(
      job,
      store,
      adapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' }),
      async () => {
        editorialCalls += 1;
        return { summary: { purpose: 'Existing summary' } };
      },
    );

    assert.equal(store.findById(job.id)?.status, 'completed');
    assert.equal(editorialCalls, 1);
    assert.equal(adapterCalls, 2);
    assert.ok(store.findById(job.id)?.editorialPatch, 'editorialPatch should be set after pipeline');
    assert.equal(store.findById(job.id)?.editorialPatch?.summary?.purpose, 'Enhanced summary');
  });
});

describe('ai-orchestrator policyContext', () => {
  beforeEach(() => {
    resetPromptPolicyCacheForTests();
  });

  it('buildSystemPrompt without policyContext returns base prompt (backwards-compatible)', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /JSON object/);
    assert.doesNotMatch(prompt, /Editorial Style Guidelines/);
  });

  it('buildSystemPrompt with policyContext appends Editorial Style Guidelines section', () => {
    const policyContext = '[source: tone > Tone policy]\nUse technical, prescriptive tone.';
    const prompt = buildSystemPrompt(policyContext);
    assert.match(prompt, /Editorial Style Guidelines/);
    assert.ok(prompt.includes('Use technical, prescriptive tone.'));
    assert.ok(prompt.includes('[source: tone > Tone policy]'));
  });

  it('buildSystemPrompt with empty string returns base prompt', () => {
    const prompt = buildSystemPrompt('');
    assert.doesNotMatch(prompt, /Editorial Style Guidelines/);
  });

  it('editorial patch prompt includes EDITORIAL STYLE GUIDELINES when policyContext is present', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
    });

    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    let editorialPatchPrompt: string | undefined;
    let adapterCalls = 0;

    const adapter = {
      generate: async (input: { systemPrompt: string; userPrompt: string; jsonSchema?: Record<string, unknown> }) => {
        adapterCalls += 1;
        const schemaProperties = (
          (input.jsonSchema as { properties?: Record<string, unknown> } | undefined)?.properties
        ) ?? {};
        const isEditorialPatchCall = 'related_components' in schemaProperties && 'qa' in schemaProperties;
        if (isEditorialPatchCall) {
          // Editorial patch prompt call
          editorialPatchPrompt = input.userPrompt;
          return {
            rawText: '{...}',
            parsedJson: {
              schemaVersion: 1,
              summary: { purpose: 'Enhanced purpose' },
            },
            usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
          };
        }
        return {
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
          usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
        };
      },
    };

    await runGenerateComponentDoc(
      job,
      store,
      adapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' }),
      undefined,
      async () => '[source: test > Tone policy]\nUse technical, prescriptive tone.',
    );

    assert.equal(store.findById(job.id)?.status, 'completed');
    assert.ok(adapterCalls >= 2, 'Pipeline should perform at least generation + editorial patch calls');
    assert.ok(editorialPatchPrompt, 'Editorial patch prompt should have been captured');
    assert.match(editorialPatchPrompt!, /EDITORIAL STYLE GUIDELINES/);
    assert.ok(
      editorialPatchPrompt!.includes('[source:'),
      'Editorial patch prompt should include source markers from policyContext',
    );
  });

  it('appends policyContext to custom systemPrompt in generation call', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      systemPrompt: 'Custom system prompt for controlled generation.',
    });

    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    let generationSystemPrompt: string | undefined;
    const adapter = {
      generate: async (input: { systemPrompt: string; jsonSchema?: Record<string, unknown> }) => {
        const schemaProperties = (
          (input.jsonSchema as { properties?: Record<string, unknown> } | undefined)?.properties
        ) ?? {};
        const isEditorialPatchCall = 'related_components' in schemaProperties && 'qa' in schemaProperties;
        if (!isEditorialPatchCall) {
          generationSystemPrompt = input.systemPrompt;
          return {
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
            usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: {
            schemaVersion: 1,
            summary: { purpose: 'Enhanced purpose' },
          },
          usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
        };
      },
    };

    await runGenerateComponentDoc(
      job,
      store,
      adapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' }),
      undefined,
      async () => '[source: test > Tone policy]\nUse technical, prescriptive tone.',
    );

    assert.equal(store.findById(job.id)?.status, 'completed');
    assert.ok(generationSystemPrompt, 'Generation system prompt should be captured');
    assert.ok(
      generationSystemPrompt!.includes('Custom system prompt for controlled generation.'),
      'Custom system prompt content should be preserved',
    );
    assert.match(generationSystemPrompt!, /Editorial Style Guidelines/);
    assert.ok(generationSystemPrompt!.includes('[source: test > Tone policy]'));
  });

  it('does not duplicate Editorial Style Guidelines when custom systemPrompt already includes it', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      systemPrompt: 'Custom header\n\n## Editorial Style Guidelines\n\nAlready present',
    });

    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    let generationSystemPrompt: string | undefined;
    const adapter = {
      generate: async (input: { systemPrompt: string; jsonSchema?: Record<string, unknown> }) => {
        const schemaProperties = (
          (input.jsonSchema as { properties?: Record<string, unknown> } | undefined)?.properties
        ) ?? {};
        const isEditorialPatchCall = 'related_components' in schemaProperties && 'qa' in schemaProperties;
        if (!isEditorialPatchCall) {
          generationSystemPrompt = input.systemPrompt;
          return {
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
            usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: {
            schemaVersion: 1,
            summary: { purpose: 'Enhanced purpose' },
          },
          usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
        };
      },
    };

    await runGenerateComponentDoc(
      job,
      store,
      adapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' }),
      undefined,
      async () => '[source: test > Tone policy]\nUse technical, prescriptive tone.',
    );

    assert.equal(store.findById(job.id)?.status, 'completed');
    assert.ok(generationSystemPrompt);
    assert.ok(generationSystemPrompt!.includes('Already present'));
    assert.doesNotMatch(generationSystemPrompt!, /\[source: test > Tone policy\]/);
    const occurrences = generationSystemPrompt!.split('## Editorial Style Guidelines').length - 1;
    assert.equal(occurrences, 1, 'Editorial guidelines heading should not be duplicated');
  });

  it('does not treat unrelated [source: text as existing policy markers', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      systemPrompt: 'Custom notes: [source: Figma Token] should remain plain text.',
    });

    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    let generationSystemPrompt: string | undefined;
    const adapter = {
      generate: async (input: { systemPrompt: string; jsonSchema?: Record<string, unknown> }) => {
        const schemaProperties = (
          (input.jsonSchema as { properties?: Record<string, unknown> } | undefined)?.properties
        ) ?? {};
        const isEditorialPatchCall = 'related_components' in schemaProperties && 'qa' in schemaProperties;
        if (!isEditorialPatchCall) {
          generationSystemPrompt = input.systemPrompt;
          return {
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
            usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: {
            schemaVersion: 1,
            summary: { purpose: 'Enhanced purpose' },
          },
          usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
        };
      },
    };

    await runGenerateComponentDoc(
      job,
      store,
      adapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' }),
      undefined,
      async () => '[source: test > Tone policy]\nUse technical, prescriptive tone.',
    );

    assert.equal(store.findById(job.id)?.status, 'completed');
    assert.ok(generationSystemPrompt);
    assert.ok(generationSystemPrompt!.includes('Custom notes: [source: Figma Token]'));
    assert.ok(generationSystemPrompt!.includes('[source: test > Tone policy]'));
    assert.match(generationSystemPrompt!, /Editorial Style Guidelines/);
  });
});
