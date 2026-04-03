export interface SpecProperty {
    name: string;
    type: string;
    values?: string[];
    default: string | boolean | null;
    required: boolean;
    description: string;
    narrative_notes?: string;
}

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
    fingerprints: Record<string, any>;
}

export interface ComponentSpec {
    name: string;
    status: "draft" | "ready" | string;
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
    anatomy: SpecAnatomyItem[];
    properties: SpecProperty[];
    content_guidelines: { rules: string[] };
    best_practices: { do: string[]; dont: string[] };
    accessibility: {
        role: string;
        focus?: { tokens?: { inner?: string; outer?: string } };
        hit_area?: { desktop_token?: string; mobile_token?: string };
        labeling?: { rules?: string[] };
        notes?: string[];
    };
    token_mapping: Record<string, Record<string, string>>;
    qa: string[];
    related_components?: string[];
    layout?: SpecLayoutItem[];
    variant_visuals?: SpecVariantVisual[];
}

/**
 * UI/runtime-friendly shape for partially captured specs (e.g. raw Figma extraction).
 * Use this type in ingestion and read-only surfaces that must tolerate missing fields.
 * Keep `ComponentSpec` strict for validated/editorial contracts.
 */
export type PartialComponentSpec = Partial<ComponentSpec>;
