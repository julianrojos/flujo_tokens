---
name: ds-tokens-sync
description: Generate deterministic Markdown docs from Figma Variables token JSON exports (Primitives, Typography, Semantic, Components, A11y), including alias resolution and warnings.
---

# ds-tokens-sync

## When to use

Use this skill when:

- Token JSON exports changed
- You need updated inventories, alias resolution, and modes docs
- You want a stable, non-hand-edited “generated” section for Foundations/Components to link to

## Inputs (ask only if missing)

- `docs_root` (default: `docs/`)
- `token_files` (default list below; user may override)
  - `_Primitives.json`
  - `_Typography.json`
  - `Semantic.json`
  - `Components.json`
  - `A11y.json`

## Applicable rules

This skill must produce output that complies with:

- `ds-docs-guardrails.mdc` — global content integrity and no-invention policy
- `token-references.mdc` — token path formatting and naming patterns in generated tables

## Required behavior

- Read all provided token files
- Do not invent meaning; only document what is present
- Token paths in generated tables must follow the formatting conventions in `token-references.mdc` (inline code, grouped by semantic category)
- Detect and report:
  - Unresolved `{alias}` references
  - Circular alias chains
  - Duplicate token keys (if present across files)
- Keep ordering stable and predictable (alphabetical within groups)

## Alias resolution rules

- Treat any `$value` like `{Some.Path.To.Token}` as an alias
- Resolve recursively until:
  - a concrete value is found, or
  - resolution fails, or
  - a cycle is detected
- For each alias token, record:
  - `alias_of` (direct)
  - `chain` (A → B → C)
  - `resolves_to` (final concrete value if possible)

## Outputs (write to ${docs_root}/\_generated/)

Generate (overwrite these files each run):

1. `${docs_root}/_generated/tokens.inventory.md`
2. `${docs_root}/_generated/tokens.alias-resolution.md`
3. `${docs_root}/_generated/a11y.modes.md`

### tokens.inventory.md (structure)

- Heading + sources (list of JSON files)
- “Observed namespaces / tiers” (what top-level groups exist)
- Inventory tables grouped by:
  - Color
  - Typography
  - Dimension (spacing/sizing/radius/border widths/hit area tokens)
  - Elevation/Shadow
  - Other (whatever exists)
- Each table row:
  - Token path (in code formatting)
  - Raw value (as in JSON)
  - Notes (empty unless explicitly inferable)

### tokens.alias-resolution.md (structure)

- Summary counts: total tokens, aliases, resolved, unresolved, cycles
- Table:
  - Token
  - alias_of
  - chain
  - resolves_to
  - status (resolved/unresolved/cycle)

### a11y.modes.md (structure)

- Document any mode/grouping patterns present (e.g., desktop/mobile modes)
- Extract any hit-area minimums or A11y dimensions if explicitly present
- Do not assert WCAG compliance; only state values found

## End with a Doc report

Print:

- Generated files list
- Counts + warnings list
- Top 5 unresolved/cycle examples
