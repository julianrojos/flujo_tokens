# Component Detail: Data Ownership (DB-first Architecture)

## Overview

The component detail feature now follows a **DB-first architecture** for structural Figma data. This document defines the ownership boundaries between database (structural) and YAML (editorial) data sources.

## Data Ownership Matrix

| Data Category  | Source          | Rationale                                                         | Fields                                                                                         |
| -------------- | --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Structural** | Database (DB)   | Mechanical data from Figma plugin; should not diverge from import | `layout`, `variant_visuals`, `figma_metadata`, `figma_token_bindings`                          |
| **Editorial**  | YAML filesystem | Human-curated content; designers edit this directly               | `summary`, `best_practices`, `accessibility_notes`, `content_guidelines`, `related_components` |

## Structured Figma Data (DB)

### Schema

Stored as normalized DB fields/tables (Migration 020):

- `components.figma_page_name TEXT` — Figma page containing the component
- `component_figma_variants` — one row per variant (`variant_name`, `node_id`, `properties_json`, ingestion metadata)
- `component_figma_token_bindings` — one row per raw binding (`node_id`, `field`, `variable_id`, optional `token_path`, ingestion metadata)
- `component_figma_layout_rows` — one row per layout node (`node_id`, `depth`, sizing/alignment/padding, ingestion metadata)

### Type Definition

```typescript
interface StructuredFigmaData {
  pageName?: string;
  variants?: Array<{
    name: string;
    properties: Record<string, string>;
    nodeId?: string;
  }>;
  tokenBindings?: Array<{
    nodeId: string;
    nodeName: string;
    field: string;
    variableId: string;
    tokenPath?: string;
    mode?: string;
  }>;
  layout?: Array<{
    nodeId: string;
    nodeName: string;
    depth: number;
    direction?: 'Horizontal' | 'Vertical' | '—';
    hSizing?: string;
    vSizing?: string;
    alignmentH?: string;
    alignmentV?: string;
    itemSpacing?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
  }>;
}
```

### When DB Data Is Authoritative

1. **Layout metadata** — Auto-layout properties from Figma (mode, spacing, padding, alignment, sizing)
2. **Variant definitions** — Mechanical variant structure (property names and values)
3. **Figma metadata** — Page name, component set node ID, file URL
4. **Raw token bindings** — Evidence of which Figma variables are bound (not curated mappings)

## Editorial Data (YAML)

### Location

`design-systems/{dsId}/docs/_spec/components/{slug}.yml`

### When YAML Is Authoritative

1. **Summary** — Human-written component description
2. **Best practices** — Usage guidelines and recommendations
3. **Accessibility notes** — ARIA patterns, keyboard navigation guidance
4. **Content guidelines** — Writing style, tone, voice
5. **Related components** — Curated list of related patterns

## Merge Logic

The `mergeSpecWithStructuredData()` function in `use-component-detail.ts` applies DB-first precedence:

```typescript
// Pseudocode
effectiveSpec = {
  ...yamlSpec, // Base from YAML
  layout: mapDbLayoutRowsToSpecLayout(db.figma.layout) ?? yamlSpec.layout, // DB wins
  variant_visuals: db.figma.variants ?? yamlSpec.variant_visuals, // DB wins
  figma_metadata: {
    // Always from DB
    page_name: db.figma.page_name,
    component_set_node_id: db.figma.component_set_node_id,
    file_url: db.figma.file_url,
  },
  figma_token_bindings: db.figma.tokenBindings, // DB evidence
  // YAML-only fields preserved
  summary: yamlSpec.summary,
  best_practices: yamlSpec.best_practices,
  // ...
};
```

## Import Flow

```
Figma Plugin (SEARCH_COMPONENTS + GET_COMPONENT_SPEC)
    ↓ pageName, layout, variants, tokenBindings
Sync Service (figma-db-sync-service.ts)
    ↓ enrichComponentEntriesWithStructuredData() (independent of YAML capture)
    ↓ extractStructuredFigmaData()
ComponentRepository.upsertFromRegistry()
    ↓ upsert components + child rows (variants/token_bindings/layout_rows)
/api/component-registry
    ↓ serialized figma object
Frontend: useComponentDetail hook
    ↓ mergeSpecWithStructuredData()
UI Components render effective spec (mergedSpec)
```

**Key change:** Structured data extraction (`enrichComponentEntriesWithStructuredData`) now runs **independently** of the `captureComponentSpecYaml` flag. This ensures DB persistence even when YAML file generation is disabled.

## Error Handling

### Missing DB Data

If structured data is not yet captured (legacy components), the merge function gracefully falls back to YAML-only data. No errors are thrown.

### Malformed JSON in DB

`component_figma_variants.properties_json` is parsed safely with contextual warnings. Invalid payloads degrade to `{}` for that row and do not crash requests.

## Testing

- **Unit tests**:
  - `component-repository.test.ts` — JSON parsing, roundtrip persistence, and structured-row replacement/preservation semantics
  - `merge-spec-structured-data.test.ts` — DB-first precedence rules and edge cases
- **Integration tests**:
  - `figma-db-sync-service.test.ts` — structured data capture, warning/reporting, and failure preservation behavior
  - `components.test.ts` (plugin) — pageName propagation and layout extraction
- **Frontend tests**: `test:frontend`

Test counts change over time; verify current coverage with the suite commands used in CI/local validation.

## Future Considerations

1. **Token path resolution quality** — `token_path` is resolved during sync from the in-memory variable map of the same run; future work can add diagnostics for unresolved variable IDs.

2. **Layout visualization** — The `layout` object could power auto-generated anatomy diagrams in the UI.

3. **Variant comparison** — Store historical variant definitions to track how component structure evolves over time.

4. **Validation** — Add schema validation for JSON columns to prevent malformed data at import time.

## Related Files

- Migration: `apps/ds-dashboard/server/db/migrations/020_component_structured_figma_fields.sql`
- Repository: `apps/ds-dashboard/server/db/component-repository.ts`
- Sync Service: `apps/ds-dashboard/server/services/figma-db-sync-service.ts`
- Plugin Protocol: `apps/figma-plugin/src/bridge/protocol.ts`
- Plugin Handler: `apps/figma-plugin/src/bridge/handlers/components.ts`
- Frontend Types: `apps/ds-dashboard/src/types/component-registry.ts`
- Merge Logic: `apps/ds-dashboard/src/features/components/component-detail/lib/merge-spec-structured-data.ts`
- Hook: `apps/ds-dashboard/src/features/components/component-detail/hooks/use-component-detail.ts`
