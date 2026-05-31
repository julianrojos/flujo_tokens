/**
 * Capture Targets Types
 *
 * Type definitions for capture target operations.
 */

/**
 * Spec exhibit for visual proof.
 */
export interface SpecExhibit {
  nodeId: string | null;
  imageUrl: string | null;
}

/**
 * Spec exhibits collection.
 */
export interface SpecExhibits {
  specsNodeId: string | null;
  anatomy: SpecExhibit | null;
  properties: SpecExhibit | null;
  layout: SpecExhibit | null;
}

/**
 * Capture target representing a component and its associated docs metadata.
 */
export interface CaptureTarget {
  slug: string;
  kind: string;
  nodeId: string;
  name: string;
  specExists: boolean;
  nodeUrl: string;
  pageName: string | null;
  specExhibits: SpecExhibits | null;
}

/**
 * Kind of capture target.
 */
export type CaptureTargetKind = string;
