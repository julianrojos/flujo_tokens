export interface ComponentsHealthFilter<TItem> {
  items: TItem[];
  total: number;
  truncated: boolean;
}

export interface ComponentsHealthSummary {
  total_components: number;
  with_spec: number;
  without_spec: number;
  average_coverage_percent: number;
}

export interface ComponentsHealthRow {
  slug: string;
  display_name: string;
  coverage: number;
  with_spec: boolean;
  paths: {
    spec?: string;
  };
}

export interface ComponentsHealthReport {
  schema_version: number;
  source: {
    registry_path: string;
  };
  summary: ComponentsHealthSummary;
  filters: {
    without_spec: ComponentsHealthFilter<string>;
  };
  components: ComponentsHealthRow[];
  fingerprint_sha256: string;
}
