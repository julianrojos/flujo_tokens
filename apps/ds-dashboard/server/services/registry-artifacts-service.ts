import fs from "node:fs/promises";

export interface JsonArtifactReadError {
  kind: "not_found" | "read_failed" | "empty" | "invalid_json";
  artifactName: string;
  filePath: string;
  reason?: string;
}

export interface JsonArtifactReadSuccess<TValue, TMissing = null> {
  ok: true;
  value: TValue | TMissing;
}

export interface JsonArtifactReadFailure {
  ok: false;
  error: JsonArtifactReadError;
}

export interface ReadJsonArtifactOptions<TMissing = null> {
  filePath: string;
  artifactName: string;
  allowMissing?: boolean;
  missingValue?: TMissing;
  readFile?: typeof fs.readFile;
}

export async function readJsonArtifact<TValue = unknown, TMissing = null>({
  filePath,
  artifactName,
  allowMissing = false,
  missingValue = null as TMissing,
  readFile = fs.readFile,
}: ReadJsonArtifactOptions<TMissing>): Promise<
  JsonArtifactReadSuccess<TValue, TMissing> | JsonArtifactReadFailure
> {
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";
    if (code === "ENOENT" && allowMissing) {
      return { ok: true, value: missingValue };
    }
    if (code === "ENOENT") {
      return {
        ok: false,
        error: {
          kind: "not_found",
          artifactName,
          filePath,
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: "read_failed",
        artifactName,
        filePath,
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }

  if (!raw.trim()) {
    return {
      ok: false,
      error: {
        kind: "empty",
        artifactName,
        filePath,
      },
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) as TValue };
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "invalid_json",
        artifactName,
        filePath,
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export interface ArtifactReadFailureLike {
  kind?: string;
  artifactName?: unknown;
  filePath?: unknown;
  reason?: unknown;
}

export interface ArtifactReadApiError {
  statusCode: number;
  args: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context: Record<string, unknown>;
  };
}

export function artifactReadFailureToApiError(
  error: ArtifactReadFailureLike,
): ArtifactReadApiError {
  const artifactName = String(error?.artifactName || "artifact");
  const filePath = String(error?.filePath || "");
  if (error?.kind === "not_found") {
    return {
      statusCode: 404,
      args: {
        code: "file.not_found",
        userMessage: `${artifactName} artifact not found.`,
        recoverable: true,
        context: { artifact: artifactName, filePath },
      },
    };
  }
  if (error?.kind === "read_failed") {
    return {
      statusCode: 500,
      args: {
        code: "internal.unexpected_error",
        userMessage: `Failed to read ${artifactName} artifact.`,
        recoverable: true,
        context: {
          artifact: artifactName,
          filePath,
          reason: String(error.reason || ""),
        },
      },
    };
  }
  if (error?.kind === "empty") {
    return {
      statusCode: 500,
      args: {
        code: "internal.unexpected_error",
        userMessage: `${artifactName} artifact is empty.`,
        recoverable: true,
        context: { artifact: artifactName, filePath },
      },
    };
  }
  return {
    statusCode: 500,
    args: {
      code: "internal.unexpected_error",
      userMessage: `${artifactName} artifact is not valid JSON.`,
      recoverable: true,
      context: {
        artifact: artifactName,
        filePath,
        reason: String(error?.reason || ""),
      },
    },
  };
}

export interface RegistryTokenEntry {
  collection?: unknown;
  path?: unknown;
  slashPath?: unknown;
  [key: string]: unknown;
}

export interface TokenTreeNode {
  id: string;
  name: string;
  type: "collection" | "group" | "token";
  path: string;
  children: TokenTreeNode[];
  tokenData?: RegistryTokenEntry;
}

export interface TokenCollectionTree {
  collection: string;
  tokenCount: number;
  root: TokenTreeNode;
}

export interface TokenCollectionTreesResult {
  collections: TokenCollectionTree[];
  summary: {
    collections: number;
    tokens: number;
  };
}

function sortTokenTree(nodes: TokenTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      if (a.type === "token") return 1;
      if (b.type === "token") return -1;
    }
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
  for (const node of nodes) {
    if (node.children.length > 0) sortTokenTree(node.children);
  }
}

export function buildTokenCollectionTrees(
  entries: RegistryTokenEntry[],
): TokenCollectionTreesResult {
  const byCollection = new Map<string, RegistryTokenEntry[]>();
  for (const entry of entries) {
    const collection = String(entry.collection || "Uncategorized").trim() || "Uncategorized";
    if (!byCollection.has(collection)) byCollection.set(collection, []);
    byCollection.get(collection)?.push(entry);
  }

  const collections = Array.from(byCollection.entries())
    .sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map(([collection, collectionEntries]) => {
      const root: TokenTreeNode = {
        id: `collection:${collection}`,
        name: collection,
        type: "collection",
        path: collection,
        children: [],
      };
      const nodeByPath = new Map<string, TokenTreeNode>();
      nodeByPath.set(root.path, root);

      const sortedEntries = collectionEntries
        .slice()
        .sort((a, b) =>
          String(a.path || a.slashPath || "").localeCompare(
            String(b.path || b.slashPath || ""),
            "en",
            { sensitivity: "base" },
          ),
        );

      for (const entry of sortedEntries) {
        const slashPath = String(entry.slashPath || "").trim();
        const pathValue = String(entry.path || "").trim();
        const normalizedPath = slashPath || pathValue.replace(/\./g, "/");
        if (!normalizedPath) continue;
        const rawSegments = normalizedPath.split("/").filter(Boolean);
        const segments =
          rawSegments[0]?.localeCompare(collection, "en", { sensitivity: "base" }) === 0
            ? rawSegments.slice(1)
            : rawSegments;
        if (segments.length === 0) continue;

        let currentPath = collection;
        let parent = root;
        for (let i = 0; i < segments.length; i += 1) {
          const segment = segments[i];
          const isLeaf = i === segments.length - 1;
          currentPath = `${currentPath}/${segment}`;

          if (isLeaf) {
            const tokenNode: TokenTreeNode = {
              id: `token:${currentPath}`,
              name: segment,
              type: "token",
              path: currentPath,
              children: [],
              tokenData: entry,
            };
            parent.children.push(tokenNode);
            continue;
          }

          let groupNode = nodeByPath.get(currentPath);
          if (!groupNode) {
            groupNode = {
              id: `group:${currentPath}`,
              name: segment,
              type: "group",
              path: currentPath,
              children: [],
            };
            nodeByPath.set(currentPath, groupNode);
            parent.children.push(groupNode);
          }
          parent = groupNode;
        }
      }

      sortTokenTree(root.children);

      return {
        collection,
        tokenCount: collectionEntries.length,
        root,
      };
    });

  return {
    collections,
    summary: {
      collections: collections.length,
      tokens: entries.length,
    },
  };
}

export interface RegistryComponentUsageVariant {
  nodeId?: unknown;
  name?: unknown;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RegistryComponentUsageDependency {
  instanceNodeId?: unknown;
  instanceNodeName?: unknown;
  usedComponentNodeId?: unknown;
  usedComponentName?: unknown;
  usedComponentKey?: unknown;
  status?: unknown;
  [key: string]: unknown;
}

export interface RegistryComponentUsageFigmaInfo {
  componentSetNodeId?: unknown;
  variants?: RegistryComponentUsageVariant[];
  instanceDependencies?: RegistryComponentUsageDependency[];
}

export interface RegistryComponentUsageRow {
  slug?: unknown;
  name?: unknown;
  display_name?: unknown;
  figma?: RegistryComponentUsageFigmaInfo;
  figmaComponentSetNodeId?: unknown;
}

export interface ComponentUsageEntry {
  uses: string[];
  used_in: string[];
}

export interface ComponentUsageIndexResult {
  by_slug: Record<string, ComponentUsageEntry>;
}

export function buildComponentUsageIndex(
  rows: RegistryComponentUsageRow[],
): ComponentUsageIndexResult {
  const slugSet = new Set(
    rows
      .map((row) => String(row.slug || "").trim())
      .filter(Boolean),
  );
  const usesMap = new Map<string, Set<string>>();
  for (const slug of Array.from(slugSet)) usesMap.set(slug, new Set());
  const nodeIdToSlug = new Map<string, string>();
  const nameToSlugs = new Map<string, Set<string>>();
  const normalizeNodeId = (value: unknown): string => String(value || "").trim();
  const normalizeName = (value: unknown): string => String(value || "").trim().toLowerCase();

  for (const row of rows) {
    const slug = String(row.slug || "").trim();
    if (!slug) continue;
    const name = normalizeName(row.name || row.display_name || "");
    const componentNodeId = normalizeNodeId(
      row.figma?.componentSetNodeId || row.figmaComponentSetNodeId,
    );
    if (componentNodeId && !nodeIdToSlug.has(componentNodeId)) {
      nodeIdToSlug.set(componentNodeId, slug);
    }
    if (name) {
      const candidates = nameToSlugs.get(name) || new Set<string>();
      candidates.add(slug);
      nameToSlugs.set(name, candidates);
    }
  }

  for (const row of rows) {
    const slug = String(row.slug || "").trim();
    if (!slug) continue;
    const variants = Array.isArray(row.figma?.variants) ? row.figma.variants : [];
    for (const variant of variants) {
      const variantNodeId = normalizeNodeId(variant?.nodeId);
      if (variantNodeId && !nodeIdToSlug.has(variantNodeId)) {
        nodeIdToSlug.set(variantNodeId, slug);
      }
    }
  }

  for (const row of rows) {
    const ownerSlug = String(row.slug || "").trim();
    if (!ownerSlug || !usesMap.has(ownerSlug)) continue;

    const instanceDependencies = Array.isArray(row.figma?.instanceDependencies)
      ? row.figma.instanceDependencies
      : [];
    for (const dependency of instanceDependencies) {
      const usedNodeId = normalizeNodeId(dependency?.usedComponentNodeId);
      const usedName = normalizeName(
        dependency?.usedComponentName || dependency?.usedComponentKey || "",
      );
      const nameCandidates = nameToSlugs.get(usedName);
      const usedNameSlug =
        nameCandidates && nameCandidates.size === 1
          ? Array.from(nameCandidates)[0] || ""
          : "";
      const targetSlug =
        nodeIdToSlug.get(usedNodeId) ||
        usedNameSlug ||
        "";
      if (!targetSlug || targetSlug === ownerSlug) continue;
      usesMap.get(ownerSlug)?.add(targetSlug);
    }
  }

  const usedInMap = new Map<string, Set<string>>();
  for (const slug of Array.from(slugSet)) usedInMap.set(slug, new Set());

  for (const [ownerSlug, uses] of Array.from(usesMap.entries())) {
    for (const targetSlug of Array.from(uses)) {
      usedInMap.get(targetSlug)?.add(ownerSlug);
    }
  }

  const bySlug: Record<string, ComponentUsageEntry> = {};
  for (const slug of Array.from(slugSet).sort((a, b) => a.localeCompare(b))) {
    bySlug[slug] = {
      uses: Array.from(usesMap.get(slug) || []).sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" }),
      ),
      used_in: Array.from(usedInMap.get(slug) || []).sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" }),
      ),
    };
  }

  return { by_slug: bySlug };
}
