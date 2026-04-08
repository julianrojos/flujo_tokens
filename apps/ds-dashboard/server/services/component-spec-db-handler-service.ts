/**
 * Component Spec DB Handler Service
 * 
 * Handles GET and PATCH /editorial requests for component specs.
 * All data is read from and written to SQLite DB (no filesystem).
 */

import type { ComponentRepository } from '../db/component-repository.js';
import type { EditorialEntry, StructuredFigmaData } from '../db/component-repository.js';
import type { PartialComponentSpec } from 'ds-types';
import type { Context } from 'hono';

interface ComponentSpecHandlerDeps {
  componentRepo: ComponentRepository;
  getSystemContext: (systemHeader?: string) => { systemId: string; repoRoot: string };
  failJson: (ctx: Context, status: number, payload: { code: string; userMessage: string;[key: string]: unknown }) => Response;
}

/**
 * Build a complete PartialComponentSpec from DB sources
 */
function buildSpecFromDb(params: {
  editorial: EditorialEntry | null;
  structured: StructuredFigmaData | undefined;
  figmaFileUrl?: string;
  figmaComponentSetNodeId?: string;
}): PartialComponentSpec {
  const { editorial, structured, figmaFileUrl, figmaComponentSetNodeId } = params;
  const hasFigmaMetadata =
    Boolean(structured?.pageName) ||
    Boolean(figmaComponentSetNodeId) ||
    Boolean(figmaFileUrl);

  const spec: PartialComponentSpec = {
    // Editorial fields (null if not yet created)
    summary: editorial?.summary ?? null,
    best_practices: editorial?.bestPractices ?? null,
    accessibility: editorial?.accessibility
      ? {
        ...editorial.accessibility,
        notes: editorial.accessibilityNotes ?? undefined,
      }
      : editorial?.accessibilityNotes
        ? { notes: editorial.accessibilityNotes }
        : null,
    content_guidelines: editorial?.contentGuidelines ?? null,
    related_components: editorial?.relatedComponents ?? null,
    token_mapping: editorial?.tokenMapping ?? null,
    qa: editorial?.qa ?? null,
    variants: editorial?.variants ?? null,
    tokens: editorial?.tokens ?? null,

    // Additional structured data
    variant_visuals: structured?.variants?.map((v) => ({
      name: v.name,
      properties: v.properties,
    })) ?? [],

    layout: structured?.layout,

    // Figma metadata
    figma_metadata: hasFigmaMetadata
      ? {
        page_name: structured?.pageName ?? null,
        component_set_node_id: figmaComponentSetNodeId ?? null,
        file_url: figmaFileUrl ?? null,
      }
      : null,

    // Raw token bindings for reference
    figma_token_bindings: structured?.tokenBindings?.map((binding) => ({
      node_id: binding.nodeId,
      node_name: binding.nodeName,
      field: binding.field,
      variable_id: binding.variableId,
      token_path: binding.tokenPath ?? null,
      mode: binding.mode ?? null,
    })),
  };

  return spec;
}

/**
 * GET /api/component-spec/:slug handler
 *
 * Returns a complete spec (editorial + structural) for a component.
 * Never returns 404 for missing editorial - returns exists: false instead.
 */
