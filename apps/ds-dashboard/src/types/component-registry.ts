export type PipelineStage =
  | "missing-spec"
  | "spec"
  | "markdown"
  | "render"
  | "visual-proof";

export interface ComponentRegistryItem {
  slug: string;
  display_name: string;
  paths: {
    spec: string;
    doc: string;
    render_payload: string | null;
    visual_proof: string | null;
  };
  spec: {
    exists: boolean;
    status: "draft" | "ready" | string;
  };
  doc: {
    exists: boolean;
    status: "draft" | "ready" | "needs-review" | string;
  };
  figma: {
    file_url: string | null;
    component_set_node_id: string | null;
  };
  render: {
    exists: boolean;
  };
  visual_proof: {
    exists: boolean;
    screenshot_url: string | null;
    image_path?: string | null;
    captured_at?: string | null;
    node_id?: string | null;
    image_sha256?: string | null;
    image_bytes?: number | null;
    image_content_type?: string | null;
    image_width?: number | null;
    image_height?: number | null;
  };
  pipeline_stage: PipelineStage;
  ready_for_publish: boolean;
  fingerprint_sha256: string;
}

export interface ComponentRegistry {
  schema_version: number;
  components: ComponentRegistryItem[];
  summary: {
    total_components: number;
    with_spec: number;
    with_doc: number;
    with_render_payload: number;
    with_visual_proof: number;
    ready_for_publish: number;
    by_pipeline_stage: Record<PipelineStage, number>;
  };
  fingerprint_sha256: string;
}
