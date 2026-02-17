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

## Inputs (ask only if missing)

- `docs_root` (default: `docs/design-system/`)
- `component_name` (required)
- `spec_file` (default: `${docs_root}/_spec/components/${component_name}.yml`)
- `token_files` (optional; if needed to resolve component tokens)

## Required behavior

- Read the component spec YAML
- Read token JSON files if needed to resolve values
- Do NOT write code snippets
- Do NOT invent anatomy/variants/states/accessibility behavior
- If spec lacks information:
  - Fill section with `TBD`
  - Add explicit items under “Gaps / TBD”

## Spec expectations (YAML schema)

The spec should contain (when available):

- `summary` (purpose/when_to_use/when_not_to_use)
- `anatomy` (slots/parts)
- `properties` (Figma properties; enum/boolean/etc)
- `content_guidelines`
- `best_practices` (do/dont)
- `accessibility` (role/focus/hit_area/labeling)
- `token_mapping` (variant conditions → token keys)

## Output

- `${docs_root}/components/${component_name}.md`
- Update `${docs_root}/components/overview.md` to include the component in the list (append alphabetically if possible)

## Component page structure (fixed order)

1. Title + metadata (Status + Figma reference if present)
2. Summary
3. Anatomy (table)
4. Properties (table)
5. States (derived from a `state` property if present; otherwise TBD)
6. Content guidelines
7. Best practices (Do / Don’t)
8. Accessibility (values only; no claims)
9. Tokens used (resolved)
10. Gaps / TBD

## Properties table format

| Property | Type | Values | Default | Required | Description |
| -------- | ---- | ------ | ------- | -------- | ----------- |

## Tokens used (resolved)

- Must list real token keys.
- If `token_mapping` includes conditional mappings, show them in a table:
  | Slot/Property | Condition | Token | Resolves to | Notes |
  |---|---|---|---|---|
- Resolve aliases when possible; otherwise show raw reference and mark `unresolved`.

## End with a report

- Component page path
- Missing spec fields
- Unresolved token references (if any)
