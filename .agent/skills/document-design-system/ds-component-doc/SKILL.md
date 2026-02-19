---
name: ds-component-doc
description: Generate a single component documentation page (one-by-one) from a minimal Figma-first spec YAML plus token references, without code examples.
---

# ds-component-doc

## When to use

Use this skill when:

- A component exists in Figma (component set with properties/variants)
- You want a single Markdown page per component
- You have (or will create) a minimal spec YAML to avoid guessing

## Applicable rules

This skill must produce output that complies with:

- `ds-docs-guardrails.mdc` — global content integrity and no-invention policy
- `component-doc-structure.mdc` — mandatory frontmatter + section order and content
- `component-spec-yaml.mdc` — required fields and conventions for the input YAML
- `component-spec-properties-order.mdc` — deterministic ordering of `properties` entries in spec YAML
- `token-references.mdc` — token path formatting, fallback values, and naming patterns
- `accessibility-docs.mdc` — five required areas in the Accessibility section
- `component-figma-traceability.mdc` — Figma source metadata in component docs
- `markdown-lifecycle-status.mdc` — `doc_status` lifecycle for markdown pages
- `design-token-discrepancies.mdc` — optional discrepancy section with fixed table format
- `docs-language-tone.mdc` — language and tone consistency
- `component-name-normalization.mdc` — canonical `component_name` normalization and deterministic paths
- `overview-index-maintenance.mdc` — required synchronization of `docs/components/overview.md`
- `overview-components-canonical-list.mdc` — canonical component list format and strict ordering in overview
- `docs-pipeline-contract.mdc` — canonical stage order, preconditions, and validation gates

When in doubt, the rules are the source of truth.

## Inputs (ask only if missing)

- `docs_root` (default: `docs/`)
- `component_name` (required)
- `spec_file` (default: `${docs_root}/_spec/components/${component_name}.yml`)
- `token_files` (optional; if needed to resolve component tokens)

## Required behavior

- Read the component spec YAML (validated against `component-spec-yaml.mdc`)
- Read token JSON files if needed to resolve values
- Do NOT write code snippets
- Do NOT invent anatomy/variants/states/accessibility behavior
- Generate/update frontmatter traceability block (`pipeline.ds_component_doc.*`) for deterministic drift detection
- If spec lacks information:
  - Fill section with `TBD`
  - Add explicit items under `## Gaps / TBD`

## Spec expectations (YAML schema)

The spec YAML must follow the structure defined in `component-spec-yaml.mdc`. Required top-level fields:

- `name`, `status`, `figma`
- `summary` (purpose / when_to_use / when_not_to_use)
- `anatomy` (array of { id, description })
- `properties` (array of { name, type, values, default, required, description })
- `content_guidelines`, `best_practices` (do / dont)
- `accessibility` (role / focus / hit_area / labeling)
- `token_mapping` (keyed by `{anatomy_id}.{css_property}`)
- `qa`

See `component-spec-yaml.mdc` for full field conventions and validation rules.

## Output

- `${docs_root}/components/${component_name}.md`
- Update `${docs_root}/components/overview.md` using the canonical list format:
  - `- [Display Name](snake_case.md)`
  - sorted alphabetically by display name (case-insensitive)
  - no duplicates, no dead links, no orphan component docs

## Naming contract

- `component_name` is display name input (`Alert`, `StatusBar`, `Status Bar`).
- Default spec path: `docs/_spec/components/<snake_case>.yml`
- Default markdown path: `docs/components/<snake_case>.md`
- If explicit path flags are provided (`--spec-file`, `--output`), they take precedence.

## Component page structure

Follow the structure defined in `component-doc-structure.mdc` (required frontmatter + ordered sections). The skill generates all sections from the spec YAML, filling `TBD` where data is missing.

Summary of sections (see rule for full details):

Before `# {ComponentName}`, always generate YAML frontmatter:

```yaml
doc_type: component
doc_status: draft
figma:
  file_url: TBD
  page: TBD
  component: TBD
  last_verified: TBD
```

Then use this section order:

1. `# {ComponentName}` + one-line description
2. `## Overview` — from `summary` + Figma component set info + source link
3. `## Anatomy` — numbered list from `anatomy`
4. `## Component API` — `### Properties` table from `properties`
5. `## Visual Specifications` — token mappings organized by part (container, typography, spacing, iconography)
6. `## Variants` — from `properties` where type is `VARIANT` + variant-specific tokens from `token_mapping`
7. `## States` — from `state` property if present; otherwise `TBD`
8. `## Usage Guidelines` — from `summary.when_to_use`, `summary.when_not_to_use`, `best_practices`
9. `## Content Guidelines` — from `content_guidelines`
10. `## Accessibility` — from `accessibility`, following `accessibility-docs.mdc` (five required areas)
11. `## Related Components` — from spec if available, otherwise `TBD`
12. `## Design–Token Discrepancies` — only when mismatches are verifiable; follow `design-token-discrepancies.mdc`
13. `## Gaps / TBD` — auto-generated from all missing fields

Do not generate any extra H2 sections outside this canonical list.
If extra detail is needed, use `###` subsections inside the closest allowed H2.

## Properties table format

Per `component-doc-structure.mdc`, use this table format:

| Name | Type | Default | Required | Description |
|------|------|---------|----------|-------------|

- `Type` column uses Figma property types: `VARIANT`, `TEXT`, `BOOLEAN`, `INSTANCE_SWAP`.
- For `VARIANT` types, list allowed values in the `Description` column.

## Token references in output

- Token paths must follow `token-references.mdc`: inline code with hex/px fallback.
- Tokens appear within `## Visual Specifications` (organized by anatomy part) and `## Variants` (conditional per variant).
- If `token_mapping` includes conditional mappings, render them as:

  | Part | Condition | Token | Fallback |
  |------|-----------|-------|----------|

- Resolve aliases when possible; otherwise show raw reference and mark `unresolved`.
- Never include `VariableID:*`.
- Figma node IDs are allowed only for source traceability (for example, `node-id` in Figma URLs).

## End with a report

- Component page path
- Missing spec fields
- Unresolved token references (if any)

## Incremental execution (CLI)

Use the project command to generate from spec with cache:

```bash
npm run ds:component-doc -- \
  --component-name Alert \
  --spec-file docs/_spec/components/alert.yml \
  --agent codex
```

Force regeneration:

```bash
npm run ds:component-doc -- --component-name Alert --force true --agent codex
```
