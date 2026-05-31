export const COMPONENT_CATALOG_SCHEMA_VERSION = 2;

export function createEmptyComponentCatalog() {
  return {
    schema_version: COMPONENT_CATALOG_SCHEMA_VERSION,
    components: [],
    summary: {
      total_components: 0,
      with_spec: 0,
      with_editorial: 0,
    },
    fingerprint_sha256: "",
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
