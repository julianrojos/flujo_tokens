export interface ComponentRegistryItem {
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
  fingerprint_sha256: string;
}

export interface ComponentRegistry {
  schema_version: number;
  components: ComponentRegistryItem[];
  summary: {
    total_components: number;
    with_spec: number;
  };
  fingerprint_sha256: string;
}