export async function handleGetComponentSpecRoute(
  c: Context,
  deps: ComponentSpecHandlerDeps,
): Promise<Response> {
  const { componentRepo, getSystemContext, failJson } = deps;
  const slug = c.req.param('slug');

  if (!slug) {
    return failJson(c, 400, {
      code: 'invalid.slug',
      userMessage: 'Slug is required',
    });
  }

  const sysCtx = getSystemContext(c.req.header('x-ds-system'));

  // Resolve slug → componentId
  const component = componentRepo.getBySlug(sysCtx.systemId, slug);
  if (!component) {
    return failJson(c, 404, {
      code: 'component.not_found',
      userMessage: `Component "${slug}" not found`,
    });
  }

  const componentId = component.id;

  // Load all spec data from DB
  const editorial = componentRepo.getEditorial(componentId);
  const structured = component.figma;

  // Build complete spec
  const spec = buildSpecFromDb({
    editorial,
    structured: structured || undefined,
    figmaFileUrl: component.figmaFileUrl,
    figmaComponentSetNodeId: component.figmaComponentSetNodeId,
  });

  // "exists" intentionally models editorial authoring state.
  // Structured Figma data (variants/layout) can exist independently.
  const exists = editorial !== null;

  // Compute staleness from DB timestamps
  const staleness = componentRepo.getComponentDocStaleness(componentId);

  try {
    return c.json({
      ok: true,
      exists,
      slug,
      spec,
      updatedAt: editorial?.updatedAt ?? null,
      staleness: {
        status: staleness.status,
        editorialUpdatedAt: staleness.editorialUpdatedAt,
        figmaCapturedAt: staleness.capturedAt,
      },
    });
  } catch (error: any) {
    console.error('[handleGetComponentSpecRoute] JSON serialization error:', error.message);
    return failJson(c, 500, {
      code: 'internal.json_error',
      userMessage: 'Failed to serialize spec response',
    });
  }
}

/**
 * PATCH /api/component-spec/:slug/editorial handler
 * 
 * Updates editorial (human-authored) fields with optimistic locking.
 */
export async function handlePatchEditorialSpecRoute(
  c: Context,
  deps: ComponentSpecHandlerDeps,
): Promise<Response> {
  const { componentRepo, getSystemContext, failJson } = deps;
  const slug = c.req.param('slug');

  if (!slug) {
    return failJson(c, 400, {
      code: 'invalid.slug',
      userMessage: 'Slug is required',
    });
  }

  const sysCtx = getSystemContext(c.req.header('x-ds-system'));

  // Resolve slug → componentId
  const component = componentRepo.getBySlug(sysCtx.systemId, slug);
  if (!component) {
    return failJson(c, 404, {
      code: 'component.not_found',
      userMessage: `Component "${slug}" not found`,
    });
  }

  const componentId = component.id;

  // Parse and validate body
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return failJson(c, 400, {
      code: 'invalid.json',
      userMessage: 'Invalid JSON body',
    });
  }

  const { expectedUpdatedAt, fields } = body;

  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return failJson(c, 400, {
      code: 'invalid.fields',
      userMessage: 'fields object is required',
    });
  }

  if (
    expectedUpdatedAt !== null &&
    expectedUpdatedAt !== undefined &&
    (!Number.isFinite(expectedUpdatedAt) || !Number.isInteger(expectedUpdatedAt))
  ) {
    return failJson(c, 400, {
      code: 'invalid.expected_updated_at',
      userMessage: 'expectedUpdatedAt must be an integer timestamp or null',
    });
  }

  // Validate field keys against allowlist
  const allowedKeys = new Set([
    'summary',
    'best_practices',
    'accessibility',
    'content_guidelines',
    'related_components',
    'token_mapping',
    'qa',
    'variants',
    'tokens',
  ]);

  for (const key of Object.keys(fields)) {
    if (!allowedKeys.has(key)) {
      return failJson(c, 400, {
        code: 'invalid.field',
        userMessage: `Unknown field: ${key}`,
      });
    }
  }
  const savedKeys = Object.keys(fields);

  // Convert snake_case keys to camelCase for repository
  const camelCaseFields: Partial<Omit<EditorialEntry, 'componentId' | 'updatedAt'>> = {};
  if (fields.summary !== undefined) camelCaseFields.summary = fields.summary;
  if (fields.best_practices !== undefined) camelCaseFields.bestPractices = fields.best_practices;
  if (fields.accessibility !== undefined) {
    const acc = fields.accessibility as Record<string, unknown>;
    // Extract notes from accessibility object — stored separately in DB
    const { notes, ...accWithoutNotes } = acc;
    if (notes !== undefined) {
      camelCaseFields.accessibilityNotes = Array.isArray(notes) ? notes : null;
    }
    if (Object.keys(accWithoutNotes).length > 0) {
      camelCaseFields.accessibility = accWithoutNotes;
    }
  }
  if (fields.content_guidelines !== undefined) camelCaseFields.contentGuidelines = fields.content_guidelines;
  if (fields.related_components !== undefined) camelCaseFields.relatedComponents = fields.related_components;
  if (fields.token_mapping !== undefined) camelCaseFields.tokenMapping = fields.token_mapping;
  if (fields.qa !== undefined) camelCaseFields.qa = fields.qa;
  if (fields.variants !== undefined) camelCaseFields.variants = fields.variants;
  if (fields.tokens !== undefined) camelCaseFields.tokens = fields.tokens;

  // Upsert with optimistic locking
  let editorial: EditorialEntry;
  try {
    editorial = componentRepo.upsertEditorial(componentId, camelCaseFields, expectedUpdatedAt ?? null);
  } catch (error: any) {
    if (error.statusCode === 400) {
      return failJson(c, 400, {
        code: 'invalid.expected_updated_at',
        userMessage: error.message,
      });
    }
    if (error.statusCode === 409) {
      return failJson(c, 409, {
        code: 'optimistic_lock_failed',
        userMessage: error.message,
        expectedUpdatedAt: expectedUpdatedAt,
      });
    }
    const reason = error instanceof Error ? error.message : String(error);
    console.error('[handlePatchEditorialSpecRoute] Failed to upsert editorial data:', reason);
    return failJson(c, 500, {
      code: 'internal.editorial_upsert_failed',
      userMessage: 'Failed to persist editorial spec data',
    });
  }

  // Load complete spec for response
  const structured = component.figma;
  const spec = buildSpecFromDb({
    editorial,
    structured,
    figmaFileUrl: component.figmaFileUrl,
    figmaComponentSetNodeId: component.figmaComponentSetNodeId,
  });

  try {
    return c.json({
      ok: true,
      exists: true,
      slug,
      spec,
      updatedAt: editorial.updatedAt,
      savedKeys,
      message: 'Editorial fields saved successfully.',
    });
  } catch (error: any) {
    console.error('[handlePatchEditorialSpecRoute] JSON serialization error:', error.message);
    return failJson(c, 500, {
      code: 'internal.json_error',
      userMessage: 'Failed to serialize spec response',
    });
  }
}

