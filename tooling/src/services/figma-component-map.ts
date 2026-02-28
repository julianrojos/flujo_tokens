/**
 * Figma Component Map Service
 *
 * Builds a map of components and component sets from Figma file.
 * Includes walkNode logic for tracking component ownership, nesting, and instance dependencies.
 * Migrated from tooling/scripts/lib/figma-component-map.mjs and integrated with existing types.
 */

import type { FigmaNode } from '../types/figma.js';

// ============================================================================
// Constants
// ============================================================================

const COMPONENT_SET_TYPE = 'COMPONENT_SET';
const COMPONENT_TYPE = 'COMPONENT';
const INSTANCE_TYPE = 'INSTANCE';
const PAGE_TYPE = 'CANVAS';
const SUPPORTED_FILE_SURFACES = new Set(['design', 'file']);
const MAX_TOP_DEPENDENCIES = 10;

// ============================================================================
// Interfaces
// ============================================================================

export interface FigmaComponentItem {
    id: string;
    name: string;
    nodeId: string;
    type: "component" | "component_set" | "unknown";
    description?: string;
    documentationLinks?: string[];
}

export interface FigmaPageItem {
    id: string;
    name: string;
    nodeId: string;
    type: "page";
    children?: FigmaComponentItem[];
}

export interface ParsedFigmaFileUrl {
    fileKey: string;
    fileName: string;
    fileSlug: string;
    surface: string;
    rootNodeId: string;
    figmaUrl: string;
}

export interface FigmaComponentMap {
    fileKey: string;
    fileName: string;
    fileSlug: string;
    surface: string;
    rootNodeId: string;
    figmaUrl: string;
    components: FigmaComponentItem[];
    componentSets: FigmaComponentItem[];
    pages: FigmaPageItem[];
}

// ----------------------------------------------------------------------------
// Relations & Tracking (Internal but exported for advanced consumers)
// ----------------------------------------------------------------------------

export interface TreeContainsRelation {
    parent_node_id: string;
    child_node_id: string;
}

export interface InstanceUseRecord {
    owner_component_node_id: string;
    owner_component_name: string;
    used_component_node_id: string;
    used_component_name: string;
    used_component_key: string;
    instance_node_id: string;
    instance_node_url: string;
}

export interface UnresolvedInstanceUseRecord extends InstanceUseRecord {
    reason: string;
}

export interface DependencyEdge {
    owner_component_node_id: string;
    used_component_node_id: string;
    used_component_key: string;
    instance_count: number;
    instance_node_ids: string[];
}

export interface ComponentMapWithRelations extends FigmaComponentMap {
    tree_contains: TreeContainsRelation[];
    instance_uses: InstanceUseRecord[];
    unresolved_instance_uses: UnresolvedInstanceUseRecord[];
    dependency_edges: DependencyEdge[];
}

interface ComponentRecord {
    node_id: string;
    node_url: string;
    kind: 'component' | 'component_set';
    type: string;
    name: string;
    description: string;
    page_id: string;
    page_name: string;
    parent_component_node_id: string | null;
    parent_component_name: string | null;
    ancestor_component_node_ids: string[];
    depth: number;
    tree_path: string;
    component_key: string;
}

interface CatalogItem {
    node_id: string;
    key: string;
    name: string;
    description: string;
    kind: "component" | "component_set";
}

