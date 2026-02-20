const COMPONENT_SET_TYPE = "COMPONENT_SET";
const COMPONENT_TYPE = "COMPONENT";
const INSTANCE_TYPE = "INSTANCE";
const PAGE_TYPE = "CANVAS";
const SUPPORTED_FILE_SURFACES = new Set(["design", "file"]);

function compareStrings(a, b) {
  return String(a || "").localeCompare(String(b || ""), "en", {
    sensitivity: "base",
  });
}

function compareNodeIds(a, b) {
  return compareStrings(a, b);
}

function toHyphenNodeId(nodeId) {
  return String(nodeId || "").replace(/:/g, "-");
}

function toComponentKind(nodeType) {
  if (nodeType === COMPONENT_SET_TYPE) return "component_set";
  if (nodeType === COMPONENT_TYPE) return "component";
  return "unknown";
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeName(rawName, fallback = "") {
  const text = String(rawName || "").trim();
  return text || fallback;
}

function normalizePathSlug(rawSlug, fallback = "Figma-File") {
  const decoded = decodeURIComponent(String(rawSlug || "").trim());
  const normalized = decoded.replace(/\s+/g, "-").replace(/-+/g, "-").trim();
  return normalized || fallback;
}

function parseFilePathInfo(url) {
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

function sanitizeNodeId(rawNodeId) {
  const value = String(rawNodeId || "").trim();
  if (!value) return "";
  const normalized = value.replace(/-/g, ":");
  return /^\d+:\d+$/.test(normalized) ? normalized : "";
}

function parseNodeIdFromUrl(url) {
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

function uniqueSorted(values, comparator = compareStrings) {
  return Array.from(new Set(values)).sort(comparator);
}

export function parseFigmaFileUrl(figmaUrl) {
  const raw = String(figmaUrl || "").trim();
  if (!raw) {
    throw new Error("Missing Figma URL.");
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid URL format: ${raw}`);
  }

  if (!/figma\.com$/i.test(parsed.hostname) && !/\.figma\.com$/i.test(parsed.hostname)) {
    throw new Error(`URL host is not figma.com: ${parsed.hostname}`);
  }

  const { surface, fileKey, slug } = parseFilePathInfo(parsed);
  const baseFileUrl = `${parsed.origin}/${surface}/${fileKey}/${encodeURIComponent(slug)}`;

  return {
    sourceUrl: raw,
    origin: parsed.origin,
    surface,
    fileKey,
    slug,
    nodeIdFromUrl: parseNodeIdFromUrl(parsed),
    baseFileUrl,
  };
}

export function buildFigmaNodeUrl(fileDescriptor, nodeId) {
  const safeNodeId = String(nodeId || "").trim();
  if (!safeNodeId) return "";
  return `${fileDescriptor.baseFileUrl}?node-id=${toHyphenNodeId(safeNodeId)}`;
}

function normalizeComponentCatalog(rawCatalog, fallbackKind) {
  if (!isObject(rawCatalog)) return [];
  const normalized = [];

  for (const [nodeId, meta] of Object.entries(rawCatalog)) {
    if (!isObject(meta)) continue;
    normalized.push({
      node_id: String(nodeId || "").trim(),
      key: String(meta.key || "").trim(),
      name: normalizeName(meta.name, ""),
      description: normalizeName(meta.description, ""),
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

function buildCatalogIndex(filePayload) {
  const components = normalizeComponentCatalog(filePayload.components, "component");
  const componentSets = normalizeComponentCatalog(
    filePayload.componentSets,
    "component_set",
  );
  const merged = [...components, ...componentSets];

  const byNodeId = new Map();
  const byKey = new Map();
  const keyCollisions = [];

  for (const item of merged) {
    byNodeId.set(item.node_id, item);
    const componentKey = String(item.key || "").trim();
    if (!componentKey) continue;

    if (!byKey.has(componentKey)) {
      byKey.set(componentKey, item.node_id);
      continue;
    }
    const existingNodeId = byKey.get(componentKey);
    if (existingNodeId !== item.node_id) {
      keyCollisions.push({
        component_key: componentKey,
        node_ids: uniqueSorted([existingNodeId, item.node_id], compareNodeIds),
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

function sortedChildren(node) {
  if (!Array.isArray(node?.children)) return [];
  return node.children
    .filter((child) => isObject(child))
    .slice()
    .sort((a, b) =>
      compareStrings(
        `${a.type || ""}|${a.name || ""}|${a.id || ""}`,
        `${b.type || ""}|${b.name || ""}|${b.id || ""}`,
      ),
    );
}

function relationKey(parts) {
  return parts.map((part) => String(part || "")).join("|");
}

function pushUniqueRelation(rows, uniqueKeys, payload, keyParts) {
  const key = relationKey(keyParts);
  if (uniqueKeys.has(key)) return;
  uniqueKeys.add(key);
  rows.push(payload);
}

function isComponentNodeType(nodeType) {
  return nodeType === COMPONENT_TYPE || nodeType === COMPONENT_SET_TYPE;
}

function isPageNode(node) {
  return String(node?.type || "").trim() === PAGE_TYPE;
}

function buildPageRecords(pageNodes, fileDescriptor) {
  return pageNodes
    .map((pageNode) => ({
      id: String(pageNode.id || "").trim(),
      name: normalizeName(pageNode.name, "Untitled Page"),
      node_url: buildFigmaNodeUrl(fileDescriptor, pageNode.id),
    }))
    .filter((page) => page.id)
    .sort((a, b) => compareStrings(`${a.name}|${a.id}`, `${b.name}|${b.id}`));
}

function stableJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableJsonValue(item));
  }
  if (isObject(value)) {
    const ordered = {};
    for (const key of Object.keys(value).sort(compareStrings)) {
      ordered[key] = stableJsonValue(value[key]);
    }
    return ordered;
  }
  return value;
}

function makePathLabel(pathItems) {
  return pathItems.filter(Boolean).join(" > ");
}

export function buildFigmaComponentMap({
  filePayload,
  fileDescriptor,
  includeInstances = true,
} = {}) {
  if (!isObject(filePayload)) {
    throw new Error("Invalid Figma payload: expected an object.");
  }
  if (!isObject(filePayload.document)) {
    throw new Error("Invalid Figma payload: missing `document`.");
  }
  if (!isObject(fileDescriptor)) {
    throw new Error("Missing file descriptor.");
  }

  const { byNodeId, byKey, keyCollisions } = buildCatalogIndex(filePayload);
  const rootDocument = filePayload.document;
  const pageNodes = sortedChildren(rootDocument).filter((node) => isPageNode(node));
  const pages = buildPageRecords(pageNodes, fileDescriptor);

  const components = [];
  const componentIndex = new Map();
  const treeContainsRelations = [];
  const treeContainsKeys = new Set();
  const instanceUseRecords = [];
  const unresolvedInstanceUseRecords = [];
  const dependencyEdges = new Map();

  const walkNode = ({
    node,
    page,
    depth,
    ancestors,
    componentStack,
  }) => {
    const nodeId = String(node.id || "").trim();
    if (!nodeId) return;

    const nodeType = String(node.type || "").trim().toUpperCase();
    const nodeName = normalizeName(node.name, nodeType || "Node");
    const pathNames = [...ancestors, nodeName];
    const nextDepth = depth + 1;

    if (isComponentNodeType(nodeType)) {
      const parentComponent = componentStack.length
        ? componentStack[componentStack.length - 1]
        : null;
      const catalog = byNodeId.get(nodeId);
      const componentRecord = {
        node_id: nodeId,
        node_url: buildFigmaNodeUrl(fileDescriptor, nodeId),
        kind: toComponentKind(nodeType),
        type: nodeType,
        name: nodeName,
        description: normalizeName(catalog?.description, ""),
        page_id: page.id,
        page_name: page.name,
        parent_component_node_id: parentComponent ? parentComponent.node_id : null,
        parent_component_name: parentComponent ? parentComponent.name : null,
        ancestor_component_node_ids: componentStack.map((item) => item.node_id),
        depth,
        tree_path: makePathLabel(pathNames),
        component_key: normalizeName(catalog?.key, ""),
      };

      components.push(componentRecord);
      componentIndex.set(nodeId, componentRecord);

      if (parentComponent) {
        pushUniqueRelation(
          treeContainsRelations,
          treeContainsKeys,
          {
            parent_node_id: parentComponent.node_id,
            child_node_id: nodeId,
          },
          [parentComponent.node_id, nodeId],
        );
      }

      componentStack = [...componentStack, componentRecord];
    }

    if (includeInstances && nodeType === INSTANCE_TYPE && componentStack.length > 0) {
      const ownerComponent = componentStack[componentStack.length - 1];
      const usedComponentKey = String(node.componentId || "").trim();
      const usedComponentNodeId = usedComponentKey ? byKey.get(usedComponentKey) : "";
      const instanceNodeId = nodeId;

      if (usedComponentNodeId) {
        instanceUseRecords.push({
          owner_component_node_id: ownerComponent.node_id,
          owner_component_name: ownerComponent.name,
          used_component_node_id: usedComponentNodeId,
          used_component_name: "",
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
        const edge = dependencyEdges.get(edgeKey);
        edge.instance_count += 1;
        edge.instance_node_ids.push(instanceNodeId);
      } else {
        unresolvedInstanceUseRecords.push({
          owner_component_node_id: ownerComponent.node_id,
          owner_component_name: ownerComponent.name,
          used_component_key: usedComponentKey || null,
          instance_node_id: instanceNodeId,
          instance_node_url: buildFigmaNodeUrl(fileDescriptor, instanceNodeId),
          reason: usedComponentKey
            ? "component key not found in file catalog"
            : "instance without componentId",
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
    const pageNode = pageNodes.find((node) => String(node.id || "").trim() === page.id);
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

  components.sort((a, b) =>
    compareStrings(
      `${a.page_name}|${a.kind}|${a.name}|${a.node_id}`,
      `${b.page_name}|${b.kind}|${b.name}|${b.node_id}`,
    ),
  );

  treeContainsRelations.sort((a, b) =>
    compareStrings(
      `${a.parent_node_id}|${a.child_node_id}`,
      `${b.parent_node_id}|${b.child_node_id}`,
    ),
  );

  const dependencyList = Array.from(dependencyEdges.values())
    .map((edge) => ({
      ...edge,
      instance_node_ids: uniqueSorted(edge.instance_node_ids, compareNodeIds),
    }))
    .sort((a, b) =>
      compareStrings(
        `${a.owner_component_node_id}|${a.used_component_node_id}`,
        `${b.owner_component_node_id}|${b.used_component_node_id}`,
      ),
    );

  instanceUseRecords.sort((a, b) =>
    compareStrings(
      `${a.owner_component_node_id}|${a.used_component_node_id}|${a.instance_node_id}`,
      `${b.owner_component_node_id}|${b.used_component_node_id}|${b.instance_node_id}`,
    ),
  );
  unresolvedInstanceUseRecords.sort((a, b) =>
    compareStrings(
      `${a.owner_component_node_id}|${a.instance_node_id}|${a.used_component_key || ""}`,
      `${b.owner_component_node_id}|${b.instance_node_id}|${b.used_component_key || ""}`,
    ),
  );

  for (const edge of dependencyList) {
    const used = componentIndex.get(edge.used_component_node_id);
    const owner = componentIndex.get(edge.owner_component_node_id);
    edge.owner_component_name = owner ? owner.name : "";
    edge.used_component_name = used ? used.name : "";
  }
  for (const usage of instanceUseRecords) {
    const used = componentIndex.get(usage.used_component_node_id);
    usage.used_component_name = used ? used.name : "";
  }

  const childrenByParent = new Map();
  for (const relation of treeContainsRelations) {
    if (!childrenByParent.has(relation.parent_node_id)) {
      childrenByParent.set(relation.parent_node_id, []);
    }
    childrenByParent.get(relation.parent_node_id).push(relation.child_node_id);
  }

  const dependencyByOwner = new Map();
  const dependencyByUsed = new Map();
  for (const edge of dependencyList) {
    if (!dependencyByOwner.has(edge.owner_component_node_id)) {
      dependencyByOwner.set(edge.owner_component_node_id, []);
    }
    dependencyByOwner.get(edge.owner_component_node_id).push(edge.used_component_node_id);

    if (!dependencyByUsed.has(edge.used_component_node_id)) {
      dependencyByUsed.set(edge.used_component_node_id, []);
    }
    dependencyByUsed.get(edge.used_component_node_id).push(edge.owner_component_node_id);
  }

  for (const component of components) {
    component.child_component_node_ids = uniqueSorted(
      childrenByParent.get(component.node_id) || [],
      compareNodeIds,
    );
    component.uses_component_node_ids = uniqueSorted(
      dependencyByOwner.get(component.node_id) || [],
      compareNodeIds,
    );
    component.used_by_component_node_ids = uniqueSorted(
      dependencyByUsed.get(component.node_id) || [],
      compareNodeIds,
    );
  }

  const pageStats = pages.map((page) => {
    const pageComponents = components.filter((component) => component.page_id === page.id);
    return {
      ...page,
      component_set_count: pageComponents.filter((row) => row.kind === "component_set")
        .length,
      component_count: pageComponents.filter((row) => row.kind === "component").length,
      component_like_count: pageComponents.length,
    };
  });

  const componentUrls = components
    .map((component) => ({
      node_id: component.node_id,
      name: component.name,
      kind: component.kind,
      page_name: component.page_name,
      url: component.node_url,
    }))
    .sort((a, b) =>
      compareStrings(
        `${a.page_name}|${a.kind}|${a.name}|${a.node_id}`,
        `${b.page_name}|${b.kind}|${b.name}|${b.node_id}`,
      ),
    );

  const fileName = normalizeName(filePayload.name, "Untitled");
  const componentSetCount = components.filter((row) => row.kind === "component_set").length;
  const componentCount = components.filter((row) => row.kind === "component").length;

  const warnings = [];
  if (keyCollisions.length > 0) {
    warnings.push("Duplicate component keys were found in Figma catalog.");
  }
  if (unresolvedInstanceUseRecords.length > 0) {
    warnings.push(
      "Some component instances reference keys not present in this file catalog.",
    );
  }

  return stableJsonValue({
    schema_version: "1",
    source: {
      file_key: fileDescriptor.fileKey,
      file_name: fileName,
      file_url: fileDescriptor.baseFileUrl,
      source_url: fileDescriptor.sourceUrl,
      surface: fileDescriptor.surface,
      node_id_from_url: fileDescriptor.nodeIdFromUrl || null,
    },
    stats: {
      pages: pageStats.length,
      component_sets: componentSetCount,
      components: componentCount,
      component_nodes_total: components.length,
      tree_contains_relations: treeContainsRelations.length,
      instance_dependencies: dependencyList.length,
      instance_records: instanceUseRecords.length,
      unresolved_instance_records: unresolvedInstanceUseRecords.length,
    },
    pages: pageStats,
    components,
    component_urls: componentUrls,
    relations: {
      tree_contains: treeContainsRelations,
      component_dependencies: dependencyList,
      instance_uses: instanceUseRecords,
      unresolved_instance_uses: unresolvedInstanceUseRecords,
    },
    catalog: {
      size: byNodeId.size,
      key_collisions: keyCollisions,
    },
    warnings,
  });
}

export function buildFigmaComponentMapSummary(componentMap) {
  const map = isObject(componentMap) ? componentMap : {};
  const stats = isObject(map.stats) ? map.stats : {};
  const source = isObject(map.source) ? map.source : {};
  const pages = Array.isArray(map.pages) ? map.pages : [];
  const topDependencies = isObject(map.relations) &&
    Array.isArray(map.relations.component_dependencies)
    ? map.relations.component_dependencies
        .slice()
        .sort((a, b) => {
          const countDiff =
            Number(b.instance_count || 0) - Number(a.instance_count || 0);
          if (countDiff !== 0) return countDiff;
          return compareStrings(
            `${a.owner_component_name || ""}|${a.used_component_name || ""}`,
            `${b.owner_component_name || ""}|${b.used_component_name || ""}`,
          );
        })
        .slice(0, 10)
    : [];

  return {
    source: {
      file_key: source.file_key || "",
      file_name: source.file_name || "",
      file_url: source.file_url || "",
    },
    stats: {
      pages: Number(stats.pages || 0),
      component_sets: Number(stats.component_sets || 0),
      components: Number(stats.components || 0),
      component_nodes_total: Number(stats.component_nodes_total || 0),
      tree_contains_relations: Number(stats.tree_contains_relations || 0),
      instance_dependencies: Number(stats.instance_dependencies || 0),
      unresolved_instance_records: Number(stats.unresolved_instance_records || 0),
    },
    pages: pages.map((page) => ({
      name: page.name,
      component_like_count: page.component_like_count,
      component_sets: page.component_set_count,
      components: page.component_count,
    })),
    top_dependencies: topDependencies.map((edge) => ({
      owner_component_name: edge.owner_component_name || edge.owner_component_node_id,
      used_component_name: edge.used_component_name || edge.used_component_node_id,
      instance_count: Number(edge.instance_count || 0),
    })),
  };
}

export function renderFigmaComponentMapText(componentMap) {
  const summary = buildFigmaComponentMapSummary(componentMap);
  const lines = [];
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
