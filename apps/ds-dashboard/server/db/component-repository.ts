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
 * Component Repository for SQLite-backed storage
 */
export class ComponentRepository {
  private db: Database.Database;
  private static readonly IN_BATCH_SIZE = 500;
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
      console.warn(
        `[component-repository] Invalid variants_json in component_visual_proofs id=${rowId} component_id=${componentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
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
      console.warn(
        `[component-repository] Invalid properties_json for component_id=${componentId} variant="${variantName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
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
          SELECT component_id, node_id, node_name, field, variable_id, token_path, mode, run_id, captured_at, schema_version
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
   * Get all components for a design system
   */
  getAll(dsId: string): ComponentEntry[] {
    const rows = this.db
      .prepare(`
        SELECT c.id, c.ds_id, c.slug, c.name, c.status, c.doc_type, c.figma_file_url, c.figma_component_set_node_id, c.figma_page_name
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
    }));
  }

  /**
   * Get component by slug
   */
  getBySlug(dsId: string, slug: string): ComponentEntry | null {
    const row = this.db
      .prepare(`
        SELECT c.id, c.ds_id, c.slug, c.name, c.status, c.doc_type, c.figma_file_url, c.figma_component_set_node_id, c.figma_page_name
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
              INSERT INTO component_figma_token_bindings (component_id, node_id, node_name, field, variable_id, token_path, mode, run_id, captured_at, schema_version)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const seenBindings = new Set<string>();
            for (const binding of entry.figma.tokenBindings) {
              const nodeId = String(binding.nodeId || '').trim();
              const nodeName = String(binding.nodeName || '').trim();
              const field = String(binding.field || '').trim();
              const variableId = String(binding.variableId || '').trim();
              const mode = String(binding.mode || '').trim();
              if (!nodeId || !nodeName || !field || !variableId) continue;
              const dedupeKey = `${nodeId}\x00${field}\x00${variableId}\x00${mode}`;
              if (seenBindings.has(dedupeKey)) continue;
              seenBindings.add(dedupeKey);
              bindingStmt.run(
                componentId,
                nodeId,
                nodeName,
                field,
                variableId,
                String(binding.tokenPath || '').trim() || null,
                mode,
                figmaRunId,
                figmaCapturedAt,
                figmaSchemaVersion,
              );
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
}
