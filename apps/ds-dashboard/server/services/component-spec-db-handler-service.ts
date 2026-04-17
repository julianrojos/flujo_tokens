/**
 * Component Spec DB Handler Service
 *
 * Handles GET and PATCH /editorial requests for component specs.
 * All data is read from and written to PostgreSQL DB (no filesystem).
 */

import {
  EDITORIAL_ALLOWED_KEYS,
  type ComponentRepository,
} from '../db/component-repository.js';
import type {
  EditorialEntry,
  StructuredFigmaData,
} from '../db/component-repository.js';
import type { PartialComponentSpec } from 'ds-types';
import type { Context } from 'hono';

interface ComponentSpecHandlerDeps {
  componentRepo: ComponentRepository;
  getSystemContext: (
    systemHeader?: string,
  ) =>
    | { systemId: string; repoRoot: string }
    | Promise<{ systemId: string; repoRoot: string }>;
  failJson: (
    ctx: Context,
    status: number,
    payload: { code: string; userMessage: string; [key: string]: unknown },
  ) => Response;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSpecPropertyDefault(value: unknown): string | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
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
  const { editorial, structured, figmaFileUrl, figmaComponentSetNodeId } =
    params;
  const hasFigmaMetadata =
    Boolean(structured?.pageName) ||
    Boolean(figmaComponentSetNodeId) ||
    Boolean(figmaFileUrl);

  // Properties now come from Figma capture (Migration 034), not editorial
  const capturedProperties = structured?.properties
    ? structured.properties.map((p) => ({
        name: p.name,
        type: p.type,
        values: p.values,
        default: normalizeSpecPropertyDefault(p.defaultValue),
        required: p.required,
        description: p.description,
      }))
    : null;

