/**
 * AI Orchestrator
 * Implements the deterministic pipeline for generating component documentation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  AiProvider,
  AiProviderResult,
  AiProviderName,
} from './ai-provider.js';
import { createAnthropicAdapter } from './ai-anthropic-adapter.js';
import { createOpenAiAdapter } from './ai-openai-adapter.js';
import { createOllamaAdapter } from './ai-ollama-adapter.js';
import { createGeminiAdapter } from './ai-gemini-adapter.js';
import { getApiKey, resolveProviderConfig } from './ai-provider.js';
import type {
  AiJobState,
  ComponentDocModelOutput,
  ComponentDocOutput,
} from './ai-component-doc-schema.js';
import {
  validateComponentDocModelOutput,
  COMPONENT_DOC_MODEL_JSON_SCHEMA,
  toComponentDocOutput,
  AI_ERROR_CODES,
} from './ai-component-doc-schema.js';
import type { EditorialPatch } from './ai-editorial-patch-schema.js';
import {
  validateEditorialPatch,
  EDITORIAL_PATCH_JSON_SCHEMA,
} from './ai-editorial-patch-schema.js';
import { renderComponentDoc } from './ai-component-doc-renderer.js';
import { buildCanonicalKey } from './figma-descriptions-resolver.js';
import type { AiJobsStore } from './ai-jobs-store.js';
import { getComponentSpecDirect } from './figma-direct-bridge-service.js';
import {
  buildPromptPolicyContext,
  type PolicyCallStage,
} from './ai-prompt-policy.js';
import type { ValidationReport } from './ai-validation-report-schema.js';
import {
  validateValidationReport,
  VALIDATION_REPORT_JSON_SCHEMA,
} from './ai-validation-report-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const AI_CONTEXT_PATH = path.join(
  REPO_ROOT,
  'apps',
  'ds-dashboard',
  'ai-context',
);
if (!fs.existsSync(AI_CONTEXT_PATH)) {
  console.warn(
    '[ai-orchestrator] REPO_ROOT may be incorrect: apps/ds-dashboard/ai-context not found at',
    REPO_ROOT,
  );
}

/** Shadow mode: validation runs but never blocks publication */
function isValidationShadowMode(): boolean {
  // Default is warn-only (shadow ON). Set AI_VALIDATION_SHADOW=false to enforce blocking.
  return process.env.AI_VALIDATION_SHADOW !== 'false';
}

/**
 * Maximum prompt characters (approximately 8k tokens)
 */
const MAX_PROMPT_CHARS = 32000;

/**
 * Default job timeout in milliseconds (90 seconds)
 */
const DEFAULT_JOB_TIMEOUT_MS = 90000;

/**
 * Default Ollama job timeout in milliseconds (120 seconds)
 */
const DEFAULT_OLLAMA_TIMEOUT_MS = 120000;
const DEFAULT_STAGE_TIMEOUT_MS = 30000;
const EDITORIAL_GUIDELINES_HEADING = '## Editorial Style Guidelines';
type PolicyContextOverride = (stage: PolicyCallStage) => Promise<string>;

class JobCancelledSignal extends Error {
  constructor() {
    super('Job cancelled');
    this.name = 'JobCancelledSignal';
  }
}

const DEFAULT_USER_PROMPT_TEMPLATE = `Generate component documentation for Figma component ID: {{componentId}}

Component Specification:
\`\`\`json
{{componentSpecJson}}
\`\`\`
{{existingEditorialJsonBlock}}

Generate the documentation following the schema provided in the system prompt.`;

/**
 * Get job timeout from environment based on provider
 * @param provider - Provider name
 * @returns Timeout in milliseconds
 */
