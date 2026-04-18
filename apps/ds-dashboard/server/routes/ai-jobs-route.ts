/**
 * AI Jobs Routes
 * HTTP endpoints for AI-powered component documentation generation
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { getAiJobsStore } from '../services/ai-jobs-store.js';
import {
  buildDefaultUserPromptTemplate,
  buildSystemPrompt,
  buildUserPrompt,
  pruneSpecForPrompt,
  runGenerateComponentDoc,
} from '../services/ai-orchestrator.js';
import { hasApiKey, resolveProviderConfig } from '../services/ai-provider.js';
import type { AiProviderName } from '../services/ai-provider.js';
import { OllamaAdapter } from '../services/ai-ollama-adapter.js';
import {
  createComponentSlug,
  renderComponentDoc,
} from '../services/ai-component-doc-renderer.js';
import { AI_ERROR_CODES } from '../services/ai-component-doc-schema.js';
import { resolveFileKeyFromManager } from '../lib/filekey-utils.ts';
import { computeDocStatusesDb } from '../services/ai-doc-status-service.js';
import { computeInMemoryDiff } from '../services/ai-diff-utils.js';
import {
  renderEditorialPatchToMarkdown,
  renderEditorialEntryToMarkdown,
} from '../services/ai-component-doc-renderer.js';
import {
  buildCanonicalKey,
  resolveDescriptionsForRender,
} from '../services/figma-descriptions-resolver.js';
import {
  getComponentSpecDirect,
  fetchVariablesDirect,
} from '../services/figma-direct-bridge-service.js';
import { buildVariableIdToTokenPathMap } from '../services/figma-db-sync-service.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get repo root (this file is in apps/ds-dashboard/server/routes/)
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const REPO_ROOT_WITH_SEP = REPO_ROOT.endsWith(path.sep)
  ? REPO_ROOT
  : `${REPO_ROOT}${path.sep}`;

function isPathWithinDirectory(targetPath: string, baseDir: string): boolean {
  const relative = path.relative(
    path.resolve(baseDir),
    path.resolve(targetPath),
  );
  return (
    relative.length > 0 &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

interface SystemContextLike {
  systemId?: unknown;
  docsDir?: unknown;
}

interface AiJobsRouteDeps {
  internalToken?: string;
  getSystemContext: (systemHeader: string) => unknown | Promise<unknown>;
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
}
const PROVIDER_ORDER: readonly AiProviderName[] = [
  'anthropic',
  'gemini',
  'ollama',
  'openai',
  'opencode',
];
const VALID_PROVIDERS: readonly AiProviderName[] = [
  'anthropic',
  'openai',
  'ollama',
  'gemini',
  'opencode',
];
const SSE_POLL_INTERVAL_MS = 1000;
const SSE_KEEPALIVE_INTERVAL_MS = 15000;
const SSE_MAX_POLL_DURATION_MS = 30 * 60 * 1000;
const PROMPT_PREVIEW_CACHE_TTL_MS = 60_000;
const PROMPT_PREVIEW_CACHE_MAX_ENTRIES = 50;

const promptPreviewSpecCache = new Map<
  string,
  {
    expiresAt: number;
    prunedSpec: Record<string, unknown>;
  }
>();

function sweepExpiredPromptPreviewCache(now: number): void {
  for (const [key, entry] of promptPreviewSpecCache.entries()) {
    if (entry.expiresAt <= now) {
      promptPreviewSpecCache.delete(key);
    }
  }
}

function setPromptPreviewCacheEntry(
  cacheKey: string,
  entry: { expiresAt: number; prunedSpec: Record<string, unknown> },
): void {
  if (promptPreviewSpecCache.has(cacheKey)) {
    promptPreviewSpecCache.delete(cacheKey);
  } else if (promptPreviewSpecCache.size >= PROMPT_PREVIEW_CACHE_MAX_ENTRIES) {
    const oldestKey = promptPreviewSpecCache.keys().next().value;
    if (oldestKey) {
      promptPreviewSpecCache.delete(oldestKey);
    }
  }
  promptPreviewSpecCache.set(cacheKey, entry);
}

type ResolveDocsContextResult =
  | {
      ok: true;
      docsComponentsDir: string;
      systemId?: string;
    }
  | {
      ok: false;
      statusCode: number;
      message: string;
    };

function normalizeHeaderValue(value: string | undefined): string {
  return String(value || '').trim();
}

function editorialToPromptContext(editorial: {
  summary?: unknown;
  accessibility?: unknown;
  contentGuidelines?: unknown;
  qa?: unknown;
  accessibilityNotes?: unknown;
}): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  if (editorial.summary) result.summary = editorial.summary;
  if (editorial.accessibility) result.accessibility = editorial.accessibility;
  if (editorial.contentGuidelines)
    result.content_guidelines = editorial.contentGuidelines;
  if (editorial.qa) result.qa = editorial.qa;
  if (editorial.accessibilityNotes)
    result.accessibility_notes = editorial.accessibilityNotes;
  return Object.keys(result).length > 0 ? result : null;
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

function extractFigmaDescriptionsFromSpec(spec: Record<string, unknown>): {
  componentSet: string | null;
  variants: Array<{
    nodeId: string;
    canonicalKey: string;
    description: string | null;
  }>;
} {
  const componentSet =
    typeof spec.description === 'string' ? spec.description.trim() : null;
  const rawVariants = Array.isArray(spec.variants) ? spec.variants : [];
  const variants: Array<{
    nodeId: string;
    canonicalKey: string;
    description: string | null;
  }> = [];

  for (const rawVariant of rawVariants) {
    if (
      !rawVariant ||
      typeof rawVariant !== 'object' ||
      Array.isArray(rawVariant)
    ) {
      continue;
    }
    const variant = rawVariant as Record<string, unknown>;
    const nodeId =
      typeof variant.nodeId === 'string' ? variant.nodeId.trim() : '';
    if (!nodeId) continue;

    const description =
      typeof variant.description === 'string'
        ? variant.description.trim()
        : null;
    if (!description) continue;
    const variantProperties = toVariantPropertiesMap(variant.variantProperties);

    variants.push({
      nodeId,
      canonicalKey: buildCanonicalKey(variantProperties),
      description,
    });
  }

  return { componentSet, variants };
}

/**
 * Resolves the documentation context used by AI job endpoints.
 * Requires a system-scoped docs directory from system context.
 */
