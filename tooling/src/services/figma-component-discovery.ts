/**
 * Figma Component Discovery
 *
 * Utilities for discovering and extracting component specification nodes from Figma files.
 */

/**
 * Normalize a node name for comparison.
 */
function normalizeNodeName(rawValue: string): string {
  return String(rawValue || '').trim().toLowerCase();
}

/**
 * Classify a Figma node type to a kind.
 */
function classifyNodeTypeToKind(nodeType: string): string {
  const normalized = String(nodeType || '').trim().toUpperCase();
  if (normalized === 'COMPONENT_SET') return 'component_set';
  if (normalized === 'COMPONENT') return 'component';
  if (normalized === 'FRAME' || normalized === 'GROUP') return 'frame';
  if (normalized === 'INSTANCE') return 'instance';
  return 'unknown';
}

interface FigmaTreeEntry {
  node: Record<string, unknown>;
  parentId: string | null;
  canvasId: string | null;
}

/**
 * Build a tree index from a Figma document root.
 */
function buildFigmaTreeIndex(documentRoot: Record<string, unknown>): Map<string, FigmaTreeEntry> {
  const byId = new Map<string, FigmaTreeEntry>();

  function visit(node: Record<string, unknown>, parentId: string | null = null, canvasId: string | null = null): void {
    if (!node || typeof node !== 'object') return;
    const nodeId = String(node.id || '').trim();
    if (!nodeId) return;
    const type = String(node.type || '').trim().toUpperCase();
    const currentCanvasId = type === 'CANVAS' ? nodeId : canvasId;
    byId.set(nodeId, { node, parentId, canvasId: currentCanvasId });
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      visit(child as Record<string, unknown>, nodeId, currentCanvasId);
    }
  }

  visit(documentRoot, null, null);
  return byId;
}

/**
 * Find a descendant FRAME node by exact name match.
 */
function findDescendantFrameByName(rootNode: Record<string, unknown>, targetName: string): Record<string, unknown> | null {
  if (!rootNode || typeof rootNode !== 'object') return null;
  const queue: Array<Record<string, unknown>> = [rootNode];
  const expected = normalizeNodeName(targetName);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!current || typeof current !== 'object') continue;
    const type = String(current.type || '').trim().toUpperCase();
    if (type === 'FRAME' && normalizeNodeName(current.name as string) === expected) {
      return current;
    }
    const children = Array.isArray(current.children) ? current.children : [];
    for (const child of children) queue.push(child as Record<string, unknown>);
  }

  return null;
}

/**
 * Find a descendant FRAME node by regex pattern.
 */
function findDescendantFrameByPattern(rootNode: Record<string, unknown>, pattern: RegExp): Record<string, unknown> | null {
  if (!rootNode || typeof rootNode !== 'object') return null;
  const queue: Array<Record<string, unknown>> = [rootNode];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!current || typeof current !== 'object') continue;
    const type = String(current.type || '').trim().toUpperCase();
    const name = String(current.name || '').trim();
    if (type === 'FRAME' && pattern.test(name)) {
      return current;
    }
    const children = Array.isArray(current.children) ? current.children : [];
    for (const child of children) queue.push(child as Record<string, unknown>);
  }

  return null;
}

/**
 * Pick an exhibit node from a section node.
 */
function pickSectionExhibitNode(
  sectionNode: Record<string, unknown> | null,
  primaryPattern: RegExp,
  fallbackPattern: RegExp | null
): Record<string, unknown> | null {
  if (!sectionNode || typeof sectionNode !== 'object') return null;
  const directChildren = Array.isArray(sectionNode.children) ? sectionNode.children : [];

  for (const child of directChildren) {
    const type = String(child?.type || '').trim().toUpperCase();
    const name = String(child?.name || '').trim();
    if (type === 'FRAME' && primaryPattern.test(name)) return child as Record<string, unknown>;
  }

  const fallback = findDescendantFrameByPattern(sectionNode, primaryPattern);
  if (fallback) return fallback;

  if (fallbackPattern) {
    const secondary = findDescendantFrameByPattern(sectionNode, fallbackPattern);
    if (secondary) return secondary;
  }

  for (const child of directChildren) {
    const type = String(child?.type || '').trim().toUpperCase();
    const name = normalizeNodeName(child?.name as string);
    if (type !== 'FRAME') continue;
    if (name === 'title') continue;
    return child as Record<string, unknown>;
  }

  return null;
}

