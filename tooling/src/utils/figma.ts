/**
 * Figma API Types
 *
 * Standard TypeScript interfaces for Figma REST API responses.
 * These types provide a single source of truth for all Figma-related services.
 */

// ============================================================================
// Basic Types
// ============================================================================

/**
 * RGB color with optional alpha.
 */
export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * Rectangle bounding box.
 */
export interface FigmaRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Figma node interface - base type for all Figma nodes.
 */
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  fills?: unknown[];
  strokes?: unknown[];
  effects?: unknown[];
  style?: Record<string, unknown>;
  absoluteBoundingBox?: FigmaRectangle;
  size?: { width: number; height: number };
  cornerRadius?: number;
  strokeWeight?: number;
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  layoutGrow?: number;
  layoutAlign?: string;
  componentId?: string;
  componentPropertyDefinitions?: Record<string, unknown>;
  componentProperties?: Record<string, unknown>;
  variableCollectionId?: string;
  valuesByMode?: Record<string, unknown>;
  resolvedType?: string;
  [key: string]: unknown;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from GET /v1/files/:key endpoint.
 */
export interface FigmaFileResponse {
  document: FigmaNode;
  components: Record<string, unknown>;
  componentSets: Record<string, unknown>;
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  role: string;
  editorType: string;
  linkAccess: string;
}

/**
 * Response from GET /v1/files/:key/nodes endpoint.
 */
export interface FigmaNodesResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  role: string;
  editorType: string;
  linkAccess: string;
  nodes: Record<string, {
    document: FigmaNode;
    components: Record<string, unknown>;
    componentSets: Record<string, unknown>;
    schemaVersion: number;
  }>;
}

/**
 * Figma variable representation.
 */
export interface FigmaVariable {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: string;
  valuesByMode: Record<string, unknown>;
}

/**
 * Figma variable collection representation.
 */
export interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
}

/**
 * Response from GET /v1/files/:key/variables/local endpoint.
 */
export interface FigmaVariablesResponse {
  meta: {
    variableCollections: Record<string, FigmaVariableCollection>;
    variables: Record<string, FigmaVariable>;
  };
}

// ============================================================================
// API Options
// ============================================================================

/**
 * Options for Figma API requests.
 */
export interface FigmaApiOptions {
  token: string;
  timeoutMs?: number;
}

/**
 * Options for fetching Figma file.
 */
export interface FetchFigmaFileOptions extends FigmaApiOptions {
  fileKey: string;
  depth?: number;
  branchData?: boolean;
  geometry?: string;
}

/**
 * Options for fetching Figma nodes.
 */
export interface FetchFigmaNodesOptions extends FigmaApiOptions {
  fileKey: string;
  nodeIds: string[];
  depth?: number;
  geometry?: string;
}

/**
 * Options for fetching Figma local variables.
 */
export interface FetchFigmaVariablesOptions extends FigmaApiOptions {
  fileKey: string;
}

/**
 * Options for fetching Figma images.
 */
export interface FetchFigmaImagesOptions extends FigmaApiOptions {
  fileKey: string;
  nodeIds: string[];
  scale?: number;
  format?: 'png' | 'jpg' | 'svg' | 'pdf';
}

/**
 * Response from GET /v1/images/:key endpoint.
 */
export interface FigmaImagesResponse {
  images: Record<string, string>;
  err?: string;
  status?: string;
}
