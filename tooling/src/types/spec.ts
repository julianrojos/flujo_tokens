/**
 * Spec types for ds-spec-to-markdown
 *
 * Types for component specification data structures used in
 * the spec-to-markdown injection pipeline.
 */

/**
 * Extracted component spec from Figma node tree.
 */
export interface ExtractedComponentSpec {
  anatomy: SpecAnatomyItem[];
  properties: SpecProperty[];
  layoutTree: LayoutTreeNode;
  layout: SpecLayoutItem[];
  variants: SpecVariant[];
  variantProperties: string[];
  name?: string;
}

/**
 * Layout info extracted from a Figma auto-layout node.
 */
export interface LayoutInfo {
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
}

/**
 * Recursive auto-layout tree extracted from Figma.
 */
export interface LayoutTreeNode {
  name: string;
  type: string;
  width?: number;
  height?: number;
  layout?: LayoutInfo;
  children?: LayoutTreeNode[];
}

/**
 * Anatomy item describing a component part.
 */
export interface SpecAnatomyItem {
  id: string;
  name: string;
  type?: string;
  dimensions?: {
    width?: number;
    height?: number;
  };
  width?: number;
  height?: number;
  fill?: string;
  fill_alias_chain?: string[];
  fill_resolved?: string;
  stroke?: string;
  cornerRadius?: number;
  effects?: string[];
  textStyle?: string;
  children?: SpecAnatomyItem[];
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
  variant?: boolean;
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
