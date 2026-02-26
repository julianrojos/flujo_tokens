/**
 * Figma type definitions
 *
 * Shared types for Figma API interactions across tooling.
 */

/**
 * Parsed Figma URL descriptor.
 */
export interface FigmaFileDescriptor {
  /** Original source URL. */
  sourceUrl: string;
  /** Figma file key. */
  fileKey: string;
  /** File slug/name from URL. */
  fileSlug: string;
  /** Surface type (design, file). */
  surface: string;
  /** Node ID from URL (if provided). */
  nodeIdFromUrl: string | null;
}

/**
 * Figma component item in component map.
 */
export interface FigmaComponentItem {
  /** Component ID. */
  id: string;
  /** Component display name. */
  name: string;
  /** Node ID (format: 123:456). */
  nodeId: string;
  /** Component type from Figma REST API (COMPONENT_SET, COMPONENT, etc.). */
  type: 'component' | 'component_set' | 'unknown';
  /** Component description. */
  description?: string;
  /** Documentation links. */
  documentationLinks?: string[];
  /** Page name where component is located. */
  page_name?: string | null;
  /** Pipeline-normalized component kind shorthand (derived from type). */
  kind?: string;
}

/**
 * Figma page item in component map.
 */
export interface FigmaPageItem {
  /** Page ID. */
  id: string;
  /** Page display name. */
  name: string;
  /** Page node ID. */
  nodeId: string;
  /** Page type. */
  type: 'page';
  /** Child components. */
  children?: FigmaComponentItem[];
}

/**
 * Figma component map structure.
 */
export interface FigmaComponentMap {
  /** File key. */
  fileKey: string;
  /** File name. */
  fileName: string;
  /** File slug. */
  fileSlug: string;
  /** Surface type. */
  surface: string;
  /** Root node ID. */
  rootNodeId: string;
  /** List of components. */
  components: FigmaComponentItem[];
  /** List of component sets. */
  componentSets: FigmaComponentItem[];
  /** List of pages. */
  pages: FigmaPageItem[];
}

/**
 * Figma node payload from REST API.
 */
export interface FigmaNodePayload {
  /** Nodes keyed by node ID. */
  nodes: Record<string, { document: Record<string, unknown> }>;
}

/**
 * Figma image export payload from REST API.
 */
export interface FigmaImagesPayload {
  /** Images keyed by node ID. */
  images: Record<string, string> | null;
}
