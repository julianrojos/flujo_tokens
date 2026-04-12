/**
 * Component Repository
 *
 * DB-backed repository for components, component_specs, component_visual_proofs,
 * and structured Figma evidence tables.
 */

import Database from 'better-sqlite3';
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
  // Layer Token Mapping fields (Migration 027)
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

/**
 * Structured Figma data for a component
 */
export interface StructuredFigmaData {
  pageName?: string;
  variants?: FigmaVariantEntry[];
  tokenBindings?: FigmaTokenBindingEntry[];
  layout?: FigmaLayoutRowEntry[];
}

/**
 * Component entry for public API
 */
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

/**
 * Component spec entry
 */
export interface ComponentSpecEntry {
  id: number;
  componentId: number;
  markdownPath: string;
  docStatus: 'draft' | 'ready' | 'needs-review';
  coverage: number;
}

/**
 * Component visual proof entry
 */
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

/**
 * Component registry entry for bulk upsert
 */
export interface ComponentRegistryEntry {
  slug: string;
  name: string;
  status?: 'draft' | 'ready' | 'needs-review' | 'missing';
  docType?: 'component' | 'pattern' | 'guideline';
  specs?: Array<{
    markdownPath: string;
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
      // Layer Token Mapping fields (Migration 027)
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
  };
}

/**
 * Editorial data (human-authored component spec fields)
 */
export interface EditorialEntry {
  componentId: number;
  summary?: Record<string, unknown> | null;
  properties?: Array<Record<string, unknown>> | null;
  bestPractices?: Record<string, unknown> | null;
  accessibility?: Record<string, unknown> | null;
  contentGuidelines?: Record<string, unknown> | null;
  relatedComponents?: Array<unknown> | null;
  qa?: Array<unknown> | null;
  accessibilityNotes?: string[] | null;
  variants?: EditorialVariantEntry[] | null;
  updatedAt: number;
}

export interface EditorialVariantEntry {
  id: string;
  name: string;
  description: string;
  properties: Record<string, string>;
}

/**
 * Allowed keys for editorial upsert (validation allowlist)
 */
export const EDITORIAL_ALLOWED_KEYS = [
  'summary',
  'properties',
  'best_practices',
  'accessibility',
  'content_guidelines',
  'related_components',
  'qa',
  'variants',
] as const;

/**
 * Basic component info for doc assembly (S-01).
 */
export interface ComponentBasicInfo {
  name: string;
  displayName: string | null;
  figmaComponentSetNodeId: string | null;
}

/**
 * Component Repository for SQLite-backed storage
 */
