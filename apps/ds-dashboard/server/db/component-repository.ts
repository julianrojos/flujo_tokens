/**
 * Component Repository
 *
 * DB-backed repository for components, component_specs, component_visual_proofs,
 * and structured Figma evidence tables.
 */

import type { Sql } from 'postgres';
import type { PropertyType } from 'ds-types';

import { normalizeVisualProofVariants } from '../lib/visual-proof-normalizer.js';

export interface FigmaVariantEntry {
  name: string;
  properties: Record<string, string>;
  nodeId?: string;
  runId?: string;
  capturedAtEpoch?: number;
  schemaVersion?: number;
}

export interface FigmaTokenBindingEntry {
  nodeId: string;
  nodeName: string;
  field: string;
  variableId: string;
  tokenPath?: string;
  mode?: string;
  runId?: string;
  capturedAtEpoch?: number;
  schemaVersion?: number;
  variantNodeId?: string;
  variantSignature?: string;
  propertyPath?: string;
  status?: 'resolved' | 'unresolved';
  modeId?: string;
  modeName?: string;
}

export interface FigmaLayoutRowEntry {
  nodeId: string;
  nodeName: string;
  depth: number;
  direction?: 'Horizontal' | 'Vertical' | '—';
  hSizing?: string;
  vSizing?: string;
  alignmentH?: string;
  alignmentV?: string;
  itemSpacing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  runId?: string;
  capturedAtEpoch?: number;
  schemaVersion?: number;
}

export interface CapturedPropertyEntry {
  name: string;
  type: PropertyType;
  values?: string[];
  defaultValue?: unknown;
  required: boolean;
  description: string;
}

export interface StructuredFigmaData {
  pageName?: string;
  variants?: FigmaVariantEntry[];
  tokenBindings?: FigmaTokenBindingEntry[];
  layout?: FigmaLayoutRowEntry[];
  properties?: CapturedPropertyEntry[];
}

export interface ComponentEntry {
  id: number;
  dsId: string;
  slug: string;
  name: string;
  status: 'draft' | 'ready' | 'needs-review' | 'missing';
  docType: 'component' | 'pattern' | 'guideline';
  figmaFileUrl?: string;
  figmaComponentSetNodeId?: string;
  figma?: StructuredFigmaData;
  specs?: ComponentSpecEntry[];
  visualProofs?: ComponentVisualProofEntry[];
  editorialExists: boolean;
}

export interface ComponentSpecEntry {
  id: number;
  componentId: number;
  docPath: string;
  docStatus: 'draft' | 'ready' | 'needs-review';
  coverage: number;
}

export interface ComponentVisualProofEntry {
  id: number;
  componentId: number;
  imagePath: string;
  screenshotUrl?: string;
  caption?: string;
  capturedAt?: string;
  capturedAtEpoch?: number;
  nodeId?: string;
  imageSha256?: string;
  imageBytes?: number;
  imageContentType?: string;
  imageWidth?: number;
  imageHeight?: number;
  variantsCount?: number;
  variants?: Array<{
    name: string;
    node_id?: string | null;
    screenshot_url?: string | null;
    image_path?: string | null;
    captured_at?: string | null;
    image_sha256?: string | null;
    image_bytes?: number | null;
    image_content_type?: string | null;
    image_width?: number | null;
    image_height?: number | null;
  }>;
}

export interface ComponentCatalogEntry {
  slug: string;
  name: string;
  status?: 'draft' | 'ready' | 'needs-review' | 'missing';
  docType?: 'component' | 'pattern' | 'guideline';
  specs?: Array<{
    docPath: string;
    docStatus?: 'draft' | 'ready' | 'needs-review';
    coverage?: number;
  }>;
  visualProofs?: Array<{
    imagePath: string;
    screenshotUrl?: string;
    caption?: string;
    capturedAt?: string;
    capturedAtEpoch?: number;
    nodeId?: string;
    imageSha256?: string;
    imageBytes?: number;
    imageContentType?: string;
    imageWidth?: number;
    imageHeight?: number;
    variantsCount?: number;
    variants?: Array<{
      name: string;
      node_id?: string | null;
      screenshot_url?: string | null;
      image_path?: string | null;
      captured_at?: string | null;
      image_sha256?: string | null;
      image_bytes?: number | null;
      image_content_type?: string | null;
      image_width?: number | null;
      image_height?: number | null;
    }>;
  }>;
  figma?: {
    fileUrl?: string;
    componentSetNodeId?: string;
    pageName?: string;
    runId?: string;
    capturedAtEpoch?: number;
    schemaVersion?: number;
    structuredCaptureStatus?: 'ok' | 'failed';
    variants?: Array<{
      name: string;
      properties: Record<string, string>;
      nodeId?: string;
    }>;
    tokenBindings?: Array<{
      nodeId: string;
      nodeName: string;
      field: string;
      variableId: string;
      tokenPath?: string;
      mode?: string;
      variantNodeId?: string;
      variantSignature?: string;
      propertyPath?: string;
      status?: 'resolved' | 'unresolved';
      modeId?: string;
      modeName?: string;
    }>;
    layout?: Array<{
      nodeId: string;
      nodeName: string;
      depth: number;
      direction?: 'Horizontal' | 'Vertical' | '—';
      hSizing?: string;
      vSizing?: string;
      alignmentH?: string;
      alignmentV?: string;
      itemSpacing?: number;
      padding?: { top: number; right: number; bottom: number; left: number };
    }>;
    props?: Array<{
      name: string;
      type: PropertyType;
      values?: string[];
      defaultValue?: unknown;
      required?: boolean;
      description?: string;
    }>;
  };
}

export interface EditorialEntry {
  componentId: number;
  summary?: Record<string, unknown> | null;
  behaviour?: string | null;
  accessibility?: Record<string, unknown> | null;
  contentGuidelines?: Record<string, unknown> | null;
  qa?: Array<unknown> | null;
  accessibilityNotes?: string[] | null;
  variants?: EditorialVariantEntry[] | null;
  updatedAt: Date;
}

export interface EditorialVariantEntry {
  id: string;
  name: string;
  description: string;
  properties: Record<string, string>;
}

export const EDITORIAL_ALLOWED_KEYS = [
  'summary',
  'behaviour',
  'accessibility',
  'content_guidelines',
  'qa',
  'variants',
] as const;

export interface ComponentBasicInfo {
  name: string;
  displayName: string | null;
  figmaComponentSetNodeId: string | null;
}

export class ComponentRepository {
  private sql: Sql;
  private static readonly IN_BATCH_SIZE = 500;

  private static normalizeComponentId(componentId: number | string): number | null {
    const normalized = Number(componentId);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
  }

