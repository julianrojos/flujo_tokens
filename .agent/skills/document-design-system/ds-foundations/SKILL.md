---
name: ds-foundations
description: Build optional Foundations pages (Color, Typography, Spacing/Sizing, Elevation, Iconography, A11y) in Markdown using the token registry as source of truth.
version: "1.3.0"
requires_rules:
  - ds-docs-guardrails: ">=1.0.0"
  - docs-taxonomy: ">=1.0.0"
  - token-references: ">=1.0.0"
  - token-registry-validation: ">=1.0.0"
  - accessibility-docs: ">=1.0.0"
  - docs-language-tone: ">=1.0.0"
  - overview-index-maintenance: ">=1.0.0"
compatible_agents:
  - codex
  - claude
  - gemini
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

## Output files (create/update)

- Apply only when foundations docs are requested for this repo.
- `${docs_root}/foundations/color.md`
- `${docs_root}/foundations/typography.md`
- `${docs_root}/foundations/spacing-sizing.md`
- `${docs_root}/foundations/elevation.md`
- `${docs_root}/foundations/iconography.md`
- `${docs_root}/foundations/a11y.md`
- Update `${docs_root}/foundations/overview.md` to link to all of the above

## Applicable rules

This skill must produce output that complies with:

- `ds-docs-guardrails.mdc` — global content integrity and no-invention policy
- `token-references.mdc` — token path formatting, fallback values, and naming patterns in all foundation pages
- `token-registry-validation.mdc` — validation of token references against the generated registry
- `accessibility-docs.mdc` — conventions for documenting focus, hit area, and contrast in `a11y.md`
- `docs-taxonomy.mdc` — page type classification (`foundation`)
- `docs-language-tone.mdc` — language and tone consistency
- `overview-index-maintenance.mdc` — keep `foundations/overview.md` synchronized

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
3. Focus indicator tokens (if present) — follow `accessibility-docs.mdc` for focus outline token conventions
4. Touch targets (values only) — reference A11y hit area tokens per `accessibility-docs.mdc`
5. Gaps / TBD

## End with a report

- Pages written/updated
- Any missing generated deps
- Any sections left as TBD (bulleted)
