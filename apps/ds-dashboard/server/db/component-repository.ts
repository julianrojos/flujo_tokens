/**
 * Component Repository
 *
 * DB-backed repository for components, component_specs, and component_visual_proofs.
 */

import Database from 'better-sqlite3';
import { normalizeVisualProofVariants } from '../lib/visual-proof-normalizer.js';

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
    };
}

/**
 * Component Repository for SQLite-backed storage
 */
export class ComponentRepository {
    private db: Database.Database;
    /**
     * Keep batched `IN (...)` queries comfortably below SQLite's host-parameter limit
     * while still reducing roundtrips for large registries. Default SQLite host parameter
     * limit is high, but this keeps each generated IN list and query payload conservative.
     */
    private static readonly IN_BATCH_SIZE = 500;

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

    /**
     * Get all components for a design system
     */
    getAll(dsId: string): ComponentEntry[] {
        const stmt = this.db.prepare(`
            SELECT c.id, c.ds_id, c.slug, c.name, c.status, c.doc_type, c.figma_file_url, c.figma_component_set_node_id
            FROM components c
            WHERE c.ds_id = ?
            ORDER BY c.name
        `);
        const rows = stmt.all(dsId) as Array<{
            id: number;
            ds_id: string;
            slug: string;
            name: string;
            status: string;
            doc_type: string;
            figma_file_url: string | null;
            figma_component_set_node_id: string | null;
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

            specRows.push(...this.db.prepare(`
                SELECT id, component_id, markdown_path, doc_status, coverage
                FROM component_specs
                WHERE component_id IN (${placeholders})
            `).all(...batch) as Array<{
                id: number;
                component_id: number;
                markdown_path: string;
                doc_status: string;
                coverage: number;
            }>);

            proofRows.push(...this.db.prepare(`
                SELECT id, component_id, image_path, screenshot_url, caption, captured_at, captured_at_epoch, node_id, image_sha256, image_bytes, image_content_type, image_width, image_height, variants_count, variants_json
                FROM component_visual_proofs
                WHERE component_id IN (${placeholders})
                ORDER BY captured_at_epoch DESC, captured_at DESC, id DESC
            `).all(...batch) as Array<{
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
            }>);
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
                variants: ComponentRepository.parseVariantsJson(
                    row.variants_json,
                    row.id,
                    row.component_id,
                ),
            });
            proofsByComponentId.set(row.component_id, prev);
        }

        return rows.map((row) => ({
            id: row.id,
            dsId: row.ds_id,
            slug: row.slug,
            name: row.name,
            status: row.status as ComponentEntry['status'],
            docType: row.doc_type as ComponentEntry['docType'],
            figmaFileUrl: row.figma_file_url ?? undefined,
            figmaComponentSetNodeId: row.figma_component_set_node_id ?? undefined,
            specs: specsByComponentId.get(row.id) || [],
            visualProofs: proofsByComponentId.get(row.id) || [],
        }));
    }

    /**
     * Get component by slug
     */
    getBySlug(dsId: string, slug: string): ComponentEntry | null {
        const stmt = this.db.prepare(`
            SELECT c.id, c.ds_id, c.slug, c.name, c.status, c.doc_type, c.figma_file_url, c.figma_component_set_node_id
            FROM components c
            WHERE c.ds_id = ? AND c.slug = ?
        `);
        const row = stmt.get(dsId, slug) as Array<{
            id: number;
            ds_id: string;
            slug: string;
            name: string;
            status: string;
            doc_type: string;
            figma_file_url: string | null;
            figma_component_set_node_id: string | null;
        }>[0];

        if (!row) return null;

        return {
            id: row.id,
            dsId: row.ds_id,
            slug: row.slug,
            name: row.name,
            status: row.status as ComponentEntry['status'],
            docType: row.doc_type as ComponentEntry['docType'],
            figmaFileUrl: row.figma_file_url ?? undefined,
            figmaComponentSetNodeId: row.figma_component_set_node_id ?? undefined,
            specs: this.getSpecs(row.id),
            visualProofs: this.getVisualProofs(row.id),
        };
    }

    /**
     * Get specs for a component
     */
    private getSpecs(componentId: number): ComponentSpecEntry[] {
        const stmt = this.db.prepare(`
            SELECT id, component_id, markdown_path, doc_status, coverage
            FROM component_specs
            WHERE component_id = ?
        `);
        const rows = stmt.all(componentId) as Array<{
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
        const stmt = this.db.prepare(`
            SELECT id, component_id, image_path, screenshot_url, caption, captured_at, captured_at_epoch, node_id, image_sha256, image_bytes, image_content_type, image_width, image_height, variants_count, variants_json
            FROM component_visual_proofs
            WHERE component_id = ?
            ORDER BY captured_at_epoch DESC, captured_at DESC, id DESC
        `);
        const rows = stmt.all(componentId) as Array<{
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
            variants: ComponentRepository.parseVariantsJson(
                row.variants_json,
                row.id,
                row.component_id,
            ),
        }));
    }

    /**
     * Upsert components from registry (bulk operation)
     */
    upsertFromRegistry(dsId: string, entries: ComponentRegistryEntry[]): number {
        const tx = this.db.transaction(() => {
            let upsertedCount = 0;

            for (const entry of entries) {
                // Upsert component
                const now = Math.floor(Date.now() / 1000);
                const componentStmt = this.db.prepare(`
                    INSERT INTO components (ds_id, slug, name, status, doc_type, figma_file_url, figma_component_set_node_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ds_id, slug) DO UPDATE SET
                        name = excluded.name,
                        status = excluded.status,
                        doc_type = excluded.doc_type,
                        figma_file_url = excluded.figma_file_url,
                        figma_component_set_node_id = excluded.figma_component_set_node_id,
                        updated_at = excluded.updated_at
                `);

                componentStmt.run(
                    dsId,
                    entry.slug,
                    entry.name,
                    entry.status ?? 'draft',
                    entry.docType ?? 'component',
                    entry.figma?.fileUrl ?? null,
                    entry.figma?.componentSetNodeId ?? null,
                    now,
                    now
                );

                const row = this.db.prepare('SELECT id FROM components WHERE ds_id=? AND slug=?').get(dsId, entry.slug) as { id: number };
                const componentId = row.id;
                upsertedCount++;

                // Replace specs when explicitly provided (including empty array to clear stale rows)
                if (Array.isArray(entry.specs)) {
                    this.db.prepare(`
                        DELETE FROM component_specs
                        WHERE component_id = ?
                    `).run(componentId);

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
                                now
                            );
                        }
                    }
                }

                // Upsert visual proofs if provided
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
                            now
                        );
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
        const stmt = this.db.prepare(`
            DELETE FROM components
            WHERE ds_id = ?
        `);
        const result = stmt.run(dsId);
        return result.changes;
    }

    /**
     * Mark components as missing if they exist in DB but not in provided slugs
     */
    markMissingComponents(dsId: string, existingSlugs: string[]): number {
        if (existingSlugs.length === 0) {
            const stmt = this.db.prepare(`
                UPDATE components
                SET status = 'missing', updated_at = strftime('%s', 'now')
                WHERE ds_id = ? AND status != 'missing'
            `);
            const result = stmt.run(dsId);
            return result.changes;
        }

        const existingSlugSet = new Set(existingSlugs);
        const activeRows = this.db.prepare(`
            SELECT slug
            FROM components
            WHERE ds_id = ? AND status != 'missing'
        `).all(dsId) as Array<{ slug: string }>;

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
            const stmt = this.db.prepare(`
                UPDATE components
                SET status = 'missing', updated_at = strftime('%s', 'now')
                WHERE ds_id = ? AND slug IN (${placeholders}) AND status != 'missing'
            `);
            const result = stmt.run(dsId, ...batch);
            changed += result.changes;
        }
        return changed;
    }
}
