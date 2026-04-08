import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

export async function readJsonArtifact({
  filePath,
  artifactName,
  allowMissing = false,
  missingValue = null,
  readFile = fs.readFile,
}) {
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code || "")
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
    return { ok: true, value: JSON.parse(raw) };
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

export function artifactReadFailureToApiError(error) {
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

export function buildTokenCollectionTrees(entries) {
  const byCollection = new Map();
  for (const entry of entries) {
    const collection = String(entry.collection || "Uncategorized").trim() || "Uncategorized";
    if (!byCollection.has(collection)) byCollection.set(collection, []);
    byCollection.get(collection)?.push(entry);
  }

  const collections = Array.from(byCollection.entries())
    .sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map(([collection, collectionEntries]) => {
      const root = {
        id: `collection:${collection}`,
        name: collection,
        type: "collection",
        path: collection,
        children: [],
      };
      const nodeByPath = new Map();
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
            const tokenNode = {
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

      const sortTree = (nodes) => {
        nodes.sort((a, b) => {
          if (a.type !== b.type) {
            if (a.type === "token") return 1;
            if (b.type === "token") return -1;
          }
          return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
        });
        for (const node of nodes) {
          if (node.children.length > 0) sortTree(node.children);
        }
      };
      sortTree(root.children);

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

function normalizeSlug(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s\-./]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function singularizeSlug(slug) {
  const normalized = normalizeSlug(slug);
  if (normalized.endsWith("ies") && normalized.length > 3) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("s") && normalized.length > 1) return normalized.slice(0, -1);
  return normalized;
}

function extractExplicitRelatedComponents(rawSpec) {
  const blockMatch = String(rawSpec || "").match(
    /^related_components:\s*\n((?:[ \t]*-\s*[^\n]+\n?)*)/m,
  );
  if (!blockMatch) return [];

  const rows = String(blockMatch[1] || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));

  return rows
    .map((line) => line.replace(/^- /, "").trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .map((item) => normalizeSlug(item));
}

function extractAnatomyItemRefs(rawSpec) {
  const refs = new Set();
  const text = String(rawSpec || "");
  const idRegex = /^\s*-\s*id:\s*([A-Za-z0-9_-]+)\s*$/gm;
  let idMatch = null;
  while ((idMatch = idRegex.exec(text)) !== null) {
    const id = normalizeSlug(String(idMatch[1] || ""));
    if (!id) continue;
    if (id.endsWith("_item") || id.endsWith("_items")) {
      const base = id.replace(/_items?$/, "");
      if (base) refs.add(base);
      const singular = singularizeSlug(base);
      if (singular) refs.add(singular);
    }
  }

  const instanceRegex = /\b([A-Z][A-Za-z0-9_-]*)\s+instances\b/g;
  let instanceMatch = null;
  while ((instanceMatch = instanceRegex.exec(text)) !== null) {
    const token = normalizeSlug(String(instanceMatch[1] || ""));
    if (token) {
      refs.add(token);
      refs.add(singularizeSlug(token));
    }
  }

  return Array.from(refs);
}

function extractRelatedComponentsFromRow(row) {
  const source = row?.related_components;
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => normalizeSlug(String(item || "")))
    .filter(Boolean);
}

export function buildComponentUsageIndex(rows, root, options = {}) {
  const readFileSync = options.readFileSync || fsSync.readFileSync;
  const slugSet = new Set(rows.map((row) => normalizeSlug(String(row.slug || ""))).filter(Boolean));
  const usesMap = new Map();
  for (const slug of Array.from(slugSet)) usesMap.set(slug, new Set());

  for (const row of rows) {
    const ownerSlug = normalizeSlug(String(row.slug || ""));
    if (!ownerSlug || !usesMap.has(ownerSlug)) continue;
    const specRelPath = String(row.paths?.spec || "").trim();
    if (!specRelPath) continue;
    if (specRelPath.startsWith("db://")) {
      const refs = new Set(extractRelatedComponentsFromRow(row));
      for (const ref of Array.from(refs)) {
        const normalized = normalizeSlug(ref);
        const singular = singularizeSlug(normalized);
        const finalRef = slugSet.has(normalized) ? normalized : slugSet.has(singular) ? singular : "";
        if (!finalRef || finalRef === ownerSlug) continue;
        usesMap.get(ownerSlug)?.add(finalRef);
      }
      continue;
    }
    const specPath = path.resolve(root, specRelPath);

    let rawSpec = "";
    try {
      rawSpec = readFileSync(specPath, "utf8");
    } catch {
      continue;
    }

    const refs = new Set([
      ...extractExplicitRelatedComponents(rawSpec),
      ...extractAnatomyItemRefs(rawSpec),
    ]);
    for (const ref of Array.from(refs)) {
      const normalized = normalizeSlug(ref);
      const singular = singularizeSlug(normalized);
      const finalRef = slugSet.has(normalized) ? normalized : slugSet.has(singular) ? singular : "";
      if (!finalRef || finalRef === ownerSlug) continue;
      usesMap.get(ownerSlug)?.add(finalRef);
    }
  }

  const usedInMap = new Map();
  for (const slug of Array.from(slugSet)) usedInMap.set(slug, new Set());

  for (const [ownerSlug, uses] of Array.from(usesMap.entries())) {
    for (const targetSlug of Array.from(uses)) {
      usedInMap.get(targetSlug)?.add(ownerSlug);
    }
  }

  const bySlug = {};
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
