function normalizeNodeName(rawValue) {
  return String(rawValue || "").trim().toLowerCase();
}

function classifyNodeTypeToKind(nodeType) {
  const normalized = String(nodeType || "").trim().toUpperCase();
  if (normalized === "COMPONENT_SET") return "component_set";
  if (normalized === "COMPONENT") return "component";
  if (normalized === "FRAME" || normalized === "GROUP") return "frame";
  if (normalized === "INSTANCE") return "instance";
  return "unknown";
}

function buildFigmaTreeIndex(documentRoot) {
  const byId = new Map();

  function visit(node, parentId = null, canvasId = null) {
    if (!node || typeof node !== "object") return;
    const nodeId = String(node.id || "").trim();
    if (!nodeId) return;
    const type = String(node.type || "").trim().toUpperCase();
    const currentCanvasId = type === "CANVAS" ? nodeId : canvasId;
    byId.set(nodeId, { node, parentId, canvasId: currentCanvasId });
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      visit(child, nodeId, currentCanvasId);
    }
  }

  visit(documentRoot, null, null);
  return byId;
}

function findDescendantFrameByName(rootNode, targetName) {
  if (!rootNode || typeof rootNode !== "object") return null;
  const queue = [rootNode];
  const expected = normalizeNodeName(targetName);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    const type = String(current.type || "").trim().toUpperCase();
    if (type === "FRAME" && normalizeNodeName(current.name) === expected) {
      return current;
    }
    const children = Array.isArray(current.children) ? current.children : [];
    for (const child of children) queue.push(child);
  }

  return null;
}

function findDescendantFrameByPattern(rootNode, pattern) {
  if (!rootNode || typeof rootNode !== "object") return null;
  const queue = [rootNode];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    const type = String(current.type || "").trim().toUpperCase();
    const name = String(current.name || "").trim();
    if (type === "FRAME" && pattern.test(name)) {
      return current;
    }
    const children = Array.isArray(current.children) ? current.children : [];
    for (const child of children) queue.push(child);
  }

  return null;
}

function pickSectionExhibitNode(sectionNode, primaryPattern, fallbackPattern) {
  if (!sectionNode || typeof sectionNode !== "object") return null;
  const directChildren = Array.isArray(sectionNode.children)
    ? sectionNode.children
    : [];

  for (const child of directChildren) {
    const type = String(child?.type || "").trim().toUpperCase();
    const name = String(child?.name || "").trim();
    if (type === "FRAME" && primaryPattern.test(name)) return child;
  }

  const fallback = findDescendantFrameByPattern(sectionNode, primaryPattern);
  if (fallback) return fallback;

  if (fallbackPattern) {
    const secondary = findDescendantFrameByPattern(sectionNode, fallbackPattern);
    if (secondary) return secondary;
  }

  for (const child of directChildren) {
    const type = String(child?.type || "").trim().toUpperCase();
    const name = normalizeNodeName(child?.name);
    if (type !== "FRAME") continue;
    if (name === "title") continue;
    return child;
  }

  return null;
}

export function classifyTargetKind(kindValue) {
  const normalized = String(kindValue || "").trim().toLowerCase();
  if (normalized === "component_set") return "component_set";
  if (normalized === "component") return "component";
  return "unknown";
}

export function isKindAllowed(kind, requestedKind) {
  if (requestedKind === "all") return kind !== "unknown";
  return kind === requestedKind;
}

export function extractSingleNodeCandidate(nodePayload, nodeId) {
  const nodes = nodePayload && typeof nodePayload === "object" ? nodePayload.nodes : null;
  const entry = nodes && typeof nodes === "object" ? nodes[nodeId] : null;
  const doc = entry && typeof entry === "object" ? entry.document : null;
  const safeName =
    doc && typeof doc === "object" && doc.name
      ? String(doc.name).trim()
      : nodeId;
  const safeType =
    doc && typeof doc === "object" && doc.type
      ? String(doc.type).trim()
      : "";

  return {
    node_id: nodeId,
    name: safeName || nodeId,
    kind: classifyNodeTypeToKind(safeType),
    page_name: null,
  };
}

export function resolveSpecExhibitNodeIds({ figmaFilePayload, targetNodeId }) {
  if (!figmaFilePayload?.document || !targetNodeId) {
    return null;
  }
  const index = buildFigmaTreeIndex(figmaFilePayload.document);
  const targetEntry = index.get(String(targetNodeId || "").trim());
  if (!targetEntry?.canvasId) return null;
  const canvasEntry = index.get(targetEntry.canvasId);
  if (!canvasEntry?.node) return null;
  const canvasNode = canvasEntry.node;
  const canvasChildren = Array.isArray(canvasNode.children) ? canvasNode.children : [];

  const specsFrame =
    canvasChildren.find(
      (child) =>
        String(child?.type || "").trim().toUpperCase() === "FRAME" &&
        normalizeNodeName(child?.name) === "specs",
    ) ||
    canvasChildren.find(
      (child) =>
        String(child?.type || "").trim().toUpperCase() === "FRAME" &&
        /spec/i.test(String(child?.name || "")),
    );

  if (!specsFrame || typeof specsFrame !== "object") return null;

  const specificationRoot =
    findDescendantFrameByName(specsFrame, "Specification") || specsFrame;
  const anatomySection = findDescendantFrameByName(specificationRoot, "Anatomy");
  const propertiesSection = findDescendantFrameByName(specificationRoot, "Properties");
  const layoutSection = findDescendantFrameByName(
    specificationRoot,
    "Layout and spacing",
  );

  const anatomyExhibit = pickSectionExhibitNode(anatomySection, /exhibit/i, null);
  const propertiesExhibit = pickSectionExhibitNode(
    propertiesSection,
    /exhibits?/i,
    /state/i,
  );
  const layoutExhibit = pickSectionExhibitNode(
    layoutSection,
    /selected node/i,
    /exhibit/i,
  );

  const specsNodeId = String(specsFrame.id || "").trim();
  const anatomyNodeId = String(anatomyExhibit?.id || "").trim();
  const propertiesNodeId = String(propertiesExhibit?.id || "").trim();
  const layoutNodeId = String(layoutExhibit?.id || "").trim();

  if (!specsNodeId && !anatomyNodeId && !propertiesNodeId && !layoutNodeId) {
    return null;
  }

  return {
    specsNodeId: specsNodeId || null,
    anatomyNodeId: anatomyNodeId || null,
    propertiesNodeId: propertiesNodeId || null,
    layoutNodeId: layoutNodeId || null,
  };
}
