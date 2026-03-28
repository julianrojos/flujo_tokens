/**
 * Component Repository
 *
 * DB-backed repository for components, component_specs, and component_visual_proofs.
 */

import Database from 'better-sqlite3';

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
    private static readonly IN_BATCH_SIZE = 500;

    constructor(db: Database.Database) {
        this.db = db;
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
                SELECT id, component_id, image_path, screenshot_url, caption
                FROM component_visual_proofs
                WHERE component_id IN (${placeholders})
            `).all(...batch) as Array<{
                id: number;
                component_id: number;
                image_path: string;
                screenshot_url: string | null;
                caption: string | null;
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
            SELECT id, component_id, image_path, screenshot_url, caption
            FROM component_visual_proofs
            WHERE component_id = ?
        `);
        const rows = stmt.all(componentId) as Array<{
            id: number;
            component_id: number;
            image_path: string;
            screenshot_url: string | null;
            caption: string | null;
        }>;

        return rows.map((row) => ({
            id: row.id,
            componentId: row.component_id,
            imagePath: row.image_path,
            screenshotUrl: row.screenshot_url ?? undefined,
            caption: row.caption ?? undefined,
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

                // Upsert specs if provided
                if (entry.specs && entry.specs.length > 0) {
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

                // Upsert visual proofs if provided
                if (entry.visualProofs && entry.visualProofs.length > 0) {
                    const proofStmt = this.db.prepare(`
                        INSERT INTO component_visual_proofs (component_id, image_path, screenshot_url, caption, created_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(component_id, image_path) DO UPDATE SET
                            screenshot_url = excluded.screenshot_url,
                            caption = excluded.caption
                    `);

                    for (const proof of entry.visualProofs) {
                        proofStmt.run(
                            componentId,
                            proof.imagePath,
                            proof.screenshotUrl ?? null,
                            proof.caption ?? null,
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
}