async function resolveDocsContext(
  deps: AiJobsRouteDeps,
  options: {
    requestSystemHeader?: string;
    preferredSystemId?: string;
  },
): Promise<ResolveDocsContextResult> {
  const preferredSystemId = normalizeHeaderValue(options.preferredSystemId);
  const requestSystemHeader = normalizeHeaderValue(options.requestSystemHeader);
  const targetSystemHeader = preferredSystemId || requestSystemHeader || '';

  let contextValue: unknown;
  try {
    contextValue = await deps.getSystemContext(targetSystemHeader);
  } catch (error) {
    console.warn('[ai-jobs-route] Failed to resolve system context', {
      targetSystemHeader,
      error,
    });
    if (preferredSystemId) {
      return {
        ok: false,
        statusCode: 409,
        message:
          'The job references a design system that is no longer available.',
      };
    }
    if (requestSystemHeader) {
      return {
        ok: false,
        statusCode: 400,
        message: 'Invalid design system header.',
      };
    }
    return {
      ok: false,
      statusCode: 500,
      message: 'Failed to resolve default design system context.',
    };
  }

  if (typeof contextValue !== 'object' || contextValue === null) {
    return {
      ok: false,
      statusCode: 500,
      message: 'Design system context resolver returned an invalid value.',
    };
  }

  const context = contextValue as SystemContextLike;
  const docsDir = normalizeHeaderValue(
    typeof context.docsDir === 'string' ? context.docsDir : undefined,
  );
  if (!docsDir) {
    return {
      ok: false,
      statusCode: 500,
      message: 'Design system context does not include docsDir.',
    };
  }

  const systemId =
    normalizeHeaderValue(
      typeof context.systemId === 'string' ? context.systemId : undefined,
    ) || undefined;
  const resolvedDocsDir = path.resolve(docsDir);
  if (
    resolvedDocsDir !== REPO_ROOT &&
    !resolvedDocsDir.startsWith(REPO_ROOT_WITH_SEP)
  ) {
    console.error('[ai-jobs-route] Rejected docsDir outside repository root', {
      targetSystemHeader,
      systemId,
      docsDir,
      resolvedDocsDir,
      repoRoot: REPO_ROOT,
    });
    return {
      ok: false,
      statusCode: 500,
      message: 'Design system docs directory is invalid.',
    };
  }

  return {
    ok: true,
    docsComponentsDir: path.resolve(resolvedDocsDir, 'components'),
    systemId,
  };
}

/**
 * Request body for creating a job
 */
interface CreateJobRequest {
  type: 'GENERATE_COMPONENT_DOC';
  provider: 'anthropic' | 'openai' | 'ollama' | 'gemini' | 'opencode';
  componentId: string;
  figmaUrl?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  dryRun?: boolean;
  runValidation?: boolean;
  idempotencyKey?: string;
}

/**
 * Request body for applying a job
 */
interface ApplyJobRequest {
  outputPath?: string;
  overwrite?: boolean;
}

interface PromptPreviewRequest {
  componentId?: string;
  figmaUrl?: string;
  systemPrompt?: string;
  userPrompt?: string;
}

type ProviderHealthStatus = 'ready' | 'warning' | 'error';

interface ProviderHealthCheck {
  status: ProviderHealthStatus;
  ready: boolean;
  message: string;
}

interface FigmaHealthCheck extends ProviderHealthCheck {
  fileKey: string | null;
}

function hasExplicitProviderEnv(
  provider: CreateJobRequest['provider'],
): boolean {
  if (provider === 'anthropic') {
    return String(process.env.ANTHROPIC_API_KEY || '').trim().length > 0;
  }
  if (provider === 'openai') {
    return String(process.env.OPENAI_API_KEY || '').trim().length > 0;
  }
  if (provider === 'gemini') {
    return (
      String(process.env.GEMINI_API_KEY || '').trim().length > 0 ||
      String(process.env.GOOGLE_API_KEY || '').trim().length > 0
    );
  }
  if (provider === 'opencode') {
    return String(process.env.OPENCODE_API_KEY || '').trim().length > 0;
  }
  return (
    String(process.env.OLLAMA_BASE_URL || '').trim().length > 0 ||
    String(process.env.AI_OLLAMA_MODEL || '').trim().length > 0
  );
}

function formatProviderEnvHint(provider: CreateJobRequest['provider']): string {
  if (provider === 'anthropic') return 'ANTHROPIC_API_KEY';
  if (provider === 'ollama')
    return 'OLLAMA_BASE_URL (and optionally AI_OLLAMA_MODEL)';
  if (provider === 'gemini') return 'GEMINI_API_KEY (or GOOGLE_API_KEY)';
  if (provider === 'opencode')
    return 'OPENCODE_API_KEY (and optionally OPENCODE_BASE_URL)';
  return 'OPENAI_API_KEY';
}

function resolveDefaultModel(provider: CreateJobRequest['provider']): string {
  const config = resolveProviderConfig();
  if (provider === 'anthropic') return config.anthropicModel;
  if (provider === 'openai') return config.openaiModel;
  if (provider === 'gemini') return config.geminiModel;
  if (provider === 'opencode') return config.opencodeModel;
  return config.ollamaModel;
}

