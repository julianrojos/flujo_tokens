/**
 * AI Doc Status Service
 * Computes staleness status for component documentation
 */

import fs from 'fs/promises';
import path from 'path';
import { getPluginConnectionManager, type PluginConnectionManager } from './plugin-connection-manager.js';

/** Staleness window: components changed more recently than this are flagged */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Interface for plugin connection manager (allows mocking in tests)
 */
export interface PluginConnectionManagerLike {
    getConnectionCount(): number;
    getDocumentChangesWithFileKey(): Array<{
        changedNodeIds?: string[];
        timestamp: number;
        fileKey?: string;
    }>;
}

/**
 * Frontmatter regex patterns
 */
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const FIELD_RE = (key: string) => new RegExp(`^${key.replace('.', '\\.')}:\\s*(.+)$`, 'm');

/**
 * Extract a field from frontmatter
 */
function extractFrontmatterField(content: string, key: string): string | undefined {
    const fmMatch = content.match(FRONTMATTER_RE);
    if (!fmMatch) return undefined;
    const fieldMatch = fmMatch[1].match(FIELD_RE(key));
    return fieldMatch?.[1]?.trim();
}

/**
 * Source scope for staleness computation
 */
export type DocStatusSourceScope = 'docs_only' | 'docs_plus_recent_changes';

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

/**
 * Compute documentation staleness for all components
 * Uses 'docs_plus_recent_changes' strategy:
 * - Components with docs: show their staleness status
 * - Components seen in recent changes without docs: show as missing
 * @param docsDir - Directory containing component documentation files
 * @param manager - Optional manager for dependency injection (used in tests)
 */
export async function computeDocStatuses(
    docsDir: string,
    manager?: PluginConnectionManagerLike
): Promise<DocStatusResult> {
    const SOURCE_SCOPE: DocStatusSourceScope = 'docs_plus_recent_changes';
    const pluginManager = manager ?? getPluginConnectionManager();
    const connected = pluginManager.getConnectionCount() > 0;

    // Get document changes from plugin
    const documentChanges = connected ? pluginManager.getDocumentChangesWithFileKey() : [];

    // Find all .md files in docs directory
    let files: string[];
    try {
        files = await fs.readdir(docsDir);
    } catch {
        // Directory doesn't exist - still return changes as missing
        if (SOURCE_SCOPE === 'docs_plus_recent_changes' && documentChanges.length > 0) {
            const componentsFromChanges = getComponentsFromChanges(documentChanges);
            return {
                connected,
                sourceScope: SOURCE_SCOPE,
                components: componentsFromChanges
            };
        }
        return { connected, sourceScope: SOURCE_SCOPE, components: [] };
    }

    const mdFiles = files.filter(f => f.endsWith('.md'));
    const components: DocComponentStatus[] = [];
    const processedComponentIds = new Set<string>();

    // Pre-build index: componentId → most recent change timestamp (O(n) instead of O(n*m))
    const changeIndex = new Map<string, number>();
    for (const change of documentChanges) {
        if (change.changedNodeIds) {
            for (const nodeId of change.changedNodeIds) {
                const existing = changeIndex.get(nodeId);
                if (existing === undefined || change.timestamp > existing) {
                    changeIndex.set(nodeId, change.timestamp);
                }
            }
        }
    }

    // Process docs first
    for (const filename of mdFiles) {
        const filePath = path.join(docsDir, filename);
        const slug = filename.replace(/\.md$/, '');

        try {
            const content = await fs.readFile(filePath, 'utf-8');

            // Extract frontmatter fields
            const componentId = extractFrontmatterField(content, 'figma.component_set_node_id');
            const generatedAtStr = extractFrontmatterField(content, 'ai.generated_at');

            if (!componentId) {
                // No component ID in frontmatter, skip
                continue;
            }

            processedComponentIds.add(componentId);
            const generatedAt = generatedAtStr ? new Date(generatedAtStr).getTime() : undefined;

            // O(1) lookup via pre-built index
            const lastChangeAt = changeIndex.get(componentId);

            // Determine status
            let status: 'fresh' | 'stale' | 'missing';
            if (!generatedAt) {
                status = 'missing';
            } else if (lastChangeAt !== undefined && lastChangeAt > generatedAt) {
                status = 'stale';
            } else {
                status = 'fresh';
            }

            components.push({
                componentId,
                slug,
                status,
                generatedAt: generatedAtStr,
                lastChangeAt,
                filePath: path.relative(process.cwd(), filePath),
                origin: 'from_doc',
            });
        } catch (error) {
            // Failed to read file, skip with warning
            console.warn(`Failed to read file ${filePath}:`, error);
            continue;
        }
    }

    // Add components from recent changes that don't have docs
    if (SOURCE_SCOPE === 'docs_plus_recent_changes') {
        const thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS;
        for (const change of documentChanges) {
            if (change.changedNodeIds) {
                for (const nodeId of change.changedNodeIds) {
                    if (!processedComponentIds.has(nodeId)) {
                        processedComponentIds.add(nodeId);
                        if (change.timestamp > thirtyDaysAgo) {
                            components.push({
                                componentId: nodeId,
                                slug: nodeId, // No slug available
                                status: 'missing',
                                lastChangeAt: change.timestamp,
                                origin: 'from_change_event',
                            });
                        }
                    }
                }
            }
        }
    }

    return { connected, sourceScope: SOURCE_SCOPE, components };
}

/**
 * Extract unique component IDs from document changes
 */
function getComponentsFromChanges(documentChanges: Array<{ changedNodeIds?: string[]; timestamp: number }>): DocComponentStatus[] {
    const componentMap = new Map<string, number>();

    for (const change of documentChanges) {
        if (change.changedNodeIds) {
            for (const nodeId of change.changedNodeIds) {
                const existing = componentMap.get(nodeId);
                if (!existing || change.timestamp > existing) {
                    componentMap.set(nodeId, change.timestamp);
                }
            }
        }
    }

    const components: DocComponentStatus[] = [];
    const thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS;

    for (const [componentId, timestamp] of componentMap) {
        if (timestamp > thirtyDaysAgo) {
            components.push({
                componentId,
                slug: componentId,
                status: 'missing',
                lastChangeAt: timestamp,
                origin: 'from_change_event',
            });
        }
    }

    return components;
}

// ─── DB-first staleness (no filesystem dependency) ────────────────────────

export function computeDocStatusesDbFromSnapshots(
    snapshots: Array<{
        id: number;
        slug: string;
        status: 'fresh' | 'stale' | 'missing';
        editorialUpdatedAt: number | null;
        capturedAt: number | null;
    }>,
): DocStatusResult {
    return {
        connected: true,
        sourceScope: 'docs_plus_recent_changes',
        components: snapshots.map((snapshot) => ({
            componentId: String(snapshot.id),
            slug: snapshot.slug,
            status: snapshot.status,
            generatedAt: snapshot.editorialUpdatedAt
                ? new Date(snapshot.editorialUpdatedAt).toISOString()
                : undefined,
            lastChangeAt: snapshot.capturedAt ?? undefined,
            origin: 'from_doc',
        })),
    };
}
