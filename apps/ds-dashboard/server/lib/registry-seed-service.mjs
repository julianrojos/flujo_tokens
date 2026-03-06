export const COMPONENT_REGISTRY_SCHEMA_VERSION = 1;

export function createEmptyComponentRegistry() {
  return {
    schema_version: COMPONENT_REGISTRY_SCHEMA_VERSION,
    components: [],
    summary: {
      total_components: 0,
      with_spec: 0,
      with_doc: 0,
      with_render_payload: 0,
      with_visual_proof: 0,
      ready_for_publish: 0,
      by_pipeline_stage: {
        "missing-spec": 0,
        spec: 0,
        markdown: 0,
        render: 0,
        "visual-proof": 0,
      },
    },
    fingerprint_sha256: "",
  };
}

export function createEmptyTokenRegistry() {
  return {
    entries: [],
    byPath: {},
    bySlashPath: {},
  };
}

export function createEmptyTokenUsageIndex() {
  return {
    ok: true,
    summary: {
      tokens_total: 0,
      tokens_with_usage: 0,
      tokens_without_usage: 0,
      usage_links_total: 0,
      usage_links_by_kind: {},
      unresolved_total: 0,
    },
    warnings: [],
    unresolved: [],
    entries: [],
    byPath: {},
    bySlashPath: {},
    byCssVar: {},
  };
}
