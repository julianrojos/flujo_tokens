export interface ComponentCatalogItem {
  slug: string;
  display_name: string;
  paths: {
    spec: string;
  };
  spec: {
    exists: boolean;
  };
  figma: {
    file_url: string | null;
    component_set_node_id: string | null;
    page_name?: string | null;
    variants?: Array<{
      name: string;
      properties: Record<string, string>;
      node_id?: string;
    }>;
    token_bindings?: Array<{
      node_id: string;
      node_name: string;
      field: string;
      variable_id: string;
      token_path?: string;
      mode?: string;
    }>;
    layout?: Array<{
      node_id: string;
      node_name: string;
      depth: number;
      direction?: "Horizontal" | "Vertical" | "—";
      h_sizing?: string;
      v_sizing?: string;
      alignment_h?: string;
      alignment_v?: string;
      item_spacing?: number;
      padding?: { top: number; right: number; bottom: number; left: number };
    }>;
  };
  visual_proof?: {
    screenshot_url: string | null;
    image_path?: string | null;
    captured_at?: string | null;
    node_id?: string | null;
    image_sha256?: string | null;
    image_bytes?: number | null;
    image_content_type?: string | null;
    image_width?: number | null;
    image_height?: number | null;
    variants_count?: number | null;
    variants?: Array<{
      name: string;
      node_id?: string | null;
      screenshot_url?: string | null;
      image_path?: string | null;
      captured_at?: string | null;
      image_sha256?: string | null;
      image_bytes?: number | null;
      image_content_type?: string | null;
      image_width?: number | null;
      image_height?: number | null;
    }>;
  };
  fingerprint_sha256: string;
}

export interface ComponentCatalog {
  schema_version: number;
  components: ComponentCatalogItem[];
  summary: {
    total_components: number;
    with_spec: number;
    with_editorial: number;
  };
  fingerprint_sha256: string;
}
