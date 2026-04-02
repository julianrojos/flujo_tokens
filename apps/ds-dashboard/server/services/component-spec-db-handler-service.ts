/**
 * Component Spec DB Handler Service
 * 
 * Handles GET and PATCH /editorial requests for component specs.
 * All data is read from and written to SQLite DB (no filesystem).
 */

import type { ComponentRepository } from '../db/component-repository.js';
import type { EditorialEntry, AnatomySpecEntry, StructuredFigmaData } from '../db/component-repository.js';
import type { PartialComponentSpec } from 'ds-types';

/**
 * Build a complete PartialComponentSpec from DB sources
 */
function buildSpecFromDb(params: {
  editorial: EditorialEntry | null;
  anatomy: AnatomySpecEntry | null;
  structured: StructuredFigmaData | undefined;
  figmaFileUrl?: string;
  figmaComponentSetNodeId?: string;
}): PartialComponentSpec {
  const { editorial, anatomy, structured, figmaFileUrl, figmaComponentSetNodeId } = params;
  const hasFigmaMetadata =
    Boolean(structured?.pageName) ||
    Boolean(figmaComponentSetNodeId) ||
    Boolean(figmaFileUrl);

  const spec: PartialComponentSpec = {
    // Editorial fields (null if not yet created)
    summary: editorial?.summary ?? null,
    best_practices: editorial?.bestPractices ?? null,
    accessibility: editorial?.accessibility ?? null,
    content_guidelines: editorial?.contentGuidelines ?? null,
    related_components: editorial?.relatedComponents ?? null,
    token_mapping: editorial?.tokenMapping ?? null,
    qa: editorial?.qa ?? null,

    // Structural fields from Figma (anatomy + properties)
    anatomy: anatomy?.anatomy ?? [],
    properties: anatomy?.properties ?? [],

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
  c: any,
  deps: {
    componentRepo: ComponentRepository;
    getSystemContext: (systemHeader?: string) => { systemId: string; repoRoot: string };
    failJson: (ctx: any, status: number, payload: any) => any;
  },
): Promise<any> {
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
  const anatomy = componentRepo.getAnatomySpec(componentId);
  const structured = component.figma;

  // Build complete spec
  const spec = buildSpecFromDb({
    editorial,
    anatomy,
    structured: structured || undefined,
    figmaFileUrl: component.figmaFileUrl,
    figmaComponentSetNodeId: component.figmaComponentSetNodeId,
  });

  // "exists" intentionally models editorial authoring state.
  // Structural Figma data (anatomy/variants/layout) can exist independently.
  const exists = editorial !== null;

  try {
    return c.json({
      ok: true,
      exists,
      slug,
      spec,
      updatedAt: editorial?.updatedAt ?? null,
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
  c: any,
  deps: {
    componentRepo: ComponentRepository;
    getSystemContext: (systemHeader?: string) => { systemId: string; repoRoot: string };
    failJson: (ctx: any, status: number, payload: any) => any;
  },
): Promise<any> {
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
  if (fields.accessibility !== undefined) camelCaseFields.accessibility = fields.accessibility;
  if (fields.content_guidelines !== undefined) camelCaseFields.contentGuidelines = fields.content_guidelines;
  if (fields.related_components !== undefined) camelCaseFields.relatedComponents = fields.related_components;
  if (fields.token_mapping !== undefined) camelCaseFields.tokenMapping = fields.token_mapping;
  if (fields.qa !== undefined) camelCaseFields.qa = fields.qa;

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
  const anatomy = componentRepo.getAnatomySpec(componentId);
  const structured = component.figma;
  const spec = buildSpecFromDb({
    editorial,
    anatomy,
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