function resolveAllowedModels(
  provider: CreateJobRequest['provider'],
): string[] {
  const config = resolveProviderConfig();
  if (provider === 'anthropic') return config.anthropicAllowlist;
  if (provider === 'openai') return config.openaiAllowlist;
  if (provider === 'gemini') return config.geminiAllowlist;
  if (provider === 'opencode') return config.opencodeAllowlist;
  return [];
}

function normalizeOllamaModelName(value: string): string {
  const normalized = String(value || '').trim();
  return normalized.replace(/:latest$/i, '');
}

function ollamaModelMatches(requested: string, available: string): boolean {
  return (
    normalizeOllamaModelName(requested) === normalizeOllamaModelName(available)
  );
}

function parseOllamaModelNames(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const payload = raw as { models?: unknown };
  if (!Array.isArray(payload.models)) return [];
  const names: string[] = [];
  for (const entry of payload.models) {
    if (!entry || typeof entry !== 'object') continue;
    const name = String((entry as { name?: unknown }).name || '').trim();
    if (name) names.push(name);
  }
  return names;
}

/**
 * Auth guard helper
 */
function checkAuth(
  c: { req: { header: (name: string) => string | undefined } },
  internalToken?: string,
): boolean {
  // Allow loopback requests
  const forwarded = c.req.header('x-forwarded-for');
  const isLoopback =
    forwarded === '127.0.0.1' || forwarded === '::1' || !forwarded;

  if (isLoopback) {
    return true;
  }

  // If no token is configured, allow all requests (development mode)
  if (!internalToken) {
    return true;
  }

  // Check internal token if set
  const provided = c.req.header('x-internal-token');
  return provided === internalToken;
}

/**
 * Create error response
 */
function errorResponse(code: string, message: string, retryable = false) {
  return {
    ok: false,
    code,
    message,
    retryable,
  };
}

/**
 * Register AI jobs routes
 */