// ─── Editorial Suggestion Routes ──────────────────────────────────────────

/**
 * GET /api/component-spec/:slug/editorial-suggestion
 * Returns the latest pending AI suggestion for this component.
 */
export async function handleGetEditorialSuggestionRoute(c: Context, deps: ComponentSpecHandlerDeps): Promise<Response> {
  const { componentRepo, failJson, getSystemContext } = deps;
  const slug = c.req.param('slug');
  if (!slug) {
    return failJson(c, 400, {
      code: 'invalid.slug',
      userMessage: 'Slug is required',
    });
  }
  const sysCtx = getSystemContext(c.req.header('x-ds-system'));
  const component = componentRepo.getBySlug(sysCtx.systemId, slug);
  if (!component) {
    return failJson(c, 404, {
      code: 'component.not_found',
      userMessage: `Component "${slug}" not found`,
    });
  }
  const componentId = component.id;

  const suggestion = componentRepo.getLatestEditorialSuggestion(componentId);
  if (!suggestion) {
    return c.json({ ok: true, suggestion: null, message: 'No pending suggestion' });
  }

  let parsedPatch: Record<string, unknown>;
  try {
    parsedPatch = JSON.parse(suggestion.patchJson) as Record<string, unknown>;
  } catch (error) {
    console.warn('[component-spec] Failed to parse editorial suggestion patch_json', {
      suggestionId: suggestion.id,
      error,
    });
    return c.json({ ok: true, suggestion: null, message: 'Suggestion payload is invalid' });
  }

  return c.json({
    ok: true,
    suggestion: {
      id: suggestion.id,
      jobId: suggestion.jobId,
      patch: parsedPatch,
      provider: suggestion.provider,
      model: suggestion.model,
      createdAt: suggestion.createdAt,
    },
  });
}

