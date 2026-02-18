---
name: ds-markdown-to-figma-section
description: Render a component markdown doc into a styled Figma documentation section placed 200px to the right of the component section, using the shared theme contract in docs/_spec/figma_doc_theme.yml.
---

# ds-markdown-to-figma-section

## When to use

Use this skill when:

- A component markdown exists in `docs/components/`
- You want a visual documentation section in Figma, not only markdown
- You need consistent formatting for headings, paragraphs, lists, tables, and containers

Do not use this skill for non-component pages.

## Applicable rules

This skill must comply with:

- `figma-doc-rendering.mdc` — block types, determinism, theme contract, section placement, and table rendering rules
- `component-doc-structure.mdc` — the Markdown input is expected to follow the required frontmatter + ordered sections
- `ds-docs-guardrails.mdc` — no Figma internal IDs in visible text, no invented content
- `markdown-figma-subset.mdc` — supported markdown subset and table authoring constraints

## Inputs (ask only if missing)

- `component_name` (recommended)
- `markdown_path` (default: `docs/components/${component_name}.md`)
- `theme_path` (default: `docs/_spec/figma_doc_theme.yml`)
- `component_set_node_id` (preferred for deterministic placement)
- `figma_file_url` (optional if already connected through Desktop Bridge)
- `offset_x` (default from theme; expected `200`)

## Bundled scripts

- `scripts/markdown_to_doc_model.mjs`
  - Step A parser.
  - Converts markdown into deterministic `doc_model.json`.
- `scripts/build_figma_execute_code.mjs`
  - Step B builder.
  - Combines `doc_model.json` + `figma_doc_theme.yml` and generates:
    - Figma runtime code (`*.figma-execute.js`) for `figma_execute`
    - Render payload snapshot (`*.render-payload.json`) for traceability

## Preconditions

- Figma MCP connection is active.
- Markdown file exists and is readable.
- Theme file exists and is readable.
- The component exists in Figma as a `COMPONENT_SET`.

If any precondition fails, STOP and report the exact blocker.

## Two-step pipeline (required)

### Step A: Markdown -> doc model

Run:

```bash
node .agent/skills/document-design-system/ds-markdown-to-figma-section/scripts/markdown_to_doc_model.mjs \
  --markdown docs/components/<component>.md \
  --component-name <ComponentName> \
  --out docs/_generated/figma_doc_models/<component>.doc-model.json
```

### Step B: doc model + theme -> render code

Run:

```bash
node .agent/skills/document-design-system/ds-markdown-to-figma-section/scripts/build_figma_execute_code.mjs \
  --model docs/_generated/figma_doc_models/<component>.doc-model.json \
  --theme docs/_spec/figma_doc_theme.yml \
  --component-name <ComponentName> \
  --component-set-id <figma_component_set_node_id_optional> \
  --offset-x 200 \
  --out docs/_generated/figma_doc_models/<component>.figma-execute.js \
  --payload-out docs/_generated/figma_doc_models/<component>.render-payload.json
```

Then execute the generated JS with `figma_execute`.

Notes:

- Re-run Step A and Step B on every markdown/theme change.
- Keep generated files in `docs/_generated/figma_doc_models/` for reproducibility.

## Required behavior

1. Read `markdown_path`.
2. Read `theme_path` and use it as the single source of style/layout truth.
3. Resolve target component node:
   - Use `component_set_node_id` when provided.
   - Otherwise, find `COMPONENT_SET` by component name in the current page/file.
4. Resolve placement anchor:
   - Use the parent `SECTION` of the component set as `component_section`.
   - Place documentation section at `component_section.right + offset_x`.
   - Align top with `component_section.y`.
5. Build or update the documentation section:
   - Section name pattern: `Doc/{component_name}` unless overridden by theme.
   - Idempotent mode: if section already exists, clear and re-render content.
   - Never create duplicates with the same logical target.
6. Parse markdown blocks in order using the supported block types defined in `figma-doc-rendering.mdc` (header, card_title, inline_heading, paragraph, list, table). Unsupported blocks → body text fallback + warning entry in report.
   - Ignore YAML frontmatter when present.
7. Apply design contract from theme (see `figma-doc-rendering.mdc` for theme contract rules). No hardcoded styling outside theme, except fallback safety values.
8. Produce a run report with:
   - `markdown_path`
   - `target_section_id`
   - `theme_name`
   - `offset_x_applied`
   - `unsupported_blocks`

## Idempotency and naming rules

- Logical section identity is `Doc/{component_name}` under the same parent/page context.
- Re-run must update existing section contents instead of adding a second section.
- Keep stable internal node names for deterministic updates:
  - `Doc Canvas`
  - `Header`
  - `Card/<H2 title>`
  - `Table/<H2 or H3 title>`

## Visual consistency rules

- Use one visual card per `##` section.
- Preserve markdown source order.
- Preserve hierarchy; do not flatten headings.
- Use stretch alignment for text containers where possible.
- Keep typography consistent with theme token names (`h1`, `h2`, `h3`, `body`).

## Safety rules

- Do not modify the original component set.
- Do not move unrelated sections or nodes.
- Do not infer missing design semantics not present in markdown or theme.

## QA checklist (must run before finishing)

- Section exists exactly once.
- Horizontal distance from component section is exactly `offset_x`.
- Typography levels are visually consistent (`h1/h2/h3/body`).
- Tables are rendered as structured rows/cells (not plain paragraph dumps).
- No overflow clipping in major content blocks.

## End with a report

- Created/updated section name and node ID.
- Anchor component and parent section IDs.
- Applied offset and measured result.
- Count of rendered blocks by type.
- Unsupported blocks list (if any).
