---
name: ds-migrate-legacy-component
description: Migrate legacy component documentation into the canonical spec + markdown pipeline with deterministic validation gates.
version: "1.1.1"
context:
  doc_type: component
  stage: markdown
compatible_agents:
  - codex
  - claude
  - gemini
inputs:
  - name: component_name
    type: component_name
    required: true
    description: "Display name of the component to migrate (e.g. 'Button'). Used to resolve spec and markdown target paths."
  - name: legacy_markdown_path
    type: path
    required: true
    description: "Path to the existing (non-canonical) markdown file to be migrated."
  - name: docs_root
    type: path
    required: false
    default: "docs/"
    description: "Root documentation directory."
  - name: spec_root
    type: path
    required: false
    default: "${docs_root}/_spec/components"
    description: "Directory where the canonical spec YAML will be created or updated."
  - name: registry
    type: path
    required: false
    default: "${docs_root}/_generated/token-registry.json"
    description: "Token registry path used to validate and replace hardcoded token values."
  - name: force
    type: boolean
    required: false
    default: false
    description: "When true, overwrites existing spec/markdown files even if they already exist."
outputs:
  - name: spec_file
    type: path
    value: "${spec_root}/${component_name_snake_case}.yml"
    description: "Created or repaired canonical spec YAML."
  - name: markdown_file
    type: path
    value: "${docs_root}/components/${component_name_snake_case}.md"
    description: "Regenerated canonical markdown documentation page."
  - name: report
    type: report
    description: "Migration report with auto-migrated fields, TBD fields, replaced hardcoded values, remaining validation errors, and next actions."
---

# ds-migrate-legacy-component

## When to use

- Existing markdown docs without matching spec YAML
- Component docs with non-canonical structure/order
- Docs with hardcoded values that should be token references
- Components that fail `validate:docs` due to structure/traceability drift

## Scope

This skill targets documentation assets only:
- `docs/_spec/components/*.yml`
- `docs/components/*.md`
- `docs/components/overview.md`

It does not generate implementation code for UI components.

## Required rules

Migration output must comply with:
- `component-name-normalization.mdc`
- `component-spec-yaml.mdc`
- `component-doc.mdc`
- `component-figma-traceability.mdc`
- `token-references.mdc`
- `token-registry-validation.mdc`
- `markdown-lifecycle-status.mdc`
- `docs-pipeline-contract.mdc`

## Migration workflow

1. **Analyze current inputs**
- Inspect the legacy markdown and infer component display name + slug.
- Detect whether spec YAML exists.
- Extract any existing Figma source traceability from frontmatter/prose.
- Identify hardcoded visual values and token candidates.

2. **Create or repair spec YAML**
- Target path: `docs/_spec/components/<snake_case>.yml`.
- Fill required schema fields from existing docs.
- Use `TBD` only where data is genuinely unknown.
- Prefer deterministic Figma linkage:
  - set `figma.component_set_node_id` when available.

3. **Regenerate canonical markdown**
- Generate/update markdown from spec using the standard pipeline.
- Keep canonical H2 order and frontmatter contract.
- Ensure `## Gaps / TBD` is deterministic from spec+registry.

4. **Token normalization**
- Replace hardcoded values with canonical token references when inferable.
- Keep fallback values in prose/tables as required by rules.
- Reject unresolved `VariableID:*` tokens.

5. **Validate and synchronize**
- Run docs validation gate.
- Fix blocking errors.
- Ensure `docs/components/overview.md` includes canonical entry.

## Recommended commands

```bash
# 1) Ensure registry is fresh
npm run generate:registry

# 2) Generate/repair markdown from spec
npm run ds:component-doc -- --component-name "<DisplayName>" --force true

# 3) Validate migrated output
npm run validate:docs -- --file "docs/components/<snake_case>.md" --no-overview true

# 4) Full audit (optional, recommended before ready)
npm run ds:audit-consistency -- --component-name "<DisplayName>"
```

## Output report

Return a migration report with:
- `component`
- `spec_path`
- `markdown_path`
- `auto_migrated_fields`
- `tbd_fields`
- `hardcoded_values_replaced`
- `validation_errors_remaining`
- `next_actions`
