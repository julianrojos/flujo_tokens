const COMPONENT_SET_TYPE = "COMPONENT_SET";
const COMPONENT_TYPE = "COMPONENT";
const INSTANCE_TYPE = "INSTANCE";
const PAGE_TYPE = "CANVAS";
const SUPPORTED_FILE_SURFACES = new Set(["design", "file"]);

export interface FigmaComponentMap {
  fileKey: string;
  fileName: string;
  fileSlug: string;
  surface: string;
  rootNodeId: string;
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
  return value && typeof value === "object" && !Array.isArray(value);
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

function buildCatalogIndex(filePayload: Record<string, unknown>): CatalogIndex {
  const components = normalizeComponentCatalog(filePayload.components, "component");
  const componentSets = normalizeComponentCatalog(
    filePayload.componentSets,
    "component_set",
  );
  const merged = [...components, ...componentSets];

  const byNodeId = new Map<string, CatalogItem>();
  const byKey = new Map<string, string>();
  const keyCollisions: Array<{ component_key: string; node_ids: string[] }> = [];

  for (const item of merged) {
    byNodeId.set(item.node_id, item);
    const componentKey = String(item.key || "").trim();
    if (!componentKey) continue;

    if (!byKey.has(componentKey)) {
      byKey.set(componentKey, item.node_id);
      continue;
    }
    // Safe to use non-null assertion - has() check above guarantees existence
    const existingNodeId = byKey.get(componentKey)!;
    if (existingNodeId !== item.node_id) {
      keyCollisions.push({
        component_key: componentKey,
        node_ids: uniqueSorted<string>([existingNodeId, item.node_id], compareStrings),
      });
    }
  }

  keyCollisions.sort((a, b) =>
    compareStrings(
      `${a.component_key}|${a.node_ids.join(",")}`,
      `${b.component_key}|${b.node_ids.join(",")}`,
    ),
  );

  return {
    catalog: merged,
    byNodeId,
    byKey,
    keyCollisions,
  };
}

export function buildFigmaComponentMap(
  parsedUrl: ParsedFigmaFileUrl,
  nodes: Record<string, any> = {},
  components: Record<string, any> = {},
  componentSets: Record<string, any> = {}
): FigmaComponentMap {
  const componentsList: FigmaComponentItem[] = [];
  const componentSetsList: FigmaComponentItem[] = [];
  const pages: FigmaPageItem[] = [];

  // Process component sets
  for (const [id, setData] of Object.entries(componentSets)) {
    if (!isObject(setData)) continue;
    const typedSetData = setData as Record<string, unknown>;
    const name = normalizeName(typedSetData.name, id);
    componentSetsList.push({
      id,
      name,
      nodeId: toHyphenNodeId(id),
      type: "component_set",
      description: normalizeName(typedSetData.description),
      documentationLinks: [],
    });
  }

  // Process components
  for (const [id, compData] of Object.entries(components)) {
    if (!isObject(compData)) continue;
    const typedCompData = compData as Record<string, unknown>;
    const name = normalizeName(typedCompData.name, id);

    componentsList.push({
      id,
      name,
      nodeId: toHyphenNodeId(id),
      type: "component",
      description: normalizeName(typedCompData.description),
      documentationLinks: [],
    });
  }

  // Process nodes (pages and children)
  for (const [nodeId, nodeData] of Object.entries(nodes)) {
    if (!isObject(nodeData)) continue;
    const typedNodeData = nodeData as Record<string, unknown>;
    const nodeType = String(typedNodeData.type || "");
    
    if (nodeType === PAGE_TYPE) {
      const page: FigmaPageItem = {
        id: nodeId,
        name: normalizeName(typedNodeData.name, nodeId),
        nodeId: toHyphenNodeId(nodeId),
        type: "page",
        children: [],
      };

      // Process children if present
      const children = typedNodeData.children as Record<string, unknown> | undefined;
      if (children && isObject(children)) {
        for (const [childId, childData] of Object.entries(children)) {
          if (!isObject(childData)) continue;
          const typedChildData = childData as Record<string, unknown>;
          const childType = String(typedChildData.type || "");
          
          if (childType === COMPONENT_TYPE || childType === COMPONENT_SET_TYPE || childType === INSTANCE_TYPE) {
            page.children!.push({
              id: childId,
              name: normalizeName(typedChildData.name, childId),
              nodeId: toHyphenNodeId(childId),
              type: toComponentKind(childType),
              description: normalizeName(typedChildData.description),
              documentationLinks: [],
            });
          }
        }
      }

      pages.push(page);
    }
  }

  // Sort all lists
  componentsList.sort((a, b) => compareStrings(a.name, b.name));
  componentSetsList.sort((a, b) => compareStrings(a.name, b.name));
  pages.sort((a, b) => compareStrings(a.name, b.name));

  return {
    fileKey: parsedUrl.fileKey,
    fileName: parsedUrl.fileName,
    fileSlug: parsedUrl.fileSlug,
    surface: parsedUrl.surface,
    rootNodeId: parsedUrl.rootNodeId,
    components: uniqueSorted(componentsList, (a, b) => compareStrings(a.name, b.name)),
    componentSets: uniqueSorted(componentSetsList, (a, b) => compareStrings(a.name, b.name)),
    pages,
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