/**
 * Classify a target kind from a kind value.
 */
export function classifyTargetKind(kindValue: string): string {
  const normalized = String(kindValue || '').trim().toLowerCase();
  if (normalized === 'component_set') return 'component_set';
  if (normalized === 'component') return 'component';
  return 'unknown';
}

/**
 * Check if a kind is allowed for a requested kind.
 */
export function isKindAllowed(kind: string, requestedKind: string): boolean {
  if (requestedKind === 'all') return kind !== 'unknown';
  return kind === requestedKind;
}

export interface SpecNodeCandidate {
  node_id: string;
  name: string;
  kind: string;
  page_name?: string;  // Changed from page_name: string | null to optional
}

/**
 * Extract a single node candidate from a Figma file payload.
 */
export function extractSingleNodeCandidate(
  nodePayload: Record<string, unknown> | null,
  nodeId: string
): SpecNodeCandidate {
  const nodes = nodePayload && typeof nodePayload === 'object' ? nodePayload.nodes : null;
  const entry = nodes && typeof nodes === 'object' ? (nodes as Record<string, unknown>)[nodeId] : null;
  const doc = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).document : null;
  // Narrow doc to Record<string, unknown> for type-safe property access
  const docRec = doc && typeof doc === 'object' ? doc as Record<string, unknown> : null;
  const safeName = docRec?.name ? String(docRec.name).trim() : nodeId;
  const safeType = docRec?.type ? String(docRec.type).trim() : '';

  return {
    node_id: nodeId,
    name: safeName || nodeId,
    kind: classifyNodeTypeToKind(safeType),
    page_name: undefined,  // Changed from null to undefined
  };
}

export interface SpecExhibitNodeIds {
  specsNodeId: string | null;
  anatomyNodeId: string | null;
  propertiesNodeId: string | null;
  layoutNodeId: string | null;
}

export interface ResolveSpecExhibitNodeIdsOptions {
  figmaFilePayload: Record<string, unknown> | null;
  targetNodeId: string;
}

/**
 * Resolve spec exhibit node IDs from a Figma file payload.
 */
export function resolveSpecExhibitNodeIds(options: ResolveSpecExhibitNodeIdsOptions): SpecExhibitNodeIds | null {
  const { figmaFilePayload, targetNodeId } = options;
  if (!figmaFilePayload?.document || !targetNodeId) {
    return null;
  }
  const index = buildFigmaTreeIndex(figmaFilePayload.document as Record<string, unknown>);
  const targetEntry = index.get(String(targetNodeId || '').trim());
  if (!targetEntry?.canvasId) return null;
  const canvasEntry = index.get(targetEntry.canvasId);
  if (!canvasEntry?.node) return null;
  const canvasNode = canvasEntry.node;
  const canvasChildren = Array.isArray(canvasNode.children) ? canvasNode.children : [];

  const specsFrame =
    canvasChildren.find(
      (child) =>
        String(child?.type || '').trim().toUpperCase() === 'FRAME' &&
        normalizeNodeName(child?.name as string) === 'specs',
    ) ||
    canvasChildren.find(
      (child) =>
        String(child?.type || '').trim().toUpperCase() === 'FRAME' &&
        /spec/i.test(String(child?.name || '')),
    );

  if (!specsFrame || typeof specsFrame !== 'object') return null;

  const specificationRoot =
    findDescendantFrameByName(specsFrame, 'Specification') || specsFrame;
  const anatomySection = findDescendantFrameByName(specificationRoot, 'Anatomy');
  const propertiesSection = findDescendantFrameByName(specificationRoot, 'Properties');
  const layoutSection = findDescendantFrameByName(
    specificationRoot,
    'Layout and spacing',
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

  const specsNodeId = String(specsFrame.id || '').trim();
  const anatomyNodeId = String(anatomyExhibit?.id || '').trim();
  const propertiesNodeId = String(propertiesExhibit?.id || '').trim();
  const layoutNodeId = String(layoutExhibit?.id || '').trim();

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
