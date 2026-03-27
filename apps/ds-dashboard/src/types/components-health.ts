export interface ComponentsHealthFilter<TItem> {
  items: TItem[];
  total: number;
  truncated: boolean;
}

export interface ComponentsHealthSummary {
  total_components: number;
  ready: number;
  needs_review: number;
  draft: number;
  missing: number;
  with_visual_proof: number;
  average_coverage_percent: number;
  by_pipeline_stage: Record<string, number>;
}

export interface ComponentsHealthRow {
  slug: string;
  display_name: string;
  pipeline_stage: string;
  status: string;
  coverage: number;
  ready_for_publish: boolean;
  spec_exists: boolean;
  doc_exists: boolean;
  visual_proof_exists: boolean;
  doc_status: string;
  spec_status: string;
  paths: {
    spec?: string;
    doc?: string;
    visual_proof?: string;
  };
}

export interface ComponentsHealthReport {
  schema_version: number;
  source: {
    registry_path: string;
  };
  summary: ComponentsHealthSummary;
  filters: {
    needs_review: ComponentsHealthFilter<string>;
    missing_visual_proof: ComponentsHealthFilter<string>;
    blocked_in_pipeline: ComponentsHealthFilter<{ component: string; stage: string }>;
  };
  components: ComponentsHealthRow[];
  fingerprint_sha256: string;
}
