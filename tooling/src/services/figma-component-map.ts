/**
 * Figma Component Map Service
 *
 * Builds a map of components and component sets from Figma file.
 * Includes walkNode logic for tracking component ownership, nesting, and instance dependencies.
 */

import type { FigmaNode } from '../utils/figma.js';

const COMPONENT_SET_TYPE = 'COMPONENT_SET';
const COMPONENT_TYPE = 'COMPONENT';
const INSTANCE_TYPE = 'INSTANCE';
const PAGE_TYPE = 'CANVAS';
const SUPPORTED_FILE_SURFACES = new Set(['design', 'file']);

/**
 * Maximum number of top dependencies to include in the summary report.
 */
const MAX_TOP_DEPENDENCIES = 10;

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
// WalkNode Types (for tracking component ownership and dependencies)
// ============================================================================

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

interface TreeContainsRelation {
  parent_node_id: string;
  child_node_id: string;
}

interface InstanceUseRecord {
  owner_component_node_id: string;
  owner_component_name: string;
  used_component_node_id: string;
  used_component_name: string;
  used_component_key: string;
  instance_node_id: string;
  instance_node_url: string;
}

interface UnresolvedInstanceUseRecord extends InstanceUseRecord {
  reason: string;
}

interface DependencyEdge {
  owner_component_node_id: string;
  used_component_node_id: string;
  used_component_key: string;
  instance_count: number;
  instance_node_ids: string[];
}

interface ComponentMapWithRelations extends FigmaComponentMap {
  tree_contains: TreeContainsRelation[];
  instance_uses: InstanceUseRecord[];
  unresolved_instance_uses: UnresolvedInstanceUseRecord[];
  dependency_edges: DependencyEdge[];
}

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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

interface PathInfo {
  surface: string;
  fileKey: string;
  slug: string;
}

