import fs from "node:fs/promises";

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

export function buildComponentUsageIndex(rows) {
  const slugSet = new Set(
    rows
      .map((row) => String(row.slug || "").trim())
      .filter(Boolean),
  );
  const usesMap = new Map();
  for (const slug of Array.from(slugSet)) usesMap.set(slug, new Set());
  const nodeIdToSlug = new Map();
  const nameToSlugs = new Map();
  const normalizeNodeId = (value) => String(value || "").trim();
  const normalizeName = (value) => String(value || "").trim().toLowerCase();

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
      const candidates = nameToSlugs.get(name) || new Set();
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