  const spec: PartialComponentSpec = {
    // Editorial fields (null if not yet created)
    summary: editorial?.summary ?? null,
    properties: capturedProperties,
    behaviour: editorial?.behaviour ?? null,
    accessibility: editorial?.accessibility
      ? {
          ...editorial.accessibility,
          notes: editorial.accessibilityNotes ?? undefined,
        }
      : editorial?.accessibilityNotes
        ? { notes: editorial.accessibilityNotes }
        : null,
    content_guidelines: editorial?.contentGuidelines ?? null,
    qa: editorial?.qa ?? null,
    variants: editorial?.variants ?? null,

    // Additional structured data
    variant_visuals:
      structured?.variants?.map((v) => ({
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

    // Layer Token Mapping: per-variant, per-layer token bindings (Migration 027)
    layer_token_mapping: structured?.tokenBindings?.length
      ? structured.tokenBindings.map((binding) => ({
          variant_node_id: binding.variantNodeId ?? '',
          variant_signature: binding.variantSignature ?? '',
          layer_node_id: binding.nodeId,
          layer_name: binding.nodeName,
          property_path: String(binding.propertyPath || binding.field || '')
            .trim()
            .toLowerCase(),
          variable_id: binding.variableId,
          token_path: binding.tokenPath ?? null,
          status:
            binding.status ?? (binding.tokenPath ? 'resolved' : 'unresolved'),
          mode_id: binding.modeId ?? '',
          mode_name: binding.modeName ?? binding.mode ?? '',
        }))
      : [],
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

  const sysCtx = await getSystemContext(c.req.header('x-ds-system'));

  // Resolve slug → componentId
  const component = await componentRepo.getBySlug(sysCtx.systemId, slug);
  if (!component) {
    return failJson(c, 404, {
      code: 'component.not_found',
      userMessage: `Component "${slug}" not found`,
    });
  }

  const componentId = component.id;

  // Load all spec data from DB
  const editorial = await componentRepo.getEditorial(componentId);
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
  const staleness = await componentRepo.getComponentDocStaleness(componentId);

  try {
    return c.json({
      ok: true,
      exists,
      slug,
      spec,
      updatedAt: editorial?.updatedAt?.getTime() ?? null,
      staleness: {
        status: staleness.status,
        editorialUpdatedAt: staleness.editorialUpdatedAt,
        figmaCapturedAt: staleness.capturedAt,
      },
    });
  } catch (error: any) {
    console.error(
      '[handleGetComponentSpecRoute] JSON serialization error:',
      error.message,
    );
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

  const sysCtx = await getSystemContext(c.req.header('x-ds-system'));

  // Resolve slug → componentId
  const component = await componentRepo.getBySlug(sysCtx.systemId, slug);
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
    (!Number.isFinite(expectedUpdatedAt) ||
      !Number.isInteger(expectedUpdatedAt))
  ) {
    return failJson(c, 400, {
      code: 'invalid.expected_updated_at',
      userMessage: 'expectedUpdatedAt must be an integer timestamp or null',
    });
  }

  // Hard cut: properties are no longer editable via PATCH (Migration 034)
  if (fields.properties !== undefined) {
    return failJson(c, 400, {
      code: 'invalid.field',
      userMessage:
        'properties is read-only and sourced from Figma capture. Use the Figma plugin to update component properties.',
    });
  }

  // Validate field keys against allowlist
  const allowedKeys = new Set<string>(EDITORIAL_ALLOWED_KEYS);

  for (const key of Object.keys(fields)) {
    if (!allowedKeys.has(key)) {
      return failJson(c, 400, {
        code: 'invalid.field',
        userMessage: `Unknown field: ${key}`,
      });
    }
  }

  if (
    fields.behaviour !== undefined &&
    fields.behaviour !== null &&
    typeof fields.behaviour !== 'string'
  ) {
    return failJson(c, 400, {
      code: 'invalid.field',
      userMessage: 'Invalid field: behaviour must be a string or null.',
    });
  }
  if (
    fields.accessibility !== undefined &&
    fields.accessibility !== null &&
    !isPlainRecord(fields.accessibility)
  ) {
    return failJson(c, 400, {
      code: 'invalid.field',
      userMessage: 'Invalid field: accessibility must be an object or null.',
    });
  }
  const savedKeys = Object.keys(fields);

  // Convert snake_case keys to camelCase for repository
  const camelCaseFields: Partial<
    Omit<EditorialEntry, 'componentId' | 'updatedAt'>
  > = {};
  if (fields.summary !== undefined) camelCaseFields.summary = fields.summary;
  if (fields.behaviour !== undefined)
    camelCaseFields.behaviour = fields.behaviour;
  if (fields.accessibility !== undefined) {
    if (fields.accessibility === null) {
      camelCaseFields.accessibility = null;
      camelCaseFields.accessibilityNotes = null;
    } else {
      const acc = fields.accessibility as Record<string, unknown>;
      // Extract notes from accessibility object — stored separately in DB
      const { notes, ...accWithoutNotes } = acc;
      if (notes !== undefined) {
        camelCaseFields.accessibilityNotes = Array.isArray(notes)
          ? notes
          : null;
      }
      if (Object.keys(accWithoutNotes).length > 0) {
        camelCaseFields.accessibility = accWithoutNotes;
      }
    }
  }
  if (fields.content_guidelines !== undefined)
    camelCaseFields.contentGuidelines = fields.content_guidelines;
  if (fields.qa !== undefined) camelCaseFields.qa = fields.qa;
  if (fields.variants !== undefined) camelCaseFields.variants = fields.variants;

  // Upsert with optimistic locking
  let editorial: EditorialEntry;
  try {
    editorial = await componentRepo.upsertEditorial(
      componentId,
      camelCaseFields,
      expectedUpdatedAt ?? null,
    );
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
    console.error(
      '[handlePatchEditorialSpecRoute] Failed to upsert editorial data:',
      reason,
    );
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
      updatedAt: editorial.updatedAt.getTime(),
      savedKeys,
      message: 'Editorial fields saved successfully.',
    });
  } catch (error: any) {
    console.error(
      '[handlePatchEditorialSpecRoute] JSON serialization error:',
      error.message,
    );
    return failJson(c, 500, {
      code: 'internal.json_error',
      userMessage: 'Failed to serialize spec response',
    });
  }
}
