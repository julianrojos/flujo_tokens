/**
 * Spec types for ds-spec-to-markdown
 *
 * Types for component specification data structures used in
 * the spec-to-markdown injection pipeline.
 */

/**
 * Anatomy item describing a component part.
 */
export interface SpecAnatomyItem {
  name: string;
  dimensions?: {
    width?: number;
    height?: number;
  };
  description?: string;
}

/**
 * Property definition for component API table.
 */
export interface SpecProperty {
  name: string;
  type: string;
  default?: string | number | boolean;
  required: boolean;
  description?: string;
  notes?: string;
}

/**
 * Layout item describing auto-layout configuration.
 */
export interface SpecLayoutItem {
  node: string;
  direction: string;
  alignment: string;
  hSizing: string;
  vSizing: string;
  itemSpacing?: number | string;
  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}

/**
 * Variant definition for variants matrix table.
 */
export interface SpecVariant {
  name: string;
  type: string;
  values?: string[];
  token?: string;
  fallback?: string;
  notes?: string;
}

/**
 * Input type for spec-to-markdown injection.
 */
export interface SpecToMarkdownInput {
  anatomy?: SpecAnatomyItem[];
  properties?: SpecProperty[];
  layout?: SpecLayoutItem[];
  variants?: SpecVariant[];
}
