/**
 * Figma API Type Definitions
 */

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  componentId?: string;
  componentSetId?: string;
  [key: string]: unknown;
}

export interface FigmaFileResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, {
    key: string;
    name: string;
    description: string;
    [key: string]: unknown;
  }>;
  componentSets: Record<string, {
    key: string;
    name: string;
    description: string;
    [key: string]: unknown;
  }>;
  schemaVersion: number;
}

export interface FigmaNodesResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: Record<string, {
    document: FigmaNode;
    components: Record<string, unknown>;
    schemaVersion: number;
  }>;
}

export interface FigmaVariablesResponse {
  status: number;
  error: boolean;
  meta: {
    variableCollections: Record<string, {
      id: string;
      name: string;
      modes: Array<{ modeId: string; name: string }>;
      defaultModeId: string;
      remote: boolean;
    }>;
    variables: Record<string, {
      id: string;
      name: string;
      variableCollectionId: string;
      resolvedType: string;
      valuesByMode: Record<string, unknown>;
      remote: boolean;
    }>;
  };
}

export interface FigmaApiOptions {
  token: string;
  timeoutMs?: number;
}

export interface FetchFigmaFileOptions extends FigmaApiOptions {
  fileKey: string;
  depth?: number;
  branchData?: boolean;
  geometry?: string;
}

export interface FetchFigmaNodesOptions extends FigmaApiOptions {
  fileKey: string;
  nodeIds: string[];
  depth?: number;
  geometry?: string;
}

export interface FetchFigmaVariablesOptions extends FigmaApiOptions {
  fileKey: string;
}

export interface FetchFigmaImagesOptions extends FigmaApiOptions {
  fileKey: string;
  nodeIds: string[];
  format?: 'png' | 'jpg' | 'svg' | 'pdf';
  scale?: number;
}