/**
 * POST /api/component-spec/:slug/editorial-suggestion/discard
 * Discards the latest pending suggestion.
 */
export async function handleDiscardEditorialSuggestionRoute(c: Context, deps: ComponentSpecHandlerDeps): Promise<Response> {
  const { componentRepo, failJson, getSystemContext } = deps;
  const slug = c.req.param('slug');
  if (!slug) {
    return failJson(c, 400, {
      code: 'invalid.slug',
      userMessage: 'Slug is required',
    });
  }
  const sysCtx = getSystemContext(c.req.header('x-ds-system'));
  const component = componentRepo.getBySlug(sysCtx.systemId, slug);
  if (!component) {
    return failJson(c, 404, {
      code: 'component.not_found',
      userMessage: `Component "${slug}" not found`,
    });
  }
  const componentId = component.id;

  const suggestion = componentRepo.getLatestEditorialSuggestion(componentId);
  if (!suggestion) {
    return c.json({ ok: true, message: 'No pending suggestion to discard' });
  }

  try {
    componentRepo.markSuggestionStatus(suggestion.id, 'discarded');
    return c.json({ ok: true, message: 'Suggestion discarded' });
  } catch (error) {
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 404;
    return failJson(c, statusCode, {
      code: statusCode === 409 ? 'suggestion.invalid_state' : 'suggestion.not_found',
      userMessage: error instanceof Error ? error.message : 'No pending suggestion found',
    });
  }
}

/**
 * POST /api/component-spec/:slug/editorial-suggestion/mark-applied
 * Marks the latest pending suggestion as applied (called after human saves).
 */
export async function handleMarkSuggestionAppliedRoute(c: Context, deps: ComponentSpecHandlerDeps): Promise<Response> {
  const { componentRepo, failJson, getSystemContext } = deps;
  const slug = c.req.param('slug');
  if (!slug) {
    return failJson(c, 400, {
      code: 'invalid.slug',
      userMessage: 'Slug is required',
    });
  }
  const sysCtx = getSystemContext(c.req.header('x-ds-system'));
  const component = componentRepo.getBySlug(sysCtx.systemId, slug);
  if (!component) {
    return failJson(c, 404, {
      code: 'component.not_found',
      userMessage: `Component "${slug}" not found`,
    });
  }
  const componentId = component.id;

  let suggestionId: number | null = null;
  try {
    const body = await c.req.json() as { suggestionId?: unknown };
    if (body && body.suggestionId !== undefined) {
      if (!Number.isFinite(body.suggestionId) || !Number.isInteger(body.suggestionId)) {
        return failJson(c, 400, {
          code: 'invalid.suggestion_id',
          userMessage: 'suggestionId must be an integer when provided',
        });
      }
      suggestionId = Number(body.suggestionId);
    }
  } catch {
    // Empty/absent body is valid; fallback to latest pending.
  }

  const suggestion = suggestionId !== null
    ? componentRepo.getEditorialSuggestionById(suggestionId)
    : componentRepo.getLatestEditorialSuggestion(componentId);

  if (suggestionId !== null && suggestion && suggestion.componentId !== componentId) {
    return failJson(c, 403, {
      code: 'suggestion.forbidden',
      userMessage: 'Suggestion does not belong to this component',
    });
  }
  if (!suggestion) {
    return c.json({ ok: true, message: 'No pending suggestion to mark' });
  }
  if (suggestion.status !== 'pending') {
    return failJson(c, 409, {
      code: 'suggestion.not_pending',
      userMessage: `Suggestion is already ${suggestion.status}`,
    });
  }

  try {
    componentRepo.markSuggestionStatus(suggestion.id, 'applied');
    return c.json({ ok: true, message: 'Suggestion marked as applied' });
  } catch (error) {
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 404;
    return failJson(c, statusCode, {
      code: statusCode === 409 ? 'suggestion.invalid_state' : 'suggestion.not_found',
      userMessage: error instanceof Error ? error.message : 'No pending suggestion found',
    });
  }
}