function getJobTimeout(provider: AiProviderName): number {
  if (provider === 'ollama') {
    const ollamaTimeout = process.env.AI_OLLAMA_TIMEOUT_MS;
    if (ollamaTimeout) {
      const parsed = parseInt(ollamaTimeout, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    // Fallback to global, then to ollama default
    const globalTimeout = process.env.AI_JOB_TIMEOUT_MS;
    if (globalTimeout) {
      const parsed = parseInt(globalTimeout, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_OLLAMA_TIMEOUT_MS;
  }

  // OpenCode uses longer timeout like Ollama (remote backend, similar latency profile)
  if (provider === 'opencode') {
    const opencodeTimeout = process.env.AI_OPENCODE_TIMEOUT_MS;
    if (opencodeTimeout) {
      const parsed = parseInt(opencodeTimeout, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const globalTimeout = process.env.AI_JOB_TIMEOUT_MS;
    if (globalTimeout) {
      const parsed = parseInt(globalTimeout, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_OLLAMA_TIMEOUT_MS;
  }

  const envTimeout = process.env.AI_JOB_TIMEOUT_MS;
  if (envTimeout) {
    const parsed = parseInt(envTimeout, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_JOB_TIMEOUT_MS;
}

function getStageTimeoutCapMs(): number {
  const envTimeout = process.env.AI_VALIDATION_TIMEOUT_MS;
  if (envTimeout) {
    const parsed = parseInt(envTimeout, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_STAGE_TIMEOUT_MS;
}

/**
 * Prune Figma spec for LLM prompt
 * Removes deep children, internal IDs, and truncates if needed
 * @param spec - Raw Figma component spec
 * @returns Pruned spec object
 */
export function pruneSpecForPrompt(spec: Record<string, unknown>): {
  pruned: Record<string, unknown>;
  truncated: boolean;
} {
  // Extract relevant fields
  const cleaned: Record<string, unknown> = {
    name: spec.name,
    type: spec.type,
    description: spec.description,
    // Limit variant axes
    variantAxes: spec.variantAxes,
    // Limit variants to 20
    variants:
      Array.isArray(spec.variants) && spec.variants.length > 20
        ? (spec.variants as unknown[]).slice(0, 20)
        : spec.variants,
    // Keep other fields as-is
    props: spec.props,
    states: spec.states,
  };

  // Serialize and check size
  const serialized = JSON.stringify(cleaned, null, 2);

  if (serialized.length <= MAX_PROMPT_CHARS) {
    return { pruned: cleaned, truncated: false };
  }

  // Progressive truncation: reduce variants first
  if (cleaned.variants && Array.isArray(cleaned.variants)) {
    cleaned.variants = (cleaned.variants as unknown[]).slice(0, 10);
    const reducedSerialized = JSON.stringify(cleaned, null, 2);
    if (reducedSerialized.length <= MAX_PROMPT_CHARS) {
      return { pruned: cleaned, truncated: true };
    }
  }

  // Further reduce
  if (cleaned.variants && Array.isArray(cleaned.variants)) {
    cleaned.variants = (cleaned.variants as unknown[]).slice(0, 5);
  }

  return { pruned: cleaned, truncated: true };
}

const FIGMA_CONNECTION_ERROR_PATTERNS = [
  'no_socket',
  'connection',
  'network',
  'econnrefused',
  'econnreset',
  'etimedout',
  'websocket',
  'socket',
  'closed unexpectedly',
] as const;

/**
 * Heuristic classifier for spec-fetch transport/connectivity failures.
 * Fail-safe: non-matching errors are treated as generic spec failures.
 */
export function isLikelyFigmaConnectionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return FIGMA_CONNECTION_ERROR_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

function toVariantPropertiesMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const mapped: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') {
      mapped[key] = raw;
    } else if (raw != null) {
      mapped[key] = String(raw);
    }
  }
  return mapped;
}

/**
 * Enforce authoritative descriptions from Figma over AI-generated prose.
 * - Keep AI-generated summary intact (component-set Figma description is rendered separately).
 */
export function applyAuthoritativeFigmaDescriptions(
  output: ComponentDocModelOutput,
  spec: Record<string, unknown>,
): ComponentDocModelOutput {
  const next: ComponentDocModelOutput = { ...output };

  const rawSpecVariants = Array.isArray(spec.variants) ? spec.variants : [];
  const figmaVariantByNodeId = new Map<string, string>();
  const figmaVariantByCanonicalKey = new Map<string, string>();

  for (const raw of rawSpecVariants) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const variant = raw as Record<string, unknown>;
    const desc =
      typeof variant.description === 'string' ? variant.description.trim() : '';
    if (!desc) continue;
    const nodeId =
      typeof variant.nodeId === 'string' ? variant.nodeId.trim() : '';
    if (nodeId) {
      figmaVariantByNodeId.set(nodeId, desc);
    }
    const props = toVariantPropertiesMap(variant.variantProperties);
    const canonicalKey = buildCanonicalKey(props);
    if (canonicalKey) {
      figmaVariantByCanonicalKey.set(canonicalKey, desc);
    }
  }

  if (Array.isArray(next.variants) && next.variants.length > 0) {
    next.variants = next.variants.map((variant) => {
      const byNodeId = variant.id
        ? figmaVariantByNodeId.get(variant.id)
        : undefined;
      const canonicalKey = buildCanonicalKey(variant.properties ?? {});
      const byKey = canonicalKey
        ? figmaVariantByCanonicalKey.get(canonicalKey)
        : undefined;
      const authoritative = byNodeId ?? byKey;
      if (!authoritative) return variant;
      return {
        ...variant,
        description: authoritative,
      };
    });
  }

  return next;
}

/**
 * Build system prompt for component documentation
 * @param policyContext - Optional editorial policy context from .mc rules
 * @returns System prompt string
 */
export function buildSystemPrompt(policyContext?: string): string {
  const prompt = `You are an expert design system documentation assistant. Your task is to generate structured component documentation based on Figma component specifications.

Generate a JSON object that matches the provided schema exactly. Follow these guidelines:

1. TITLE: Create a clear, human-readable title for the component
2. SUMMARY: Write a 1-2 sentence summary of what this component does
3. VARIANTS: Document all variants with:
   - A unique ID and descriptive name
   - Description of what makes this variant different
   - Properties: the variant properties (e.g., variant: Primary, state: Hover)
4. STATES: Extract visual/interactive states from variant properties and component spec:
   - Scan variant property names for axes like "State", "Interaction", "Status", "Hover", "Focus", "Active", "Disabled", "Selected", "Pressed", "Loading", "Error", "Success", etc.
   - For each distinct state value found in variant properties, create a state entry with:
     - name: the state value (e.g., "Hover", "Focused", "Disabled", "Loading")
     - description: what observable visual or interaction cue exists in this state
   - Map variant properties that represent states (not structural variants) to the states[] array
   - Do NOT include structural variant axes like "Size", "Layout", "Orientation" as states
   - If no state-like properties are found, use empty array []
   - Do NOT invent states that are not present in the spec
5. ACCESSIBILITY: Document evidence-based accessibility output only:
   - accessibilityNotes: concise notes from observable evidence or clearly marked inferences
   - accessibilityFacts: factual or inferred statements with source set to one of: spec | inferred | assumed
   - You may mention visible focus/disabled/loading states when present
   - Do NOT claim verified keyboard behavior, focus management, or screen reader announcements from Figma alone
   - Use explicit pending markers such as "[To confirm with dev]" or "TBD" when evidence is insufficient

IMPORTANT:
- Populate all fields in the schema
- Use empty arrays "[]" if no items exist (not null)
- Keep descriptions concise but informative
- Ensure JSON is valid and matches the schema exactly`;

  return appendPolicyContext(prompt, policyContext);
}

function appendPolicyContext(prompt: string, policyContext?: string): string {
  if (!policyContext || policyContext.length === 0) {
    return prompt;
  }
  const hasExistingPolicyMarkers =
    prompt.includes('[source: ') && prompt.includes('] > ');
  if (
    prompt.includes(EDITORIAL_GUIDELINES_HEADING) ||
    hasExistingPolicyMarkers
  ) {
    return prompt;
  }
  return `${prompt}\n\n---\n${EDITORIAL_GUIDELINES_HEADING}\n\n${policyContext}`;
}

export function buildDefaultUserPromptTemplate(): string {
  return DEFAULT_USER_PROMPT_TEMPLATE;
}

interface UserPromptTemplateContext {
  componentId: string;
  componentSpecJson: string;
  existingEditorialJsonBlock: string;
}

const REQUIRED_USER_PROMPT_PLACEHOLDERS = [
  '{{componentId}}',
  '{{componentSpecJson}}',
] as const;

function renderUserPromptTemplate(
  template: string,
  context: UserPromptTemplateContext,
): string {
  for (const placeholder of REQUIRED_USER_PROMPT_PLACEHOLDERS) {
    if (!template.includes(placeholder)) {
      throw new Error(`Custom prompt template must include ${placeholder}`);
    }
  }
  return template
    .split('{{componentId}}')
    .join(context.componentId)
    .split('{{componentSpecJson}}')
    .join(context.componentSpecJson)
    .split('{{existingEditorialJsonBlock}}')
    .join(context.existingEditorialJsonBlock);
}

/**
 * Build user prompt with component spec
 * @param spec - Pruned Figma component spec
 * @param componentId - Figma component ID
 * @param existingEditorial - Optional existing editorial data to preserve/enhance
 * @returns User prompt string
 */
export function buildUserPrompt(
  spec: Record<string, unknown>,
  componentId: string,
  existingEditorial?: Record<string, unknown> | null,
  userPromptOverride?: string,
): string {
  const editorialContext =
    existingEditorial && Object.keys(existingEditorial).length > 0
      ? `\n\nEXISTING EDITORIAL DATA (preserve and enhance these fields in your output):\n\`\`\`json\n${stringifyJsonForPrompt(existingEditorial, 4000)}\n\`\`\``
      : '';
  const selectedTemplate =
    String(userPromptOverride || '').trim() || buildDefaultUserPromptTemplate();
  return renderUserPromptTemplate(selectedTemplate, {
    componentId,
    componentSpecJson: JSON.stringify(spec, null, 2),
    existingEditorialJsonBlock: editorialContext,
  });
}

/**
 * Resolve adapter for provider
 * @param provider - Provider name
 * @returns AiProvider instance
 */
export function resolveAdapter(provider: AiProviderName): AiProvider {
  if (provider === 'anthropic') {
    return createAnthropicAdapter();
  }
  if (provider === 'ollama') {
    return createOllamaAdapter();
  }
  if (provider === 'gemini') {
    return createGeminiAdapter();
  }
  if (provider === 'opencode') {
    const config = resolveProviderConfig();
    return createOpenAiAdapter(
      'opencode',
      getApiKey('opencode'),
      config.opencodeBaseUrl,
    );
  }
  return createOpenAiAdapter();
}

/**
 * Build editorial patch prompt for the 2nd LLM call.
 * Takes the generated ComponentDocOutput and existing editorial data,
 * asks the LLM to produce a structured EditorialPatch suggestion.
 */
function buildEditorialPatchPrompt(
  docOutput: ComponentDocOutput,
  existingEditorial: Record<string, unknown> | null,
  policyContext?: string,
): string {
  const policyGuidance =
    policyContext && policyContext.length > 0
      ? `\n\nEDITORIAL STYLE GUIDELINES (apply to all output):\n${policyContext}`
      : '';
  const existingContext = existingEditorial
    ? `\n\nEXISTING EDITORIAL DATA (preserve or improve):\n${stringifyJsonForPrompt(existingEditorial, 4000)}`
    : '';

  return `You are an expert design system editor. Based on the generated component documentation below, produce a structured EDITORIAL PATCH that suggests improvements to the human-authored editorial fields.${policyGuidance}

The patch should include:
- summary: purpose, when_to_use, when_not_to_use (if the docs suggest good editorial content)
- content_guidelines: rules for content that appears in/with this component
- behavior: conceptual interaction pattern and user-facing outcome (not implementation details)
- accessibility: role (ARIA), labeling rules, and notes (accessibility observations)
- qa: quality assurance checklist items specific to this component

Rules:
- Only include sections where you have concrete, useful content
- Keep items concise (1 sentence each)
- Do NOT repeat what's already in the existing editorial unless improving it
- Focus on insights from the Figma spec and generated docs
- Use both accessibilityNotes and accessibilityFacts as source evidence for accessibility output
- behavior.interactionPattern must be one of: trigger | toggle | selection | disclosure | navigation | input | compound | unknown
- Infer behavior from component name, extracted states, and purpose summary
- Do NOT claim key bindings, focus management, screen reader announcements, async internals, or multi-step flows as facts
- If such behavior must be mentioned, include a note with "[To confirm with dev]" or "TBD"
- Accessibility minimum editorial rule: always include an "accessibility" object.
- If evidence is insufficient, include at least one "accessibility.notes" item with "TBD" or "[To confirm with dev]".

COMPONENT DOCUMENTATION:${existingContext}

${stringifyJsonForPrompt(
  {
    title: docOutput.title,
    summary: docOutput.summary,
    variants: docOutput.variants?.slice(0, 5),
    states: docOutput.states?.slice(0, 10),
    accessibilityNotes: docOutput.accessibilityNotes,
    accessibilityFacts: docOutput.accessibilityFacts,
  },
  8000,
)}

Respond with a valid JSON object matching the EditorialPatch schema exactly.`;
}

function ensureMinimumAccessibilityPatch(
  patch: EditorialPatch,
  docOutput: ComponentDocOutput,
): EditorialPatch {
  const hasRole =
    typeof patch.accessibility?.role === 'string' &&
    patch.accessibility.role.trim().length > 0;
  const hasLabelingRules =
    Array.isArray(patch.accessibility?.labeling?.rules) &&
    patch.accessibility!.labeling!.rules!.length > 0;
  const hasNotes =
    Array.isArray(patch.accessibility?.notes) &&
    patch.accessibility!.notes!.length > 0;
  if (hasRole || hasLabelingRules || hasNotes) {
    return patch;
  }

  const fallbackNote =
    docOutput.accessibilityNotes[0] ||
    docOutput.accessibilityFacts[0]?.fact ||
    'TBD (pending accessibility validation). [Por confirmar con dev]';

  return {
    ...patch,
    accessibility: {
      ...patch.accessibility,
      notes: [fallbackNote],
    },
  };
}

function stringifyJsonForPrompt(value: unknown, maxChars: number): string {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized.length <= maxChars) {
    return serialized;
  }

  // Keep the original JSON shape and truncate only string values.
  // This avoids introducing metadata fields that can be misread as editorial data.
  const limits = [800, 400, 200, 120, 80, 40];
  for (const maxStringLength of limits) {
    const truncated = truncateJsonStringValues(value, maxStringLength);
    const candidate = JSON.stringify(truncated, null, 2);
    if (candidate.length <= maxChars) {
      return candidate;
    }
  }

  // Fall back to a heavily truncated, still-shape-preserving payload.
  return JSON.stringify(truncateJsonStringValues(value, 20), null, 2);
}

function truncateJsonStringValues(
  value: unknown,
  maxStringLength: number,
): unknown {
  if (typeof value === 'string') {
    if (value.length <= maxStringLength) return value;
    const cutAt = value.lastIndexOf(' ', maxStringLength);
    const safeEnd = cutAt > 0 ? cutAt : maxStringLength;
    return `${value.slice(0, safeEnd)}...`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateJsonStringValues(item, maxStringLength));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      result[key] = truncateJsonStringValues(nestedValue, maxStringLength);
    }
    return result;
  }
  return value;
}

/**
 * Create placeholder output for dry-run mode
 * @param componentId - Component ID
 * @param name - Component name from spec
 * @returns Placeholder ComponentDocOutput
 */
function createDryRunOutput(
  componentId: string,
  name?: string,
): ComponentDocOutput {
  const modelOutput: ComponentDocModelOutput = {
    schemaVersion: 2,
    componentId,
    title: `[DRY RUN] ${name || 'Unknown Component'}`,
    summary:
      'This is a dry-run placeholder output - no actual LLM call was made.',
    variants: [],
    accessibilityNotes: [],
    states: [],
    accessibilityFacts: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      provider: 'dry-run',
    },
  };
  return toComponentDocOutput(modelOutput, '');
}

/**
 * Run the component documentation generation pipeline
 * @param job - Job state
 * @param store - Jobs store
 * @param adapterOverride - Optional adapter override for testing
 * @param getSpecOverride - Optional spec fetcher override for testing
 */

/**
 * Build validation prompt for the 3rd LLM call.
 * Takes both artefacts and asks the LLM to validate consistency and quality.
 */
function buildValidationPrompt(
  docOutput: ComponentDocOutput,
  editorialPatch: EditorialPatch | null,
  policyContext?: string,
): string {
  // policyContext is already stage-budgeted/truncated by buildPromptPolicyContext('validation').
  const policyGuidance =
    policyContext && policyContext.length > 0
      ? `\n\nVALIDATION STYLE GUIDELINES (apply to all output):\n${policyContext}`
      : '';
  const editorialContext = editorialPatch
    ? `\n\nEDITORIAL PATCH (to check for contradictions):\n${stringifyJsonForPrompt(editorialPatch, 4000)}`
    : '';

  return `You are an expert design system quality inspector. Review the generated component documentation below and produce a ValidationReport that identifies any issues.${policyGuidance}

Focus on:
- Structural completeness: all required sections present and populated
- Consistency between extraction and editorial patch (no contradictions)
- Unsupported claims not backed by Figma spec
- Terminology matching the design system's canonical terms
- Accessibility: claims presented as "verified" when only inferred/assumed
- Behavior: claims about keyboard/screen-reader/focus internals presented as facts without evidence

COMPONENT DOCUMENTATION:
${stringifyJsonForPrompt(
  {
    title: docOutput.title,
    summary: docOutput.summary,
    variants: docOutput.variants?.slice(0, 5),
    states: docOutput.states?.slice(0, 10),
    accessibilityNotes: docOutput.accessibilityNotes,
    accessibilityFacts: docOutput.accessibilityFacts,
  },
  8000,
)}
${editorialContext}

Respond with a valid JSON object matching the ValidationReport schema exactly.`;
}

/**
 * Generate a ValidationReport via a 3rd LLM call.
 * Fail-open: if validation fails, job still completes but without a report.
 */
async function generateValidationReport(
  job: AiJobState,
  docOutput: ComponentDocOutput,
  editorialPatch: EditorialPatch | undefined,
  store: AiJobsStore,
  adapterOverride?: { generate: (input: unknown) => Promise<unknown> },
  getPolicyContextOverride?: PolicyContextOverride,
): Promise<ValidationReport | undefined> {
  const validationTimeout = Math.min(
    getJobTimeout(job.input.provider),
    getStageTimeoutCapMs(),
  );

  store.pushEvent(job.id, 'validation.report_calling', {
    timeoutMs: validationTimeout,
  });

  try {
    const policyContext = getPolicyContextOverride
      ? await getPolicyContextOverride('validation')
      : await buildPromptPolicyContext(REPO_ROOT, 'validation');

    const adapter = adapterOverride ?? resolveAdapter(job.input.provider);
    const userPrompt = buildValidationPrompt(
      docOutput,
      editorialPatch ?? null,
      policyContext,
    );

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = globalThis.setTimeout(
        () => reject(new Error('Validation report LLM call timed out')),
        validationTimeout,
      );
    });

    const result = (await Promise.race([
      adapter.generate({
        systemPrompt:
          'You are a JSON-only assistant. Respond with valid JSON matching the schema exactly. No explanations.',
        userPrompt,
        jsonSchema: VALIDATION_REPORT_JSON_SCHEMA as Record<string, unknown>,
        model: job.input.model,
        timeoutMs: validationTimeout,
      }),
      timeoutPromise,
    ]).finally(() => {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    })) as AiProviderResult;

    store.pushEvent(job.id, 'validation.report_received', {
      durationMs: result.usage.durationMs,
    });

    const validated = validateValidationReport(result.parsedJson);
    if (!validated.valid) {
      throw new Error(
        `Validation report validation failed: ${validated.errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`,
      );
    }

    store.pushEvent(job.id, 'validation.report_validated', {});
    return validated.report;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.pushEvent(job.id, 'validation.report_failed', { reason: msg });
    console.warn(
      `[ai-orchestrator] Validation report generation failed: ${msg}`,
    );
    return undefined;
  }
}

/**
 * Generate an EditorialPatch via a 2nd LLM call.
 * Fail-open: callers catch errors and continue without the patch.
 */
async function generateEditorialPatch(
  job: AiJobState,
  docOutput: ComponentDocOutput,
  store: AiJobsStore,
  adapterOverride?: { generate: (input: unknown) => Promise<unknown> },
  existingEditorial?: Record<string, unknown> | null,
  getPolicyContextOverride?: PolicyContextOverride,
): Promise<EditorialPatch | undefined> {
  const patchTimeout = Math.min(
    getJobTimeout(job.input.provider),
    getStageTimeoutCapMs(),
  );

  store.pushEvent(job.id, 'editorial.patch_calling', {
    timeoutMs: patchTimeout,
  });

  const policyContext = getPolicyContextOverride
    ? await getPolicyContextOverride('editorial')
    : await buildPromptPolicyContext(REPO_ROOT, 'editorial');

  const adapter = adapterOverride ?? resolveAdapter(job.input.provider);
  const userPrompt = buildEditorialPatchPrompt(
    docOutput,
    existingEditorial ?? null,
    policyContext,
  );

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(
      () => reject(new Error('Editorial patch LLM call timed out')),
      patchTimeout,
    );
  });

  const result = (await Promise.race([
    adapter.generate({
      systemPrompt:
        'You are a JSON-only assistant. Respond with valid JSON matching the schema exactly. No explanations.',
      userPrompt,
      jsonSchema: EDITORIAL_PATCH_JSON_SCHEMA as Record<string, unknown>,
      model: job.input.model,
      timeoutMs: patchTimeout,
    }),
    timeoutPromise,
  ]).finally(() => {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  })) as AiProviderResult;

  store.pushEvent(job.id, 'editorial.patch_received', {
    durationMs: result.usage.durationMs,
  });

  const validated = validateEditorialPatch(result.parsedJson);
  if (!validated.valid) {
    throw new Error(
      `Editorial patch validation failed: ${validated.errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`,
    );
  }

  const normalizedPatch = ensureMinimumAccessibilityPatch(
    validated.patch,
    docOutput,
  );
  store.pushEvent(job.id, 'editorial.patch_validated', {});
  return normalizedPatch;
}

