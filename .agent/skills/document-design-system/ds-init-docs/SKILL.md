---
name: ds-init-docs
description: Bootstrap a Markdown documentation site for a Design System (Get Started, Foundations, Components, A11y) without code, designed for Figma-first teams.
---

# ds-init-docs

## When to use

Use this skill when the user wants to:

- Start documenting a Design System in Markdown in the repo
- Create a consistent IA: Get Started → Foundations → Components → A11y
- Set up folder structure + index pages + navigation stubs

## Inputs (ask only if missing)

- `docs_root` (default: `docs/design-system/`)
- `system_name` (default: `Iter`)
- `repo_conventions` (optional: preferred naming, language, tone)

## Output (files to create if missing)

Create these files/directories (do not overwrite if already present; append safely if needed):

- `${docs_root}/index.md`
- `${docs_root}/get-started/overview.md`
- `${docs_root}/foundations/overview.md`
- `${docs_root}/components/overview.md`
- `${docs_root}/a11y/overview.md`
- `${docs_root}/_generated/` (empty dir; generated docs later)
- `${docs_root}/_spec/components/` (empty dir; component specs live here)

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

### ${docs_root}/index.md

- Title: `${system_name}`
- Sections:
  - Get started (links)
  - Foundations (links)
  - Components (links)
  - Accessibility (links)
  - How docs are generated (tokens vs specs)

### ${docs_root}/get-started/overview.md

- What is the DS
- Who it’s for
- How to navigate docs
- Contribution flow (high level)

### ${docs_root}/foundations/overview.md

- What foundations cover
- Link list of foundation pages (to be created/maintained by ds-foundations)

### ${docs_root}/components/overview.md

- One-page-per-component policy
- How to add a component:
  1. Create spec YAML in `_spec/components/<Component>.yml`
  2. Run ds-component-doc
- Definition of done checklist (short)

### ${docs_root}/a11y/overview.md

- Accessibility goals
- What is documented here (focus, hit area, color contrast notes)
- How to raise gaps/issues

## End with a brief report

After writing files, output:

- Created files list
- Files skipped (already existed)
- Next suggested step: run `ds-tokens-sync`, then `ds-foundations`
