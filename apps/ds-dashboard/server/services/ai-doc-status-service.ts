/**
 * AI Doc Status Service
 * Computes staleness status for component documentation
 *
 * S-11: Migrated from filesystem scan to DB-first via ComponentRepository.
 * The file-based computeDocStatuses is deprecated; use computeDocStatusesDb
 * for all new code.
 */

import type { ComponentRepository } from '../db/component-repository.js';

/**
 * Source scope for staleness computation
 */
export type DocStatusSourceScope = 'docs_only' | 'docs_plus_recent_changes' | 'docs_from_db';

/**
 * Component documentation status origin
 */
export type DocStatusOrigin = 'from_doc' | 'from_change_event';

/**
 * Component documentation status
 */
export interface DocComponentStatus {
    componentId: string;
    slug: string;
    status: 'fresh' | 'stale' | 'missing';
    generatedAt?: string;
    lastChangeAt?: number;
    filePath?: string;
    origin: DocStatusOrigin;
}

/**
 * Result of staleness computation
 */
export interface DocStatusResult {
    connected: boolean;
    sourceScope: DocStatusSourceScope;
    components: DocComponentStatus[];
}

// ─── DB-first staleness (S-11: single source of truth) ────────────────────

/**
 * Compute documentation staleness from DB.
 *
 * S-11: Reads from component_docs (applied_at) and components
 * (figma_descriptions_synced_at) to determine whether each component's
 * documentation is fresh, stale, or missing.
 *
 * Staleness logic:
 * - component_docs row exists → compare applied_at vs figma_descriptions_synced_at
 *   - applied_at >= synced_at → fresh
 *   - applied_at < synced_at  → stale
 * - No component_docs row → missing
 */
export async function computeDocStatusesDb(
    componentRepo: ComponentRepository,
    dsId?: string,
): Promise<DocStatusResult> {
    const snapshots = await componentRepo.listDocStatusFromComponentDocs(dsId);

    return {
        connected: true,
        sourceScope: 'docs_from_db',
        components: snapshots.map((snapshot) => ({
            componentId: String(snapshot.id),
            slug: snapshot.slug,
            status: snapshot.status,
            generatedAt: snapshot.appliedAt
                ? new Date(snapshot.appliedAt * 1000).toISOString()
                : undefined,
            lastChangeAt: snapshot.appliedAt ?? undefined,
            origin: 'from_doc',
        })),
    };
}

/**
 * Legacy signature: computeDocStatuses(docsDir, manager?).
 * S-11: Delegates to computeDocStatusesDb when db+repo are provided.
 * The old filesystem-scan implementation has been removed.
 *
 * @deprecated Pass { db, componentRepo } to use the DB-based path.
 *   The docsDir and manager parameters are ignored.
 */
export async function computeDocStatuses(
    _docsDir: string,
    _manager?: unknown,
    opts?: { componentRepo?: ComponentRepository },
): Promise<DocStatusResult> {
    if (opts?.componentRepo) {
        return await computeDocStatusesDb(opts.componentRepo);
    }
    // No DB available — return empty result (filesystem scan removed in S-11)
    return {
        connected: false,
        sourceScope: 'docs_from_db',
        components: [],
    };
}

// ─── Backwards-compatible snapshot wrapper ────────────────────────────────

/**
 * Compute documentation statuses from pre-fetched snapshot data.
 * Useful when the caller has already queried ComponentRepository.
 */
export function computeDocStatusesFromSnapshots(
    snapshots: Array<{
        id: number;
        slug: string;
        status: 'fresh' | 'stale' | 'missing';
        appliedAt: number | null;
    }>,
): DocStatusResult {
    return {
        connected: true,
        sourceScope: 'docs_from_db',
        components: snapshots.map((snapshot) => ({
            componentId: String(snapshot.id),
            slug: snapshot.slug,
            status: snapshot.status,
            generatedAt: snapshot.appliedAt
                ? new Date(snapshot.appliedAt * 1000).toISOString()
                : undefined,
            lastChangeAt: snapshot.appliedAt ?? undefined,
            origin: 'from_doc',
        })),
    };
}

/** @deprecated Use computeDocStatusesFromSnapshots */
export const computeDocStatusesDbFromSnapshots = computeDocStatusesFromSnapshots;
