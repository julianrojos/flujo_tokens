---
name: ds-foundations
description: Build Foundations pages (Color, Typography, Spacing/Sizing, Elevation, Iconography, A11y) in Markdown, linking to generated token inventories and avoiding invented guidance.
---

# ds-foundations

## When to use

Use this skill when:

- You want “Foundations” docs that read like a Design System site (not a token dump)
- Tokens exist and `ds-tokens-sync` has generated `_generated/*`
- You want consistent pages: purpose + structure + relevant token groups + TBD gaps

## Inputs (ask only if missing)

- `docs_root` (default: `docs/design-system/`)
- `language` (default: Spanish if repo is Spanish; otherwise keep consistent with repo)

## Dependencies

- Requires `${docs_root}/_generated/tokens.inventory.md` and `${docs_root}/_generated/tokens.alias-resolution.md`
- If missing, instruct to run `ds-tokens-sync` first and STOP

## Output files (create/update)

- `${docs_root}/foundations/color.md`
- `${docs_root}/foundations/typography.md`
- `${docs_root}/foundations/spacing-sizing.md`
- `${docs_root}/foundations/elevation.md`
- `${docs_root}/foundations/iconography.md`
- `${docs_root}/foundations/a11y.md`
- Update `${docs_root}/foundations/overview.md` to link to all of the above

## Global rules

- Do not invent usage rules.
- If a guideline is not explicitly supported by naming or metadata, mark `TBD` and list what’s needed.
- Always link to `_generated/` for the authoritative token tables.

## Page patterns (fixed sections)

### color.md

1. Purpose (short)
2. Semantic model (Background/Surface/Action/Text/Icon/Focus etc. if present)
3. Key token groups (list the relevant token prefixes, not every token)
4. “See also” links:
   - `_generated/tokens.inventory.md`
   - `_generated/tokens.alias-resolution.md`
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
3. Minimum hit area link to a11y.modes
4. Asset inventory policy (TBD unless repo has assets folder)
5. Gaps / TBD

### a11y.md

1. A11y foundations (scope)
2. Modes (link `_generated/a11y.modes.md`)
3. Focus indicator tokens (if present)
4. Touch targets (values only)
5. Gaps / TBD

## End with a report

- Pages written/updated
- Any missing generated deps
- Any sections left as TBD (bulleted)