export function registerAiJobsRoutes(app: Hono, deps: AiJobsRouteDeps) {
  const store = getAiJobsStore();
  store.setOnJobStarted((job) => {
    const getSpecWithFigmaDescriptionSync = deps.componentRepo
      ? async (fileKey: string | null, nodeId: string) => {
          const spec = (await getComponentSpecDirect(fileKey, {
            nodeId,
            depth: 4,
          })) as unknown as Record<string, unknown>;

          // Keep preview markdown aligned with latest Figma descriptions for this run.
          // Fail-open: generation must continue even if DB sync fails.
          try {
            const component = deps.componentRepo!.getComponentByFigmaNodeId(
              job.input.componentId,
              job.input.systemId,
            );
            if (component) {
              const extracted = extractFigmaDescriptionsFromSpec(spec);
              deps.componentRepo!.saveFigmaDescriptions(component.id, {
                componentSet: extracted.componentSet,
                syncedAt: Math.floor(Date.now() / 1000),
                variants: extracted.variants,
              });

              // Persist token bindings so VariableIDs resolve in AI suggestions.
              // Fail-open: generation must continue even if this fails.
              try {
                const rawBindings = Array.isArray(
                  (spec as Record<string, unknown>).tokenBindings,
                )
                  ? ((spec as Record<string, unknown>).tokenBindings as Array<
                      Record<string, unknown>
                    >)
                  : [];
                if (rawBindings.length > 0) {
                  const variablesResp = await fetchVariablesDirect(fileKey);
                  const variableIdToTokenPath = buildVariableIdToTokenPathMap(
                    variablesResp.meta,
                  );
                  const bindings = rawBindings.map((b) => ({
                    nodeId: String(b.nodeId || '').trim(),
                    nodeName: String(b.nodeName || '').trim(),
                    field: String(b.field || '').trim(),
                    variableId: String(b.variableId || '').trim(),
                    tokenPath: variableIdToTokenPath.get(
                      String(b.variableId || '').trim(),
                    ),
                  }));
                  deps.componentRepo!.saveTokenBindingsForComponent(
                    component.id,
                    bindings,
                  );
                } else {
                  // No bindings in this spec — clear stale mappings
                  // from previous captures so VariableIDs don't resolve to old tokens.
                  deps.componentRepo!.saveTokenBindingsForComponent(
                    component.id,
                    [],
                  );
                }
              } catch (bindingError) {
                console.warn(
                  '[ai-jobs-route] Failed to persist token bindings from generation spec',
                  {
                    jobId: job.id,
                    componentId: job.input.componentId,
                    error: bindingError,
                  },
                );
              }
            }
          } catch (error) {
            console.warn(
              '[ai-jobs-route] Failed to persist Figma descriptions from generation spec',
              {
                jobId: job.id,
                componentId: job.input.componentId,
                error,
              },
            );
          }

          return spec;
        }
      : undefined;

    const getExistingEditorial = deps.componentRepo
      ? async () => {
          try {
            const figmaNodeId = job.input.componentId;
            if (!figmaNodeId) return null;
            const component = deps.componentRepo!.getComponentByFigmaNodeId(
              figmaNodeId,
              job.input.systemId,
            );
            if (!component) return null;
            const editorial = deps.componentRepo!.getEditorial(component.id);
            if (!editorial) return null;
            return editorialToPromptContext(editorial);
          } catch (error) {
            console.warn(
              '[ai-jobs-route] Failed to load existing editorial context',
              {
                jobId: job.id,
                componentId: job.input.componentId,
                error,
              },
            );
            return null;
          }
        }
      : undefined;

    runGenerateComponentDoc(
      job,
      store,
      undefined,
      getSpecWithFigmaDescriptionSync,
      getExistingEditorial,
    ).catch((err) => {
      console.error('Job pipeline error:', err);
    });
  });

  // GET /api/ai/providers/configured - Provider preference from explicit env vars
  app.get('/api/ai/providers/configured', async (c) => {
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    const configuredProviders = PROVIDER_ORDER.filter((provider) =>
      hasExplicitProviderEnv(provider),
    );
    const defaultProvider =
      configuredProviders.length > 0 ? configuredProviders[0] : null;

    return c.json({
      ok: true,
      configuredProviders,
      defaultProvider,
    });
  });

  // GET /api/ai/providers/health - Preflight checks for Figma/plugin + provider + model
  app.get('/api/ai/providers/health', async (c) => {
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    const provider = String(
      c.req.query('provider') || '',
    ).trim() as CreateJobRequest['provider'];
    const modelOverride = String(c.req.query('model') || '').trim();
    const figmaUrl = String(c.req.query('figmaUrl') || '').trim();
    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return c.json(
        errorResponse(
          'ai.input.invalid',
          'provider must be anthropic, openai, ollama, gemini, or opencode',
        ),
        400,
      );
    }

    const defaultModel = resolveDefaultModel(provider);
    const effectiveModel = modelOverride || defaultModel;

    const figmaResolved = resolveFileKeyFromManager(figmaUrl || undefined, {
      ambiguous: AI_ERROR_CODES.FIGMA_NO_CONNECTION.code,
      noSocket: AI_ERROR_CODES.FIGMA_NO_CONNECTION.code,
      ambiguousMessage:
        'Multiple plugin connections detected. Provide a Figma URL to disambiguate.',
      noSocketMessage: 'No plugin WebSocket connection available.',
    });
    const figmaCheck: FigmaHealthCheck =
      'fileKey' in figmaResolved
        ? {
            status: 'ready',
            ready: true,
            fileKey: figmaResolved.fileKey,
            message: figmaResolved.fileKey
              ? `Connected to Figma file ${figmaResolved.fileKey}.`
              : 'Figma plugin connected.',
          }
        : {
            status: figmaResolved.message.includes(
              'Multiple plugin connections',
            )
              ? 'warning'
              : 'error',
            ready: false,
            fileKey: null,
            message: figmaResolved.message,
          };

    let providerCheck: ProviderHealthCheck = {
      status: 'ready',
      ready: true,
      message: 'Provider credentials are configured.',
    };
    let modelCheck: ProviderHealthCheck = {
      status: 'ready',
      ready: true,
      message: `Model "${effectiveModel}" is ready.`,
    };

    if (provider === 'ollama') {
      const baseUrl = OllamaAdapter.configuredBaseUrl;
      let tagsResponse: Response | null = null;
      try {
        tagsResponse = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        tagsResponse = null;
      }

      if (!tagsResponse?.ok) {
        const suffix = tagsResponse ? ` (HTTP ${tagsResponse.status})` : '';
        providerCheck = {
          status: 'error',
          ready: false,
          message: `Ollama is not reachable at ${baseUrl}${suffix}.`,
        };
        modelCheck = {
          status: 'error',
          ready: false,
          message: `Cannot verify model "${effectiveModel}" because Ollama is unreachable.`,
        };
      } else {
        providerCheck = {
          status: 'ready',
          ready: true,
          message: `Ollama reachable at ${baseUrl}.`,
        };
        try {
          const body = await tagsResponse.json();
          const available = parseOllamaModelNames(body);
          const exists = available.some((name) =>
            ollamaModelMatches(effectiveModel, name),
          );
          modelCheck = exists
            ? {
                status: 'ready',
                ready: true,
                message: `Model "${effectiveModel}" is available in Ollama.`,
              }
            : {
                status: 'error',
                ready: false,
                message: `Model "${effectiveModel}" is not available. Run: ollama pull ${effectiveModel}`,
              };
        } catch (error) {
          modelCheck = {
            status: 'warning',
            ready: false,
            message: `Could not verify model list: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    } else {
      const hasKey = hasApiKey(provider);
      providerCheck = hasKey
        ? {
            status: 'ready',
            ready: true,
            message: 'Provider API key is configured.',
          }
        : {
            status: 'error',
            ready: false,
            message: `Missing ${formatProviderEnvHint(provider)}.`,
          };

      if (!hasKey) {
        modelCheck = {
          status: 'warning',
          ready: false,
          message: `Cannot verify model "${effectiveModel}" until provider credentials are configured.`,
        };
      } else {
        const allowlist = resolveAllowedModels(provider);
        if (modelOverride && !allowlist.includes(modelOverride)) {
          modelCheck = {
            status: 'warning',
            ready: false,
            message: `Model "${modelOverride}" is not in the allowlist; default "${defaultModel}" will be used.`,
          };
        } else {
          modelCheck = {
            status: 'ready',
            ready: true,
            message: `Model "${effectiveModel}" is configured.`,
          };
        }
      }
    }

    const overallReady =
      figmaCheck.ready && providerCheck.ready && modelCheck.ready;
    return c.json({
      ok: true,
      provider,
      model: effectiveModel,
      checks: {
        figma: figmaCheck,
        provider: providerCheck,
        model: modelCheck,
      },
      overallReady,
      checkedAt: Date.now(),
    });
  });

  // GET /api/ai/prompts/defaults - Default prompts for AI docs generation
  app.get('/api/ai/prompts/defaults', async (c) => {
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    return c.json({
      ok: true,
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildDefaultUserPromptTemplate(),
      placeholders: [
        '{{componentId}}',
        '{{componentSpecJson}}',
        '{{existingEditorialJsonBlock}}',
      ],
    });
  });

  // POST /api/ai/prompts/preview - Build rendered prompts before creating a job
  app.post('/api/ai/prompts/preview', async (c) => {
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    let body: PromptPreviewRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        errorResponse('ai.input.invalid', 'Invalid JSON body'),
        400,
      );
    }

    const componentId = String(body.componentId || '').trim();
    if (!componentId) {
      return c.json(
        errorResponse('ai.input.invalid', 'componentId is required'),
        400,
      );
    }

    const figmaUrl = String(body.figmaUrl || '').trim();
    const resolvedFigmaUrl = figmaUrl.length > 0 ? figmaUrl : undefined;
    const systemPrompt =
      String(body.systemPrompt || '').trim() || buildSystemPrompt();

    let promptSpec: Record<string, unknown> = {
      componentId,
      name: 'Component',
      type: 'COMPONENT_SET',
    };
    let specSource: 'figma' | 'fallback' = 'fallback';
    let warning: string | undefined;

    const resolved = resolveFileKeyFromManager(resolvedFigmaUrl, {
      ambiguous: AI_ERROR_CODES.FIGMA_NO_CONNECTION.code,
      noSocket: AI_ERROR_CODES.FIGMA_NO_CONNECTION.code,
      ambiguousMessage:
        'Multiple plugin connections detected. Provide figmaUrl to disambiguate.',
      noSocketMessage: 'No plugin WebSocket connection available.',
    });

    if ('fileKey' in resolved && resolved.fileKey) {
      try {
        const cacheKey = `${resolved.fileKey}:${componentId}`;
        const now = Date.now();
        sweepExpiredPromptPreviewCache(now);
        const cached = promptPreviewSpecCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
          promptSpec = cached.prunedSpec;
        } else {
          const rawSpec = await getComponentSpecDirect(resolved.fileKey, {
            nodeId: componentId,
            depth: 4,
          });
          const { pruned } = pruneSpecForPrompt(rawSpec);
          promptSpec = pruned;
          setPromptPreviewCacheEntry(cacheKey, {
            expiresAt: now + PROMPT_PREVIEW_CACHE_TTL_MS,
            prunedSpec: pruned,
          });
        }
        specSource = 'figma';
      } catch (error) {
        warning = `Could not fetch Figma spec for preview: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else if (resolvedFigmaUrl) {
      return c.json(
        errorResponse(
          resolved.code,
          resolved.message,
          AI_ERROR_CODES.FIGMA_NO_CONNECTION.retryable,
        ),
        503,
      );
    } else if (!('fileKey' in resolved)) {
      warning = `${resolved.message} Using fallback preview spec.`;
    }

    let userPrompt: string;
    try {
      userPrompt = buildUserPrompt(
        promptSpec,
        componentId,
        null,
        String(body.userPrompt || '').trim() || undefined,
      );
    } catch (error) {
      return c.json(
        errorResponse(
          AI_ERROR_CODES.INPUT_INVALID.code,
          error instanceof Error ? error.message : 'Invalid prompt template',
          AI_ERROR_CODES.INPUT_INVALID.retryable,
        ),
        400,
      );
    }

    return c.json({
      ok: true,
      systemPrompt,
      userPrompt,
      componentId,
      specSource,
      warning,
    });
  });

  // POST /api/ai/jobs - Create a new job
  app.post('/api/ai/jobs', async (c) => {
    // Auth check
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    // Parse body
    let body: CreateJobRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        errorResponse('ai.input.invalid', 'Invalid JSON body'),
        400,
      );
    }

    // Validate required fields
    if (!body.type || body.type !== 'GENERATE_COMPONENT_DOC') {
      return c.json(
        errorResponse(
          'ai.input.invalid',
          'type must be GENERATE_COMPONENT_DOC',
        ),
        400,
      );
    }
    if (!body.provider || !VALID_PROVIDERS.includes(body.provider)) {
      return c.json(
        errorResponse(
          'ai.input.invalid',
          'provider must be anthropic, openai, ollama, gemini, or opencode',
        ),
        400,
      );
    }
    if (!body.componentId || typeof body.componentId !== 'string') {
      return c.json(
        errorResponse('ai.input.invalid', 'componentId is required'),
        400,
      );
    }
    if (
      body.runValidation !== undefined &&
      typeof body.runValidation !== 'boolean'
    ) {
      return c.json(
        errorResponse(
          'ai.input.invalid',
          'runValidation must be a boolean when provided',
        ),
        400,
      );
    }

    // Check API key exists (not required for Ollama)
    if (body.provider !== 'ollama' && !hasApiKey(body.provider)) {
      return c.json(
        errorResponse(
          'ai.input.missing_provider_key',
          `API key not set for ${body.provider}. Set ${
            body.provider === 'anthropic'
              ? 'ANTHROPIC_API_KEY'
              : body.provider === 'gemini'
                ? 'GEMINI_API_KEY (or GOOGLE_API_KEY)'
                : 'OPENAI_API_KEY'
          } environment variable.`,
        ),
        400,
      );
    }

    const figmaUrl =
      typeof body.figmaUrl === 'string' && body.figmaUrl.trim()
        ? body.figmaUrl.trim()
        : undefined;

    // Resolve file key via plugin connection manager utility
    const resolved = resolveFileKeyFromManager(figmaUrl, {
      ambiguous: AI_ERROR_CODES.FIGMA_NO_CONNECTION.code,
      noSocket: AI_ERROR_CODES.FIGMA_NO_CONNECTION.code,
      ambiguousMessage:
        'Multiple plugin connections detected. Provide figmaUrl to disambiguate.',
      noSocketMessage: 'No plugin WebSocket connection available.',
    });

    if (!('fileKey' in resolved)) {
      // For requests without figmaUrl, allow enqueue even if no socket is currently connected.
      // The job may still fail later at extraction time with a taxonomy-mapped retryable error.
      if (
        !figmaUrl &&
        resolved.code === AI_ERROR_CODES.FIGMA_NO_CONNECTION.code
      ) {
        // continue with undefined fileKey
      } else {
        return c.json(
          errorResponse(
            resolved.code,
            resolved.message,
            AI_ERROR_CODES.FIGMA_NO_CONNECTION.retryable,
          ),
          503,
        );
      }
    }
    const fileKey =
      'fileKey' in resolved ? (resolved.fileKey ?? undefined) : undefined;
    const docsContext = await resolveDocsContext(deps, {
      requestSystemHeader: c.req.header('x-ds-system'),
    });
    if (!docsContext.ok) {
      return c.json(
        errorResponse('ai.input.invalid', docsContext.message),
        docsContext.statusCode,
      );
    }

    // Health-check for Ollama before enqueue
    if (body.provider === 'ollama') {
      const ollamaBaseUrl = OllamaAdapter.configuredBaseUrl;
      const alive = await OllamaAdapter.isAvailable();
      if (!alive) {
        return c.json(
          errorResponse(
            AI_ERROR_CODES.AI_OLLAMA_UNAVAILABLE.code,
            'Ollama is not reachable at ' + ollamaBaseUrl,
            true,
          ),
          503,
        );
      }
    }

    let job;
    try {
      job = store.enqueue({
        type: body.type,
        provider: body.provider,
        ...(docsContext.systemId ? { systemId: docsContext.systemId } : {}),
        componentId: body.componentId,
        fileKey,
        figmaUrl,
        model: body.model,
        systemPrompt:
          typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
        userPrompt:
          typeof body.userPrompt === 'string' ? body.userPrompt : undefined,
        dryRun: body.dryRun,
        runValidation: body.runValidation === true,
        idempotencyKey: body.idempotencyKey,
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        const err = error as {
          code: string;
          message: string;
          retryable: boolean;
        };
        // Map error codes to appropriate HTTP status codes
        let statusCode: 400 | 429 | 503 = 400; // Default for client errors

        if (err.code === 'ai.job.queue_full') {
          // Queue full is a temporary server condition (retryable)
          statusCode = 503; // Service Unavailable
        } else if (
          err.code === 'ai.figma.no_connection' ||
          err.code === 'ai.figma.spec_failed'
        ) {
          // Figma connectivity issues are temporary (retryable)
          statusCode = 503; // Service Unavailable
        } else if (
          err.code === 'ai.llm.timeout' ||
          err.code === 'ai.llm.rate_limited' ||
          err.code === 'ai.llm.api_error'
        ) {
          // LLM issues are temporary (retryable)
          statusCode = err.code === 'ai.llm.rate_limited' ? 429 : 503;
        } else if (err.retryable) {
          // Generic retryable errors -> 503
          statusCode = 503;
        }
        // Non-retryable input errors remain 400

        return c.json(
          errorResponse(err.code, err.message, err.retryable),
          statusCode,
        );
      }
      return c.json(
        errorResponse('ai.input.invalid', 'Failed to create job'),
        500,
      );
    }

    // Try to dequeue immediately to start execution if slot available.
    // This should never fail request creation, because the job is already persisted.
    try {
      store.tryDequeue(body.provider);
    } catch (dequeueError) {
      console.error('[ai-jobs-route] Failed to start queued job immediately', {
        provider: body.provider,
        jobId: job.id,
        error: dequeueError,
      });
      const retryProvider = body.provider;
      const retryJobId = job.id;
      const retryTimer = setTimeout(() => {
        try {
          store.tryDequeue(retryProvider);
        } catch (retryError) {
          console.error('[ai-jobs-route] Retry dequeue failed', {
            provider: retryProvider,
            jobId: retryJobId,
            error: retryError,
          });
        }
      }, 5000);
      if (typeof retryTimer.unref === 'function') {
        retryTimer.unref();
      }
    }

    // Return status of the requested job, not dequeued job
    return c.json(
      {
        ok: true,
        jobId: job.id,
        status: job.status,
      },
      202,
    );
  });

  // GET /api/ai/docs/status - Get documentation staleness status
  app.get('/api/ai/docs/status', async (c) => {
    // Auth check
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    const docsContext = await resolveDocsContext(deps, {
      requestSystemHeader: c.req.header('x-ds-system'),
    });
    if (!docsContext.ok) {
      return c.json(
        errorResponse('ai.input.invalid', docsContext.message),
        docsContext.statusCode,
      );
    }

    try {
      // DB-first staleness
      if (!deps.componentRepo) {
        return c.json(
          errorResponse(
            'ai.status.unavailable',
            'Component repository not available',
          ),
          503,
        );
      }
      const repo = deps.componentRepo;
      const result = computeDocStatusesDb(repo, docsContext.systemId);
      return c.json(result);
    } catch (error) {
      console.error('Error computing doc statuses:', error);
      return c.json(
        errorResponse(
          'ai.status.computation_failed',
          'Failed to compute doc statuses',
        ),
        500,
      );
    }
  });

  // GET /api/ai/jobs/:id - Get job status
  app.get('/api/ai/jobs/:id', async (c) => {
    // Auth check
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    const jobId = c.req.param('id');
    const job = store.findById(jobId);

    if (!job) {
      return c.json(errorResponse('ai.job.not_found', 'Job not found'), 404);
    }

    // Compute done flag from terminal statuses
    const done =
      job.status === 'completed' ||
      job.status === 'failed' ||
      job.status === 'cancelled';

    // Compute nextCursor (null if done, otherwise polling hint)
    const nextCursor = done ? null : 'poll';

    // Compute previewMarkdown (composite: output + editorialPatch) for preview UI only.
    // DESIGN NOTE: this does NOT affect output.markdown which remains the base factual version.
    // S-08: Enrich with Figma descriptions from DB (DB always wins over AI).
    let previewMarkdown: string | undefined;
    if (job.status === 'completed' && job.output) {
      try {
        // Resolve Figma descriptions for this job's component
        let figmaDescriptions = null;
        if (deps.componentRepo && job.input?.componentId) {
          try {
            const component = await deps.componentRepo.getComponentByFigmaNodeId(
              job.input.componentId,
              job.input.systemId,
            );
            if (component) {
              const dbDesc = await deps.componentRepo.getFigmaDescriptions(
                component.id,
              );
              figmaDescriptions = resolveDescriptionsForRender(dbDesc);
            }
          } catch {
            // Fail-open: preview renders without descriptions
          }
        }

        previewMarkdown = renderComponentDoc(
          {
            output: job.output,
            editorialPatch: job.editorialPatch ?? null,
          },
          figmaDescriptions,
        );
      } catch {
        // Fallback to base markdown if composite render fails
        previewMarkdown = job.output.markdown;
      }
    }

    return c.json({
      ok: true,
      id: job.id,
      status: job.status,
      input: job.input,
      output: job.output,
      editorialPatch: job.editorialPatch ?? null,
      error: job.error,
      errorCode: job.errorCode,
      retryable: job.retryable,
      events: job.events,
      usage: job.usage,
      hasEditorialPatch: !!job.editorialPatch,
      validationReport: job.validationReport,
      canPublish: job.canPublish,
      pipelineStage: job.pipelineStage,
      pipelineSeverity: job.pipelineSeverity,
      pipelineScore: job.pipelineScore,
      previewMarkdown,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      done,
      nextCursor,
    });
  });

  // GET /api/ai/jobs/:id/events - SSE for job events
  //
  // Contract:
  // - Cursor precedence: Last-Event-ID header > query param 'cursor' > default 0
  // - Events are emitted with id, event, data fields
  // - Terminal event 'done' is emitted when job reaches terminal state
  // - Keepalive ':' events sent every 15s to prevent proxy timeouts
  // - Client can reconnect using Last-Event-ID to resume from last seen event
  app.get('/api/ai/jobs/:id/events', async (c) => {
    // Auth check
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    const jobId = c.req.param('id');

    // Cursor precedence: Last-Event-ID header > query cursor > default 0
    // This follows EventSource spec for reliable reconnection
    const lastEventId = c.req.header('Last-Event-ID');
    const queryCursor = c.req.query('cursor');

    let cursorNum = 0;
    if (lastEventId !== undefined && lastEventId !== '') {
      cursorNum = parseInt(lastEventId, 10) || 0;
    } else if (queryCursor !== undefined) {
      cursorNum = parseInt(queryCursor, 10) || 0;
    }

    const job = store.findById(jobId);
    if (!job) {
      return c.json(errorResponse('ai.job.not_found', 'Job not found'), 404);
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const signal = c.req.raw.signal;

    // State variables shared between start and cancel
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let controllerRef: ReadableStreamDefaultController | null = null;

    const closeStream = () => {
      if (closed) {
        return;
      }
      closed = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      // Close the controller if available
      if (controllerRef) {
        try {
          controllerRef.close();
        } catch {
          /* already closed */
        }
        controllerRef = null;
      }
    };

    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
        let lastSeq = cursorNum;
        let lastKeepalive = Date.now();
        const startTime = Date.now();

        signal.addEventListener('abort', closeStream, { once: true });

        // Send existing events first
        const sendNewEvents = () => {
          if (closed || signal.aborted) {
            closeStream();
            return;
          }
          if (Date.now() - startTime > SSE_MAX_POLL_DURATION_MS) {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  code: 'ai.events.timeout',
                  message: 'Job event stream polling timeout exceeded.',
                })}\n\n`,
              ),
            );
            closeStream();
            return;
          }

          // Get fresh job reference
          const currentJob = store.findById(jobId);
          if (!currentJob) {
            closeStream();
            return;
          }

          const newEvents = currentJob.events.filter((e) => e.seq > lastSeq);
          for (const evt of newEvents) {
            controller.enqueue(
              encoder.encode(
                `id: ${evt.seq}\ndata: ${JSON.stringify(evt)}\n\n`,
              ),
            );
            lastSeq = evt.seq;
          }

          // Check for terminal state
          if (
            currentJob.status === 'completed' ||
            currentJob.status === 'failed' ||
            currentJob.status === 'cancelled'
          ) {
            controller.enqueue(
              encoder.encode(
                `event: done\ndata: ${JSON.stringify({ status: currentJob.status })}\n\n`,
              ),
            );
            closeStream();
            return;
          }

          // Keepalive
          if (Date.now() - lastKeepalive > SSE_KEEPALIVE_INTERVAL_MS) {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
            lastKeepalive = Date.now();
          }

          // Continue polling
          timeoutId = setTimeout(sendNewEvents, SSE_POLL_INTERVAL_MS);
        };

        // Start polling
        sendNewEvents();
      },
      cancel() {
        // Cleanup when client disconnects
        closeStream();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  });

  // POST /api/ai/jobs/:id/apply - Apply generated documentation (DB-first, S-10)
  // Contract change: response is { ok, componentId, appliedAt } — no path/checksum.
  app.post('/api/ai/jobs/:id/apply', async (c) => {
    // Auth check
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    const jobId = c.req.param('id');
    const job = store.findById(jobId);

    if (!job) {
      return c.json(errorResponse('ai.job.not_found', 'Job not found'), 404);
    }

    if (job.status !== 'completed') {
      return c.json(
        errorResponse('ai.job.not_completed', 'Job must be completed to apply'),
        409,
      );
    }

    // Gate: enforce persisted publication decision from the pipeline.
    if (job.canPublish === false) {
      return c.json(
        errorResponse(
          AI_ERROR_CODES.VALIDATION_BLOCKED.code,
          'ValidationReport severity: blocking — cannot apply documentation.',
        ),
        422,
      );
    }

    if (!job.output) {
      return c.json(
        errorResponse('ai.job.no_output', 'Job has no output to apply'),
        400,
      );
    }

    // S-10: Resolve component and save to DB (no disk write)
    if (!deps.componentRepo) {
      return c.json(
        errorResponse('ai.apply.no_repo', 'Component repository not available'),
        503,
      );
    }

    // Guard against cross-system apply on the same job id.
    const requestSystemHeader = c.req.header('x-ds-system');
    if (
      requestSystemHeader &&
      job.input.systemId &&
      requestSystemHeader !== job.input.systemId
    ) {
      return c.json(
        errorResponse(
          'ai.input.conflict',
          'Requested design system does not match the job design system.',
        ),
        409,
      );
    }

    // Resolve component by figma node id from the job input.
    // Prefer persisted job.systemId; fallback to request header for legacy jobs.
    const systemId = job.input.systemId ?? requestSystemHeader ?? undefined;
    let component: { id: number; slug: string } | null = null;
    try {
      component = await deps.componentRepo.getComponentByFigmaNodeId(
        job.input.componentId,
        systemId,
      );
    } catch (error) {
      console.error('[ai-jobs-route] Failed to resolve component for apply', {
        jobId: job.id,
        componentId: job.input.componentId,
        systemId,
        error,
      });
      return c.json(
        errorResponse(
          'ai.apply.lookup_failed',
          'Failed to resolve target component for apply',
        ),
        500,
      );
    }

    if (!component) {
      return c.json(
        errorResponse(
          'ai.apply.no_component',
          'No matching component found in the catalog',
        ),
        404,
      );
    }

    // Serialize output and editorial patch for DB storage
    let outputJson: string;
    let editorialJson: string | null = null;
    try {
      outputJson = JSON.stringify(job.output);
      if (job.editorialPatch) {
        editorialJson = JSON.stringify(job.editorialPatch);
      }
    } catch (error) {
      console.error('[ai-jobs-route] Failed to serialize apply payload', {
        jobId: job.id,
        error,
      });
      return c.json(
        errorResponse(
          'ai.apply.serialization_failed',
          'Failed to serialize generated documentation',
        ),
        500,
      );
    }

    // Upsert into component_docs (one active doc per component)
    await deps.componentRepo.saveComponentDoc(component.id, {
      outputJson,
      editorialJson,
      jobId: job.id,
    });

    return c.json({
      ok: true,
      componentId: component.id,
      appliedAt: Math.floor(Date.now() / 1000),
    });
  });

  // GET /api/ai/jobs/:id/diff - Get diff between proposed editorial patch and existing DB editorial
  app.get('/api/ai/jobs/:id/diff', async (c) => {
    // Auth check
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    const jobId = c.req.param('id');
    const job = store.findById(jobId);

    if (!job) {
      return c.json(errorResponse('ai.job.not_found', 'Job not found'), 404);
    }

    if (job.status !== 'completed' || !job.output) {
      return c.json(
        errorResponse(
          'ai.job.not_completed',
          'Job must be completed to get diff',
        ),
        400,
      );
    }

    const countLines = (content: string): number =>
      content === '' ? 0 : content.split('\n').length;

    // No editorial patch (e.g. Ollama without stage 3) → no previous to compare
    if (!job.editorialPatch) {
      const newLines = countLines(job.output.markdown);
      return c.json({
        hasPrevious: false,
        diff: '',
        stats: { added: newLines, removed: 0, unchanged: 0 },
      });
    }

    // Component repo required for DB lookup
    if (!deps.componentRepo) {
      return c.json(
        errorResponse('ai.input.invalid', 'Component repository not available'),
        503,
      );
    }

    let component;
    let existingEditorial;
    try {
      const systemId =
        job.input.systemId ?? c.req.header('x-ds-system') ?? undefined;
      component = await deps.componentRepo.getComponentByFigmaNodeId(
        job.input.componentId,
        systemId,
      );
      existingEditorial = component
        ? await deps.componentRepo.getEditorial(component.id)
        : null;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        '[ai-jobs-route] Failed to resolve component or editorial for diff:',
        reason,
        {
          jobId,
          componentId: job.input.componentId,
        },
      );
      return c.json(
        errorResponse(
          'ai.diff.computation_failed',
          'Failed to resolve component editorial data',
        ),
        500,
      );
    }

    // Render both sides to markdown for comparison
    const previousMarkdown = existingEditorial
      ? renderEditorialEntryToMarkdown(existingEditorial)
      : '';
    const newMarkdown = renderEditorialPatchToMarkdown(job.editorialPatch);

    // If no previous editorial exists, all content is new
    const diffResult = await computeInMemoryDiff(
      existingEditorial ? previousMarkdown : null,
      newMarkdown,
    );
    return c.json(diffResult);
  });

  // POST /api/ai/jobs/:id/cancel - Cancel a job
  app.post('/api/ai/jobs/:id/cancel', async (c) => {
    // Auth check
    if (!checkAuth(c, deps.internalToken)) {
      return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
    }

    const jobId = c.req.param('id');
    const job = store.findById(jobId);

    if (!job) {
      return c.json(errorResponse('ai.job.not_found', 'Job not found'), 404);
    }

    if (
      job.status !== 'queued' &&
      job.status !== 'pending' &&
      job.status !== 'running'
    ) {
      return c.json(
        errorResponse('ai.job.not_cancelable', 'Job cannot be cancelled'),
        409,
      );
    }

    store.cancel(jobId);

    return c.json({
      ok: true,
      jobId,
      status: 'cancelled',
    });
  });
}