export class ComponentRepository {
  private db: Database.Database;
  private static readonly IN_BATCH_SIZE = 500;
  private static toJsonColumnValue(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    try {
      return JSON.stringify(value, (_key, currentValue) => {
        if (typeof currentValue === 'number' && !Number.isFinite(currentValue)) {
          throw new Error('Invalid numeric value in editorial payload: NaN/Infinity are not allowed');
        }
        return currentValue;
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`[component-repository] Failed to serialize editorial JSON value: ${reason}`);
    }
  }
  private static parseJsonColumnValue<T>(
    value: string | null,
    context: string,
  ): T | null {
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[component-repository] Invalid JSON in ${context}: ${reason}`);
      return null;
    }
  }
  private static readonly MAX_VARIANT_PROPERTIES_JSON_BYTES = 64 * 1024;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private static parseVariantsJson(
    variantsJson: string | null,
    rowId: number,
    componentId: number,
  ): ComponentVisualProofEntry['variants'] {
    if (!variantsJson) return undefined;
    try {
      const parsed = JSON.parse(variantsJson);
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
    propertiesJson: string,
    componentId: number,
    variantName: string,
  ): Record<string, string> {
    try {
      const parsed = JSON.parse(propertiesJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
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

  private static toCapturedAtEpoch(capturedAt: string | undefined, fallback: number | undefined): number | null {
    if (Number.isFinite(Number(fallback))) {
      return Number(fallback);
    }
    const normalized = String(capturedAt || '').trim();
    if (!normalized) return null;
    const epochMs = new Date(normalized).getTime();
    if (!Number.isFinite(epochMs)) return null;
    return Math.floor(epochMs / 1000);
  }

  private static toIntOrDefault(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.floor(numeric);
  }

  private static shouldReplaceStructuredFigmaData(entry: ComponentRegistryEntry['figma']): boolean {
    if (!entry) return false;
    const status = String(entry.structuredCaptureStatus || '').trim().toLowerCase();
    if (status === 'failed') return false;
    if (status === 'ok') return true;
    return entry.variants !== undefined || entry.tokenBindings !== undefined || entry.layout !== undefined;
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

  private loadStructuredFigmaByComponentIds(componentIds: number[]): Map<number, StructuredFigmaData> {
    const out = new Map<number, StructuredFigmaData>();
    if (componentIds.length === 0) return out;

    for (let i = 0; i < componentIds.length; i += ComponentRepository.IN_BATCH_SIZE) {
      const batch = componentIds.slice(i, i + ComponentRepository.IN_BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(', ');
      if (!placeholders) continue;

      const variantRows = this.db
        .prepare(`
          SELECT component_id, variant_name, node_id, properties_json, run_id, captured_at, schema_version
          FROM component_figma_variants
          WHERE component_id IN (${placeholders})
          ORDER BY id ASC
        `)
        .all(...batch) as Array<{
          component_id: number;
          variant_name: string;
          node_id: string;
          properties_json: string;
          run_id: string | null;
          captured_at: number;
          schema_version: number;
        }>;

      for (const row of variantRows) {
        const current = out.get(row.component_id) || {};
        const variants = current.variants || [];
        variants.push({
          name: String(row.variant_name || '').trim() || 'Variant',
          properties: ComponentRepository.parsePropertiesJson(
            String(row.properties_json || '{}'),
            row.component_id,
            String(row.variant_name || ''),
          ),
          nodeId: String(row.node_id || '').trim() || undefined,
          runId: String(row.run_id || '').trim() || undefined,
          capturedAtEpoch: Number.isFinite(Number(row.captured_at)) ? Number(row.captured_at) : undefined,
          schemaVersion: Number.isFinite(Number(row.schema_version)) ? Number(row.schema_version) : undefined,
        });
        current.variants = variants;
        out.set(row.component_id, current);
      }

      const bindingRows = this.db
        .prepare(`
          SELECT component_id, node_id, node_name, field, variable_id, token_path, mode,
                 run_id, captured_at, schema_version,
                 variant_node_id, variant_signature, property_path, status, mode_id, mode_name
          FROM component_figma_token_bindings
          WHERE component_id IN (${placeholders})
          ORDER BY id ASC
        `)
        .all(...batch) as Array<{
          component_id: number;
          node_id: string;
          node_name: string;
          field: string;
          variable_id: string;
          token_path: string | null;
          mode: string;
          run_id: string | null;
          captured_at: number;
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
          capturedAtEpoch: Number.isFinite(Number(row.captured_at)) ? Number(row.captured_at) : undefined,
          schemaVersion: Number.isFinite(Number(row.schema_version)) ? Number(row.schema_version) : undefined,
          // Layer Token Mapping fields (Migration 027)
          variantNodeId: String(row.variant_node_id || '').trim() || undefined,
          variantSignature: String(row.variant_signature || '').trim() || undefined,
          propertyPath: String(row.property_path || '').trim() || undefined,
          status: (row.status as 'resolved' | 'unresolved' | null) || undefined,
          modeId: String(row.mode_id || '').trim() || undefined,
          modeName: String(row.mode_name || '').trim() || undefined,
        });
        current.tokenBindings = tokenBindings;
        out.set(row.component_id, current);
      }

      const layoutRows = this.db
        .prepare(`
          SELECT component_id, node_id, node_name, depth, direction, h_sizing, v_sizing, alignment_h, alignment_v,
                 item_spacing, padding_top, padding_right, padding_bottom, padding_left, run_id, captured_at, schema_version
          FROM component_figma_layout_rows
          WHERE component_id IN (${placeholders})
          ORDER BY depth ASC, id ASC
        `)
        .all(...batch) as Array<{
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
          captured_at: number;
          schema_version: number;
        }>;

      for (const row of layoutRows) {
        const current = out.get(row.component_id) || {};
        const layout = current.layout || [];

        const directionRaw = String(row.direction || '').trim();
        const direction =
          directionRaw === 'Horizontal' || directionRaw === 'Vertical' || directionRaw === '—'
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
          itemSpacing: Number.isFinite(Number(row.item_spacing)) ? Number(row.item_spacing) : undefined,
          padding: hasPadding
            ? {
              top: Number(row.padding_top ?? 0),
              right: Number(row.padding_right ?? 0),
              bottom: Number(row.padding_bottom ?? 0),
              left: Number(row.padding_left ?? 0),
            }
            : undefined,
          runId: String(row.run_id || '').trim() || undefined,
          capturedAtEpoch: Number.isFinite(Number(row.captured_at)) ? Number(row.captured_at) : undefined,
          schemaVersion: Number.isFinite(Number(row.schema_version)) ? Number(row.schema_version) : undefined,
        });

        current.layout = layout;
        out.set(row.component_id, current);
      }
    }

    return out;
  }

  /**
   * Get editorial data for a component (human-authored fields)
   */
  getEditorial(componentId: number): EditorialEntry | null {
    const row = this.db
      .prepare(`
        SELECT component_id, summary_json, properties_json, best_practices_json, accessibility_json,
               content_guidelines_json, related_components_json, qa_json,
               accessibility_notes_json, variants_json, updated_at
        FROM component_editorial
        WHERE component_id = ?
      `)
      .get(componentId) as Array<{
        component_id: number;
        summary_json: string | null;
        properties_json: string | null;
        best_practices_json: string | null;
        accessibility_json: string | null;
        content_guidelines_json: string | null;
        related_components_json: string | null;
        qa_json: string | null;
        accessibility_notes_json: string | null;
        variants_json: string | null;
        updated_at: number;
      }>[0];

    if (!row) return null;

    return {
      componentId: row.component_id,
      summary: ComponentRepository.parseJsonColumnValue<Record<string, unknown>>(row.summary_json, 'component_editorial.summary_json'),
      properties: ComponentRepository.parseJsonColumnValue<Array<Record<string, unknown>>>(row.properties_json, 'component_editorial.properties_json'),
      bestPractices: ComponentRepository.parseJsonColumnValue<Record<string, unknown>>(row.best_practices_json, 'component_editorial.best_practices_json'),
      accessibility: ComponentRepository.parseJsonColumnValue<Record<string, unknown>>(row.accessibility_json, 'component_editorial.accessibility_json'),
      contentGuidelines: ComponentRepository.parseJsonColumnValue<Record<string, unknown>>(row.content_guidelines_json, 'component_editorial.content_guidelines_json'),
      relatedComponents: ComponentRepository.parseJsonColumnValue<Array<unknown>>(row.related_components_json, 'component_editorial.related_components_json'),
      qa: ComponentRepository.parseJsonColumnValue<Array<unknown>>(row.qa_json, 'component_editorial.qa_json'),
      accessibilityNotes: ComponentRepository.parseJsonColumnValue<string[]>(row.accessibility_notes_json, 'component_editorial.accessibility_notes_json'),
      variants: ComponentRepository.parseJsonColumnValue<EditorialVariantEntry[]>(row.variants_json, 'component_editorial.variants_json'),
      updatedAt: row.updated_at,
    };
  }

  /**
   * Batch editorial lookup by component ids.
   */
  getEditorialByComponentIds(componentIds: number[]): Map<number, EditorialEntry> {
    const out = new Map<number, EditorialEntry>();
    if (!Array.isArray(componentIds) || componentIds.length === 0) return out;

    for (let i = 0; i < componentIds.length; i += ComponentRepository.IN_BATCH_SIZE) {
      const batch = componentIds.slice(i, i + ComponentRepository.IN_BATCH_SIZE);
      const placeholders = batch.map(() => "?").join(", ");
      const rows = this.db
        .prepare(`
          SELECT component_id, summary_json, properties_json, best_practices_json, accessibility_json,
                 content_guidelines_json, related_components_json, qa_json,
                 variants_json, updated_at
          FROM component_editorial
          WHERE component_id IN (${placeholders})
        `)
        .all(...batch) as Array<{
          component_id: number;
          summary_json: string | null;
          properties_json: string | null;
          best_practices_json: string | null;
          accessibility_json: string | null;
          content_guidelines_json: string | null;
          related_components_json: string | null;
          qa_json: string | null;
          variants_json: string | null;
          updated_at: number;
        }>;

      for (const row of rows) {
        out.set(row.component_id, {
          componentId: row.component_id,
          summary: ComponentRepository.parseJsonColumnValue<Record<string, unknown>>(row.summary_json, "component_editorial.summary_json"),
          properties: ComponentRepository.parseJsonColumnValue<Array<Record<string, unknown>>>(row.properties_json, "component_editorial.properties_json"),
          bestPractices: ComponentRepository.parseJsonColumnValue<Record<string, unknown>>(row.best_practices_json, "component_editorial.best_practices_json"),
          accessibility: ComponentRepository.parseJsonColumnValue<Record<string, unknown>>(row.accessibility_json, "component_editorial.accessibility_json"),
          contentGuidelines: ComponentRepository.parseJsonColumnValue<Record<string, unknown>>(row.content_guidelines_json, "component_editorial.content_guidelines_json"),
          relatedComponents: ComponentRepository.parseJsonColumnValue<Array<unknown>>(row.related_components_json, "component_editorial.related_components_json"),
          qa: ComponentRepository.parseJsonColumnValue<Array<unknown>>(row.qa_json, "component_editorial.qa_json"),
          variants: ComponentRepository.parseJsonColumnValue<EditorialVariantEntry[]>(row.variants_json, "component_editorial.variants_json"),
          updatedAt: row.updated_at,
        });
      }
    }

    return out;
  }

  /**
   * Upsert editorial data with optimistic locking via updated_at
   * If expectedUpdatedAt is null/undefined and no row exists → INSERT
   * If expectedUpdatedAt matches existing row → UPDATE
   * expectedUpdatedAt is required for UPDATE calls from all consumers.
   * If expectedUpdatedAt doesn't match → throw { statusCode: 409 }
   */
  upsertEditorial(
    componentId: number,
    fields: Partial<Omit<EditorialEntry, 'componentId' | 'updatedAt'>>,
    expectedUpdatedAt?: number | null,
  ): EditorialEntry {
    const expectedLockValue = expectedUpdatedAt ?? null;
    const tx = this.db.transaction(() => {
      const existing = this.getEditorial(componentId);

      if (!existing) {
        // INSERT: only allowed if expectedUpdatedAt is null/undefined (first create)
        if (expectedLockValue !== null) {
          throw { statusCode: 409, message: 'Optimistic lock failed: row does not exist but expectedUpdatedAt was provided' };
        }

        const now = Math.floor(Date.now() / 1000);
        const insertResult = this.db.prepare(`
          INSERT OR IGNORE INTO component_editorial (
            component_id, summary_json, properties_json, best_practices_json, accessibility_json,
            content_guidelines_json, related_components_json, qa_json,
            accessibility_notes_json, variants_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          componentId,
          ComponentRepository.toJsonColumnValue(fields.summary),
          ComponentRepository.toJsonColumnValue(fields.properties),
          ComponentRepository.toJsonColumnValue(fields.bestPractices),
          ComponentRepository.toJsonColumnValue(fields.accessibility),
          ComponentRepository.toJsonColumnValue(fields.contentGuidelines),
          ComponentRepository.toJsonColumnValue(fields.relatedComponents),
          ComponentRepository.toJsonColumnValue(fields.qa),
          ComponentRepository.toJsonColumnValue(fields.accessibilityNotes),
          ComponentRepository.toJsonColumnValue(fields.variants),
          now,
        );

        if ((insertResult.changes ?? 0) === 0) {
          throw { statusCode: 409, message: 'Optimistic lock failed: concurrent editorial creation detected' };
        }

        return { componentId, ...fields, updatedAt: now };
      }

      // UPDATE: check optimistic lock
      if (expectedLockValue === null) {
        throw { statusCode: 400, message: 'expectedUpdatedAt is required for updates' };
      }
      if (expectedLockValue !== existing.updatedAt) {
        throw { statusCode: 409, message: `Optimistic lock failed: expected ${expectedLockValue} but found ${existing.updatedAt}` };
      }

      const now = Math.floor(Date.now() / 1000);
      this.db.prepare(`
        UPDATE component_editorial SET
          summary_json = CASE WHEN ? = 1 THEN ? ELSE summary_json END,
          properties_json = CASE WHEN ? = 1 THEN ? ELSE properties_json END,
          best_practices_json = CASE WHEN ? = 1 THEN ? ELSE best_practices_json END,
          accessibility_json = CASE WHEN ? = 1 THEN ? ELSE accessibility_json END,
          content_guidelines_json = CASE WHEN ? = 1 THEN ? ELSE content_guidelines_json END,
          related_components_json = CASE WHEN ? = 1 THEN ? ELSE related_components_json END,
          qa_json = CASE WHEN ? = 1 THEN ? ELSE qa_json END,
          accessibility_notes_json = CASE WHEN ? = 1 THEN ? ELSE accessibility_notes_json END,
          variants_json = CASE WHEN ? = 1 THEN ? ELSE variants_json END,
          updated_at = ?
        WHERE component_id = ?
      `).run(
        fields.summary !== undefined ? 1 : 0,
        fields.summary !== undefined ? ComponentRepository.toJsonColumnValue(fields.summary) : null,
        fields.properties !== undefined ? 1 : 0,
        fields.properties !== undefined ? ComponentRepository.toJsonColumnValue(fields.properties) : null,
        fields.bestPractices !== undefined ? 1 : 0,
        fields.bestPractices !== undefined ? ComponentRepository.toJsonColumnValue(fields.bestPractices) : null,
        fields.accessibility !== undefined ? 1 : 0,
        fields.accessibility !== undefined ? ComponentRepository.toJsonColumnValue(fields.accessibility) : null,
        fields.contentGuidelines !== undefined ? 1 : 0,
        fields.contentGuidelines !== undefined ? ComponentRepository.toJsonColumnValue(fields.contentGuidelines) : null,
        fields.relatedComponents !== undefined ? 1 : 0,
        fields.relatedComponents !== undefined ? ComponentRepository.toJsonColumnValue(fields.relatedComponents) : null,
        fields.qa !== undefined ? 1 : 0,
        fields.qa !== undefined ? ComponentRepository.toJsonColumnValue(fields.qa) : null,
        fields.accessibilityNotes !== undefined ? 1 : 0,
        fields.accessibilityNotes !== undefined ? ComponentRepository.toJsonColumnValue(fields.accessibilityNotes) : null,
        fields.variants !== undefined ? 1 : 0,
        fields.variants !== undefined ? ComponentRepository.toJsonColumnValue(fields.variants) : null,
        now,
        componentId,
      );

      return { ...existing, ...fields, updatedAt: now };
    });

    return tx();
  }

  /**
   * Get all components for a design system
   */
  getAll(dsId: string): ComponentEntry[] {
    const rows = this.db
      .prepare(`
        SELECT c.id, c.ds_id, c.slug, c.name, c.status, c.doc_type, c.figma_file_url, c.figma_component_set_node_id, c.figma_page_name,
               (SELECT 1 FROM component_editorial ce WHERE ce.component_id = c.id) AS has_editorial
        FROM components c
        WHERE c.ds_id = ?
        ORDER BY c.name
      `)
      .all(dsId) as Array<{
        id: number;
        ds_id: string;
        slug: string;
        name: string;
        status: string;
        doc_type: string;
        figma_file_url: string | null;
        figma_component_set_node_id: string | null;
        figma_page_name: string | null;
        has_editorial: number | null;
      }>;

    if (rows.length === 0) {
      return [];
    }

    const componentIds = rows.map((row) => row.id);
    const specRows: Array<{
      id: number;
      component_id: number;
      markdown_path: string;
      doc_status: string;
      coverage: number;
    }> = [];
    const proofRows: Array<{
      id: number;
      component_id: number;
      image_path: string;
      screenshot_url: string | null;
      caption: string | null;
      captured_at: string | null;
      captured_at_epoch: number | null;
      node_id: string | null;
      image_sha256: string | null;
      image_bytes: number | null;
      image_content_type: string | null;
      image_width: number | null;
      image_height: number | null;
      variants_count: number | null;
      variants_json: string | null;
    }> = [];

    for (let i = 0; i < componentIds.length; i += ComponentRepository.IN_BATCH_SIZE) {
      const batch = componentIds.slice(i, i + ComponentRepository.IN_BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(', ');
      if (!placeholders) continue;

      specRows.push(
        ...this.db
          .prepare(`
            SELECT id, component_id, markdown_path, doc_status, coverage
            FROM component_specs
            WHERE component_id IN (${placeholders})
          `)
          .all(...batch) as Array<{
            id: number;
            component_id: number;
            markdown_path: string;
            doc_status: string;
            coverage: number;
          }>,
      );

      proofRows.push(
        ...this.db
          .prepare(`
            SELECT id, component_id, image_path, screenshot_url, caption, captured_at, captured_at_epoch, node_id, image_sha256, image_bytes, image_content_type, image_width, image_height, variants_count, variants_json
            FROM component_visual_proofs
            WHERE component_id IN (${placeholders})
            ORDER BY captured_at_epoch DESC, captured_at DESC, id DESC
          `)
          .all(...batch) as Array<{
            id: number;
            component_id: number;
            image_path: string;
            screenshot_url: string | null;
            caption: string | null;
            captured_at: string | null;
            captured_at_epoch: number | null;
            node_id: string | null;
            image_sha256: string | null;
            image_bytes: number | null;
            image_content_type: string | null;
            image_width: number | null;
            image_height: number | null;
            variants_count: number | null;
            variants_json: string | null;
          }>,
      );
    }

    const specsByComponentId = new Map<number, ComponentSpecEntry[]>();
    for (const row of specRows) {
      const prev = specsByComponentId.get(row.component_id) || [];
      prev.push({
        id: row.id,
        componentId: row.component_id,
        markdownPath: row.markdown_path,
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
        capturedAt: row.captured_at ?? undefined,
        capturedAtEpoch: row.captured_at_epoch ?? undefined,
        nodeId: row.node_id ?? undefined,
        imageSha256: row.image_sha256 ?? undefined,
        imageBytes: row.image_bytes ?? undefined,
        imageContentType: row.image_content_type ?? undefined,
        imageWidth: row.image_width ?? undefined,
        imageHeight: row.image_height ?? undefined,
        variantsCount: row.variants_count ?? undefined,
        variants: ComponentRepository.parseVariantsJson(row.variants_json, row.id, row.component_id),
      });
      proofsByComponentId.set(row.component_id, prev);
    }

    const structuredByComponentId = this.loadStructuredFigmaByComponentIds(componentIds);

    return rows.map((row) => ({
      id: row.id,
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

  /**
   * Get component by slug
   */
  getBySlug(dsId: string, slug: string): ComponentEntry | null {
    const row = this.db
      .prepare(`
        SELECT c.id, c.ds_id, c.slug, c.name, c.status, c.doc_type, c.figma_file_url, c.figma_component_set_node_id, c.figma_page_name,
               (SELECT 1 FROM component_editorial ce WHERE ce.component_id = c.id) AS has_editorial
        FROM components c
        WHERE c.ds_id = ? AND c.slug = ?
      `)
      .get(dsId, slug) as
      | {
        id: number;
        ds_id: string;
        slug: string;
        name: string;
        status: string;
        doc_type: string;
        figma_file_url: string | null;
        figma_component_set_node_id: string | null;
        figma_page_name: string | null;
        has_editorial: number | null;
      }
      | undefined;

    if (!row) return null;

    const structured = this.loadStructuredFigmaByComponentIds([row.id]).get(row.id);

    return {
      id: row.id,
      dsId: row.ds_id,
      slug: row.slug,
      name: row.name,
      status: row.status as ComponentEntry['status'],
      docType: row.doc_type as ComponentEntry['docType'],
      figmaFileUrl: row.figma_file_url ?? undefined,
      figmaComponentSetNodeId: row.figma_component_set_node_id ?? undefined,
      figma: ComponentRepository.buildFigmaData(row.figma_page_name, structured),
      specs: this.getSpecs(row.id),
      visualProofs: this.getVisualProofs(row.id),
      editorialExists: Boolean(row.has_editorial),
    };
  }

  /**
   * Get specs for a component
   */
  private getSpecs(componentId: number): ComponentSpecEntry[] {
    const rows = this.db
      .prepare(`
        SELECT id, component_id, markdown_path, doc_status, coverage
        FROM component_specs
        WHERE component_id = ?
      `)
      .all(componentId) as Array<{
        id: number;
        component_id: number;
        markdown_path: string;
        doc_status: string;
        coverage: number;
      }>;

    return rows.map((row) => ({
      id: row.id,
      componentId: row.component_id,
      markdownPath: row.markdown_path,
      docStatus: row.doc_status as ComponentSpecEntry['docStatus'],
      coverage: row.coverage,
    }));
  }

  /**
   * Get visual proofs for a component
   */
  private getVisualProofs(componentId: number): ComponentVisualProofEntry[] {
    const rows = this.db
      .prepare(`
        SELECT id, component_id, image_path, screenshot_url, caption, captured_at, captured_at_epoch, node_id, image_sha256, image_bytes, image_content_type, image_width, image_height, variants_count, variants_json
        FROM component_visual_proofs
        WHERE component_id = ?
        ORDER BY captured_at_epoch DESC, captured_at DESC, id DESC
      `)
      .all(componentId) as Array<{
        id: number;
        component_id: number;
        image_path: string;
        screenshot_url: string | null;
        caption: string | null;
        captured_at: string | null;
        captured_at_epoch: number | null;
        node_id: string | null;
        image_sha256: string | null;
        image_bytes: number | null;
        image_content_type: string | null;
        image_width: number | null;
        image_height: number | null;
        variants_count: number | null;
        variants_json: string | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      componentId: row.component_id,
      imagePath: row.image_path,
      screenshotUrl: row.screenshot_url ?? undefined,
      caption: row.caption ?? undefined,
      capturedAt: row.captured_at ?? undefined,
      capturedAtEpoch: row.captured_at_epoch ?? undefined,
      nodeId: row.node_id ?? undefined,
      imageSha256: row.image_sha256 ?? undefined,
      imageBytes: row.image_bytes ?? undefined,
      imageContentType: row.image_content_type ?? undefined,
      imageWidth: row.image_width ?? undefined,
      imageHeight: row.image_height ?? undefined,
      variantsCount: row.variants_count ?? undefined,
      variants: ComponentRepository.parseVariantsJson(row.variants_json, row.id, row.component_id),
    }));
  }

  /**
   * Upsert components from registry (bulk operation)
   */
  upsertFromRegistry(dsId: string, entries: ComponentRegistryEntry[]): number {
    const tx = this.db.transaction(() => {
      let upsertedCount = 0;

      for (const entry of entries) {
        const now = Math.floor(Date.now() / 1000);

        this.db
          .prepare(`
            INSERT INTO components (ds_id, slug, name, status, doc_type, figma_file_url, figma_component_set_node_id, figma_page_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ds_id, slug) DO UPDATE SET
              name = excluded.name,
              status = excluded.status,
              doc_type = excluded.doc_type,
              figma_file_url = excluded.figma_file_url,
              figma_component_set_node_id = excluded.figma_component_set_node_id,
              figma_page_name = excluded.figma_page_name,
              updated_at = excluded.updated_at
          `)
          .run(
            dsId,
            entry.slug,
            entry.name,
            entry.status ?? 'draft',
            entry.docType ?? 'component',
            entry.figma?.fileUrl ?? null,
            entry.figma?.componentSetNodeId ?? null,
            entry.figma?.pageName ?? null,
            now,
            now,
          );

        const row = this.db
          .prepare('SELECT id FROM components WHERE ds_id=? AND slug=?')
          .get(dsId, entry.slug) as { id: number };
        const componentId = row.id;
        upsertedCount += 1;

        if (Array.isArray(entry.specs)) {
          this.db.prepare('DELETE FROM component_specs WHERE component_id = ?').run(componentId);

          if (entry.specs.length > 0) {
            const specStmt = this.db.prepare(`
              INSERT INTO component_specs (component_id, markdown_path, doc_status, coverage, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(component_id, markdown_path) DO UPDATE SET
                doc_status = excluded.doc_status,
                coverage = excluded.coverage,
                updated_at = excluded.updated_at
            `);

            for (const spec of entry.specs) {
              specStmt.run(
                componentId,
                spec.markdownPath,
                spec.docStatus ?? 'draft',
                spec.coverage ?? 0,
                now,
                now,
              );
            }
          }
        }

        if (entry.visualProofs && entry.visualProofs.length > 0) {
          const proofStmt = this.db.prepare(`
            INSERT INTO component_visual_proofs (component_id, image_path, screenshot_url, caption, captured_at, captured_at_epoch, node_id, image_sha256, image_bytes, image_content_type, image_width, image_height, variants_count, variants_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(component_id, image_path) DO UPDATE SET
              screenshot_url = excluded.screenshot_url,
              caption = excluded.caption,
              captured_at = excluded.captured_at,
              captured_at_epoch = excluded.captured_at_epoch,
              node_id = excluded.node_id,
              image_sha256 = excluded.image_sha256,
              image_bytes = excluded.image_bytes,
              image_content_type = excluded.image_content_type,
              image_width = excluded.image_width,
              image_height = excluded.image_height,
              variants_count = excluded.variants_count,
              variants_json = excluded.variants_json
          `);

          for (const proof of entry.visualProofs) {
            const capturedAt = proof.capturedAt ?? null;
            const capturedAtEpoch = ComponentRepository.toCapturedAtEpoch(
              proof.capturedAt,
              proof.capturedAtEpoch,
            );
            proofStmt.run(
              componentId,
              proof.imagePath,
              proof.screenshotUrl ?? null,
              proof.caption ?? null,
              capturedAt,
              capturedAtEpoch,
              proof.nodeId ?? null,
              proof.imageSha256 ?? null,
              proof.imageBytes ?? null,
              proof.imageContentType ?? null,
              proof.imageWidth ?? null,
              proof.imageHeight ?? null,
              proof.variantsCount ?? null,
              Array.isArray(proof.variants) ? JSON.stringify(proof.variants) : null,
              now,
            );
          }
        }

        if (entry.figma) {
          const figmaRunId = String(entry.figma.runId || '').trim() || null;
          const figmaCapturedAt = Number.isFinite(Number(entry.figma.capturedAtEpoch))
            ? Number(entry.figma.capturedAtEpoch)
            : now;
          const figmaSchemaVersion = Number.isFinite(Number(entry.figma.schemaVersion))
            ? Number(entry.figma.schemaVersion)
            : 1;
          const shouldReplaceStructuredData = ComponentRepository.shouldReplaceStructuredFigmaData(entry.figma);

          if (shouldReplaceStructuredData) {
            this.db.prepare('DELETE FROM component_figma_variants WHERE component_id = ?').run(componentId);
            this.db.prepare('DELETE FROM component_figma_token_bindings WHERE component_id = ?').run(componentId);
            this.db.prepare('DELETE FROM component_figma_layout_rows WHERE component_id = ?').run(componentId);
          }

          if (shouldReplaceStructuredData && Array.isArray(entry.figma.variants) && entry.figma.variants.length > 0) {
            const variantStmt = this.db.prepare(`
              INSERT INTO component_figma_variants (component_id, variant_name, node_id, properties_json, run_id, captured_at, schema_version)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
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
              variantStmt.run(
                componentId,
                variantName,
                String(variant.nodeId || '').trim(),
                propertiesJson,
                figmaRunId,
                figmaCapturedAt,
                figmaSchemaVersion,
              );
            }
          }

          if (
            shouldReplaceStructuredData &&
            Array.isArray(entry.figma.tokenBindings) &&
            entry.figma.tokenBindings.length > 0
          ) {
            const bindingStmt = this.db.prepare(`
              INSERT INTO component_figma_token_bindings (
                component_id, node_id, node_name, field, variable_id, token_path, mode,
                run_id, captured_at, schema_version,
                variant_node_id, variant_signature, property_path, status, mode_id, mode_name
              )
              VALUES (
                @component_id, @node_id, @node_name, @field, @variable_id, @token_path, @mode,
                @run_id, @captured_at, @schema_version,
                @variant_node_id, @variant_signature, @property_path, @status, @mode_id, @mode_name
              )
            `);
            const seenBindings = new Set<string>();
            for (const binding of entry.figma.tokenBindings) {
              const nodeId = String(binding.nodeId || '').trim();
              const nodeName = String(binding.nodeName || '').trim();
              const field = String(binding.field || '').trim();
              const variableId = String(binding.variableId || '').trim();
              const mode = String(binding.mode || '').trim();
              if (!nodeId || !nodeName || !field || !variableId) continue;

              // Dedupe key aligned with unique index
              // (component_id, variant_node_id, node_id, property_path, mode_id, variable_id)
              const variantNodeId = String(binding.variantNodeId || '').trim();
              const propertyPath = String(binding.propertyPath || field).trim().toLowerCase();
              const modeId = String(binding.modeId || '').trim();
              const dedupeKey = `${variantNodeId}\x00${nodeId}\x00${propertyPath}\x00${modeId}\x00${variableId}`;
              if (seenBindings.has(dedupeKey)) continue;
              seenBindings.add(dedupeKey);

              const status = binding.status
                ? (binding.status === 'unresolved' ? 'unresolved' : 'resolved')
                : (String(binding.tokenPath || '').trim() ? 'resolved' : 'unresolved');
              const variantSignature = String(binding.variantSignature || '').trim();
              const modeName = String(binding.modeName || mode).trim();

              bindingStmt.run({
                component_id: componentId,
                node_id: nodeId,
                node_name: nodeName,
                field,
                variable_id: variableId,
                token_path: String(binding.tokenPath || '').trim() || null,
                mode,
                run_id: figmaRunId,
                captured_at: figmaCapturedAt,
                schema_version: figmaSchemaVersion,
                variant_node_id: variantNodeId,
                variant_signature: variantSignature,
                property_path: propertyPath,
                status,
                mode_id: modeId,
                mode_name: modeName,
              });
            }
          }

          if (shouldReplaceStructuredData && Array.isArray(entry.figma.layout) && entry.figma.layout.length > 0) {
            const layoutStmt = this.db.prepare(`
              INSERT INTO component_figma_layout_rows (
                component_id, node_id, node_name, depth,
                direction, h_sizing, v_sizing, alignment_h, alignment_v,
                item_spacing, padding_top, padding_right, padding_bottom, padding_left,
                run_id, captured_at, schema_version
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const rowItem of entry.figma.layout) {
              const nodeId = String(rowItem.nodeId || '').trim();
              const nodeName = String(rowItem.nodeName || '').trim();
              if (!nodeId || !nodeName) continue;
              layoutStmt.run(
                componentId,
                nodeId,
                nodeName,
                Math.max(0, ComponentRepository.toIntOrDefault(rowItem.depth, 0)),
                String(rowItem.direction || '').trim() || null,
                String(rowItem.hSizing || '').trim() || null,
                String(rowItem.vSizing || '').trim() || null,
                String(rowItem.alignmentH || '').trim() || null,
                String(rowItem.alignmentV || '').trim() || null,
                Number.isFinite(Number(rowItem.itemSpacing)) ? Number(rowItem.itemSpacing) : null,
                rowItem.padding ? Number(rowItem.padding.top) : null,
                rowItem.padding ? Number(rowItem.padding.right) : null,
                rowItem.padding ? Number(rowItem.padding.bottom) : null,
                rowItem.padding ? Number(rowItem.padding.left) : null,
                figmaRunId,
                figmaCapturedAt,
                figmaSchemaVersion,
              );
            }
          }
        }
      }

      return upsertedCount;
    });

    return tx();
  }

  /**
   * Delete all components for a design system
   */
  deleteAll(dsId: string): number {
    const result = this.db.prepare('DELETE FROM components WHERE ds_id = ?').run(dsId);
    return result.changes;
  }

  /**
   * Mark components as missing if they exist in DB but not in provided slugs
   */
  markMissingComponents(dsId: string, existingSlugs: string[]): number {
    if (existingSlugs.length === 0) {
      const result = this.db
        .prepare(`
          UPDATE components
          SET status = 'missing', updated_at = strftime('%s', 'now')
          WHERE ds_id = ? AND status != 'missing'
        `)
        .run(dsId);
      return result.changes;
    }

    const existingSlugSet = new Set(existingSlugs);
    const activeRows = this.db
      .prepare(`
        SELECT slug
        FROM components
        WHERE ds_id = ? AND status != 'missing'
      `)
      .all(dsId) as Array<{ slug: string }>;

    const missingSlugs = activeRows
      .map((row) => row.slug)
      .filter((slug) => !existingSlugSet.has(slug));
    if (missingSlugs.length === 0) {
      return 0;
    }

    let changed = 0;
    for (let i = 0; i < missingSlugs.length; i += ComponentRepository.IN_BATCH_SIZE) {
      const batch = missingSlugs.slice(i, i + ComponentRepository.IN_BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(', ');
      const result = this.db
        .prepare(`
          UPDATE components
          SET status = 'missing', updated_at = strftime('%s', 'now')
          WHERE ds_id = ? AND slug IN (${placeholders}) AND status != 'missing'
        `)
        .run(dsId, ...batch);
      changed += result.changes;
    }
    return changed;
  }

  /**
   * Resolve component ID from slug (scoped to active system).
   */
  getComponentIdBySlug(slug: string, dsId?: string): number | null {
    const row = dsId
      ? this.db.prepare(`
      SELECT id FROM components WHERE ds_id = ? AND slug = ? LIMIT 1
    `).get(dsId, slug) as { id: number } | undefined
      : this.db.prepare(`
      SELECT id FROM components WHERE slug = ? ORDER BY updated_at DESC LIMIT 1
    `).get(slug) as { id: number } | undefined;
    return row?.id ?? null;
  }

  /**
   * S-01: Fetch basic component info for doc assembly.
   * Note: display_name column does not exist in schema yet — returns null always.
   */
  getComponentBasicInfo(componentId: number): ComponentBasicInfo | null {
    const row = this.db.prepare(`
      SELECT name, figma_component_set_node_id FROM components WHERE id = ?
    `).get(componentId) as { name: string; figma_component_set_node_id: string | null } | undefined;
    if (!row) return null;
    return { name: row.name, displayName: null, figmaComponentSetNodeId: row.figma_component_set_node_id ?? null };
  }

  /**
   * Resolve component by Figma component set node id.
   * If dsId is provided, resolution is scoped to that design system.
   */
  getComponentByFigmaNodeId(
    figmaComponentSetNodeId: string,
    dsId?: string,
  ): { id: number; slug: string } | null {
    if (dsId) {
      const row = this.db.prepare(`
        SELECT id, slug
        FROM components
        WHERE ds_id = ? AND figma_component_set_node_id = ? AND status != 'missing'
        LIMIT 1
      `).get(dsId, figmaComponentSetNodeId) as { id: number; slug: string } | undefined;
      return row ?? null;
    }

    const row = this.db.prepare(`
      SELECT id, slug
      FROM components
      WHERE figma_component_set_node_id = ? AND status != 'missing'
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(figmaComponentSetNodeId) as { id: number; slug: string } | undefined;
    return row ?? null;
  }

  /**
   * Compute DB-based staleness for a component.
   * Compares component_editorial.updated_at vs latest component_figma_variants.captured_at.
   * Returns 'fresh', 'stale', or 'missing'.
   */
  getComponentDocStaleness(componentId: number): {
    status: 'fresh' | 'stale' | 'missing';
    editorialUpdatedAt: number | null;
    capturedAt: number | null;
  } {
    const stmt = this.db.prepare(`
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
      WHERE c.id = ?
    `);
    const row = stmt.get(componentId) as {
      editorial_updated_at: number | null;
      captured_at: number | null;
    } | undefined;

    if (!row) {
      return { status: 'missing', editorialUpdatedAt: null, capturedAt: null };
    }

    const editorialUpdatedAt = row.editorial_updated_at ?? null;
    const capturedAt = row.captured_at ?? null;
    const editorialUpdatedAtMs = editorialUpdatedAt ? editorialUpdatedAt * 1000 : null;
    const capturedAtMs = capturedAt ? capturedAt * 1000 : null;

    if (!capturedAt) {
      return {
        status: editorialUpdatedAt ? 'fresh' : 'missing',
        editorialUpdatedAt: editorialUpdatedAtMs,
        capturedAt: null,
      };
    }

    if (!editorialUpdatedAt) {
      return { status: 'missing', editorialUpdatedAt: null, capturedAt: capturedAtMs };
    }

    // Both are in seconds (strftime('%s', 'now'))
    return {
      status: editorialUpdatedAt >= capturedAt ? 'fresh' : 'stale',
      editorialUpdatedAt: editorialUpdatedAtMs,
      capturedAt: capturedAtMs,
    };
  }

  /**
   * Compute DB-based staleness for all components in a single query.
   * Optionally scoped to a design system id.
   */
  listComponentDocStaleness(dsId?: string): Array<{
    id: number;
    slug: string;
    status: 'fresh' | 'stale' | 'missing';
    editorialUpdatedAt: number | null;
    capturedAt: number | null;
  }> {
    const rows = (dsId
      ? this.db.prepare(`
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
      WHERE c.status != 'missing' AND c.ds_id = ?
    `).all(dsId)
      : this.db.prepare(`
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
    `).all()) as Array<{
        id: number;
        slug: string;
        editorial_updated_at: number | null;
        captured_at: number | null;
      }>;

    return rows.map((row) => {
      const editorialUpdatedAtMs = row.editorial_updated_at
        ? row.editorial_updated_at * 1000
        : null;
      const capturedAtMs = row.captured_at ? row.captured_at * 1000 : null;

      let status: 'fresh' | 'stale' | 'missing';
      if (!row.captured_at) {
        status = row.editorial_updated_at ? 'fresh' : 'missing';
      } else if (!row.editorial_updated_at) {
        status = 'missing';
      } else {
        status = row.editorial_updated_at >= row.captured_at ? 'fresh' : 'stale';
      }

      return {
        id: row.id,
        slug: row.slug,
        status,
        editorialUpdatedAt: editorialUpdatedAtMs,
        capturedAt: capturedAtMs,
      };
    });
  }

  /**
   * Get the Figma component set node ID for a component.
   * Used by routes that need to call Figma bridge for a known component.
   */
  getFigmaComponentSetNodeId(componentId: number): string | null {
    const row = this.db.prepare(`
      SELECT figma_component_set_node_id FROM components WHERE id = ?
    `).get(componentId) as { figma_component_set_node_id: string | null } | undefined;
    return row?.figma_component_set_node_id ?? null;
  }

  /**
   * Get the stored Figma file URL for a component.
   */
  getFigmaFileUrl(componentId: number): string | null {
    const row = this.db.prepare(`
      SELECT figma_file_url FROM components WHERE id = ?
    `).get(componentId) as { figma_file_url: string | null } | undefined;
    return row?.figma_file_url ?? null;
  }

  /**
   * S-11: Compute doc status from component_docs table (independent of editorial metadata).
   *
   * Logic:
   * - If a row exists in component_docs → check applied_at vs figma_descriptions_synced_at
   *   - applied_at >= synced_at → 'fresh'
   *   - applied_at < synced_at  → 'stale'
   * - No row in component_docs → 'missing'
   */
  listDocStatusFromComponentDocs(dsId?: string): Array<{
    id: number;
    slug: string;
    status: 'fresh' | 'stale' | 'missing';
    appliedAt: number | null;
  }> {
    const rows = (dsId
      ? this.db.prepare(`
      SELECT
        c.id,
        c.slug,
        cd.applied_at AS applied_at,
        c.figma_descriptions_synced_at AS synced_at
      FROM components c
      LEFT JOIN component_docs cd ON cd.component_id = c.id
      WHERE c.status != 'missing' AND c.ds_id = ?
      ORDER BY c.slug ASC
    `).all(dsId)
      : this.db.prepare(`
      SELECT
        c.id,
        c.slug,
        cd.applied_at AS applied_at,
        c.figma_descriptions_synced_at AS synced_at
      FROM components c
      LEFT JOIN component_docs cd ON cd.component_id = c.id
      WHERE c.status != 'missing'
      ORDER BY c.slug ASC
    `).all()) as Array<{
        id: number;
        slug: string;
        applied_at: number | null;
        synced_at: number | null;
      }>;

    return rows.map(row => {
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

  // ===========================================================================
  // S-03: Figma descriptions CRUD (component_figma_variants + components)
  // ===========================================================================

  /**
   * Save Figma descriptions (component set description + variant descriptions)
   * and update figma_descriptions_synced_at on the components row.
   */
  saveFigmaDescriptions(
    componentId: number,
    data: {
      componentSet: string | null;
      syncedAt: number;
      variants: Array<{ nodeId: string; canonicalKey: string; description: string | null }>;
    },
  ): void {
    const tx = this.db.transaction(() => {
      // Update component set description + synced_at
      this.db.prepare(`
        UPDATE components
        SET figma_description = ?, figma_descriptions_synced_at = ?
        WHERE id = ?
      `).run(data.componentSet ?? null, data.syncedAt, componentId);

      // Upsert variants
      // NOTE: variant_name is TEXT NOT NULL in the schema; we use canonicalKey
      // as the variant_name since it uniquely identifies the variant properties.
      // ON CONFLICT must match the UNIQUE(component_id, variant_name, node_id).
      const upsert = this.db.prepare(`
        INSERT INTO component_figma_variants (component_id, node_id, variant_name, canonical_key, description)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(component_id, variant_name, node_id) DO UPDATE SET
          canonical_key = EXCLUDED.canonical_key,
          description = EXCLUDED.description
      `);

      for (const v of data.variants) {
        const vName = v.canonicalKey || '';
        upsert.run(componentId, v.nodeId, vName, v.canonicalKey || null, v.description ?? null);
      }
    });
    tx();
  }

  /**
   * Replace all token bindings for a component with the provided set.
   * Used when enriching a component on-demand (e.g. during AI doc generation)
   * without running a full Figma sync.
   */
  saveTokenBindingsForComponent(
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
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM component_figma_token_bindings WHERE component_id = ?').run(componentId);
      const stmt = this.db.prepare(`
        INSERT INTO component_figma_token_bindings (
          component_id, node_id, node_name, field, variable_id, token_path, mode,
          run_id, captured_at, schema_version,
          variant_node_id, variant_signature, property_path, status, mode_id, mode_name
        )
        VALUES (
          @component_id, @node_id, @node_name, @field, @variable_id, @token_path, @mode,
          @run_id, @captured_at, @schema_version,
          @variant_node_id, @variant_signature, @property_path, @status, @mode_id, @mode_name
        )
      `);
      const seen = new Set<string>();
      for (const b of bindings) {
        const nodeId = String(b.nodeId || '').trim();
        const nodeName = String(b.nodeName || '').trim();
        const field = String(b.field || '').trim();
        const variableId = String(b.variableId || '').trim();
        if (!nodeId || !nodeName || !field || !variableId) continue;
        const variantNodeId = String(b.variantNodeId || '').trim();
        const propertyPath = String(b.propertyPath || field).trim().toLowerCase();
        const modeId = String(b.modeId || '').trim();
        const dedupeKey = `${variantNodeId}\x00${nodeId}\x00${propertyPath}\x00${modeId}\x00${variableId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const status = b.status
          ? (b.status === 'unresolved' ? 'unresolved' : 'resolved')
          : (String(b.tokenPath || '').trim() ? 'resolved' : 'unresolved');
        stmt.run({
          component_id: componentId,
          node_id: nodeId,
          node_name: nodeName,
          field,
          variable_id: variableId,
          token_path: b.tokenPath ?? null,
          mode: '',
          run_id: null,
          captured_at: now,
          schema_version: 1,
          variant_node_id: variantNodeId,
          variant_signature: String(b.variantSignature || '').trim(),
          property_path: propertyPath,
          status,
          mode_id: modeId,
          mode_name: String(b.modeName || '').trim(),
        });
      }
    });
    tx();
  }

  /**
   * Get Figma descriptions for a component.
   * Returns null if no descriptions have ever been synced.
   */
  getFigmaDescriptions(
    componentId: number,
  ): FigmaDescriptionsRawResult | null {
    const compRow = this.db.prepare(`
      SELECT figma_description, figma_descriptions_synced_at
      FROM components
      WHERE id = ?
    `).get(componentId) as { figma_description: string | null; figma_descriptions_synced_at: number | null } | undefined;

    if (!compRow || compRow.figma_descriptions_synced_at == null) return null;

    const variantRows = this.db.prepare(`
      SELECT node_id, canonical_key, description
      FROM component_figma_variants
      WHERE component_id = ?
      ORDER BY id ASC
    `).all(componentId) as Array<{ node_id: string; canonical_key: string | null; description: string | null }>;

    return {
      componentSet: compRow.figma_description ?? null,
      variants: variantRows.map(v => ({
        nodeId: v.node_id,
        canonicalKey: v.canonical_key ?? '',
        description: v.description ?? null,
      })),
      syncedAt: compRow.figma_descriptions_synced_at,
    };
  }

  // ===========================================================================
  // S-03: Component docs CRUD (component_docs table)
  // ===========================================================================

  /**
   * Save or replace an AI-generated component doc.
   */
  saveComponentDoc(
    componentId: number,
    data: { outputJson: string; editorialJson?: string | null; jobId: string },
  ): void {
    this.db.prepare(`
      INSERT INTO component_docs (component_id, output_json, editorial_json, job_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(component_id) DO UPDATE SET
        output_json = EXCLUDED.output_json,
        editorial_json = EXCLUDED.editorial_json,
        job_id = EXCLUDED.job_id,
        applied_at = strftime('%s', 'now')
    `).run(componentId, data.outputJson, data.editorialJson ?? null, data.jobId);
  }

  /**
   * Get the AI-generated doc for a component, or null if none exists.
   */
  getComponentDoc(componentId: number): ComponentDocRecord | null {
    const row = this.db.prepare(`
      SELECT id, component_id, output_json, editorial_json, job_id, applied_at
      FROM component_docs
      WHERE component_id = ?
    `).get(componentId) as {
      id: number;
      component_id: number;
      output_json: string;
      editorial_json: string | null;
      job_id: string | null;
      applied_at: number;
    } | undefined;

    if (!row) return null;

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

// ===========================================================================
// S-03: Exported types for Figma descriptions resolution
// ===========================================================================

/**
 * Raw DB result for Figma descriptions (no staleness computed).
 * See services/figma-descriptions-resolver.ts for the enriched type.
 */
export interface FigmaDescriptionsRawResult {
  componentSet: string | null;
  variants: Array<{ nodeId: string; canonicalKey: string; description: string | null }>;
  syncedAt: number | null;
}

/**
 * A stored AI-generated component doc row.
 */
export interface ComponentDocRecord {
  id: number;
  componentId: number;
  outputJson: string;
  editorialJson: string | null;
  jobId: string | null;
  appliedAt: number;
}
