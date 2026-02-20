---
name: ds-init-docs
description: Bootstrap a Markdown documentation structure for a Design System with a components-first baseline and optional extra sections.
version: "1.3.0"
requires_rules:
  - ds-docs-guardrails: ">=1.0.0"
  - docs-taxonomy: ">=1.0.0"
  - frontmatter-contract: ">=1.0.0"
  - docs-language-tone: ">=1.0.0"
compatible_agents:
  - codex
  - claude
  - gemini
---

# ds-init-docs

## When to use

Use this skill when the user wants to:

- Start documenting a Design System in Markdown in the repo
- Establish the baseline structure required by the current docs pipeline
- Optionally scaffold extra IA sections (Foundations, workflows, accessibility overviews)

## Inputs (ask only if missing)

- `docs_root` (default: `docs/`)
- `system_name` (default: `Iter`)
- `include_optional_sections` (default: `false`)
- `repo_conventions` (optional: preferred naming, language, tone)

## Output (files to create if missing)

Baseline outputs (always):

- `${docs_root}/components/overview.md`
- `${docs_root}/_generated/` (empty dir; generated docs later)
- `${docs_root}/_spec/components/` (empty dir; component specs live here)

Optional outputs (`include_optional_sections=true` or explicit user request):

- `${docs_root}/index.md`
- `${docs_root}/foundations/overview.md`
- `${docs_root}/workflows/overview.md`
- `${docs_root}/a11y/overview.md`

## Applicable rules

All generated documentation must comply with:

- `ds-docs-guardrails.mdc`
- `docs-taxonomy.mdc`
- `frontmatter-contract.mdc`
- `docs-language-tone.mdc`

## Style & rules

- Markdown only
- No code snippets
- Keep copy short and practical
- Never invent product-specific facts; use `TBD` placeholders
- Every overview page must explain:
  - What it contains
  - How it stays updated
  - How to contribute

## Templates (write directly into the created files)

### Baseline: ${docs_root}/components/overview.md

- One-page-per-component policy
- Each component page follows the structure defined in `component-doc.mdc` (required frontmatter + ordered sections)
- How to add a component:
  1. Create spec YAML in `_spec/components/<Component>.yml` (see `component-spec-yaml.mdc`)
  2. Run ds-component-doc
- Definition of done checklist (short)

### Optional: ${docs_root}/index.md

- Title: `${system_name}`
- Sections:
  - Components (links)
  - Foundations (links, if enabled)
  - Workflows (links, if enabled)
  - Accessibility (links, if enabled)
  - How docs are generated (tokens vs specs)

### Optional: ${docs_root}/foundations/overview.md

- What foundations cover
- Link list of foundation pages (to be created/maintained by ds-foundations)

### Optional: ${docs_root}/workflows/overview.md

- Workflow index for maintenance runbooks
- Links to docs generation and validation flows
- Ownership and update policy

### Optional: ${docs_root}/a11y/overview.md

- Accessibility goals
- What is documented here (focus, hit area, color contrast notes) — per `accessibility-docs.mdc`
- How to raise gaps/issues

## End with a brief report

After writing files, output:

- Created files list
- Files skipped (already existed)
- Next suggested step: run `ds:tokens-sync`, then `ds-component-doc`
