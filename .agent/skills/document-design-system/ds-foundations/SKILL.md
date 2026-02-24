---
name: ds-foundations
description: Build optional Foundations pages (Color, Typography, Spacing/Sizing, Elevation, Iconography, A11y) in Markdown using the token registry as source of truth.
version: "1.3.1"
context:
  doc_type: foundation
  stage: markdown
compatible_agents:
  - codex
  - claude
  - gemini
inputs:
  - name: docs_root
    type: path
    required: false
    default: "docs/"
    description: "Root documentation directory. Token registry and foundation pages are resolved relative to this path."
  - name: language
    type: string
    required: false
    default: "English"
    description: "Language for generated page content. Override only when explicitly requested."
  - name: registry
    type: path
    required: false
    default: "${docs_root}/_generated/token-registry.json"
    description: "Path to the token registry JSON. Must exist before running this skill."
  - name: dry_run
    type: boolean
    required: false
    default: false
    description: "When true, prints planned changes without writing files."
outputs:
  - name: color_page
    type: path
    value: "${docs_root}/foundations/color.md"
    description: "Color foundations page."
  - name: typography_page
    type: path
    value: "${docs_root}/foundations/typography.md"
    description: "Typography foundations page."
  - name: spacing_page
    type: path
    value: "${docs_root}/foundations/spacing-sizing.md"
    description: "Spacing and sizing foundations page."
  - name: elevation_page
    type: path
    value: "${docs_root}/foundations/elevation.md"
    description: "Elevation foundations page."
  - name: iconography_page
    type: path
    value: "${docs_root}/foundations/iconography.md"
    description: "Iconography foundations page."
  - name: a11y_page
    type: path
    value: "${docs_root}/foundations/a11y.md"
    description: "Accessibility foundations page."
  - name: overview_file
    type: path
    value: "${docs_root}/foundations/overview.md"
    description: "Foundations overview index (updated to link all generated pages)."
  - name: report
    type: report
    description: "Pages written or updated, missing dependencies, and TBD sections."
---

# ds-foundations

## When to use

Use this skill when:

- You want “Foundations” docs that read like a Design System site (not a token dump)
- `docs/foundations/` exists, or the user explicitly asks to create it
- Tokens exist and `ds:tokens-sync` has generated `docs/_generated/token-registry.json`
- You want consistent pages: purpose + structure + relevant token groups + TBD gaps

## Inputs (ask only if missing)

- `docs_root` (default: `docs/`)
- `language` (default: English; override only when explicitly requested by the user)

## Dependencies

- Requires `${docs_root}/_generated/token-registry.json`
- Optional supporting artifacts (if present): `${docs_root}/_generated/tokens.inventory.md`, `${docs_root}/_generated/tokens.alias-resolution.md`, `${docs_root}/_generated/a11y.modes.md`
- If missing, instruct to run `ds:tokens-sync` first and STOP

## Command (automated sync)

Use the foundations sync script to generate/update pages deterministically:

```bash
npm run ds:foundations:sync -- --create-root true
```

Useful flags:

- `--docs-root <path>` (default: `docs`)
- `--foundations-root <path>` (default: `docs/foundations`)
- `--registry <path>` (default: `docs/_generated/token-registry.json`)
- `--status <draft|ready|needs-review>` (default: `draft`)
- `--dry-run true`

## Output files (create/update)

- Apply only when foundations docs are requested for this repo.
- `${docs_root}/foundations/color.md`
- `${docs_root}/foundations/typography.md`
- `${docs_root}/foundations/spacing-sizing.md`
- `${docs_root}/foundations/elevation.md`
- `${docs_root}/foundations/iconography.md`
- `${docs_root}/foundations/a11y.md`
- Update `${docs_root}/foundations/overview.md` to link to all of the above

> Applicable rules are resolved from `context:` via `_manifest.yml`.

## Global rules

- Do not invent usage rules.
- If a guideline is not explicitly supported by naming or metadata, mark `TBD` and list what's needed.
- Always link to `_generated/token-registry.json` as the authoritative token source.
- Token paths in foundation pages must follow `token-references.mdc` (inline code + fallback).

## Page patterns (fixed sections)

### color.md

1. Purpose (short)
2. Semantic model (Background/Surface/Action/Text/Icon/Focus etc. if present)
3. Key token groups (list the relevant token prefixes, not every token)
4. “See also” links:
   - `_generated/token-registry.json`
   - `_generated/tokens.inventory.md` (optional if available)
   - `_generated/tokens.alias-resolution.md` (optional if available)
5. Gaps / TBD

### typography.md

1. Type scale overview (only if derivable)
2. Families, sizes, line-heights, weights (link to generated)
3. Semantic typography mapping (if present)
4. Gaps / TBD

### spacing-sizing.md

1. Spacing principles (TBD unless explicit)
2. Token families for spacing/sizing/border widths/radius (as present)
3. Gaps / TBD

### elevation.md

1. What elevation means (short, non-opinionated)
2. Shadow/elevation token families (as present)
3. Notes about platform differences (TBD unless explicit)
4. Gaps / TBD

### iconography.md

1. What’s documented here (guidelines + token hooks)
2. Icon color tokens (if present)
3. Minimum hit area values from registry (if present)
4. Asset inventory policy (TBD unless repo has assets folder)
5. Gaps / TBD

### a11y.md

1. A11y foundations (scope)
2. Modes (link `_generated/a11y.modes.md` if available)
3. Focus indicator tokens (if present) — follow `inclusive-docs.mdc` for focus outline token conventions
4. Touch targets (values only) — reference A11y hit area tokens per `inclusive-docs.mdc`
5. Gaps / TBD

## End with a report

- Pages written/updated
- Any missing generated deps
- Any sections left as TBD (bulleted)
