export interface SpecProperty {
    name: string;
    type: string;
    values?: string[];
    default: string | boolean | null;
    required: boolean;
    description: string;
    narrative_notes?: string;
}

/** @deprecated Anatomy is no longer captured. Do not use. */
export interface SpecAnatomyItem {
    id: string;
    description?: string;
    name?: string;
    type?: string;
    index?: number;
    dimensions?: { width?: number; height?: number; borderRadius?: number; borderWeight?: number; aspectRatio?: string };
    fill?: string;
    stroke?: string;
    textStyle?: string;
    textColor?: string;
    textAlign?: string;
    instanceOf?: string;
    effects?: string[];
}

export interface SpecLayoutItem {
    node: string;
    direction: "Horizontal" | "Vertical" | "—";
    hSizing: string;
    vSizing: string;
    alignment: string;
    itemSpacing: string | number;
    padding?: { top: number; right: number; bottom: number; left: number };
}

export interface SpecVariantVisual {
    name: string;
    properties: Record<string, string>;
    /**
     * Opaque blob of structural properties (fills, strokes, effects) used strictly for visual regression detection
     */
    fingerprints: Record<string, unknown>;
}

/**
 * Layer Token Mapping entry: which Figma variable (token) is bound to
 * which layer and property, per variant. (Migration 027)
 */
export interface SpecLayerTokenMappingEntry {
    variant_node_id: string;
    variant_signature: string;
    layer_node_id: string;
    layer_name: string;
    property_path: string;
    variable_id: string;
    token_path: string | null;
    status: 'resolved' | 'unresolved';
    mode_id: string;
    mode_name: string;
}

export interface ComponentSpec {
    name: string;
    /** Known values are "draft" and "ready", but other persisted statuses may exist. */
    status: string;
    figma: {
        file: string;
        page: string;
        component_set: string;
        component_set_node_id?: string;
    };
    summary: {
        purpose: string;
        when_to_use: string;
        when_not_to_use: string;
    };
    /** @deprecated Anatomy is no longer captured. Do not use. */
    anatomy?: SpecAnatomyItem[];
    properties: SpecProperty[];
    behaviour?: string;
    content_guidelines: { rules: string[] };
    accessibility: {
        role: string;
        focus?: { tokens?: { inner?: string; outer?: string } };
        hit_area?: { desktop_token?: string; mobile_token?: string };
        labeling?: { rules?: string[] };
        notes?: string[];
    };
    qa: string[];
    variants?: unknown[] | null;
    tokens?: unknown[] | null;
    layout?: SpecLayoutItem[];
    variant_visuals?: SpecVariantVisual[];
    layer_token_mapping?: SpecLayerTokenMappingEntry[];
}

/**
 * UI/runtime-friendly shape for partially captured specs (e.g. raw Figma extraction).
 * Use this type in ingestion and read-only surfaces that must tolerate missing fields.
 * Keep `ComponentSpec` as the canonical editorial contract, while allowing
 * `PartialComponentSpec` to tolerate incomplete captures.
 */
export type PartialComponentSpec = Partial<ComponentSpec>;