export async function runGenerateComponentDoc(
  job: AiJobState,
  store: AiJobsStore,
  adapterOverride?: { generate: (input: any) => Promise<any> },
  getSpecOverride?: (
    fileKey: string | null,
    nodeId: string,
  ) => Promise<Record<string, unknown>>,
  getExistingEditorialOverride?: () => Promise<Record<string, unknown> | null>,
  getPolicyContextOverride?: PolicyContextOverride,
): Promise<void> {
  const jobTimeout = getJobTimeout(job.input.provider);
  const throwIfCancelled = (): void => {
    const current = store.findById(job.id);
    if (current?.status === 'cancelled') {
      throw new JobCancelledSignal();
    }
  };

  try {
    throwIfCancelled();
    // Push initial event
    store.pushEvent(job.id, 'pipeline.started', {
      componentId: job.input.componentId,
    });

    // Step 1: Extract spec from Figma using real service or override
    const fileKey = job.input.fileKey || null;
    store.pushEvent(job.id, 'figma.spec.fetching', { fileKey });

    let spec: Record<string, unknown>;
    try {
      if (getSpecOverride) {
        spec = await getSpecOverride(fileKey, job.input.componentId);
      } else {
        spec = (await getComponentSpecDirect(fileKey, {
          nodeId: job.input.componentId,
          depth: 4,
        })) as unknown as Record<string, unknown>;
      }
    } catch (error) {
      // Classify error with granularity: connection issues vs other spec failures
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isConnectionError = isLikelyFigmaConnectionError(errorMessage);
      throw {
        code: isConnectionError
          ? AI_ERROR_CODES.FIGMA_NO_CONNECTION.code
          : AI_ERROR_CODES.FIGMA_SPEC_FAILED.code,
        message: errorMessage,
        retryable: true,
      };
    }
    throwIfCancelled();

    store.pushEvent(job.id, 'figma.spec.fetched', { hasSpec: !!spec.name });

    // Step 2: Preprocess spec
    const { pruned, truncated } = pruneSpecForPrompt(spec);
    store.pushEvent(job.id, 'context.prepared', {
      charCount: JSON.stringify(pruned).length,
      truncated,
    });
    if (truncated) {
      store.pushEvent(job.id, 'context.truncated', {
        charCount: JSON.stringify(pruned).length,
      });
    }

    // Step 3: Build prompts
    let existingEditorial: Record<string, unknown> | null = null;
    if (getExistingEditorialOverride) {
      existingEditorial = await getExistingEditorialOverride();
    }
    throwIfCancelled();
    const policyContext = getPolicyContextOverride
      ? await getPolicyContextOverride('extraction')
      : await buildPromptPolicyContext(REPO_ROOT, 'extraction');
    const customSystemPrompt = String(job.input.systemPrompt || '').trim();
    const systemPrompt =
      customSystemPrompt.length > 0
        ? appendPolicyContext(customSystemPrompt, policyContext)
        : buildSystemPrompt(policyContext);
    const userPrompt = buildUserPrompt(
      pruned,
      job.input.componentId,
      existingEditorial,
      job.input.userPrompt,
    );

    // Store redacted prompt (no secrets)
    store.setPrompt(job.id, userPrompt.slice(0, 500) + '...');

    let output: ComponentDocOutput;
    let usage: {
      promptTokens: number;
      completionTokens: number;
      durationMs: number;
    };

    // Stage 1: Extraction — mark and execute
    store.setPipelineStage(job.id, 'extracting');

    // Step 4: LLM call (or skip for dry-run)
    if (job.input.dryRun) {
      store.pushEvent(job.id, 'llm.skipped', { reason: 'dryRun=true' });
      output = createDryRunOutput(
        job.input.componentId,
        String(spec.name || ''),
      );
      usage = { promptTokens: 0, completionTokens: 0, durationMs: 0 };
    } else {
      const adapter = adapterOverride ?? resolveAdapter(job.input.provider);
      store.pushEvent(job.id, 'llm.calling', {
        provider: job.input.provider,
        model: job.input.model,
      });

      try {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('LLM call timed out')),
            jobTimeout,
          );
        });

        const result = await Promise.race([
          adapter.generate({
            systemPrompt,
            userPrompt,
            jsonSchema: COMPONENT_DOC_MODEL_JSON_SCHEMA as Record<
              string,
              unknown
            >,
            model: job.input.model,
            timeoutMs: jobTimeout,
          }) as Promise<AiProviderResult>,
          timeoutPromise,
        ]).finally(() => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        });

        store.pushEvent(job.id, 'llm.completed', {
          durationMs: result.usage.durationMs,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        });
        throwIfCancelled();

        // Step 5: Validate output
        store.pushEvent(job.id, 'schema.validating', {});
        try {
          const extracted = validateComponentDocModelOutput(result.parsedJson);
          store.pushEvent(job.id, 'schema.validated', {
            schemaVersion: extracted.schemaVersion,
          });
          const modelOutput = applyAuthoritativeFigmaDescriptions(
            extracted,
            spec,
          );
          output = toComponentDocOutput(modelOutput, '');
        } catch (validationError) {
          // Schema validation failure is non-retryable
          throw {
            code: AI_ERROR_CODES.SCHEMA_INVALID.code,
            message:
              validationError instanceof Error
                ? validationError.message
                : 'Schema validation failed',
            retryable: false,
          };
        }

        // Capture real usage metrics from provider
        usage = {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          durationMs: result.usage.durationMs,
        };
      } catch (error) {
        if (error instanceof JobCancelledSignal) {
          throw error;
        }
        // Check if it's a timeout
        if (error instanceof Error && error.message === 'LLM call timed out') {
          throw {
            code: AI_ERROR_CODES.LLM_TIMEOUT.code,
            message: `LLM call exceeded timeout of ${jobTimeout}ms`,
            retryable: true,
          };
        }

        // Re-throw known errors with code
        if (error && typeof error === 'object' && 'code' in error) {
          throw error;
        }

        throw {
          code: AI_ERROR_CODES.LLM_API_ERROR.code,
          message: error instanceof Error ? error.message : 'LLM call failed',
          retryable: false,
        };
      }
    }
    throwIfCancelled();

    // Step 6: Render markdown (BASE factual only — do NOT use composite renderer here).
    // DESIGN NOTE: output.markdown is the source of truth for /apply endpoints.
    // The composite renderer (output + editorialPatch) is used ONLY in GET job preview.
    // Changing this will break apply contracts. See S-04 in Implementation Pack v1.
    const rendered = renderComponentDoc(output);
    output.markdown = rendered;
    store.pushEvent(job.id, 'render.completed', { charCount: rendered.length });

    // Stage 2: Editorial patch (fail-open — does not block job completion)
    store.setPipelineStage(job.id, 'patching');
    let editorialPatch: EditorialPatch | undefined;
    if (!job.input.dryRun) {
      try {
        editorialPatch = await generateEditorialPatch(
          job,
          output,
          store,
          adapterOverride,
          existingEditorial,
          getPolicyContextOverride,
        );
      } catch (patchError) {
        // Fail-open: log but do not block job completion
        const msg =
          patchError instanceof Error ? patchError.message : String(patchError);
        store.pushEvent(job.id, 'editorial.patch_failed', { reason: msg });
      }
    }
    throwIfCancelled();

    // Stage 3: Validation report (fail-open)
    store.setPipelineStage(job.id, 'validating');
    let validationReport: ValidationReport | undefined;
    let canPublish = true;
    if (!job.input.dryRun) {
      if (job.input.runValidation === true) {
        validationReport = await generateValidationReport(
          job,
          output,
          editorialPatch,
          store,
          adapterOverride,
          getPolicyContextOverride,
        );

        // Calculate publish gate
        if (validationReport) {
          canPublish =
            isValidationShadowMode() ||
            validationReport.severity !== 'blocking';
        }
      } else {
        // Intentional behavior: when user disables validation, do not enforce publish gate.
        // We still surface the skip event for traceability in the timeline.
        store.pushEvent(job.id, 'validation.skipped', {
          reason: 'disabled-by-user',
        });
      }
      // If validationReport is undefined (fail-open), canPublish stays true
    }
    throwIfCancelled();

    // Step 7: Complete with all artefacts
    store.complete(job.id, output, usage, editorialPatch, {
      validationReport,
      canPublish,
      pipelineSeverity: validationReport?.severity,
      pipelineScore: validationReport?.score,
    });
  } catch (error) {
    if (error instanceof JobCancelledSignal) {
      return;
    }
    // Classify error
    const err = error as {
      code?: string;
      message?: string;
      retryable?: boolean;
    };
    const code = err.code || AI_ERROR_CODES.LLM_API_ERROR.code;
    const retryable = err.retryable ?? false;
    const message = err.message || 'Unknown error';

    store.pushEvent(job.id, 'job.failed', { code, message, retryable });
    store.fail(job.id, message, code, retryable);
  } finally {
    // Cancel path already releases/dequeues in store.cancel() for running jobs.
    const current = store.findById(job.id);
    if (current?.status !== 'cancelled') {
      store.tryDequeueNext(job.input.provider);
    }
  }
}