  private static toJsonColumnValue(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    try {
      const serialized = JSON.stringify(value, (_key, currentValue) => {
        if (
          typeof currentValue === 'number' &&
          !Number.isFinite(currentValue)
        ) {
          throw new Error(
            'Invalid numeric value in editorial payload: NaN/Infinity are not allowed',
          );
        }
        if (typeof currentValue === 'string') {
          // PostgreSQL rejects null bytes in text/json payloads.
          return currentValue.replace(/\u0000/g, '');
        }
        return currentValue;
      });
      if (serialized === undefined) {
        return null;
      }
      return serialized;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[component-repository] Failed to serialize editorial JSON value: ${reason}`,
      );
    }
  }

  private static parseJsonColumnValue<T>(
    value: unknown,
    context: string,
  ): T | null {
    if (value == null) return null;
    if (typeof value === 'object') {
      return value as T;
    }
    try {
      return JSON.parse(String(value)) as T;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[component-repository] Invalid JSON in ${context}: ${reason}`,
      );
      return null;
    }
  }

  private static readonly MAX_VARIANT_PROPERTIES_JSON_BYTES = 64 * 1024;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  private static parseVariantsJson(
    variantsJson: unknown,
    rowId: number,
    componentId: number,
  ): ComponentVisualProofEntry['variants'] {
    if (variantsJson == null) return undefined;
    if (Array.isArray(variantsJson)) {
      return normalizeVisualProofVariants(variantsJson);
    }
    if (typeof variantsJson === 'object') {
      return undefined;
    }
    try {
      const parsed = JSON.parse(String(variantsJson));
      if (!Array.isArray(parsed)) return undefined;
      return normalizeVisualProofVariants(parsed);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[component-repository] Invalid variants_json in component_visual_proofs id=${rowId} component_id=${componentId}: ${reason}`,
      );
      return undefined;
    }
  }

  private static parsePropertiesJson(
    propertiesJson: unknown,
    componentId: number,
    variantName: string,
  ): Record<string, string> {
    if (propertiesJson == null) {
      return {};
    }

    if (typeof propertiesJson === 'object') {
      if (Array.isArray(propertiesJson)) {
        return {};
      }
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        propertiesJson as Record<string, unknown>,
      )) {
        const k = String(key || '').trim();
        if (!k) continue;
        out[k] = String(value ?? '');
      }
      return out;
    }

    try {
      const parsed = JSON.parse(String(propertiesJson));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return {};
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const k = String(key || '').trim();
        if (!k) continue;
        out[k] = String(value ?? '');
      }
      return out;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[component-repository] Invalid properties_json for component_id=${componentId} variant="${variantName}": ${reason}`,
      );
      return {};
    }
  }

  private static toCapturedAtEpoch(
    capturedAt: string | undefined,
    fallback: number | undefined,
  ): Date | null {
    if (Number.isFinite(Number(fallback))) {
      return new Date(Number(fallback) * 1000);
    }
    const normalized = String(capturedAt || '').trim();
    if (!normalized) return null;
    const epochMs = new Date(normalized).getTime();
    if (!Number.isFinite(epochMs)) return null;
    return new Date(epochMs);
  }

  private static toIntOrDefault(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.floor(numeric);
  }

  private static shouldReplaceStructuredFigmaData(
    entry: ComponentCatalogEntry['figma'],
  ): boolean {
    if (!entry) return false;
    const status = String(entry.structuredCaptureStatus || '')
      .trim()
      .toLowerCase();
    if (status === 'failed') return false;
    if (status === 'ok') return true;
    return (
      entry.variants !== undefined ||
      entry.tokenBindings !== undefined ||
      entry.layout !== undefined ||
      entry.props !== undefined
    );
  }

  private static buildFigmaData(
    figmaPageName: string | null,
    structured: StructuredFigmaData | undefined,
  ): StructuredFigmaData | undefined {
    if (!figmaPageName && !structured) return undefined;
    return {
      pageName: figmaPageName ?? undefined,
      ...(structured || {}),
    };
  }

  private async loadStructuredFigmaByComponentIds(
    componentIds: number[],
  ): Promise<Map<number, StructuredFigmaData>> {
    const out = new Map<number, StructuredFigmaData>();
    if (componentIds.length === 0) return out;

    for (
      let i = 0;
      i < componentIds.length;
      i += ComponentRepository.IN_BATCH_SIZE
    ) {
      const batch = componentIds.slice(
        i,
        i + ComponentRepository.IN_BATCH_SIZE,
      );

      const variantRows = (await this.sql`
        SELECT component_id, variant_name, node_id, properties_json, run_id, captured_at, schema_version
        FROM component_figma_variants
        WHERE component_id = ANY(${batch})
        ORDER BY id ASC
      `) as Array<{
        component_id: number;
        variant_name: string;
        node_id: string;
        properties_json: Record<string, unknown>;
        run_id: string | null;
        captured_at: Date;
        schema_version: number;
      }>;

      for (const row of variantRows) {
        const current = out.get(row.component_id) || {};
        const variants = current.variants || [];
        variants.push({
          name: String(row.variant_name || '').trim() || 'Variant',
          properties: ComponentRepository.parsePropertiesJson(
            row.properties_json,
            row.component_id,
            String(row.variant_name || ''),
          ),
          nodeId: String(row.node_id || '').trim() || undefined,
          runId: String(row.run_id || '').trim() || undefined,
          capturedAtEpoch: row.captured_at?.getTime(),
          schemaVersion: Number.isFinite(Number(row.schema_version))
            ? Number(row.schema_version)
            : undefined,
        });
        current.variants = variants;
        out.set(row.component_id, current);
      }

      const bindingRows = (await this.sql`
        SELECT component_id, node_id, node_name, field, variable_id, token_path, mode,
               run_id, captured_at, schema_version,
               variant_node_id, variant_signature, property_path, status, mode_id, mode_name
        FROM component_figma_token_bindings
        WHERE component_id = ANY(${batch})
        ORDER BY id ASC
      `) as Array<{
        component_id: number;
        node_id: string;
        node_name: string;
        field: string;
        variable_id: string;
        token_path: string | null;
        mode: string;
        run_id: string | null;
        captured_at: Date;
        schema_version: number;
        variant_node_id: string | null;
        variant_signature: string | null;
        property_path: string | null;
        status: string | null;
        mode_id: string | null;
        mode_name: string | null;
      }>;

      for (const row of bindingRows) {
        const current = out.get(row.component_id) || {};
        const tokenBindings = current.tokenBindings || [];
        tokenBindings.push({
          nodeId: String(row.node_id || '').trim(),
          nodeName: String(row.node_name || '').trim(),
          field: String(row.field || '').trim(),
          variableId: String(row.variable_id || '').trim(),
          tokenPath: String(row.token_path || '').trim() || undefined,
          mode: String(row.mode || '').trim() || undefined,
          runId: String(row.run_id || '').trim() || undefined,
          capturedAtEpoch: row.captured_at?.getTime(),
          schemaVersion: Number.isFinite(Number(row.schema_version))
            ? Number(row.schema_version)
            : undefined,
          variantNodeId: String(row.variant_node_id || '').trim() || undefined,
          variantSignature:
            String(row.variant_signature || '').trim() || undefined,
          propertyPath: String(row.property_path || '').trim() || undefined,
          status: (row.status as 'resolved' | 'unresolved' | null) || undefined,
          modeId: String(row.mode_id || '').trim() || undefined,
          modeName: String(row.mode_name || '').trim() || undefined,
        });
        current.tokenBindings = tokenBindings;
        out.set(row.component_id, current);
      }

      const layoutRows = (await this.sql`
        SELECT component_id, node_id, node_name, depth, direction, h_sizing, v_sizing, alignment_h, alignment_v,
               item_spacing, padding_top, padding_right, padding_bottom, padding_left, run_id, captured_at, schema_version
        FROM component_figma_layout_rows
        WHERE component_id = ANY(${batch})
        ORDER BY depth ASC, id ASC
      `) as Array<{
        component_id: number;
        node_id: string;
        node_name: string;
        depth: number;
        direction: string | null;
        h_sizing: string | null;
        v_sizing: string | null;
        alignment_h: string | null;
        alignment_v: string | null;
        item_spacing: number | null;
        padding_top: number | null;
        padding_right: number | null;
        padding_bottom: number | null;
        padding_left: number | null;
        run_id: string | null;
        captured_at: Date;
        schema_version: number;
      }>;

      for (const row of layoutRows) {
        const current = out.get(row.component_id) || {};
        const layout = current.layout || [];

        const directionRaw = String(row.direction || '').trim();
        const direction =
          directionRaw === 'Horizontal' ||
          directionRaw === 'Vertical' ||
          directionRaw === '—'
            ? (directionRaw as 'Horizontal' | 'Vertical' | '—')
            : undefined;

        const hasPadding =
          row.padding_top !== null ||
          row.padding_right !== null ||
          row.padding_bottom !== null ||
          row.padding_left !== null;

        layout.push({
          nodeId: String(row.node_id || '').trim(),
          nodeName: String(row.node_name || '').trim(),
          depth: ComponentRepository.toIntOrDefault(row.depth, 0),
          direction,
          hSizing: String(row.h_sizing || '').trim() || undefined,
          vSizing: String(row.v_sizing || '').trim() || undefined,
          alignmentH: String(row.alignment_h || '').trim() || undefined,
          alignmentV: String(row.alignment_v || '').trim() || undefined,
          itemSpacing: Number.isFinite(Number(row.item_spacing))
            ? Number(row.item_spacing)
            : undefined,
          padding: hasPadding
            ? {
                top: Number(row.padding_top ?? 0),
                right: Number(row.padding_right ?? 0),
                bottom: Number(row.padding_bottom ?? 0),
                left: Number(row.padding_left ?? 0),
              }
            : undefined,
          runId: String(row.run_id || '').trim() || undefined,
          capturedAtEpoch: row.captured_at?.getTime(),
          schemaVersion: Number.isFinite(Number(row.schema_version))
            ? Number(row.schema_version)
            : undefined,
        });

        current.layout = layout;
        out.set(row.component_id, current);
      }

      const propsRows = (await this.sql`
        SELECT component_id, prop_name, prop_type, prop_values_json, prop_default, prop_required, prop_description
        FROM component_figma_props
        WHERE component_id = ANY(${batch})
        ORDER BY id ASC
      `) as Array<{
        component_id: number;
        prop_name: string;
        prop_type: string;
        prop_values_json: unknown | null;
        prop_default: unknown | null;
        prop_required: boolean;
        prop_description: string;
      }>;

      for (const row of propsRows) {
        const current = out.get(row.component_id) || {};
        const properties = current.properties || [];
        const values = row.prop_values_json
          ? (ComponentRepository.parseJsonColumnValue<string[]>(
              row.prop_values_json,
              'component_figma_props.prop_values_json',
            ) ?? undefined)
          : undefined;
        const defaultValue = row.prop_default
          ? ComponentRepository.parseJsonColumnValue<unknown>(
              row.prop_default,
              'component_figma_props.prop_default',
            )
          : undefined;
        properties.push({
          name: String(row.prop_name || '').trim(),
          type: row.prop_type as CapturedPropertyEntry['type'],
          values,
          defaultValue,
          required: row.prop_required,
          description: String(row.prop_description || '').trim(),
        });
        current.properties = properties;
        out.set(row.component_id, current);
      }
    }

    return out;
  }

  async getEditorial(componentId: number): Promise<EditorialEntry | null> {
    const normalizedComponentId = ComponentRepository.normalizeComponentId(
      componentId,
    );
    if (normalizedComponentId === null) {
      return null;
    }

    const rows = (await this.sql`
      SELECT component_id, summary_json, behaviour_json, accessibility_json,
             content_guidelines_json, qa_json,
             accessibility_notes_json, variants_json, updated_at
      FROM component_editorial
      WHERE component_id = ${normalizedComponentId}
    `) as Array<{
      component_id: number;
      summary_json: unknown;
      behaviour_json: unknown;
      accessibility_json: unknown;
      content_guidelines_json: unknown;
      qa_json: unknown;
      accessibility_notes_json: unknown;
      variants_json: unknown;
      updated_at: Date;
    }>;

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      componentId: Number(row.component_id),
      summary: ComponentRepository.parseJsonColumnValue<
        Record<string, unknown>
      >(row.summary_json, 'component_editorial.summary_json'),
      behaviour: ComponentRepository.parseJsonColumnValue<string>(
        row.behaviour_json,
        'component_editorial.behaviour_json',
      ),
      accessibility: ComponentRepository.parseJsonColumnValue<
        Record<string, unknown>
      >(row.accessibility_json, 'component_editorial.accessibility_json'),
      contentGuidelines: ComponentRepository.parseJsonColumnValue<
        Record<string, unknown>
      >(
        row.content_guidelines_json,
        'component_editorial.content_guidelines_json',
      ),
      qa: ComponentRepository.parseJsonColumnValue<Array<unknown>>(
        row.qa_json,
        'component_editorial.qa_json',
      ),
      accessibilityNotes: ComponentRepository.parseJsonColumnValue<string[]>(
        row.accessibility_notes_json,
        'component_editorial.accessibility_notes_json',
      ),
      variants: ComponentRepository.parseJsonColumnValue<
        EditorialVariantEntry[]
      >(row.variants_json, 'component_editorial.variants_json'),
      updatedAt: row.updated_at,
    };
  }

  async getEditorialByComponentIds(
    componentIds: number[],
  ): Promise<Map<number, EditorialEntry>> {
    const out = new Map<number, EditorialEntry>();
    if (!Array.isArray(componentIds) || componentIds.length === 0) return out;
    const normalizedComponentIds = componentIds
      .map((componentId) => ComponentRepository.normalizeComponentId(componentId))
      .filter((componentId): componentId is number => componentId !== null);
    if (normalizedComponentIds.length === 0) return out;

    const rows = (await this.sql`
      SELECT component_id, summary_json, behaviour_json, accessibility_json,
             content_guidelines_json, qa_json,
             variants_json, updated_at
      FROM component_editorial
      WHERE component_id = ANY(${normalizedComponentIds})
    `) as Array<{
      component_id: number;
      summary_json: unknown;
      behaviour_json: unknown;
      accessibility_json: unknown;
      content_guidelines_json: unknown;
      qa_json: unknown;
      variants_json: unknown;
      updated_at: Date;
    }>;

    for (const row of rows) {
      out.set(Number(row.component_id), {
        componentId: Number(row.component_id),
        summary: ComponentRepository.parseJsonColumnValue<
          Record<string, unknown>
        >(row.summary_json, 'component_editorial.summary_json'),
        behaviour: ComponentRepository.parseJsonColumnValue<string>(
          row.behaviour_json,
          'component_editorial.behaviour_json',
        ),
        accessibility: ComponentRepository.parseJsonColumnValue<
          Record<string, unknown>
        >(row.accessibility_json, 'component_editorial.accessibility_json'),
        contentGuidelines: ComponentRepository.parseJsonColumnValue<
          Record<string, unknown>
        >(
          row.content_guidelines_json,
          'component_editorial.content_guidelines_json',
        ),
        qa: ComponentRepository.parseJsonColumnValue<Array<unknown>>(
          row.qa_json,
          'component_editorial.qa_json',
        ),
        variants: ComponentRepository.parseJsonColumnValue<
          EditorialVariantEntry[]
        >(row.variants_json, 'component_editorial.variants_json'),
        updatedAt: row.updated_at,
      });
    }

    return out;
  }

  async upsertEditorial(
    componentId: number,
    fields: Partial<Omit<EditorialEntry, 'componentId' | 'updatedAt'>>,
    expectedUpdatedAt?: Date | number | null,
  ): Promise<EditorialEntry> {
    const normalizedComponentId = ComponentRepository.normalizeComponentId(
      componentId,
    );
    const persistedComponentId = normalizedComponentId ?? componentId;
    const existing = await this.getEditorial(persistedComponentId);
    const now = new Date();

    if (!existing) {
      if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
        throw {
          statusCode: 409,
          message:
            'Optimistic lock failed: row does not exist but expectedUpdatedAt was provided',
        };
      }

      await this.sql`
        INSERT INTO component_editorial (
          component_id, summary_json, behaviour_json, accessibility_json,
          content_guidelines_json, qa_json,
          accessibility_notes_json, variants_json, updated_at
        ) VALUES (
          ${persistedComponentId},
          ${ComponentRepository.toJsonColumnValue(fields.summary)},
          ${ComponentRepository.toJsonColumnValue(fields.behaviour)},
          ${ComponentRepository.toJsonColumnValue(fields.accessibility)},
          ${ComponentRepository.toJsonColumnValue(fields.contentGuidelines)},
          ${ComponentRepository.toJsonColumnValue(fields.qa)},
          ${ComponentRepository.toJsonColumnValue(fields.accessibilityNotes)},
          ${ComponentRepository.toJsonColumnValue(fields.variants)},
          ${now}
        )
      `;

      const created = await this.getEditorial(persistedComponentId);
      if (!created) {
        return { componentId: Number(persistedComponentId), ...fields, updatedAt: now };
      }
      return created;
    }

    if (expectedUpdatedAt === undefined || expectedUpdatedAt === null) {
      throw {
        statusCode: 400,
        message: 'expectedUpdatedAt is required for updates',
      };
    }

    const expectedUpdatedAtMs =
      expectedUpdatedAt instanceof Date
        ? expectedUpdatedAt.getTime()
        : Number(expectedUpdatedAt);

    if (
      !Number.isFinite(expectedUpdatedAtMs) ||
      expectedUpdatedAtMs !== existing.updatedAt.getTime()
    ) {
      throw {
        statusCode: 409,
        message: `Optimistic lock failed: expected ${expectedUpdatedAt} but found ${existing.updatedAt}`,
      };
    }

    const updates: string[] = [];
    const values: Array<string | number | Date | null> = [];

    if (fields.summary !== undefined) {
      updates.push(
        `summary_json = CASE WHEN summary_json IS DISTINCT FROM $${values.length + 1} THEN $${values.length + 1} ELSE summary_json END`,
      );
      values.push(ComponentRepository.toJsonColumnValue(fields.summary));
    }
    if (fields.behaviour !== undefined) {
      updates.push(
        `behaviour_json = CASE WHEN behaviour_json IS DISTINCT FROM $${values.length + 1} THEN $${values.length + 1} ELSE behaviour_json END`,
      );
      values.push(ComponentRepository.toJsonColumnValue(fields.behaviour));
    }
    if (fields.accessibility !== undefined) {
      updates.push(
        `accessibility_json = CASE WHEN accessibility_json IS DISTINCT FROM $${values.length + 1} THEN $${values.length + 1} ELSE accessibility_json END`,
      );
      values.push(ComponentRepository.toJsonColumnValue(fields.accessibility));
    }
    if (fields.contentGuidelines !== undefined) {
      updates.push(
        `content_guidelines_json = CASE WHEN content_guidelines_json IS DISTINCT FROM $${values.length + 1} THEN $${values.length + 1} ELSE content_guidelines_json END`,
      );
      values.push(
        ComponentRepository.toJsonColumnValue(fields.contentGuidelines),
      );
    }
    if (fields.qa !== undefined) {
      updates.push(
        `qa_json = CASE WHEN qa_json IS DISTINCT FROM $${values.length + 1} THEN $${values.length + 1} ELSE qa_json END`,
      );
      values.push(ComponentRepository.toJsonColumnValue(fields.qa));
    }
    if (fields.accessibilityNotes !== undefined) {
      updates.push(
        `accessibility_notes_json = CASE WHEN accessibility_notes_json IS DISTINCT FROM $${values.length + 1} THEN $${values.length + 1} ELSE accessibility_notes_json END`,
      );
      values.push(
        ComponentRepository.toJsonColumnValue(fields.accessibilityNotes),
      );
    }
    if (fields.variants !== undefined) {
      updates.push(
        `variants_json = CASE WHEN variants_json IS DISTINCT FROM $${values.length + 1} THEN $${values.length + 1} ELSE variants_json END`,
      );
      values.push(ComponentRepository.toJsonColumnValue(fields.variants));
    }

    updates.push(`updated_at = $${values.length + 1}`);
    values.push(now);
    values.push(persistedComponentId);

    // NOTE: The updates array is built from EDITORIAL_ALLOWED_KEYS (line 230), which contains
    // only hardcoded column names controlled internally by the codebase. Values are passed as
    // parameterized values to sql.unsafe() — no user-provided field names are concatenated.
    const setSql = updates.join(', ');
    await this.sql.unsafe(
      `UPDATE component_editorial SET ${setSql} WHERE component_id = $${values.length}`,
      values,
    );

    const updated = await this.getEditorial(persistedComponentId);
    return updated ?? { ...existing, ...fields, updatedAt: now };
  }

  async getAll(dsId: string): Promise<ComponentEntry[]> {
    const rows = (await this.sql`
      SELECT c.id, c.ds_id, c.slug, c.name, c.status, c.doc_type, c.figma_file_url, c.figma_component_set_node_id, c.figma_page_name,
             (SELECT 1 FROM component_editorial ce WHERE ce.component_id = c.id LIMIT 1) AS has_editorial
      FROM components c
      WHERE c.ds_id = ${dsId}
      ORDER BY c.name
    `) as Array<{
      id: number;
      ds_id: string;
      slug: string;
      name: string;
      status: string;
      doc_type: string;
      figma_file_url: string | null;
      figma_component_set_node_id: string | null;
      figma_page_name: string | null;
      has_editorial: unknown;
    }>;

    if (rows.length === 0) {
      return [];
    }

    const componentIds = rows.map((row) => row.id);
    const specRows = (await this.sql`
      SELECT id, component_id, doc_path, doc_status, coverage
      FROM component_specs
      WHERE component_id = ANY(${componentIds})
    `) as Array<{
      id: number;
      component_id: number;
      doc_path: string;
      doc_status: string;
      coverage: number;
    }>;

    const proofRows = (await this.sql`
      SELECT id, component_id, image_path, screenshot_url, caption, captured_at, captured_at_epoch, node_id, image_sha256, image_bytes, image_content_type, image_width, image_height, variants_count, variants_json
      FROM component_visual_proofs
      WHERE component_id = ANY(${componentIds})
      ORDER BY captured_at_epoch DESC, captured_at DESC, id DESC
    `) as Array<{
      id: number;
      component_id: number;
      image_path: string;
      screenshot_url: string | null;
      caption: string | null;
      captured_at: Date | null;
      captured_at_epoch: number | null;
      node_id: string | null;
      image_sha256: string | null;
      image_bytes: number | null;
      image_content_type: string | null;
      image_width: number | null;
      image_height: number | null;
      variants_count: number | null;
      variants_json: unknown | null;
    }>;

    const specsByComponentId = new Map<number, ComponentSpecEntry[]>();
    for (const row of specRows) {
      const prev = specsByComponentId.get(row.component_id) || [];
      prev.push({
        id: row.id,
        componentId: row.component_id,
        docPath: row.doc_path,
        docStatus: row.doc_status as ComponentSpecEntry['docStatus'],
        coverage: row.coverage,
      });
      specsByComponentId.set(row.component_id, prev);
    }

    const proofsByComponentId = new Map<number, ComponentVisualProofEntry[]>();
    for (const row of proofRows) {
      const prev = proofsByComponentId.get(row.component_id) || [];
      prev.push({
        id: row.id,
        componentId: row.component_id,
        imagePath: row.image_path,
        screenshotUrl: row.screenshot_url ?? undefined,
        caption: row.caption ?? undefined,
        capturedAt: row.captured_at?.toISOString() ?? undefined,
        capturedAtEpoch: row.captured_at_epoch ?? undefined,
        nodeId: row.node_id ?? undefined,
        imageSha256: row.image_sha256 ?? undefined,
        imageBytes: row.image_bytes ?? undefined,
        imageContentType: row.image_content_type ?? undefined,
        imageWidth: row.image_width ?? undefined,
        imageHeight: row.image_height ?? undefined,
        variantsCount: row.variants_count ?? undefined,
        variants: ComponentRepository.parseVariantsJson(
          row.variants_json,
          row.id,
          row.component_id,
        ),
      });
      proofsByComponentId.set(row.component_id, prev);
    }

    const structuredByComponentId =
      await this.loadStructuredFigmaByComponentIds(componentIds);

    return rows.map((row) => ({
      id: Number(row.id),
      dsId: row.ds_id,
      slug: row.slug,
      name: row.name,
      status: row.status as ComponentEntry['status'],
      docType: row.doc_type as ComponentEntry['docType'],
      figmaFileUrl: row.figma_file_url ?? undefined,
      figmaComponentSetNodeId: row.figma_component_set_node_id ?? undefined,
      figma: ComponentRepository.buildFigmaData(
        row.figma_page_name,
        structuredByComponentId.get(row.id),
      ),
      specs: specsByComponentId.get(row.id) || [],
      visualProofs: proofsByComponentId.get(row.id) || [],
      editorialExists: Boolean(row.has_editorial),
    }));
  }

  async getBySlug(dsId: string, slug: string): Promise<ComponentEntry | null> {
    const rows = (await this.sql`
      SELECT c.id, c.ds_id, c.slug, c.name, c.status, c.doc_type, c.figma_file_url, c.figma_component_set_node_id, c.figma_page_name,
             (SELECT 1 FROM component_editorial ce WHERE ce.component_id = c.id LIMIT 1) AS has_editorial
      FROM components c
      WHERE c.ds_id = ${dsId} AND c.slug = ${slug}
    `) as Array<{
      id: number;
      ds_id: string;
      slug: string;
      name: string;
      status: string;
      doc_type: string;
      figma_file_url: string | null;
      figma_component_set_node_id: string | null;
      figma_page_name: string | null;
      has_editorial: unknown;
    }>;

    if (rows.length === 0) return null;

    const row = rows[0];
    const structured = (
      await this.loadStructuredFigmaByComponentIds([row.id])
    ).get(row.id);

    return {
      id: Number(row.id),
      dsId: row.ds_id,
      slug: row.slug,
      name: row.name,
      status: row.status as ComponentEntry['status'],
      docType: row.doc_type as ComponentEntry['docType'],
      figmaFileUrl: row.figma_file_url ?? undefined,
      figmaComponentSetNodeId: row.figma_component_set_node_id ?? undefined,
      figma: ComponentRepository.buildFigmaData(
        row.figma_page_name,
        structured,
      ),
      specs: await this.getSpecs(row.id),
      visualProofs: await this.getVisualProofs(row.id),
      editorialExists: Boolean(row.has_editorial),
    };
  }

  private async getSpecs(componentId: number): Promise<ComponentSpecEntry[]> {
    const rows = (await this.sql`
      SELECT id, component_id, doc_path, doc_status, coverage
      FROM component_specs
      WHERE component_id = ${componentId}
    `) as Array<{
      id: number;
      component_id: number;
      doc_path: string;
      doc_status: string;
      coverage: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      componentId: row.component_id,
      docPath: row.doc_path,
      docStatus: row.doc_status as ComponentSpecEntry['docStatus'],
      coverage: row.coverage,
    }));
  }

  private async getVisualProofs(
    componentId: number,
  ): Promise<ComponentVisualProofEntry[]> {
    const rows = (await this.sql`
      SELECT id, component_id, image_path, screenshot_url, caption, captured_at, captured_at_epoch, node_id, image_sha256, image_bytes, image_content_type, image_width, image_height, variants_count, variants_json
      FROM component_visual_proofs
      WHERE component_id = ${componentId}
      ORDER BY captured_at_epoch DESC, captured_at DESC, id DESC
    `) as Array<{
      id: number;
      component_id: number;
      image_path: string;
      screenshot_url: string | null;
      caption: string | null;
      captured_at: Date | null;
      captured_at_epoch: number | null;
      node_id: string | null;
      image_sha256: string | null;
      image_bytes: number | null;
      image_content_type: string | null;
      image_width: number | null;
      image_height: number | null;
      variants_count: number | null;
      variants_json: unknown | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      componentId: row.component_id,
      imagePath: row.image_path,
      screenshotUrl: row.screenshot_url ?? undefined,
      caption: row.caption ?? undefined,
      capturedAt: row.captured_at?.toISOString() ?? undefined,
      capturedAtEpoch: row.captured_at_epoch ?? undefined,
      nodeId: row.node_id ?? undefined,
      imageSha256: row.image_sha256 ?? undefined,
      imageBytes: row.image_bytes ?? undefined,
      imageContentType: row.image_content_type ?? undefined,
      imageWidth: row.image_width ?? undefined,
      imageHeight: row.image_height ?? undefined,
      variantsCount: row.variants_count ?? undefined,
      variants: ComponentRepository.parseVariantsJson(
        row.variants_json,
        row.id,
        row.component_id,
      ),
    }));
  }

  async upsertFromRegistry(
    dsId: string,
    entries: ComponentCatalogEntry[],
  ): Promise<number> {
    let upsertedCount = 0;

    for (const entry of entries) {
      const now = new Date();

      await this.sql`
        INSERT INTO components (ds_id, slug, name, status, doc_type, figma_file_url, figma_component_set_node_id, figma_page_name, created_at, updated_at)
        VALUES (${dsId}, ${entry.slug}, ${entry.name}, ${entry.status ?? 'draft'}, ${entry.docType ?? 'component'}, ${entry.figma?.fileUrl ?? null}, ${entry.figma?.componentSetNodeId ?? null}, ${entry.figma?.pageName ?? null}, ${now}, ${now})
        ON CONFLICT(ds_id, slug) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          doc_type = EXCLUDED.doc_type,
          figma_file_url = EXCLUDED.figma_file_url,
          figma_component_set_node_id = EXCLUDED.figma_component_set_node_id,
          figma_page_name = EXCLUDED.figma_page_name,
          updated_at = EXCLUDED.updated_at
      `;

      const compRows = (await this.sql`
        SELECT id FROM components WHERE ds_id = ${dsId} AND slug = ${entry.slug}
      `) as Array<{ id: number }>;

      if (compRows.length === 0) continue;

      const componentId = compRows[0].id;
      upsertedCount += 1;

      if (Array.isArray(entry.specs)) {
        await this
          .sql`DELETE FROM component_specs WHERE component_id = ${componentId}`;

        if (entry.specs.length > 0) {
          for (const spec of entry.specs) {
            await this.sql`
              INSERT INTO component_specs (component_id, doc_path, doc_status, coverage, created_at, updated_at)
              VALUES (${componentId}, ${spec.docPath}, ${spec.docStatus ?? 'draft'}, ${spec.coverage ?? 0}, ${now}, ${now})
              ON CONFLICT(component_id, doc_path) DO UPDATE SET
                doc_status = EXCLUDED.doc_status,
                coverage = EXCLUDED.coverage,
                updated_at = EXCLUDED.updated_at
            `;
          }
        }
      }

      if (entry.visualProofs && entry.visualProofs.length > 0) {
        for (const proof of entry.visualProofs) {
          const capturedAt = proof.capturedAt
            ? new Date(proof.capturedAt)
            : null;
          const capturedAtEpoch =
            proof.capturedAtEpoch ??
            (capturedAt ? Math.floor(capturedAt.getTime() / 1000) : null);

          await this.sql`
            INSERT INTO component_visual_proofs (component_id, image_path, screenshot_url, caption, captured_at, captured_at_epoch, node_id, image_sha256, image_bytes, image_content_type, image_width, image_height, variants_count, variants_json, created_at)
            VALUES (${componentId}, ${proof.imagePath}, ${proof.screenshotUrl ?? null}, ${proof.caption ?? null}, ${capturedAt}, ${capturedAtEpoch}, ${proof.nodeId ?? null}, ${proof.imageSha256 ?? null}, ${proof.imageBytes ?? null}, ${proof.imageContentType ?? null}, ${proof.imageWidth ?? null}, ${proof.imageHeight ?? null}, ${proof.variantsCount ?? null}, ${Array.isArray(proof.variants) ? JSON.stringify(proof.variants) : null}, ${now})
            ON CONFLICT(component_id, image_path) DO UPDATE SET
              screenshot_url = EXCLUDED.screenshot_url,
              caption = EXCLUDED.caption,
              captured_at = EXCLUDED.captured_at,
              captured_at_epoch = EXCLUDED.captured_at_epoch,
              node_id = EXCLUDED.node_id,
              image_sha256 = EXCLUDED.image_sha256,
              image_bytes = EXCLUDED.image_bytes,
              image_content_type = EXCLUDED.image_content_type,
              image_width = EXCLUDED.image_width,
              image_height = EXCLUDED.image_height,
              variants_count = EXCLUDED.variants_count,
              variants_json = EXCLUDED.variants_json
          `;
        }
      }

      if (entry.figma) {
        const figmaRunId = String(entry.figma.runId || '').trim() || null;
        const figmaCapturedAt = Number.isFinite(
          Number(entry.figma.capturedAtEpoch),
        )
          ? new Date(Number(entry.figma.capturedAtEpoch) * 1000)
          : now;
        const figmaSchemaVersion = Number.isFinite(
          Number(entry.figma.schemaVersion),
        )
          ? Number(entry.figma.schemaVersion)
          : 1;
        const shouldReplaceStructuredData =
          ComponentRepository.shouldReplaceStructuredFigmaData(entry.figma);

        if (shouldReplaceStructuredData) {
          await this
            .sql`DELETE FROM component_figma_variants WHERE component_id = ${componentId}`;
          await this
            .sql`DELETE FROM component_figma_token_bindings WHERE component_id = ${componentId}`;
          await this
            .sql`DELETE FROM component_figma_layout_rows WHERE component_id = ${componentId}`;
        }

        if (
          shouldReplaceStructuredData &&
          Array.isArray(entry.figma.variants) &&
          entry.figma.variants.length > 0
        ) {
          for (const variant of entry.figma.variants) {
            const variantName = String(variant.name || '').trim() || 'Variant';
            const propertiesJson = JSON.stringify(variant.properties || {});
            if (
              Buffer.byteLength(propertiesJson, 'utf8') >
              ComponentRepository.MAX_VARIANT_PROPERTIES_JSON_BYTES
            ) {
              console.warn(
                `[component-repository] Skipping oversized variant properties for component_id=${componentId} variant="${variantName}"`,
              );
              continue;
            }
            await this.sql`
              INSERT INTO component_figma_variants (component_id, variant_name, node_id, properties_json, run_id, captured_at, schema_version)
              VALUES (${componentId}, ${variantName}, ${String(variant.nodeId || '').trim()}, ${propertiesJson}, ${figmaRunId}, ${figmaCapturedAt}, ${figmaSchemaVersion})
            `;
          }
        }

        if (
          shouldReplaceStructuredData &&
          Array.isArray(entry.figma.tokenBindings) &&
          entry.figma.tokenBindings.length > 0
        ) {
          const seenBindings = new Set<string>();
          for (const binding of entry.figma.tokenBindings) {
            const nodeId = String(binding.nodeId || '').trim();
            const nodeName = String(binding.nodeName || '').trim();
            const field = String(binding.field || '').trim();
            const variableId = String(binding.variableId || '').trim();
            const mode = String(binding.mode || '').trim();
            if (!nodeId || !nodeName || !field || !variableId) continue;

            const variantNodeId = String(binding.variantNodeId || '').trim();
            const propertyPath = String(binding.propertyPath || field)
              .trim()
              .toLowerCase();
            const modeId = String(binding.modeId || '').trim();
            const dedupeKey = `${variantNodeId}\x00${nodeId}\x00${propertyPath}\x00${modeId}\x00${variableId}`;
            if (seenBindings.has(dedupeKey)) continue;
            seenBindings.add(dedupeKey);

            const status = binding.status
              ? binding.status === 'unresolved'
                ? 'unresolved'
                : 'resolved'
              : String(binding.tokenPath || '').trim()
                ? 'resolved'
                : 'unresolved';
            const variantSignature = String(
              binding.variantSignature || '',
            ).trim();
            const modeName = String(binding.modeName || mode).trim();

            await this.sql`
              INSERT INTO component_figma_token_bindings (
                component_id, node_id, node_name, field, variable_id, token_path, mode,
                run_id, captured_at, schema_version,
                variant_node_id, variant_signature, property_path, status, mode_id, mode_name
              )
              VALUES (
                ${componentId}, ${nodeId}, ${nodeName}, ${field}, ${variableId}, ${String(binding.tokenPath || '').trim() || null}, ${mode},
                ${figmaRunId}, ${figmaCapturedAt}, ${figmaSchemaVersion},
                ${variantNodeId}, ${variantSignature}, ${propertyPath}, ${status}, ${modeId}, ${modeName}
              )
            `;
          }
        }

        if (
          shouldReplaceStructuredData &&
          Array.isArray(entry.figma.layout) &&
          entry.figma.layout.length > 0
        ) {
          for (const rowItem of entry.figma.layout) {
            const nodeId = String(rowItem.nodeId || '').trim();
            const nodeName = String(rowItem.nodeName || '').trim();
            if (!nodeId || !nodeName) continue;
            await this.sql`
              INSERT INTO component_figma_layout_rows (
                component_id, node_id, node_name, depth,
                direction, h_sizing, v_sizing, alignment_h, alignment_v,
                item_spacing, padding_top, padding_right, padding_bottom, padding_left,
                run_id, captured_at, schema_version
              )
              VALUES (
                ${componentId}, ${nodeId}, ${nodeName}, ${Math.max(0, ComponentRepository.toIntOrDefault(rowItem.depth, 0))},
                ${String(rowItem.direction || '').trim() || null}, ${String(rowItem.hSizing || '').trim() || null}, ${String(rowItem.vSizing || '').trim() || null}, ${String(rowItem.alignmentH || '').trim() || null}, ${String(rowItem.alignmentV || '').trim() || null},
                ${Number.isFinite(Number(rowItem.itemSpacing)) ? Number(rowItem.itemSpacing) : null}, ${rowItem.padding ? Number(rowItem.padding.top) : null}, ${rowItem.padding ? Number(rowItem.padding.right) : null}, ${rowItem.padding ? Number(rowItem.padding.bottom) : null}, ${rowItem.padding ? Number(rowItem.padding.left) : null},
                ${figmaRunId}, ${figmaCapturedAt}, ${figmaSchemaVersion}
              )
            `;
          }
        }

        if (shouldReplaceStructuredData && Array.isArray(entry.figma.props)) {
          await this
            .sql`DELETE FROM component_figma_props WHERE component_id = ${componentId}`;
          if (entry.figma.props.length > 0) {
            for (const prop of entry.figma.props) {
              const propName = String(prop.name || '').trim();
              if (!propName) continue;
              await this.sql`
                INSERT INTO component_figma_props (
                  component_id, prop_name, prop_type, prop_values_json, prop_default,
                  prop_required, prop_description, run_id, captured_at, schema_version
                )
                VALUES (
                  ${componentId}, ${propName}, ${prop.type || 'text'},
                  ${Array.isArray(prop.values) ? JSON.stringify(prop.values) : null},
                  ${prop.defaultValue !== undefined ? JSON.stringify(prop.defaultValue) : null},
                  ${prop.required ?? false}, ${String(prop.description || '').trim()},
                  ${figmaRunId}, ${figmaCapturedAt}, ${figmaSchemaVersion}
                )
              `;
            }
          }
        }
      }
    }

    return upsertedCount;
  }

  async deleteAll(dsId: string): Promise<number> {
    const result = await this.sql`DELETE FROM components WHERE ds_id = ${dsId}`;
    return result.count ?? 0;
  }

  async markMissingComponents(
    dsId: string,
    existingSlugs: string[],
  ): Promise<number> {
    if (existingSlugs.length === 0) {
      const result = await this.sql`
        UPDATE components
        SET status = 'missing', updated_at = now()
        WHERE ds_id = ${dsId} AND status != 'missing'
      `;
      return result.count ?? 0;
    }

    const existingSlugSet = new Set(existingSlugs);
    const activeRows = (await this.sql`
      SELECT slug
      FROM components
      WHERE ds_id = ${dsId} AND status != 'missing'
    `) as Array<{ slug: string }>;

    const missingSlugs = activeRows
      .map((row) => row.slug)
      .filter((slug) => !existingSlugSet.has(slug));
    if (missingSlugs.length === 0) {
      return 0;
    }

    let changed = 0;
    for (
      let i = 0;
      i < missingSlugs.length;
      i += ComponentRepository.IN_BATCH_SIZE
    ) {
      const batch = missingSlugs.slice(
        i,
        i + ComponentRepository.IN_BATCH_SIZE,
      );
      const result = await this.sql`
        UPDATE components
        SET status = 'missing', updated_at = now()
        WHERE ds_id = ${dsId}
          AND slug = ANY(${batch})
          AND status != 'missing'
      `;
      changed += result.count ?? 0;
    }
    return changed;
  }

  async getComponentIdBySlug(
    slug: string,
    dsId?: string,
  ): Promise<number | null> {
    if (dsId) {
      const rows = (await this.sql`
        SELECT id FROM components WHERE ds_id = ${dsId} AND slug = ${slug} LIMIT 1
      `) as Array<{ id: number | string }>;
      return rows.length > 0 ? Number(rows[0].id) : null;
    }

    const rows = (await this.sql`
      SELECT id FROM components WHERE slug = ${slug} ORDER BY updated_at DESC LIMIT 1
    `) as Array<{ id: number | string }>;
    return rows.length > 0 ? Number(rows[0].id) : null;
  }

  async getComponentBasicInfo(
    componentId: number,
  ): Promise<ComponentBasicInfo | null> {
    const rows = (await this.sql`
      SELECT name, figma_component_set_node_id FROM components WHERE id = ${componentId}
    `) as Array<{ name: string; figma_component_set_node_id: string | null }>;

    if (rows.length === 0) return null;
    return {
      name: rows[0].name,
      displayName: null,
      figmaComponentSetNodeId: rows[0].figma_component_set_node_id ?? null,
    };
  }

  async getComponentByFigmaNodeId(
    figmaComponentSetNodeId: string,
    dsId?: string,
  ): Promise<{ id: number; slug: string } | null> {
    if (dsId) {
      const rows = (await this.sql`
        SELECT id, slug
        FROM components
        WHERE ds_id = ${dsId} AND figma_component_set_node_id = ${figmaComponentSetNodeId} AND status != 'missing'
        LIMIT 1
      `) as Array<{ id: number | string; slug: string }>;
      return rows.length > 0
        ? { id: Number(rows[0].id), slug: rows[0].slug }
        : null;
    }

    const rows = (await this.sql`
      SELECT id, slug
      FROM components
      WHERE figma_component_set_node_id = ${figmaComponentSetNodeId} AND status != 'missing'
      ORDER BY updated_at DESC
      LIMIT 1
    `) as Array<{ id: number | string; slug: string }>;
    return rows.length > 0
      ? { id: Number(rows[0].id), slug: rows[0].slug }
      : null;
  }

  async getComponentDocStaleness(componentId: number): Promise<{
    status: 'fresh' | 'stale' | 'missing';
    editorialUpdatedAt: Date | null;
    capturedAt: Date | null;
  }> {
    const normalizedComponentId = ComponentRepository.normalizeComponentId(
      componentId,
    );
    if (normalizedComponentId === null) {
      return { status: 'missing', editorialUpdatedAt: null, capturedAt: null };
    }

    const rows = (await this.sql`
      SELECT
        e.updated_at AS editorial_updated_at,
        v.latest_captured_at AS captured_at
      FROM components c
      LEFT JOIN component_editorial e ON e.component_id = c.id
      LEFT JOIN (
        SELECT component_id, MAX(captured_at) AS latest_captured_at
        FROM component_figma_variants
        GROUP BY component_id
      ) v ON v.component_id = c.id
      WHERE c.id = ${normalizedComponentId}
    `) as Array<{
      editorial_updated_at: Date | null;
      captured_at: Date | null;
    }>;

    if (rows.length === 0) {
      return { status: 'missing', editorialUpdatedAt: null, capturedAt: null };
    }

    const row = rows[0];
    const editorialUpdatedAt = row.editorial_updated_at ?? null;
    const capturedAt = row.captured_at ?? null;

    if (!capturedAt) {
      return {
        status: editorialUpdatedAt ? 'fresh' : 'missing',
        editorialUpdatedAt,
        capturedAt: null,
      };
    }

    if (!editorialUpdatedAt) {
      return { status: 'missing', editorialUpdatedAt: null, capturedAt };
    }

    return {
      status: editorialUpdatedAt >= capturedAt ? 'fresh' : 'stale',
      editorialUpdatedAt,
      capturedAt,
    };
  }

  async listComponentDocStaleness(dsId?: string): Promise<
    Array<{
      id: number;
      slug: string;
      status: 'fresh' | 'stale' | 'missing';
      editorialUpdatedAt: Date | null;
      capturedAt: Date | null;
    }>
  > {
    const rows = dsId
      ? await this.sql`
        SELECT
          c.id,
          c.slug,
          e.updated_at AS editorial_updated_at,
          v.latest_captured_at AS captured_at
        FROM components c
        LEFT JOIN component_editorial e ON e.component_id = c.id
        LEFT JOIN (
          SELECT component_id, MAX(captured_at) AS latest_captured_at
          FROM component_figma_variants
          GROUP BY component_id
        ) v ON v.component_id = c.id
        WHERE c.status != 'missing' AND c.ds_id = ${dsId}
      `
      : await this.sql`
        SELECT
          c.id,
          c.slug,
          e.updated_at AS editorial_updated_at,
          v.latest_captured_at AS captured_at
        FROM components c
        LEFT JOIN component_editorial e ON e.component_id = c.id
        LEFT JOIN (
          SELECT component_id, MAX(captured_at) AS latest_captured_at
          FROM component_figma_variants
          GROUP BY component_id
        ) v ON v.component_id = c.id
        WHERE c.status != 'missing'
      `;

    return rows.map((row) => {
      let status: 'fresh' | 'stale' | 'missing';
      if (!row.captured_at) {
        status = row.editorial_updated_at ? 'fresh' : 'missing';
      } else if (!row.editorial_updated_at) {
        status = 'missing';
      } else {
        status =
          row.editorial_updated_at >= row.captured_at ? 'fresh' : 'stale';
      }

      return {
        id: row.id,
        slug: row.slug,
        status,
        editorialUpdatedAt: row.editorial_updated_at,
        capturedAt: row.captured_at,
      };
    });
  }

  async getFigmaComponentSetNodeId(
    componentId: number,
  ): Promise<string | null> {
    const normalizedComponentId = ComponentRepository.normalizeComponentId(
      componentId,
    );
    if (normalizedComponentId === null) return null;
    const rows = (await this.sql`
      SELECT figma_component_set_node_id FROM components WHERE id = ${normalizedComponentId}
    `) as Array<{ figma_component_set_node_id: string | null }>;
    return rows.length > 0
      ? (rows[0].figma_component_set_node_id ?? null)
      : null;
  }

  async getFigmaFileUrl(componentId: number): Promise<string | null> {
    const rows = (await this.sql`
      SELECT figma_file_url FROM components WHERE id = ${componentId}
    `) as Array<{ figma_file_url: string | null }>;
    return rows.length > 0 ? (rows[0].figma_file_url ?? null) : null;
  }

  async listDocStatusFromComponentDocs(dsId?: string): Promise<
    Array<{
      id: number;
      slug: string;
      status: 'fresh' | 'stale' | 'missing';
      appliedAt: Date | null;
    }>
  > {
    const rows = dsId
      ? await this.sql`
        SELECT
          c.id,
          c.slug,
          cd.applied_at AS applied_at,
          c.figma_descriptions_synced_at AS synced_at
        FROM components c
        LEFT JOIN component_docs cd ON cd.component_id = c.id
        WHERE c.status != 'missing' AND c.ds_id = ${dsId}
        ORDER BY c.slug ASC
      `
      : await this.sql`
        SELECT
          c.id,
          c.slug,
          cd.applied_at AS applied_at,
          c.figma_descriptions_synced_at AS synced_at
        FROM components c
        LEFT JOIN component_docs cd ON cd.component_id = c.id
        WHERE c.status != 'missing'
        ORDER BY c.slug ASC
      `;

    return rows.map((row) => {
      let status: 'fresh' | 'stale' | 'missing';
      if (row.applied_at == null) {
        status = 'missing';
      } else if (row.synced_at != null && row.applied_at < row.synced_at) {
        status = 'stale';
      } else {
        status = 'fresh';
      }

      return {
        id: row.id,
        slug: row.slug,
        status,
        appliedAt: row.applied_at,
      };
    });
  }

  async saveFigmaDescriptions(
    componentId: number,
    data: {
      componentSet: string | null;
      syncedAt: number;
      variants: Array<{
        nodeId: string;
        canonicalKey: string;
        description: string | null;
      }>;
    },
  ): Promise<void> {
    const syncedAt = new Date(data.syncedAt * 1000);

    await this.sql`
      UPDATE components
      SET figma_description = ${data.componentSet ?? null}, figma_descriptions_synced_at = ${syncedAt}
      WHERE id = ${componentId}
    `;

    for (const v of data.variants) {
      const vName = v.canonicalKey || '';
      await this.sql`
        INSERT INTO component_figma_variants (component_id, node_id, variant_name, canonical_key, description)
        VALUES (${componentId}, ${v.nodeId}, ${vName}, ${v.canonicalKey || null}, ${v.description ?? null})
        ON CONFLICT(component_id, variant_name, node_id) DO UPDATE SET
          canonical_key = EXCLUDED.canonical_key,
          description = EXCLUDED.description
      `;
    }
  }

  async saveTokenBindingsForComponent(
    componentId: number,
    bindings: Array<{
      nodeId: string;
      nodeName: string;
      field: string;
      variableId: string;
      tokenPath: string | undefined;
      variantNodeId?: string;
      variantSignature?: string;
      propertyPath?: string;
      status?: 'resolved' | 'unresolved';
      modeId?: string;
      modeName?: string;
    }>,
  ): Promise<void> {
    const now = new Date();

    await this
      .sql`DELETE FROM component_figma_token_bindings WHERE component_id = ${componentId}`;

    const seen = new Set<string>();
    for (const b of bindings) {
      const nodeId = String(b.nodeId || '').trim();
      const nodeName = String(b.nodeName || '').trim();
      const field = String(b.field || '').trim();
      const variableId = String(b.variableId || '').trim();
      if (!nodeId || !nodeName || !field || !variableId) continue;
      const variantNodeId = String(b.variantNodeId || '').trim();
      const propertyPath = String(b.propertyPath || field)
        .trim()
        .toLowerCase();
      const modeId = String(b.modeId || '').trim();
      const dedupeKey = `${variantNodeId}\x00${nodeId}\x00${propertyPath}\x00${modeId}\x00${variableId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const status = b.status
        ? b.status === 'unresolved'
          ? 'unresolved'
          : 'resolved'
        : String(b.tokenPath || '').trim()
          ? 'resolved'
          : 'unresolved';

      await this.sql`
        INSERT INTO component_figma_token_bindings (
          component_id, node_id, node_name, field, variable_id, token_path, mode,
          run_id, captured_at, schema_version,
          variant_node_id, variant_signature, property_path, status, mode_id, mode_name
        )
        VALUES (
          ${componentId}, ${nodeId}, ${nodeName}, ${field}, ${variableId}, ${b.tokenPath ?? null}, '',
          null, ${now}, 1,
          ${variantNodeId}, ${String(b.variantSignature || '').trim()}, ${propertyPath}, ${status}, ${modeId}, ${String(b.modeName || '').trim()}
        )
      `;
    }
  }

  async getFigmaDescriptions(
    componentId: number,
  ): Promise<FigmaDescriptionsRawResult | null> {
    const compRows = (await this.sql`
      SELECT figma_description, figma_descriptions_synced_at
      FROM components
      WHERE id = ${componentId}
    `) as Array<{
      figma_description: string | null;
      figma_descriptions_synced_at: Date | null;
    }>;

    if (
      compRows.length === 0 ||
      compRows[0].figma_descriptions_synced_at == null
    )
      return null;

    const variantRows = (await this.sql`
      SELECT node_id, canonical_key, description
      FROM component_figma_variants
      WHERE component_id = ${componentId}
      ORDER BY id ASC
    `) as Array<{
      node_id: string;
      canonical_key: string | null;
      description: string | null;
    }>;

    return {
      componentSet: compRows[0].figma_description ?? null,
      variants: variantRows.map((v) => ({
        nodeId: v.node_id,
        canonicalKey: v.canonical_key ?? '',
        description: v.description ?? null,
      })),
      syncedAt: compRows[0].figma_descriptions_synced_at,
    };
  }

  async saveComponentDoc(
    componentId: number,
    data: { outputJson: string; editorialJson?: string | null; jobId: string },
  ): Promise<void> {
    await this.sql`
      INSERT INTO component_docs (component_id, output_json, editorial_json, job_id, applied_at)
      VALUES (${componentId}, ${data.outputJson}, ${data.editorialJson ?? null}, ${data.jobId}, now())
      ON CONFLICT(component_id) DO UPDATE SET
        output_json = EXCLUDED.output_json,
        editorial_json = EXCLUDED.editorial_json,
        job_id = EXCLUDED.job_id,
        applied_at = now()
    `;
  }

  async getComponentDoc(
    componentId: number,
  ): Promise<ComponentDocRecord | null> {
    const rows = (await this.sql`
      SELECT id, component_id, output_json, editorial_json, job_id, applied_at
      FROM component_docs
      WHERE component_id = ${componentId}
    `) as Array<{
      id: number;
      component_id: number;
      output_json: string;
      editorial_json: string | null;
      job_id: string | null;
      applied_at: Date;
    }>;

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      componentId: row.component_id,
      outputJson: row.output_json,
      editorialJson: row.editorial_json,
      jobId: row.job_id,
      appliedAt: row.applied_at,
    };
  }
}

export interface FigmaDescriptionsRawResult {
  componentSet: string | null;
  variants: Array<{
    nodeId: string;
    canonicalKey: string;
    description: string | null;
  }>;
  syncedAt: Date | null;
}

export interface ComponentDocRecord {
  id: number;
  componentId: number;
  outputJson: string;
  editorialJson: string | null;
  jobId: string | null;
  appliedAt: Date;
}
