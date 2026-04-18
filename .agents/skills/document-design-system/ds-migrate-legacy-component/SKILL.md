---
name: ds-migrate-legacy-component
description: Migrate legacy component documentation into the canonical spec + markdown pipeline with deterministic validation gates.
version: "1.1.2"
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
    description: "Directory where the canonical component spec will be created or updated."
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
derived:
  - name: component_name_snake_case
    from: component_name
    transform: snake_case
    description: "Snake-case slug used to resolve canonical spec and markdown output paths."
outputs:
  - name: spec_file
    type: path
    value: "${spec_root}/${component_name_snake_case}.yml"
    description: "Created or repaired canonical component spec."
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

- Existing markdown docs without matching component spec
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
- component-spec rules
- `component-doc.mdc`
- `component-figma-traceability.mdc`
- `token-references.mdc`
- `token-registry-validation.mdc`
- `markdown-lifecycle-status.mdc`
- `docs-pipeline-contract.mdc`

## Migration workflow

1. **Analyze current inputs**
- Inspect the legacy markdown and infer component display name + slug.
- Detect whether the component spec exists.
- Extract any existing Figma source traceability from frontmatter/prose.
- Identify hardcoded visual values and token candidates.
- Pre-flight overwrite guard:
  - If target spec/markdown already exist and `force` is `false`, report file conflicts and stop without writing.
  - If `force` is `true`, continue and explicitly note overwrite intent in the output report.

2. **Create or repair the component spec**
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
- Handle unresolved `VariableID:*` tokens deterministically:
  - Leave original unresolved value unchanged (do not invent substitutions).
  - Add a warning entry to `validation_errors_remaining` in the output report.
  - Continue migration unless another blocking validation error requires failure.

5. **Validate and synchronize**
- Run docs validation gate.
- Fix blocking errors.
- Ensure `docs/components/overview.md` includes canonical entry.
- If `validate:docs` is unavailable in the workspace, record it under `next_actions` and continue with the best-effort report.

## Recommended commands

```bash
# 1) Ensure registry is fresh
npm run generate:registry

# 2) Update the component docs entry in the dashboard

# 3) Validate migrated output (if script exists)
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