interface CatalogIndex {
    catalog: CatalogItem[];
    byNodeId: Map<string, CatalogItem>;
    byKey: Map<string, string>;
    keyCollisions: Array<{ component_key: string; node_ids: string[] }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

function compareStrings(a: unknown, b: unknown): number {
    return String(a || "").localeCompare(String(b || ""), "en", {
        sensitivity: "base",
    });
}

export function toHyphenNodeId(nodeId: unknown): string {
    return String(nodeId || "").replace(/:/g, "-");
}

function toComponentKind(nodeType: string): "component_set" | "component" | "unknown" {
    if (nodeType === COMPONENT_SET_TYPE) return "component_set";
    if (nodeType === COMPONENT_TYPE) return "component";
    return "unknown";
}

function normalizeName(rawName: unknown, fallback = ""): string {
    const text = String(rawName || "").trim();
    return text || fallback;
}

function normalizePathSlug(rawSlug: unknown, fallback = "Figma-File"): string {
    const decoded = decodeURIComponent(String(rawSlug || "").trim());
    const normalized = decoded.replace(/\s+/g, "-").replace(/-+/g, "-").trim();
    return normalized || fallback;
}

function parseFilePathInfo(url: URL): { surface: string; fileKey: string; slug: string } {
    const parts = String(url.pathname || "").split("/").map((part) => part.trim()).filter(Boolean);
    const surfaceIndex = parts.findIndex((part) => SUPPORTED_FILE_SURFACES.has(part.toLowerCase()));
    if (surfaceIndex === -1) {
        throw new Error(`Invalid Figma file URL. Expected /design/<fileKey>/... or /file/<fileKey>/... in path: ${url.pathname}`);
    }
    const surface = String(parts[surfaceIndex] || "").toLowerCase();
    const fileKey = String(parts[surfaceIndex + 1] || "").trim();
    if (!fileKey) throw new Error(`Missing file key in Figma URL path: ${url.pathname}`);
    const slug = normalizePathSlug(parts[surfaceIndex + 2] || fileKey, fileKey);
    return { surface, fileKey, slug };
}

export function sanitizeNodeId(rawNodeId: unknown): string {
    const v = String(rawNodeId || "").trim().replace(/-/g, ":");
    return /^\d+:\d+$/.test(v) ? v : "";
}

export function parseNodeIdFromUrl(url: URL): string {
    const paramNames = ["node-id", "node_id", "nodeId"];
    for (const key of paramNames) {
        const value = sanitizeNodeId(url.searchParams.get(key));
        if (value) return value;
    }
    const hashRaw = String(url.hash || "").replace(/^#/, "");
    if (hashRaw) {
        const hashParams = new URLSearchParams(hashRaw.replace(/^[/?]+/, ""));
        for (const key of paramNames) {
            const value = sanitizeNodeId(hashParams.get(key));
            if (value) return value;
        }
        const inlineMatch = hashRaw.match(/(?:^|[?&])node-?id=([^&]+)/i);
        if (inlineMatch && inlineMatch[1]) return sanitizeNodeId(decodeURIComponent(inlineMatch[1]));
    }
    return "";
}

export function buildFigmaNodeUrl(fileDescriptor: ParsedFigmaFileUrl, nodeId: string): string {
    const base = 'https://www.figma.com/file';
    const fileSlug = String(fileDescriptor.fileSlug || '');
    const surface = String(fileDescriptor.surface || '');
    return `${base}/${fileDescriptor.fileKey}/${fileSlug}?node-id=${nodeId}&surface=${surface}`;
}


function buildCatalogIndex(
    components: Record<string, any> = {},
    componentSets: Record<string, any> = {}
): CatalogIndex {
    const catalog: CatalogItem[] = [];
    const byNodeId = new Map<string, CatalogItem>();
    const byKey = new Map<string, string>();
    const keyCollisions: Array<{ component_key: string; node_ids: string[] }> = [];

    const processEntries = (entries: Record<string, any>, kind: 'component' | 'component_set') => {
        for (const [id, data] of Object.entries(entries)) {
            if (!data || typeof data !== 'object') continue;
            const name = normalizeName(data.name, id);
            const key = normalizeName(data.key || (kind === 'component' ? data.componentId : data.componentSetId) || id, id);
            const description = normalizeName(data.description);
            const item: CatalogItem = { node_id: id, key, name, description, kind };
            catalog.push(item);
            byNodeId.set(id, item);

            if (byKey.has(key)) {
                const existingId = byKey.get(key)!;
                const collision = keyCollisions.find((c) => c.component_key === key);
                if (collision) {
                    if (!collision.node_ids.includes(id)) collision.node_ids.push(id);
                } else {
                    keyCollisions.push({ component_key: key, node_ids: [existingId, id] });
                }
            } else {
                byKey.set(key, id);
            }
        }
    };

    processEntries(componentSets, 'component_set');
    processEntries(components, 'component');
    return { catalog, byNodeId, byKey, keyCollisions };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Parse a Figma URL and extract file information.
 */
export function parseFigmaFileUrl(figmaUrl: unknown): ParsedFigmaFileUrl {
    const raw = String(figmaUrl || "").trim();
    if (!raw) throw new Error("Missing Figma URL");
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error(`Invalid Figma URL: ${raw}`);
    }
    const hostname = url.hostname;
    if (hostname !== 'figma.com' && !hostname.endsWith('.figma.com')) {
        throw new Error(`Invalid Figma URL hostname: ${hostname}`);
    }
    const { surface, fileKey, slug } = parseFilePathInfo(url);
    const rootNodeId = parseNodeIdFromUrl(url);
    const fileName = normalizeName(url.searchParams.get("name") || slug, fileKey);

    return { fileKey, fileName, fileSlug: slug, surface, rootNodeId, figmaUrl: raw };
}

/**
 * Build component map from Figma document tree.
 */
export function buildFigmaComponentMap(
    parsedUrl: ParsedFigmaFileUrl,
    document: FigmaNode,
    components: Record<string, any> = {},
    componentSets: Record<string, any> = {},
    includeInstances = true
): ComponentMapWithRelations {
    const catalogIndex = buildCatalogIndex(components, componentSets);
    const { byNodeId, byKey } = catalogIndex;

    const componentsList: ComponentRecord[] = [];
    const componentIndex = new Map<string, ComponentRecord>();
    const treeContainsRelations: TreeContainsRelation[] = [];
    const treeContainsKeys = new Set<string>();
    const instanceUseRecords: InstanceUseRecord[] = [];
    const unresolvedInstanceUseRecords: UnresolvedInstanceUseRecord[] = [];
    const dependencyEdges = new Map<string, DependencyEdge>();

    const walkNode = ({
        node,
        page,
        depth,
        ancestors,
        componentStack,
    }: {
        node: FigmaNode;
        page: { id: string; name: string };
        depth: number;
        ancestors: string[];
        componentStack: ComponentRecord[];
    }) => {
        const nodeId = String(node.id || '').trim();
        if (!nodeId) return;

        const nodeType = String(node.type || '').trim().toUpperCase();
        const nodeName = normalizeName(node.name, nodeType || 'Node');
        const pathNames = [...ancestors, nodeName];
        const isComponent = nodeType === COMPONENT_SET_TYPE || nodeType === COMPONENT_TYPE;

        if (isComponent) {
            const parentComponent = componentStack.length ? componentStack[componentStack.length - 1] : null;
            const catalog = byNodeId.get(nodeId);
            const componentRecord: ComponentRecord = {
                node_id: nodeId,
                node_url: buildFigmaNodeUrl(parsedUrl, nodeId),
                kind: toComponentKind(nodeType) as 'component' | 'component_set',
                type: nodeType,
                name: nodeName,
                description: normalizeName(catalog?.description),
                page_id: page.id,
                page_name: page.name,
                parent_component_node_id: parentComponent ? parentComponent.node_id : null,
                parent_component_name: parentComponent ? parentComponent.name : null,
                ancestor_component_node_ids: componentStack.map((item) => item.node_id),
                depth,
                tree_path: pathNames.join(' / '),
                component_key: normalizeName(catalog?.key),
            };

            componentsList.push(componentRecord);
            componentIndex.set(nodeId, componentRecord);

            if (parentComponent) {
                const relKey = `${parentComponent.node_id}|${nodeId}`;
                if (!treeContainsKeys.has(relKey)) {
                    treeContainsKeys.add(relKey);
                    treeContainsRelations.push({ parent_node_id: parentComponent.node_id, child_node_id: nodeId });
                }
            }
            componentStack = [...componentStack, componentRecord];
        }

        if (includeInstances && nodeType === INSTANCE_TYPE && componentStack.length > 0) {
            const ownerComponent = componentStack[componentStack.length - 1];
            const usedComponentKey = String(node.componentId || '').trim();
            const usedComponentNodeId = usedComponentKey ? byKey.get(usedComponentKey) || '' : '';

            if (usedComponentNodeId) {
                instanceUseRecords.push({
                    owner_component_node_id: ownerComponent.node_id,
                    owner_component_name: ownerComponent.name,
                    used_component_node_id: usedComponentNodeId,
                    used_component_name: '', // Resolved later if needed
                    used_component_key: usedComponentKey,
                    instance_node_id: nodeId,
                    instance_node_url: buildFigmaNodeUrl(parsedUrl, nodeId),
                });

                const edgeKey = `${ownerComponent.node_id}|${usedComponentNodeId}`;
                if (!dependencyEdges.has(edgeKey)) {
                    dependencyEdges.set(edgeKey, {
                        owner_component_node_id: ownerComponent.node_id,
                        used_component_node_id: usedComponentNodeId,
                        used_component_key: usedComponentKey,
                        instance_count: 0,
                        instance_node_ids: [],
                    });
                }
                const edge = dependencyEdges.get(edgeKey)!;
                edge.instance_count += 1;
                if (!edge.instance_node_ids.includes(nodeId)) edge.instance_node_ids.push(nodeId);
            } else if (usedComponentKey) {
                unresolvedInstanceUseRecords.push({
                    owner_component_node_id: ownerComponent.node_id,
                    owner_component_name: ownerComponent.name,
                    used_component_node_id: '',
                    used_component_name: '',
                    used_component_key: usedComponentKey,
                    instance_node_id: nodeId,
                    instance_node_url: buildFigmaNodeUrl(parsedUrl, nodeId),
                    reason: 'Component key not found in catalog',
                });
            }
        }

        const children = Array.isArray(node.children) ? node.children : [];
        for (const child of children) {
            walkNode({ node: child, page, depth: depth + 1, ancestors: pathNames, componentStack });
        }
    };

    const pages = (document.children || [])
        .filter((child) => child.type === PAGE_TYPE)
        .map((page) => ({ id: page.id, name: page.name, node: page }));

    for (const page of pages) {
        const pageChildren = Array.isArray(page.node.children) ? page.node.children : [];
        for (const child of pageChildren) {
            walkNode({ node: child, page: { id: page.id, name: page.name }, depth: 1, ancestors: [page.name], componentStack: [] });
        }
    }

    // Sort results for stability
    componentsList.sort((a, b) => compareStrings(`${a.page_name}|${a.kind}|${a.name}`, `${b.page_name}|${b.kind}|${b.name}`));
    treeContainsRelations.sort((a, b) => compareStrings(`${a.parent_node_id}|${a.child_node_id}`, `${b.parent_node_id}|${b.child_node_id}`));

    const componentSetsList: FigmaComponentItem[] = catalogIndex.catalog
        .filter(c => c.kind === 'component_set')
        .map(c => ({ id: c.node_id, name: c.name, nodeId: toHyphenNodeId(c.node_id), type: 'component_set', description: c.description }));

    const pagesWithChildren: FigmaPageItem[] = pages.map(p => ({
        id: p.id,
        name: p.name,
        nodeId: toHyphenNodeId(p.id),
        type: 'page',
        children: componentsList.filter(c => c.page_id === p.id).map(c => ({
            id: c.node_id,
            name: c.name,
            nodeId: toHyphenNodeId(c.node_id),
            type: c.kind,
            description: c.description
        }))
    }));

    return {
        fileKey: parsedUrl.fileKey,
        fileName: parsedUrl.fileName,
        fileSlug: parsedUrl.fileSlug,
        surface: parsedUrl.surface,
        rootNodeId: parsedUrl.rootNodeId,
        figmaUrl: parsedUrl.figmaUrl,
        components: componentsList.map(c => ({ id: c.node_id, name: c.name, nodeId: toHyphenNodeId(c.node_id), type: c.kind, description: c.description })),
        componentSets: componentSetsList,
        pages: pagesWithChildren,
        tree_contains: treeContainsRelations,
        instance_uses: instanceUseRecords,
        unresolved_instance_uses: unresolvedInstanceUseRecords,
        dependency_edges: Array.from(dependencyEdges.values()).sort((a, b) => compareStrings(a.owner_component_node_id, b.owner_component_node_id)),
    };
}

/**
 * Build summary statistics from component map.
 */
export function buildFigmaComponentMapSummary(map: ComponentMapWithRelations): {
    source: { file_key: string; file_name: string; file_url: string };
    stats: { pages: number; component_sets: number; components: number; component_nodes_total: number; tree_contains_relations: number; instance_dependencies: number; unresolved_instance_records: number };
    top_dependencies: Array<{ owner_component_name: string; used_component_name: string; instance_count: number }>;
} {
    const topDeps = [...map.dependency_edges]
        .sort((a, b) => b.instance_count - a.instance_count)
        .slice(0, MAX_TOP_DEPENDENCIES)
        .map(edge => ({
            owner_component_name: map.components.find(c => c.id === edge.owner_component_node_id)?.name || edge.owner_component_node_id,
            used_component_name: map.components.find(c => c.id === edge.used_component_node_id)?.name || edge.used_component_node_id,
            instance_count: edge.instance_count
        }));

    return {
        source: { file_key: map.fileKey, file_name: map.fileName, file_url: map.figmaUrl },
        stats: {
            pages: map.pages.length,
            component_sets: map.componentSets.length,
            components: map.components.length,
            component_nodes_total: map.components.length + map.componentSets.length,
            tree_contains_relations: map.tree_contains.length,
            instance_dependencies: map.dependency_edges.length,
            unresolved_instance_records: map.unresolved_instance_uses.length,
        },
        top_dependencies: topDeps,
    };
}

/** Convenience type alias for the return shape of {@link buildFigmaComponentMapSummary}. */
export type FigmaComponentMapSummary = ReturnType<typeof buildFigmaComponentMapSummary>;

/**
 * Render component map as text summary.
 */
export function renderFigmaComponentMapText(map: ComponentMapWithRelations): string {
    const summary = buildFigmaComponentMapSummary(map);
    const lines: string[] = [
        `File: ${summary.source.file_name} (${summary.source.file_key})`,
        `URL: ${summary.source.file_url}`,
        "",
        `Components: ${summary.stats.component_nodes_total} (${summary.stats.component_sets} sets, ${summary.stats.components} components)`,
        `Pages: ${summary.stats.pages}`,
        `Nested relations: ${summary.stats.tree_contains_relations}`,
        `Instance dependencies: ${summary.stats.instance_dependencies}`,
        `Unresolved instance references: ${summary.stats.unresolved_instance_records}`,
        ""
    ];

    if (summary.top_dependencies.length > 0) {
        lines.push("Top dependencies:");
        for (const dep of summary.top_dependencies) {
            lines.push(`- ${dep.owner_component_name} -> ${dep.used_component_name} (${dep.instance_count})`);
        }
    }

    return lines.join("\n") + "\n";
}

/**
 * Format a component map as a Markdown document.
 *
 * @deprecated Use {@link renderFigmaComponentMapText} for richer output.
 * Preserved for backwards compatibility with consumers that rely on the
 * heading-based Markdown format (H1 file name, H2 sections).
 */
export function formatFigmaComponentMap(map: FigmaComponentMap): string {
    const lines: string[] = [];
    lines.push(`# ${map.fileName}`);
    lines.push('');
    lines.push(`**File Key:** ${map.fileKey}`);
    lines.push(`**Surface:** ${map.surface}`);
    lines.push(`**Root Node:** ${map.rootNodeId || 'N/A'}`);
    lines.push('');

    if (map.componentSets.length > 0) {
        lines.push('## Component Sets');
        lines.push('');
        for (const set of map.componentSets) {
            lines.push(`- **${set.name}** (\`${set.nodeId}\`)`);
        }
        lines.push('');
    }

    if (map.components.length > 0) {
        lines.push('## Components');
        lines.push('');
        for (const component of map.components) {
            lines.push(`- **${component.name}** (\`${component.nodeId}\`)`);
        }
        lines.push('');
    }

    if (map.pages.length > 0) {
        lines.push('## Pages');
        lines.push('');
        for (const page of map.pages) {
            lines.push(`- **${page.name}** (\`${page.nodeId}\`)`);
        }
        lines.push('');
    }

    return lines.join('\n');
}