function parseFilePathInfo(url: URL): PathInfo {
  const parts = String(url.pathname || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  const surfaceIndex = parts.findIndex((part) =>
    SUPPORTED_FILE_SURFACES.has(part.toLowerCase()),
  );
  if (surfaceIndex === -1) {
    throw new Error(
      `Invalid Figma file URL. Expected /design/<fileKey>/... or /file/<fileKey>/... in path: ${url.pathname}`,
    );
  }

  const surface = String(parts[surfaceIndex] || "").toLowerCase();
  const fileKey = String(parts[surfaceIndex + 1] || "").trim();
  if (!fileKey) {
    throw new Error(`Missing file key in Figma URL path: ${url.pathname}`);
  }

  const slug = normalizePathSlug(parts[surfaceIndex + 2] || fileKey, fileKey);
  return { surface, fileKey, slug };
}

export function sanitizeNodeId(rawNodeId: unknown): string {
  const value = String(rawNodeId || "").trim();
  if (!value) return "";
  const normalized = value.replace(/-/g, ":");
  return /^\d+:\d+$/.test(normalized) ? normalized : "";
}

export function parseNodeIdFromUrl(url: URL): string {
  const paramNames = ["node-id", "node_id", "nodeId"];
  for (const key of paramNames) {
    const value = sanitizeNodeId(url.searchParams.get(key));
    if (value) return value;
  }

  const hashRaw = String(url.hash || "").replace(/^#/, "");
  if (!hashRaw) return "";

  const hashParams = new URLSearchParams(hashRaw.replace(/^[/?]+/, ""));
  for (const key of paramNames) {
    const value = sanitizeNodeId(hashParams.get(key));
    if (value) return value;
  }

  const inlineMatch = hashRaw.match(/(?:^|[?&])node-?id=([^&]+)/i);
  if (!inlineMatch || !inlineMatch[1]) return "";
  return sanitizeNodeId(decodeURIComponent(inlineMatch[1]));
}

// Overloads for uniqueSorted to avoid unsafe type assertions
function uniqueSorted(values: string[]): string[];
function uniqueSorted<T>(values: T[], comparator: (a: T, b: T) => number): T[];
function uniqueSorted<T>(values: T[], comparator?: (a: T, b: T) => number): T[] {
  const cmp = comparator || ((a, b) => String(a).localeCompare(String(b)));
  return Array.from(new Set(values)).sort(cmp);
}

// Internal helper - validates Figma hostname.
// Uses strict equality for root domain to prevent subdomain confusion attacks
// (e.g. evilfigma.com ends with figma.com but is not a valid Figma host).
const isValidFigmaHostname = (hostname: string): boolean =>
  hostname === 'figma.com' || hostname.endsWith('.figma.com');

// ============================================================================
// WalkNode Helper Functions
// ============================================================================

function isComponentNodeType(nodeType: string): boolean {
  return nodeType === COMPONENT_SET_TYPE || nodeType === COMPONENT_TYPE;
}

function buildFigmaNodeUrl(fileDescriptor: ParsedFigmaFileUrl, nodeId: string): string {
  const base = 'https://www.figma.com/file';
  const fileKey = fileDescriptor.fileKey;
  const slug = fileDescriptor.fileSlug;
  const surface = fileDescriptor.surface;
  return `${base}/${fileKey}/${slug}?node-id=${nodeId}&surface=${surface}`;
}

function makePathLabel(pathNames: string[]): string {
  return pathNames.join(' / ');
}

function sortedChildren(node: FigmaNode): FigmaNode[] {
  const children = Array.isArray(node.children) ? node.children : [];
  return [...children].sort((a, b) => compareNodeIds(a.id, b.id));
}

function compareNodeIds(a: unknown, b: unknown): number {
  return compareStrings(a, b);
}

function pushUniqueRelation<T extends Record<string, unknown>>(
  relations: T[],
  seenKeys: Set<string>,
  relation: T,
  keyParts: string[]
): void {
  const key = keyParts.map((part) => String(part || '')).join('|');
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  relations.push(relation);
}

function relationKey(parts: string[]): string {
  return parts.map((part) => String(part || '')).join('|');
}

function buildCatalogIndex(
  components: Record<string, unknown>,
  componentSets: Record<string, unknown>
): CatalogIndex {
  const catalog: CatalogItem[] = [];
  const byNodeId = new Map<string, CatalogItem>();
  const byKey = new Map<string, string>();
  const keyCollisions: Array<{ component_key: string; node_ids: string[] }> = [];

  // Process component sets
  for (const [id, setData] of Object.entries(componentSets)) {
    if (!isObject(setData)) continue;
    const typedSetData = setData as Record<string, unknown>;
    const name = normalizeName(typedSetData.name, id);
    const key = normalizeName((typedSetData.componentSetId as string) || id, id);
    const description = normalizeName(typedSetData.description as string);

    const item: CatalogItem = {
      node_id: id,
      key,
      name,
      description,
      kind: 'component_set',
    };

    catalog.push(item);
    byNodeId.set(id, item);

    if (byKey.has(key)) {
      const existing = byKey.get(key)!;
      const collision = keyCollisions.find((c) => c.component_key === key);
      if (collision) {
        collision.node_ids.push(id);
      } else {
        keyCollisions.push({ component_key: key, node_ids: [existing, id] });
      }
    } else {
      byKey.set(key, id);
    }
  }

  // Process components
  for (const [id, compData] of Object.entries(components)) {
    if (!isObject(compData)) continue;
    const typedCompData = compData as Record<string, unknown>;
    const name = normalizeName(typedCompData.name, id);
    const key = normalizeName((typedCompData.componentId as string) || id, id);
    const description = normalizeName(typedCompData.description as string);

    const item: CatalogItem = {
      node_id: id,
      key,
      name,
      description,
      kind: 'component',
    };

    catalog.push(item);
    byNodeId.set(id, item);

    if (byKey.has(key)) {
      const existing = byKey.get(key)!;
      const collision = keyCollisions.find((c) => c.component_key === key);
      if (collision) {
        collision.node_ids.push(id);
      } else {
        keyCollisions.push({ component_key: key, node_ids: [existing, id] });
      }
    } else {
      byKey.set(key, id);
    }
  }

  return { catalog, byNodeId, byKey, keyCollisions };
}

/**
 * Parse a Figma URL and extract file information.
 * Public API - validates hostname and extracts file key, surface, etc.
 */
export function parseFigmaFileUrl(figmaUrl: unknown): ParsedFigmaFileUrl {
  const raw = String(figmaUrl || "").trim();
  if (!raw) {
    throw new Error("Missing Figma URL");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid Figma URL: ${raw}`);
  }

  if (!isValidFigmaHostname(url.hostname)) {
    throw new Error(`Invalid Figma URL hostname: ${url.hostname}`);
  }

  const { surface, fileKey, slug } = parseFilePathInfo(url);
  const rootNodeId = parseNodeIdFromUrl(url);
  const fileName = normalizeName(url.searchParams.get("name") || slug, fileKey);

  return {
    fileKey,
    fileName,
    fileSlug: slug,
    surface,
    rootNodeId,
    figmaUrl: raw,
  };
}

// Internal helper - normalize component catalog entries
function normalizeComponentCatalog(rawCatalog: unknown, fallbackKind: "component" | "component_set"): CatalogItem[] {
  if (!isObject(rawCatalog)) return [];
  const normalized: CatalogItem[] = [];

  for (const [nodeId, meta] of Object.entries(rawCatalog)) {
    if (!isObject(meta)) continue;
    const typedMeta = meta as Record<string, unknown>;
    normalized.push({
      node_id: String(nodeId || "").trim(),
      key: String(typedMeta.key || "").trim(),
      name: normalizeName(typedMeta.name, ""),
      description: normalizeName(typedMeta.description, ""),
      kind: fallbackKind,
    });
  }

  return normalized
    .filter((item) => item.node_id)
    .sort((a, b) =>
      compareStrings(
        `${a.kind}|${a.name}|${a.node_id}`,
        `${b.kind}|${b.name}|${b.node_id}`,
      ),
    );
}

export function buildFigmaComponentMap(
  parsedUrl: ParsedFigmaFileUrl,
  document: FigmaNode,
  components: Record<string, unknown> = {},
  componentSets: Record<string, unknown> = {},
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

  // Extract pages from document
  const pages: Array<{ id: string; name: string }> = [];
  const pageNodes: FigmaNode[] = [];
  
  if (document.children) {
    for (const child of document.children) {
      if (child.type === PAGE_TYPE) {
        pages.push({ id: child.id, name: child.name });
        pageNodes.push(child);
      }
    }
  }

  const fileDescriptor = parsedUrl;

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
    const nextDepth = depth + 1;

    if (isComponentNodeType(nodeType)) {
      const parentComponent = componentStack.length ? componentStack[componentStack.length - 1] : null;
      const catalog = byNodeId.get(nodeId);
      const componentRecord: ComponentRecord = {
        node_id: nodeId,
        node_url: buildFigmaNodeUrl(fileDescriptor, nodeId),
        kind: toComponentKind(nodeType) as 'component' | 'component_set',
        type: nodeType,
        name: nodeName,
        description: normalizeName(catalog?.description, ''),
        page_id: page.id,
        page_name: page.name,
        parent_component_node_id: parentComponent ? parentComponent.node_id : null,
        parent_component_name: parentComponent ? parentComponent.name : null,
        ancestor_component_node_ids: componentStack.map((item) => item.node_id),
        depth,
        tree_path: makePathLabel(pathNames),
        component_key: normalizeName(catalog?.key, ''),
      };

      componentsList.push(componentRecord);
      componentIndex.set(nodeId, componentRecord);

      if (parentComponent) {
        pushUniqueRelation(
          treeContainsRelations,
          treeContainsKeys,
          {
            parent_node_id: parentComponent.node_id,
            child_node_id: nodeId,
          },
          [parentComponent.node_id, nodeId]
        );
      }

      componentStack = [...componentStack, componentRecord];
    }

    if (includeInstances && nodeType === INSTANCE_TYPE && componentStack.length > 0) {
      const ownerComponent = componentStack[componentStack.length - 1];
      const usedComponentKey = String(node.componentId || '').trim();
      const usedComponentNodeId = usedComponentKey ? byKey.get(usedComponentKey) || '' : '';
      const instanceNodeId = nodeId;

      if (usedComponentNodeId) {
        instanceUseRecords.push({
          owner_component_node_id: ownerComponent.node_id,
          owner_component_name: ownerComponent.name,
          used_component_node_id: usedComponentNodeId,
          used_component_name: '',
          used_component_key: usedComponentKey,
          instance_node_id: instanceNodeId,
          instance_node_url: buildFigmaNodeUrl(fileDescriptor, instanceNodeId),
        });

        const edgeKey = relationKey([ownerComponent.node_id, usedComponentNodeId]);
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
        edge.instance_node_ids.push(instanceNodeId);
      } else {
        unresolvedInstanceUseRecords.push({
          owner_component_node_id: ownerComponent.node_id,
          owner_component_name: ownerComponent.name,
          used_component_node_id: '',
          used_component_name: '',
          used_component_key: usedComponentKey || '',
          instance_node_id: instanceNodeId,
          instance_node_url: buildFigmaNodeUrl(fileDescriptor, instanceNodeId),
          reason: usedComponentKey ? 'component key not found in file catalog' : 'instance without componentId',
        });
      }
    }

    const children = sortedChildren(node);
    for (const child of children) {
      walkNode({
        node: child,
        page,
        depth: nextDepth,
        ancestors: pathNames,
        componentStack,
      });
    }
  };

  for (const page of pages) {
    const pageNode = pageNodes.find((node) => String(node.id || '').trim() === page.id);
    if (!pageNode) continue;
    for (const child of sortedChildren(pageNode)) {
      walkNode({
        node: child,
        page,
        depth: 1,
        ancestors: [page.name],
        componentStack: [],
      });
    }
  }

  componentsList.sort((a, b) =>
    compareStrings(
      `${a.page_name}|${a.kind}|${a.name}|${a.node_id}`,
      `${b.page_name}|${b.kind}|${b.name}|${b.node_id}`
    )
  );

  treeContainsRelations.sort((a, b) =>
    compareStrings(
      `${a.parent_node_id}|${a.child_node_id}`,
      `${b.parent_node_id}|${b.child_node_id}`
    )
  );

  const dependencyList: DependencyEdge[] = Array.from(dependencyEdges.values())
    .map((edge) => ({
      ...edge,
      instance_node_ids: uniqueSorted(edge.instance_node_ids, compareNodeIds) as string[],
    }))
    .sort((a, b) =>
      compareStrings(
        `${a.owner_component_node_id}|${a.used_component_node_id}`,
        `${b.owner_component_node_id}|${b.used_component_node_id}`
      )
    );

  // Build componentSets from catalog
  const componentSetsList: FigmaComponentItem[] = catalogIndex.catalog
    .filter((item) => item.kind === 'component_set')
    .map((item) => ({
      id: item.node_id,
      name: item.name,
      nodeId: toHyphenNodeId(item.node_id),
      type: 'component_set' as const,
      description: item.description,
      documentationLinks: [],
    }));

  // Build pages with children from componentsList
  const pagesWithChildren: FigmaPageItem[] = pages.map((page) => {
    const pageComponents = componentsList
      .filter((c) => c.page_id === page.id)
      .map((c) => ({
        id: c.node_id,
        name: c.name,
        nodeId: toHyphenNodeId(c.node_id),
        type: c.kind,
        description: c.description,
        documentationLinks: [],
      }));

    return {
      id: page.id,
      name: page.name,
      nodeId: toHyphenNodeId(page.id),
      type: 'page' as const,
      children: pageComponents,
    };
  });

  return {
    fileKey: parsedUrl.fileKey,
    fileName: parsedUrl.fileName,
    fileSlug: parsedUrl.fileSlug,
    surface: parsedUrl.surface,
    rootNodeId: parsedUrl.rootNodeId,
    figmaUrl: parsedUrl.figmaUrl,
    components: componentsList.map((c) => ({
      id: c.node_id,
      name: c.name,
      nodeId: toHyphenNodeId(c.node_id),
      type: c.kind,
      description: c.description,
      documentationLinks: [],
    })),
    componentSets: componentSetsList,
    pages: pagesWithChildren,
    tree_contains: treeContainsRelations,
    instance_uses: instanceUseRecords,
    unresolved_instance_uses: unresolvedInstanceUseRecords,
    dependency_edges: dependencyList,
  };
}

export function formatFigmaComponentMap(map: FigmaComponentMap): string {
  const lines: string[] = [];
  
  lines.push(`# ${map.fileName}`);
  lines.push("");
  lines.push(`**File Key:** ${map.fileKey}`);
  lines.push(`**Surface:** ${map.surface}`);
  lines.push(`**Root Node:** ${map.rootNodeId || "N/A"}`);
  lines.push("");

  if (map.componentSets.length > 0) {
    lines.push("## Component Sets");
    lines.push("");
    for (const set of map.componentSets) {
      lines.push(`- **${set.name}** (\`${set.nodeId}\`)`);
    }
    lines.push("");
  }

  if (map.components.length > 0) {
    lines.push("## Components");
    lines.push("");
    for (const comp of map.components) {
      lines.push(`- **${comp.name}** (\`${comp.nodeId}\`)`);
    }
    lines.push("");
  }

  if (map.pages.length > 0) {
    lines.push("## Pages");
    lines.push("");
    for (const page of map.pages) {
      lines.push(`### ${page.name}`);
      lines.push("");
      if (page.children && page.children.length > 0) {
        for (const child of page.children) {
          lines.push(`- ${child.name} (\`${child.nodeId}\`) - ${child.type}`);
        }
      } else {
        lines.push("- _No components_");
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Raw internal type for buildFigmaComponentMapSummary input.
 * Reduces repetitive type assertions in the function body.
 */
interface FigmaComponentMapRaw {
  components?: Array<{ node_id?: string }>;
  componentSets?: Array<{ node_id?: string }>;
  pages?: Array<{ children?: Array<{ node_id?: string }> }>;
  stats?: Record<string, unknown>;
  source?: Record<string, unknown>;
  relations?: {
    component_dependencies?: Array<Record<string, unknown>>;
  };
  tree_contains?: Array<Record<string, unknown>>;
  instance_uses?: Array<Record<string, unknown>>;
  unresolved_instance_uses?: Array<Record<string, unknown>>;
  dependency_edges?: Array<Record<string, unknown>>;
}

/**
 * Build summary statistics from component map.
 */
export interface FigmaComponentMapSummary {
  source: {
    file_key: string;
    file_name: string;
    file_url: string;
  };
  stats: {
    pages: number;
    component_sets: number;
    components: number;
    component_nodes_total: number;
    tree_contains_relations: number;
    instance_dependencies: number;
    unresolved_instance_records: number;
  };
  pages: Array<{
    name: string;
    component_like_count: number;
    component_sets: number;
    components: number;
  }>;
  top_dependencies: Array<{
    owner_component_name: string;
    used_component_name: string;
    instance_count: number;
  }>;
}

export function buildFigmaComponentMapSummary(componentMap: FigmaComponentMap | ComponentMapWithRelations): FigmaComponentMapSummary {
  // Defensive validation: fail-fast on unexpected input types
  if (!componentMap || typeof componentMap !== 'object' || Array.isArray(componentMap)) {
    throw new Error(
      `buildFigmaComponentMapSummary: expected object, got ${componentMap === null ? 'null' : Array.isArray(componentMap) ? 'array' : typeof componentMap}`,
    );
  }

  const map = componentMap as FigmaComponentMapRaw;
  const components = Array.isArray(map.components) ? map.components : [];
  const componentSets = Array.isArray(map.componentSets) ? map.componentSets : [];
  const pages = Array.isArray(map.pages) ? map.pages : [];
  const tree_contains = Array.isArray(map.tree_contains) ? map.tree_contains : [];
  const instance_uses = Array.isArray(map.instance_uses) ? map.instance_uses : [];
  const unresolved_instance_uses = Array.isArray(map.unresolved_instance_uses) ? map.unresolved_instance_uses : [];
  const dependency_edges = Array.isArray(map.dependency_edges) ? map.dependency_edges : [];

  const componentDeps = Array.isArray(dependency_edges)
    ? [...dependency_edges]
        .sort((a, b) => {
          const countDiff = Number(b.instance_count || 0) - Number(a.instance_count || 0);
          if (countDiff !== 0) return countDiff;
          return compareStrings(
            `${a.owner_component_name || ""}|${a.used_component_name || ""}`,
            `${b.owner_component_name || ""}|${b.used_component_name || ""}`,
          );
        })
        .slice(0, MAX_TOP_DEPENDENCIES)
    : [];

  return {
    source: {
      file_key: String((map as any).fileKey || ""),
      file_name: String((map as any).fileName || ""),
      file_url: String((map as any).figmaUrl || ""),
    },
    stats: {
      pages: pages.length,
      component_sets: componentSets.length,
      components: components.length,
      component_nodes_total: components.length + componentSets.length,
      tree_contains_relations: tree_contains.length,
      instance_dependencies: dependency_edges.length,
      unresolved_instance_records: unresolved_instance_uses.length,
    },
    pages: pages.map((page: any) => {
      const children = Array.isArray((page as any).children) ? (page as any).children : [];
      const sets = children.filter((c: any) => c.type === 'component_set');
      const comps = children.filter((c: any) => c.type === 'component');
      return {
        name: String((page as any).name || ""),
        component_like_count: children.length,
        component_sets: sets.length,
        components: comps.length,
      };
    }),
    top_dependencies: componentDeps.map((edge) => ({
      owner_component_name: String(edge.owner_component_name || edge.owner_component_node_id || ""),
      used_component_name: String(edge.used_component_name || edge.used_component_node_id || ""),
      instance_count: Number(edge.instance_count || 0),
    })),
  };
}

/**
 * Render component map as text summary.
 */
export function renderFigmaComponentMapText(componentMap: FigmaComponentMap | ComponentMapWithRelations): string {
  const summary = buildFigmaComponentMapSummary(componentMap);
  const lines: string[] = [];

  lines.push(`File: ${summary.source.file_name} (${summary.source.file_key})`);
  lines.push(`URL: ${summary.source.file_url}`);
  lines.push("");
  lines.push(
    `Components: ${summary.stats.component_nodes_total} (${summary.stats.component_sets} sets, ${summary.stats.components} components)`,
  );
  lines.push(`Pages: ${summary.stats.pages}`);
  lines.push(`Nested relations: ${summary.stats.tree_contains_relations}`);
  lines.push(`Instance dependencies: ${summary.stats.instance_dependencies}`);
  lines.push(
    `Unresolved instance references: ${summary.stats.unresolved_instance_records}`,
  );

  if (summary.pages.length > 0) {
    lines.push("");
    lines.push("By page:");
    for (const page of summary.pages) {
      lines.push(
        `- ${page.name}: ${page.component_like_count} total (${page.component_sets} sets, ${page.components} components)`,
      );
    }
  }

  if (summary.top_dependencies.length > 0) {
    lines.push("");
    lines.push("Top dependencies:");
    for (const dep of summary.top_dependencies) {
      lines.push(
        `- ${dep.owner_component_name} -> ${dep.used_component_name} (${dep.instance_count})`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
