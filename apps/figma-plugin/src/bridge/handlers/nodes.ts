/**
 * Node and Screenshot Handlers (P1)
 */

import {
  CaptureScreenshotParams,
  CloneNodeParams,
  CreateChildNodeParams,
  DeleteNodeParams,
  MoveNodeParams,
  RenameNodeParams,
  ResizeNodeParams,
  SetNodeCornerRadiusParams,
  SetNodeFillsParams,
  SetNodeOpacityParams,
  SetNodeStrokesParams,
  SetTextContentParams,
  GetChildrenParams,
  GetChildrenResult,
  SearchNodesParams,
  SearchNodesResult,
  GetNodesByIdParams,
  GetNodesByIdResult,
  NodeSummary,
  NodeData,
  createBridgeError,
  ERROR_CODES,
} from '../protocol';
import { stripDiacritics } from '../utils/strip-diacritics.js';

function toHexRgb(hex: string): { r: number; g: number; b: number; a: number } {
  const raw = hex.replace(/^#/, '');
  if (!/^[0-9A-Fa-f]+$/.test(raw)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;

  if (raw.length === 3) {
    r = parseInt(raw[0] + raw[0], 16) / 255;
    g = parseInt(raw[1] + raw[1], 16) / 255;
    b = parseInt(raw[2] + raw[2], 16) / 255;
  } else if (raw.length === 4) {
    r = parseInt(raw[0] + raw[0], 16) / 255;
    g = parseInt(raw[1] + raw[1], 16) / 255;
    b = parseInt(raw[2] + raw[2], 16) / 255;
    a = parseInt(raw[3] + raw[3], 16) / 255;
  } else if (raw.length === 6) {
    r = parseInt(raw.slice(0, 2), 16) / 255;
    g = parseInt(raw.slice(2, 4), 16) / 255;
    b = parseInt(raw.slice(4, 6), 16) / 255;
  } else if (raw.length === 8) {
    r = parseInt(raw.slice(0, 2), 16) / 255;
    g = parseInt(raw.slice(2, 4), 16) / 255;
    b = parseInt(raw.slice(4, 6), 16) / 255;
    a = parseInt(raw.slice(6, 8), 16) / 255;
  } else {
    throw new Error(`Invalid hex color length: ${hex}`);
  }

  return { r, g, b, a };
}

function toNodeSummary(node: BaseNode): { id: string; name: string } {
  return { id: node.id, name: node.name };
}

/**
 * Check if an error is already a BridgeError
 */
function isBridgeError(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

function toSolidPaint(paint: unknown): Paint {
  if (typeof paint !== 'object' || paint === null) {
    throw new Error('Invalid paint payload');
  }

  const raw = paint as Record<string, unknown>;
  if (raw.type !== 'SOLID') {
    return raw as unknown as Paint;
  }

  if (typeof raw.color === 'string') {
    const rgb = toHexRgb(raw.color);
    return {
      type: 'SOLID',
      color: { r: rgb.r, g: rgb.g, b: rgb.b },
      opacity: typeof raw.opacity === 'number' ? raw.opacity : rgb.a,
    } as SolidPaint;
  }

  if (
    typeof raw.color === 'object' &&
    raw.color !== null &&
    typeof (raw.color as Record<string, unknown>).r === 'number' &&
    typeof (raw.color as Record<string, unknown>).g === 'number' &&
    typeof (raw.color as Record<string, unknown>).b === 'number'
  ) {
    return {
      type: 'SOLID',
      color: {
        r: (raw.color as RGB).r,
        g: (raw.color as RGB).g,
        b: (raw.color as RGB).b,
      },
      opacity: typeof raw.opacity === 'number' ? raw.opacity : 1,
    } as SolidPaint;
  }

  throw new Error('Invalid SOLID paint color');
}

async function getNodeOrThrow(nodeId: string): Promise<BaseNode> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  return node;
}

function assertCanResize(node: BaseNode): asserts node is BaseNode & {
  resize: (width: number, height: number) => void;
  resizeWithoutConstraints: (width: number, height: number) => void;
  width: number;
  height: number;
} {
  if (!('resize' in node) || typeof node.resize !== 'function') {
    throw new Error(`Node type ${node.type} does not support resize`);
  }
}

function assertCanMove(node: BaseNode): asserts node is BaseNode & { x: number; y: number } {
  if (!('x' in node) || !('y' in node)) {
    throw new Error(`Node type ${node.type} does not support positioning`);
  }
}

function assertCanSetFills(node: BaseNode): asserts node is BaseNode & { fills: ReadonlyArray<Paint> } {
  if (!('fills' in node)) {
    throw new Error(`Node type ${node.type} does not support fills`);
  }
}

function assertCanSetStrokes(node: BaseNode): asserts node is BaseNode & {
  strokes: ReadonlyArray<Paint>;
  strokeWeight?: number;
} {
  if (!('strokes' in node)) {
    throw new Error(`Node type ${node.type} does not support strokes`);
  }
}

function assertCanSetOpacity(node: BaseNode): asserts node is BaseNode & { opacity: number } {
  if (!('opacity' in node)) {
    throw new Error(`Node type ${node.type} does not support opacity`);
  }
}

function assertCanSetCornerRadius(node: BaseNode): asserts node is BaseNode & { cornerRadius: number } {
  if (!('cornerRadius' in node)) {
    throw new Error(`Node type ${node.type} does not support corner radius`);
  }
}

function assertCanClone(node: BaseNode): asserts node is BaseNode & {
  clone: () => SceneNode;
} {
  if (!('clone' in node) || typeof node.clone !== 'function') {
    throw new Error(`Node type ${node.type} does not support cloning`);
  }
}

function assertCanAppendChild(node: BaseNode): asserts node is BaseNode & {
  appendChild: (child: SceneNode) => void;
} {
  if (!('appendChild' in node) || typeof node.appendChild !== 'function') {
    throw new Error(`Parent node type ${node.type} does not support children`);
  }
}

function assertCanExport(node: BaseNode): asserts node is BaseNode & ExportMixin {
  if (!('exportAsync' in node) || typeof node.exportAsync !== 'function') {
    throw new Error(`Node type ${node.type} does not support export`);
  }
}

function resolveTextFont(node: TextNode): FontName {
  if (node.fontName !== figma.mixed) {
    return node.fontName;
  }
  return { family: 'Inter', style: 'Regular' };
}

function buildNodeForCreate(nodeType: string): SceneNode {
  switch (nodeType) {
    case 'RECTANGLE':
      return figma.createRectangle();
    case 'ELLIPSE':
      return figma.createEllipse();
    case 'FRAME':
      return figma.createFrame();
    case 'TEXT':
      return figma.createText();
    case 'LINE':
      return figma.createLine();
    case 'POLYGON':
      return figma.createPolygon();
    case 'STAR':
      return figma.createStar();
    case 'VECTOR':
      return figma.createVector();
    default:
      throw new Error(`Unsupported node type: ${nodeType}`);
  }
}

function toSafeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function handleResizeNode(params: ResizeNodeParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    assertCanResize(node);

    if (params.withConstraints === false) {
      node.resizeWithoutConstraints(params.width, params.height);
    } else {
      node.resize(params.width, params.height);
    }

    return {
      success: true,
      node: { ...toNodeSummary(node), width: node.width, height: node.height },
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to resize node'));
  }
}

export async function handleMoveNode(params: MoveNodeParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    assertCanMove(node);
    node.x = params.x;
    node.y = params.y;

    return {
      success: true,
      node: { ...toNodeSummary(node), x: node.x, y: node.y },
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to move node'));
  }
}

export async function handleSetNodeFills(params: SetNodeFillsParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    assertCanSetFills(node);

    const fills = params.fills.map((fill) => toSolidPaint(fill));
    node.fills = fills;

    return {
      success: true,
      node: toNodeSummary(node),
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to set node fills'));
  }
}

export async function handleSetNodeStrokes(params: SetNodeStrokesParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    assertCanSetStrokes(node);

    const strokes = params.strokes.map((stroke) => toSolidPaint(stroke));
    node.strokes = strokes;
    if (typeof params.strokeWeight === 'number' && 'strokeWeight' in node) {
      node.strokeWeight = params.strokeWeight;
    }

    return {
      success: true,
      node: toNodeSummary(node),
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to set node strokes'));
  }
}

export async function handleSetNodeOpacity(params: SetNodeOpacityParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    assertCanSetOpacity(node);

    node.opacity = Math.max(0, Math.min(1, params.opacity));

    return {
      success: true,
      node: { ...toNodeSummary(node), opacity: node.opacity },
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to set node opacity'));
  }
}

export async function handleSetNodeCornerRadius(params: SetNodeCornerRadiusParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    assertCanSetCornerRadius(node);

    node.cornerRadius = params.radius;

    return {
      success: true,
      node: { ...toNodeSummary(node), cornerRadius: node.cornerRadius },
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      toSafeErrorMessage(error, 'Failed to set node corner radius')
    );
  }
}

export async function handleCloneNode(params: CloneNodeParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    assertCanClone(node);

    const cloned = node.clone();

    return {
      success: true,
      node: {
        id: cloned.id,
        name: cloned.name,
        x: 'x' in cloned ? cloned.x : undefined,
        y: 'y' in cloned ? cloned.y : undefined,
      },
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to clone node'));
  }
}

export async function handleDeleteNode(params: DeleteNodeParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    const deleted = toNodeSummary(node);
    node.remove();

    return {
      success: true,
      deleted,
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to delete node'));
  }
}

export async function handleRenameNode(params: RenameNodeParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    const oldName = node.name;
    node.name = params.newName;

    return {
      success: true,
      node: { ...toNodeSummary(node), oldName },
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to rename node'));
  }
}

export async function handleSetTextContent(params: SetTextContentParams): Promise<unknown> {
  try {
    const node = await getNodeOrThrow(params.nodeId);
    if (node.type !== 'TEXT') {
      throw new Error(`Node must be a TEXT node. Got: ${node.type}`);
    }

    const baseFont = resolveTextFont(node);
    await figma.loadFontAsync(baseFont);

    if (typeof params.fontFamily === 'string' && params.fontFamily.trim().length > 0) {
      const customFont: FontName = { family: params.fontFamily, style: 'Regular' };
      await figma.loadFontAsync(customFont);
      node.fontName = customFont;
    } else {
      node.fontName = baseFont;
    }

    node.characters = params.text;
    if (typeof params.fontSize === 'number') {
      node.fontSize = params.fontSize;
    }

    return {
      success: true,
      node: { id: node.id, name: node.name, characters: node.characters },
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to set text content'));
  }
}

export async function handleCreateChildNode(params: CreateChildNodeParams): Promise<unknown> {
  try {
    const parent = await getNodeOrThrow(params.parentId);
    assertCanAppendChild(parent);

    const newNode = buildNodeForCreate(params.nodeType);
    const properties = params.properties ?? {};

    if (typeof properties.name === 'string') {
      newNode.name = properties.name;
    }

    if ('x' in newNode && typeof properties.x === 'number') {
      newNode.x = properties.x;
    }

    if ('y' in newNode && typeof properties.y === 'number') {
      newNode.y = properties.y;
    }

    if (
      'resize' in newNode &&
      typeof properties.width === 'number' &&
      typeof properties.height === 'number'
    ) {
      newNode.resize(properties.width, properties.height);
    }

    if (newNode.type === 'TEXT' && typeof properties.text === 'string') {
      const defaultFont: FontName = { family: 'Inter', style: 'Regular' };
      await figma.loadFontAsync(defaultFont);
      newNode.fontName = defaultFont;
      newNode.characters = properties.text;
    }

    if ('fills' in newNode && Array.isArray(properties.fills)) {
      const fills = properties.fills.map((fill) => toSolidPaint(fill));
      newNode.fills = fills;
    }

    parent.appendChild(newNode);

    const summary: Record<string, unknown> = {
      id: newNode.id,
      name: newNode.name,
      type: newNode.type,
    };

    if ('x' in newNode) summary.x = newNode.x;
    if ('y' in newNode) summary.y = newNode.y;
    if ('width' in newNode) summary.width = newNode.width;
    if ('height' in newNode) summary.height = newNode.height;

    return {
      success: true,
      node: summary,
    };
  } catch (error) {
    throw createBridgeError(ERROR_CODES.FIGMA_API_ERROR, toSafeErrorMessage(error, 'Failed to create child node'));
  }
}

export async function handleCaptureScreenshot(params: CaptureScreenshotParams): Promise<unknown> {
  try {
    const targetNode = params.nodeId ? await getNodeOrThrow(params.nodeId) : figma.currentPage;
    assertCanExport(targetNode);

    const format = (params.format ?? 'PNG') as CaptureScreenshotParams['format'];
    const scale = typeof params.scale === 'number' ? params.scale : 2;

    let bytes: Uint8Array;
    if (format === 'PDF') {
      bytes = await targetNode.exportAsync({ format: 'PDF' });
    } else if (format === 'SVG') {
      bytes = await targetNode.exportAsync({ format: 'SVG' });
    } else {
      const imageFormat: 'PNG' | 'JPG' = format === 'JPG' ? 'JPG' : 'PNG';
      bytes = await targetNode.exportAsync({
        format: imageFormat,
        constraint: { type: 'SCALE', value: scale },
      });
    }

    const base64 = figma.base64Encode(bytes);

    return {
      success: true,
      image: {
        base64,
        format,
        scale,
        byteLength: bytes.length,
        node: {
          id: targetNode.id,
          name: targetNode.name,
          type: targetNode.type,
        },
        bounds:
          'absoluteBoundingBox' in targetNode
            ? targetNode.absoluteBoundingBox
            : null,
      },
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      toSafeErrorMessage(error, 'Failed to capture screenshot')
    );
  }
}

/**
 * Helper: Build NodeSummary from a node
 */
function buildNodeSummary(node: BaseNode, parentId: string | null): NodeSummary {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    parentId,
    childCount: 'children' in node ? node.children.length : 0,
    x: 'x' in node ? (node.x as number) : undefined,
    y: 'y' in node ? (node.y as number) : undefined,
    width: 'width' in node ? (node.width as number) : undefined,
    height: 'height' in node ? (node.height as number) : undefined,
  };
}

/**
 * Helper: Build NodeData from a node
 */
function buildNodeData(node: BaseNode, parentId: string | null, depth: 'minimal' | 'compact' | 'full'): NodeData {
  const base: NodeSummary = {
    id: node.id,
    name: node.name,
    type: node.type,
    parentId,
    childCount: 'children' in node ? node.children.length : 0,
  };

  if (depth === 'minimal') {
    return base;
  }

  const compact: NodeData = {
    ...base,
    x: 'x' in node ? (node.x as number) : undefined,
    y: 'y' in node ? (node.y as number) : undefined,
    width: 'width' in node ? (node.width as number) : undefined,
    height: 'height' in node ? (node.height as number) : undefined,
  };

  if (depth === 'compact') {
    return compact;
  }

  // Full depth
  return {
    ...compact,
    fills: 'fills' in node ? (node.fills as unknown[]) : undefined,
    strokes: 'strokes' in node ? (node.strokes as unknown[]) : undefined,
    opacity: 'opacity' in node ? (node.opacity as number) : undefined,
    cornerRadius: 'cornerRadius' in node ? node.cornerRadius : undefined,
    visible: 'visible' in node ? node.visible : undefined,
    locked: 'locked' in node ? node.locked : undefined,
    effects: 'effects' in node ? (node.effects as unknown[]) : undefined,
    styles: 'styles' in node && node.styles ? (node.styles as Record<string, string>) : undefined,
  };
}

/**
 * GET_CHILDREN - Get immediate children of a node.
 * 
 * Supports pagination via limit/offset to prevent blocking the main thread
 * when nodes have thousands of children.
 * 
 * Defaults:
 * - limit: 500 (max 2000)
 * - offset: 0
 * - compact: true
 */
export async function handleGetChildren(params: GetChildrenParams): Promise<unknown> {
  try {
    console.log('[Bridge] Getting children of:', params.parentId);

    const node = await figma.getNodeByIdAsync(params.parentId);
    if (!node) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.parentId}`);
    }

    if (!('children' in node)) {
      return {
        success: true,
        parentId: params.parentId,
        children: [],
        total: 0,
        limit: params.limit ?? 500,
        offset: 0,
        hasMore: false,
      } as GetChildrenResult;
    }

    const totalChildren = node.children.length;

    // Respect compact parameter (default: true)
    const compact = params.compact ?? true;

    // Apply limit/offset for pagination (default: 500, max: 2000)
    // Validate offset >= 0 to prevent slice() returning elements from end of array
    const rawLimit = params.limit ?? 500;
    const limit = rawLimit > 2000 ? 2000 : rawLimit < 0 ? totalChildren : rawLimit;
    const rawOffset = params.offset ?? 0;
    const offset = rawOffset < 0 ? 0 : rawOffset; // Clamp negative offsets to 0

    // Slice the children array to get the requested page
    const pageChildren = node.children.slice(offset, offset + limit);

    // Process in batches to avoid blocking main thread for large pages
    const CHILD_BATCH_SIZE = 100;
    const children: Array<NodeSummary | NodeData> = [];

    for (let i = 0; i < pageChildren.length; i += CHILD_BATCH_SIZE) {
      const batch = pageChildren.slice(i, i + CHILD_BATCH_SIZE);
      for (const child of batch) {
        if (compact) {
          children.push(buildNodeSummary(child, node.id));
        } else {
          children.push(buildNodeData(child, node.id, 'full'));
        }
      }
      // Yield to event loop between batches to avoid blocking UI
      if (i + CHILD_BATCH_SIZE < pageChildren.length) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    return {
      success: true,
      parentId: params.parentId,
      children,
      total: totalChildren,
      limit,
      offset,
      hasMore: offset + limit < totalChildren,
    } as GetChildrenResult;
  } catch (error) {
    // Preserve BridgeError codes, only wrap unknown errors
    if (isBridgeError(error)) {
      throw error;
    }
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to get children'
    );
  }
}

// ─── Search nodes ───────────────────────────────────────────────────────

/**
 * SEARCH_NODES - Search nodes by name/type within a scope
 */
export async function handleSearchNodes(params: SearchNodesParams): Promise<unknown> {
  try {
    console.log('[Bridge] Searching nodes with filters:', params);

    const root = await figma.getNodeByIdAsync(params.parentId);
    if (!root) {
      throw createBridgeError(ERROR_CODES.NODE_NOT_FOUND, `Node not found: ${params.parentId}`);
    }

    // Build filters
    const nameContains = params.nameContains?.toLowerCase();
    let nameRegex: RegExp | null = null;
    if (params.namePattern) {
      try {
        nameRegex = new RegExp(params.namePattern, 'i');
      } catch {
        throw createBridgeError(
          ERROR_CODES.INVALID_PARAMETER,
          `Invalid namePattern regex: ${params.namePattern}`
        );
      }
    }

    const types = params.types?.length ? new Set(params.types) : null;
    // Default to 5 levels for safety; callers can pass maxDepth=-1 for unlimited.
    const maxDepth = params.maxDepth ?? 5;
    // Apply limit (default: 50, max: 200, min: 0)
    const rawLimit = params.limit ?? 50;
    const limit = rawLimit < 0 ? 0 : Math.min(rawLimit, 200);

    // DFS iterative with stack
    const stack: Array<{ node: BaseNode; depth: number }> = [{ node: root, depth: 0 }];
    const results: NodeSummary[] = [];

    while (stack.length > 0 && results.length < limit) {
      const { node, depth } = stack.pop()!;

      // Check filters (skip root)
      if (depth > 0) {
        const matchesType = !types || types.has(node.type);
        // Diacritic-insensitive nameContains filter
        let matchesNameContains = true;
        if (nameContains) {
          const normalizedName = stripDiacritics(node.name.toLowerCase());
          const normalizedQuery = stripDiacritics(nameContains.toLowerCase());
          matchesNameContains = normalizedName.includes(normalizedQuery);
        }
        const matchesNamePattern = !nameRegex || nameRegex.test(node.name);

        if (matchesType && matchesNameContains && matchesNamePattern) {
          results.push(buildNodeSummary(node, node.parent?.id ?? null));
        }
      }

      // Add children to stack
      if ('children' in node && (maxDepth === -1 || depth < maxDepth)) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push({ node: node.children[i], depth: depth + 1 });
        }
      }
    }

    return {
      success: true,
      nodes: results,
      count: results.length,
    } as SearchNodesResult;
  } catch (error) {
    // Preserve BridgeError codes, only wrap unknown errors
    if (isBridgeError(error)) {
      throw error;
    }
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to search nodes'
    );
  }
}

/**
 * GET_NODES_BY_ID - Get detailed node data by IDs
 */
export async function handleGetNodesById(params: GetNodesByIdParams): Promise<unknown> {
  try {
    console.log('[Bridge] Getting nodes by IDs:', params.nodeIds);

    // Guard: max 50 nodeIds
    if (params.nodeIds.length > 50) {
      throw createBridgeError(ERROR_CODES.INVALID_PARAMETER, 'Max 50 nodeIds allowed');
    }

    const depth = params.depth ?? 'full';
    const results: Record<string, NodeData | null> = {};

    const nodes = await Promise.all(params.nodeIds.map((id) => figma.getNodeByIdAsync(id)));

    for (let i = 0; i < nodes.length; i++) {
      const nodeId = params.nodeIds[i];
      const node = nodes[i];

      if (!node) {
        results[nodeId] = null;
      } else {
        results[nodeId] = buildNodeData(node, node.parent?.id ?? null, depth);
      }
    }

    return {
      success: true,
      nodes: results,
      requestedIds: params.nodeIds,
    } as GetNodesByIdResult;
  } catch (error) {
    // Preserve BridgeError codes, only wrap unknown errors
    if (isBridgeError(error)) {
      throw error;
    }
    throw createBridgeError(
      ERROR_CODES.FIGMA_API_ERROR,
      error instanceof Error ? error.message : 'Failed to get nodes by ID'
    );
  }
}
