import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { AiJobsStore } from './ai-jobs-store.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  pruneSpecForPrompt,
  runGenerateComponentDoc,
  enrichSpecVariableReferences,
  normalizeVariableIdText,
  normalizeOutputTokenReferences,
  applyAuthoritativeFigmaDescriptions,
  isLikelyFigmaConnectionError,
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

  it('classifies transport/network spec-fetch errors as connection errors', () => {
    assert.equal(isLikelyFigmaConnectionError('ws.request.no_socket_for_file:GET_COMPONENT_SPEC'), true);
    assert.equal(isLikelyFigmaConnectionError('ECONNREFUSED 127.0.0.1:3456'), true);
    assert.equal(isLikelyFigmaConnectionError('WebSocket closed unexpectedly by peer'), true);
  });

  it('does not classify generic spec parse failures as connection errors', () => {
    assert.equal(isLikelyFigmaConnectionError('Invalid component schema: missing root node'), false);
    assert.equal(isLikelyFigmaConnectionError('Spec parsing failed: unexpected token at line 1'), false);
  });
});

describe('ai-orchestrator variable enrichment', () => {
  it('normalizes exact bracketed VariableID to semantic key', () => {
    const variableKeyMap = new Map([
      ['1:10', { name: 'Button BG', key: 'color/button/bg/default' }],
    ]);
    assert.equal(
      normalizeVariableIdText('[VariableID:1:10]', variableKeyMap),
      'color/button/bg/default',
    );
  });

  it('normalizes token output fields from VariableID to semantic keys', () => {
    const variableKeyMap = new Map([
      ['1:10', { name: 'Button BG', key: 'color/button/bg/default' }],
      ['1:20', { name: 'Button Text', key: 'color/button/text/default' }],
    ]);

    const output = {
      schemaVersion: 2,
      componentId: '1:23',
      title: 'Boton',
      summary: 'Summary',
      anatomy: [],
      variants: [],
      tokens: [
        {
          name: 'fills',
          value: '[VariableID:1:10]',
          type: 'color',
          description: 'Uses VariableID:1:20 for text color',
        },
      ],
      accessibilityNotes: [],
      markdown: '',
      states: [],
      accessibilityFacts: [],
    };

    const normalized = normalizeOutputTokenReferences(output, variableKeyMap);
    assert.equal(normalized.tokens[0].value, 'color/button/bg/default');
    assert.equal(normalized.tokens[0].description, 'Uses color/button/text/default for text color');
  });

  it('normalizes embedded bracketed VariableID references consistently', () => {
    const variableKeyMap = new Map([
      ['1:10', { name: 'Button BG', key: 'color/button/bg/default' }],
    ]);
    assert.equal(
      normalizeVariableIdText('Use [VariableID:1:10] for button background', variableKeyMap),
      'Use color/button/bg/default for button background',
    );
  });

  it('applies authoritative Figma token descriptions and keeps AI summary', () => {
    const variableKeyMap = new Map([
      ['1:10', {
        name: 'Button BG',
        key: 'color/button/bg/default',
        description: 'Color de fondo por defecto del botón',
      }],
    ]);

    const output = {
      schemaVersion: 2,
      componentId: '1:23',
      title: 'Boton',
      summary: 'Resumen generado por IA',
      anatomy: [],
      variants: [],
      tokens: [
        {
          name: 'fills',
          value: 'VariableID:1:10',
          type: 'color',
          description: 'Descripción inventada por IA',
        },
      ],
      accessibilityNotes: [],
      markdown: '',
      states: [],
      accessibilityFacts: [],
    };

    const spec = { description: 'Descripción oficial de Figma' };
    const result = applyAuthoritativeFigmaDescriptions(output, spec, variableKeyMap);
    assert.equal(result.summary, 'Resumen generado por IA');
    assert.equal(result.tokens[0].description, 'Color de fondo por defecto del botón');
  });

  it('does not override summary when spec.description is whitespace-only', () => {
    const output = {
      schemaVersion: 2,
      componentId: '1:23',
      title: 'Boton',
      summary: 'Resumen IA que debe mantenerse',
      anatomy: [],
      variants: [],
      tokens: [],
      accessibilityNotes: [],
      markdown: '',
      states: [],
      accessibilityFacts: [],
    };

    const spec = { description: '   ' };
    const result = applyAuthoritativeFigmaDescriptions(output, spec, new Map());
    assert.equal(result.summary, 'Resumen IA que debe mantenerse');
  });

  it('applies authoritative Figma variant descriptions over AI variant descriptions', () => {
    const output = {
      schemaVersion: 2,
      componentId: '1:23',
      title: 'Boton',
      summary: 'Resumen IA',
      anatomy: [],
      variants: [
        {
          id: '1:24',
          name: 'Accent',
          description: 'Descripción inventada por IA',
          properties: { Variant: 'Accent' },
        },
        {
          id: '1:25',
          name: 'Default',
          description: 'Descripción inventada por IA',
          properties: { Variant: 'Default' },
        },
      ],
      tokens: [],
      accessibilityNotes: [],
      markdown: '',
      states: [],
      accessibilityFacts: [],
    };

    const spec = {
      variants: [
        {
          nodeId: '1:24',
          description: 'Descripción oficial Accent',
          variantProperties: { Variant: 'Accent' },
        },
        {
          nodeId: '1:25',
          description: 'Descripción oficial Default',
          variantProperties: { Variant: 'Default' },
        },
      ],
    };

    const result = applyAuthoritativeFigmaDescriptions(output, spec, new Map());
    assert.equal(result.variants[0].description, 'Descripción oficial Accent');
    assert.equal(result.variants[1].description, 'Descripción oficial Default');
  });

  it('falls back to canonicalKey matching when variant nodeId does not match', () => {
    const output = {
      schemaVersion: 2,
      componentId: '1:23',
      title: 'Boton',
      summary: 'Resumen IA',
      anatomy: [],
      variants: [
        {
          id: 'unmatched-node-id',
          name: 'Accent',
          description: 'Descripción IA Accent',
          properties: { Variant: 'Accent', State: 'Default' },
        },
      ],
      tokens: [],
      accessibilityNotes: [],
      markdown: '',
      states: [],
      accessibilityFacts: [],
    };

    const spec = {
      variants: [
        {
          nodeId: '1:24',
          description: 'Descripción Figma por canonical key',
          variantProperties: { State: 'Default', Variant: 'Accent' },
        },
      ],
    };

    const result = applyAuthoritativeFigmaDescriptions(output, spec, new Map());
    assert.equal(result.variants[0].description, 'Descripción Figma por canonical key');
  });

  it('keeps AI variant description when no authoritative Figma match exists', () => {
    const output = {
      schemaVersion: 2,
      componentId: '1:23',
      title: 'Boton',
      summary: 'Resumen IA',
      anatomy: [],
      variants: [
        {
          id: '1:99',
          name: 'Ghost',
          description: 'Descripción IA Ghost',
          properties: { Variant: 'Ghost' },
        },
      ],
      tokens: [],
      accessibilityNotes: [],
      markdown: '',
      states: [],
      accessibilityFacts: [],
    };

    const spec = {
      variants: [
        {
          nodeId: '1:24',
          description: 'Descripción Figma Accent',
          variantProperties: { Variant: 'Accent' },
        },
      ],
    };

    const result = applyAuthoritativeFigmaDescriptions(output, spec, new Map());
    assert.equal(result.variants[0].description, 'Descripción IA Ghost');
  });

  it('enriches VariableID references with key when map has entry', () => {
    const variableKeyMap = new Map([
      ['1:12', { name: 'Primary Fill', key: 'Core/Primary Fill' }],
      ['2:34', { name: 'Border Radius', key: 'Radius/Default' }],
    ]);

    const input = {
      tokens: [{ name: 'fills', value: 'VariableID:1:12' }],
      description: 'Uses VariableID:2:34 for corners',
    };

    const result = enrichSpecVariableReferences(input, variableKeyMap) as Record<string, unknown>;
    assert.equal((result.tokens as Array<Record<string, unknown>>)[0].value, 'VariableID:1:12 (Core/Primary Fill)');
    assert.equal(result.description, 'Uses VariableID:2:34 (Radius/Default) for corners');
  });

  it('leaves VariableID unchanged when not in map', () => {
    const variableKeyMap = new Map<string, { name: string; key: string }>();
    const input = { tokenRef: 'VariableID:9:99' };
    const result = enrichSpecVariableReferences(input, variableKeyMap) as Record<string, unknown>;
    assert.equal(result.tokenRef, 'VariableID:9:99');
  });

  it('handles nested arrays and objects with VariableID references', () => {
    const variableKeyMap = new Map([
      ['1:1', { name: 'Color', key: 'Colors/Primary' }],
    ]);
    const input = {
      variants: [
        { fill: 'VariableID:1:1', stroke: 'VariableID:unknown' },
        { nested: [{ bg: 'VariableID:1:1' }] },
      ],
    };
    const result = enrichSpecVariableReferences(input, variableKeyMap) as Record<string, unknown>;
    const variants = result.variants as Array<Record<string, unknown>>;
    assert.equal(variants[0].fill, 'VariableID:1:1 (Colors/Primary)');
    assert.equal(variants[0].stroke, 'VariableID:unknown');
    assert.equal((variants[1].nested as Array<Record<string, unknown>>)[0].bg, 'VariableID:1:1 (Colors/Primary)');
  });

  it('does not duplicate key annotations when VariableID already contains hint', () => {
    const variableKeyMap = new Map([
      ['1:12', { name: 'Primary Fill', key: 'tokens.color.primary' }],
    ]);
    const input = {
      tokenRef: 'VariableID:1:12 (tokens.color.primary)',
      description: 'Keeps VariableID:1:12 (tokens.color.primary) as-is',
    };
    const result = enrichSpecVariableReferences(input, variableKeyMap) as Record<string, unknown>;
    assert.equal(result.tokenRef, 'VariableID:1:12 (tokens.color.primary)');
    assert.equal(result.description, 'Keeps VariableID:1:12 (tokens.color.primary) as-is');
  });

  it('injects VariableID key annotations into generation user prompt', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
    });
    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    let generationUserPrompt = '';
    let callIndex = 0;
    const fakeAdapter = {
      generate: async (input: { userPrompt: string; jsonSchema?: Record<string, unknown> }) => {
        callIndex += 1;
        if (callIndex === 1) {
          generationUserPrompt = input.userPrompt;
          return {
            rawText: '{...}',
            parsedJson: {
              schemaVersion: 2,
              componentId: '68:4097',
              title: 'Button',
              summary: 'Summary',
              anatomy: [],
              variants: [],
              tokens: [],
              accessibilityNotes: [],
              markdown: '',
              states: [],
              accessibilityFacts: [],
            },
            usage: { promptTokens: 10, completionTokens: 5, durationMs: 30 },
          };
        }
        if (callIndex === 2) {
          return {
            rawText: '{...}',
            parsedJson: { schemaVersion: 2, summary: { purpose: 'Enhanced summary' } },
            usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: {
            schemaVersion: 1,
            passes: true,
            severity: 'info',
            score: 100,
            structureWarnings: [],
            missingSections: [],
            unsupportedClaims: [],
            editorialConflicts: [],
            terminologyMismatches: [],
            a11yWarnings: [],
            tokenWarnings: [],
            notes: [],
          },
          usage: { promptTokens: 2, completionTokens: 2, durationMs: 10 },
        };
      },
    };

    await runGenerateComponentDoc(
      job,
      store,
      fakeAdapter,
      async () => ({
        name: 'Button',
        type: 'COMPONENT_SET',
        tokenBindings: [{ fill: 'VariableID:1:12' }],
      }),
      undefined,
      undefined,
      async () =>
        new Map([
          ['1:12', { name: 'Primary Fill', key: 'tokens.color.primary' }],
        ]),
    );

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.status, 'completed');
    assert.match(generationUserPrompt, /VariableID:1:12 \(tokens\.color\.primary\)/);
  });

  it('R-001: enrich matches keys when map uses VariableID:-prefixed ids from API', () => {
    // normalizeVariablesMeta indexes variables by variable.id which may include "VariableID:" prefix.
    // resolveVariableKeyMap now strips that prefix before inserting.
    // The enrichment regex captures the part after "VariableID:" in spec strings.
    const variableKeyMap = new Map([
      ['1:12', { name: 'Primary Fill', key: 'Core/Primary Fill' }],
    ]);

    const input = {
      token: { name: 'fills', value: 'VariableID:1:12' },
    };
    const result = enrichSpecVariableReferences(input, variableKeyMap) as Record<string, unknown>;
    assert.equal(
      (result.token as Record<string, unknown>).value,
      'VariableID:1:12 (Core/Primary Fill)',
    );
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

  it('system prompt includes states extraction guidance', () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /STATES/);
    assert.match(prompt, /variant propert/);
    assert.match(prompt, /State.*Interaction.*Status|Hover.*Focus.*Active/i);
    assert.match(prompt, /empty array|states\[\]/i);
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
          schemaVersion: 2,
          componentId: '68:4097',
          title: 'Button',
          summary: 'Summary',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          markdown: '',
          states: [],
          accessibilityFacts: [],
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
          schemaVersion: 2,
          componentId: '68:4097',
          title: 'Button',
          summary: 'Summary',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          markdown: '',
          states: [],
          accessibilityFacts: [],
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
      runValidation: true,
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
              schemaVersion: 2,
              componentId: '68:4097',
              title: 'Button',
              summary: 'Summary',
              anatomy: [],
              variants: [],
              tokens: [],
              accessibilityNotes: [],
              markdown: '',
              states: [],
              accessibilityFacts: [],
            },
            usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
          };
        }
        if (adapterCalls === 2) {
          return {
            rawText: '{...}',
            parsedJson: { schemaVersion: 2, summary: { purpose: 'Enhanced summary' } },
            usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: {
            schemaVersion: 1,
            passes: true,
            severity: 'info',
            score: 100,
            structureWarnings: [],
            missingSections: [],
            unsupportedClaims: [],
            editorialConflicts: [],
            terminologyMismatches: [],
            a11yWarnings: [],
            tokenWarnings: [],
            notes: [],
          },
          usage: { promptTokens: 2, completionTokens: 2, durationMs: 10 },
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
    assert.equal(adapterCalls, 3);
    assert.ok(store.findById(job.id)?.editorialPatch, 'editorialPatch should be set after pipeline');
    assert.equal(store.findById(job.id)?.editorialPatch?.summary?.purpose, 'Enhanced summary');
    assert.ok(
      (store.findById(job.id)?.editorialPatch?.accessibility?.notes?.length ?? 0) > 0,
      'editorialPatch should include minimum accessibility notes fallback',
    );
    const fallbackNote = store.findById(job.id)?.editorialPatch?.accessibility?.notes?.[0] ?? '';
    assert.match(
      fallbackNote,
      /(TBD|Por confirmar|accessible name)/i,
      'fallback note should contain an explicit pending marker or concrete carried fact',
    );
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
              schemaVersion: 2,
              summary: { purpose: 'Enhanced purpose' },
            },
            usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: {
            schemaVersion: 2,
            componentId: '68:4097',
            title: 'Button',
            summary: 'Summary',
            anatomy: [],
            variants: [],
            tokens: [],
            accessibilityNotes: [],
            markdown: '',
            states: [],
            accessibilityFacts: [],
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
    let adapterCalls = 0;
    const adapter = {
      generate: async (input: { systemPrompt: string; jsonSchema?: Record<string, unknown> }) => {
        adapterCalls += 1;
        if (adapterCalls === 1) {
          generationSystemPrompt = input.systemPrompt;
          return {
            rawText: '{...}',
            parsedJson: {
              schemaVersion: 2,
              componentId: '68:4097',
              title: 'Button',
              summary: 'Summary',
              anatomy: [],
              variants: [],
              tokens: [],
              accessibilityNotes: [],
              markdown: '',
              states: [],
              accessibilityFacts: [],
            },
            usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
          };
        }
        if (adapterCalls === 2) {
          return {
            rawText: '{...}',
            parsedJson: {
              schemaVersion: 2,
              summary: { purpose: 'Enhanced purpose' },
            },
            usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: {
            schemaVersion: 1,
            passes: true,
            severity: 'info',
            score: 90,
            structureWarnings: [],
            missingSections: [],
            unsupportedClaims: [],
            editorialConflicts: [],
            terminologyMismatches: [],
            a11yWarnings: [],
            tokenWarnings: [],
            notes: [],
          },
          usage: { promptTokens: 2, completionTokens: 2, durationMs: 10 },
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
    let adapterCalls = 0;
    const adapter = {
      generate: async (input: { systemPrompt: string; jsonSchema?: Record<string, unknown> }) => {
        adapterCalls += 1;
        if (adapterCalls === 1) {
          generationSystemPrompt = input.systemPrompt;
          return {
            rawText: '{...}',
            parsedJson: {
              schemaVersion: 2,
              componentId: '68:4097',
              title: 'Button',
              summary: 'Summary',
              anatomy: [],
              variants: [],
              tokens: [],
              accessibilityNotes: [],
              markdown: '',
              states: [],
              accessibilityFacts: [],
            },
            usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
          };
        }
        if (adapterCalls === 2) {
          return {
            rawText: '{...}',
            parsedJson: {
              schemaVersion: 2,
              summary: { purpose: 'Enhanced purpose' },
            },
            usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: {
            schemaVersion: 1,
            passes: true,
            severity: 'info',
            score: 95,
            structureWarnings: [],
            missingSections: [],
            unsupportedClaims: [],
            editorialConflicts: [],
            terminologyMismatches: [],
            a11yWarnings: [],
            tokenWarnings: [],
            notes: [],
          },
          usage: { promptTokens: 2, completionTokens: 2, durationMs: 10 },
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
    let adapterCalls = 0;
    const adapter = {
      generate: async (input: { systemPrompt: string; jsonSchema?: Record<string, unknown> }) => {
        adapterCalls += 1;
        if (adapterCalls === 1) {
          generationSystemPrompt = input.systemPrompt;
          return {
            rawText: '{...}',
            parsedJson: {
              schemaVersion: 2,
              componentId: '68:4097',
              title: 'Button',
              summary: 'Summary',
              anatomy: [],
              variants: [],
              tokens: [],
              accessibilityNotes: [],
              markdown: '',
              states: [],
              accessibilityFacts: [],
            },
            usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
          };
        }
        if (adapterCalls === 2) {
          return {
            rawText: '{...}',
            parsedJson: {
              schemaVersion: 2,
              summary: { purpose: 'Enhanced purpose' },
            },
            usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
          };
        }
        return {
          rawText: '{...}',
          parsedJson: {
            schemaVersion: 1,
            passes: true,
            severity: 'info',
            score: 95,
            structureWarnings: [],
            missingSections: [],
            unsupportedClaims: [],
            editorialConflicts: [],
            terminologyMismatches: [],
            a11yWarnings: [],
            tokenWarnings: [],
            notes: [],
          },
          usage: { promptTokens: 2, completionTokens: 2, durationMs: 10 },
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

  it('invokes getPolicyContextOverride once per stage (extraction, editorial, validation)', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      runValidation: true,
    });

    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const requestedStages: Array<'extraction' | 'editorial' | 'validation'> = [];
    const adapter = create3StageAdapter({});

    await runGenerateComponentDoc(
      job,
      store,
      adapter,
      async () => ({ name: 'Button', type: 'COMPONENT_SET' }),
      undefined,
      async (stage) => {
        requestedStages.push(stage);
        return `[source: test > ${stage}]\nStage-specific policy context`;
      },
    );

    assert.equal(store.findById(job.id)?.status, 'completed');
    assert.deepEqual(requestedStages, ['extraction', 'editorial', 'validation']);
  });
});

// ---------------------------------------------------------------------------
// 3-stage pipeline tests
// ---------------------------------------------------------------------------

function create3StageAdapter(options: {
  validationReport?: Record<string, unknown>;
  validationFail?: boolean;
  onCall?: (callIndex: number, input: Record<string, unknown>) => void;
}) {
  let callIndex = 0;
  return {
    callCount: () => callIndex,
    generate: async (input: { systemPrompt: string; userPrompt: string; jsonSchema?: Record<string, unknown> }) => {
      callIndex += 1;
      options.onCall?.(callIndex, input);
      const schemaProperties = (
        (input.jsonSchema as { properties?: Record<string, unknown> } | undefined)?.properties
      ) ?? {};
      const isValidationCall = 'passes' in schemaProperties && 'severity' in schemaProperties;
      const isEditorialCall = 'related_components' in schemaProperties && 'qa' in schemaProperties;

      if (isValidationCall) {
        if (options.validationFail) {
          throw new Error('Validation LLM failed');
        }
        return {
          rawText: '{...}',
          parsedJson: options.validationReport ?? {
            schemaVersion: 1,
            passes: true,
            severity: 'info',
            score: 85,
            structureWarnings: [],
            missingSections: [],
            unsupportedClaims: [],
            editorialConflicts: [],
            terminologyMismatches: [],
            a11yWarnings: [],
            tokenWarnings: [],
            notes: [],
          },
          usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
        };
      }
      if (isEditorialCall) {
        return {
          rawText: '{...}',
          parsedJson: { schemaVersion: 2, summary: { purpose: 'Enhanced summary' } },
          usage: { promptTokens: 4, completionTokens: 3, durationMs: 20 },
        };
      }
      // Generation call
      return {
        rawText: '{...}',
        parsedJson: {
          schemaVersion: 2,
          componentId: '68:4097',
          title: 'Button',
          summary: 'Summary',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          markdown: '',
          states: [],
          accessibilityFacts: [],
        },
        usage: { promptTokens: 12, completionTokens: 7, durationMs: 40 },
      };
    },
  };
}

describe('3-stage pipeline', () => {
  beforeEach(() => {
    resetPromptPolicyCacheForTests();
  });

  it('completes with canPublish=true when validation passes', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      runValidation: true,
    });
    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const adapter = create3StageAdapter({});
    await runGenerateComponentDoc(job, store, adapter, async () => ({ name: 'Button', type: 'COMPONENT_SET' }));

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.canPublish, true);
    assert.ok(completed?.validationReport, 'validationReport should be set');
    assert.equal(completed?.pipelineSeverity, 'info');
    assert.equal(completed?.pipelineScore, 85);
  });

  it('blocks publication when severity is blocking and shadow mode is OFF', async () => {
    const prev = process.env.AI_VALIDATION_SHADOW;
    process.env.AI_VALIDATION_SHADOW = 'false';

    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      runValidation: true,
    });
    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const adapter = create3StageAdapter({
      validationReport: {
        schemaVersion: 1,
        passes: false,
        severity: 'blocking',
        score: 10,
        structureWarnings: [{ message: 'Missing summary', severity: 'blocking', section: 'summary' }],
        missingSections: [],
        unsupportedClaims: [],
        editorialConflicts: [],
        terminologyMismatches: [],
        a11yWarnings: [],
        tokenWarnings: [],
        notes: ['Blocking issues found'],
      },
    });
    await runGenerateComponentDoc(job, store, adapter, async () => ({ name: 'Button', type: 'COMPONENT_SET' }));

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.canPublish, false);
    assert.equal(completed?.pipelineSeverity, 'blocking');

    if (prev !== undefined) process.env.AI_VALIDATION_SHADOW = prev;
    else delete process.env.AI_VALIDATION_SHADOW;
  });

  it('allows publication when shadow mode is ON despite blocking severity', async () => {
    const prev = process.env.AI_VALIDATION_SHADOW;
    process.env.AI_VALIDATION_SHADOW = 'true';

    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      runValidation: true,
    });
    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const adapter = create3StageAdapter({
      validationReport: {
        schemaVersion: 1,
        passes: false,
        severity: 'blocking',
        score: 5,
        structureWarnings: [],
        missingSections: [],
        unsupportedClaims: [],
        editorialConflicts: [],
        terminologyMismatches: [],
        a11yWarnings: [],
        tokenWarnings: [],
        notes: [],
      },
    });
    await runGenerateComponentDoc(job, store, adapter, async () => ({ name: 'Button', type: 'COMPONENT_SET' }));

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.canPublish, true, 'Shadow mode should allow publication despite blocking');

    if (prev !== undefined) process.env.AI_VALIDATION_SHADOW = prev;
    else delete process.env.AI_VALIDATION_SHADOW;
  });

  it('allows publication when shadow mode uses default unset env', async () => {
    const prev = process.env.AI_VALIDATION_SHADOW;
    delete process.env.AI_VALIDATION_SHADOW;

    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      runValidation: true,
    });
    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const adapter = create3StageAdapter({
      validationReport: {
        schemaVersion: 1,
        passes: false,
        severity: 'blocking',
        score: 5,
        structureWarnings: [],
        missingSections: [],
        unsupportedClaims: [],
        editorialConflicts: [],
        terminologyMismatches: [],
        a11yWarnings: [],
        tokenWarnings: [],
        notes: [],
      },
    });
    await runGenerateComponentDoc(job, store, adapter, async () => ({ name: 'Button', type: 'COMPONENT_SET' }));

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.canPublish, true, 'Default unset env should run in shadow mode');

    if (prev !== undefined) process.env.AI_VALIDATION_SHADOW = prev;
    else delete process.env.AI_VALIDATION_SHADOW;
  });

  it('fail-open: validation failure does not block publication', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      runValidation: true,
    });
    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const adapter = create3StageAdapter({ validationFail: true });
    await runGenerateComponentDoc(job, store, adapter, async () => ({ name: 'Button', type: 'COMPONENT_SET' }));

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.canPublish, true, 'Validation failure should not block publication');
    assert.equal(completed?.validationReport, undefined, 'validationReport should be undefined on failure');
  });

  it('dry-run completes without LLM calls', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: true,
    });
    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const adapter = create3StageAdapter({});
    await runGenerateComponentDoc(job, store, adapter, async () => ({ name: 'Button', type: 'COMPONENT_SET' }));

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.canPublish, true);
    assert.equal(adapter.callCount(), 0, 'Dry-run should not call adapter');
  });

  it('performs 3 adapter calls for full pipeline', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      runValidation: true,
    });
    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const calls: number[] = [];
    const adapter = create3StageAdapter({
      onCall: (idx) => calls.push(idx),
    });
    await runGenerateComponentDoc(job, store, adapter, async () => ({ name: 'Button', type: 'COMPONENT_SET' }));

    assert.equal(calls.length, 3, 'Should make exactly 3 LLM calls');
    assert.deepEqual(calls, [1, 2, 3]);
  });

  it('skips validation call when runValidation is false', async () => {
    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'anthropic',
      componentId: '68:4097',
      dryRun: false,
      runValidation: false,
    });
    const dequeued = store.tryDequeue('anthropic');
    assert.ok(dequeued);

    const calls: number[] = [];
    const adapter = create3StageAdapter({
      onCall: (idx) => calls.push(idx),
    });
    await runGenerateComponentDoc(job, store, adapter, async () => ({ name: 'Button', type: 'COMPONENT_SET' }));

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.status, 'completed');
    assert.equal(completed?.canPublish, true);
    assert.equal(completed?.validationReport, undefined);
    assert.equal(calls.length, 2, 'Should make exactly 2 LLM calls (generation + editorial)');
    assert.deepEqual(calls, [1, 2]);
    assert.ok(
      completed?.events.some((evt) => evt.event === 'validation.skipped'),
      'Should emit validation.skipped event'
    );
  });

  it('runs validation for ollama when runValidation is true', async () => {
    const prev = process.env.AI_VALIDATION_SHADOW;
    process.env.AI_VALIDATION_SHADOW = 'true';

    const store = new AiJobsStore();
    const job = store.enqueue({
      type: 'GENERATE_COMPONENT_DOC',
      provider: 'ollama',
      componentId: '68:4097',
      dryRun: false,
      runValidation: true,
    });
    const dequeued = store.tryDequeue('ollama');
    assert.ok(dequeued);

    const calls: number[] = [];
    const adapter = create3StageAdapter({
      onCall: (idx) => calls.push(idx),
    });
    await runGenerateComponentDoc(job, store, adapter, async () => ({ name: 'Button', type: 'COMPONENT_SET' }));

    const completed = store.findById(job.id);
    assert.ok(completed);
    assert.equal(completed?.status, 'completed');
    assert.equal(calls.length, 3, 'Should make exactly 3 LLM calls when validation is enabled');
    assert.deepEqual(calls, [1, 2, 3]);
    assert.equal(
      completed?.events.some((evt) => evt.event === 'validation.skipped'),
      false,
      'Should not emit validation.skipped when validation is enabled'
    );

    if (prev !== undefined) process.env.AI_VALIDATION_SHADOW = prev;
    else delete process.env.AI_VALIDATION_SHADOW;
  });
});
