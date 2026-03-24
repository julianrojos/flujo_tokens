---
name: ds-tokens-sync
description: Regenerate token CSS outputs and token registry from JSON inputs using the project CLI.
version: "1.2.2"
context:
  doc_type: spec
  stage: spec
compatible_agents:
  - codex
  - claude
  - gemini
inputs:
  - name: input_dir
    type: path
    required: false
    default: "input/"
    description: "Directory containing source token JSON files exported from Figma."
  - name: single
    type: boolean
    required: false
    default: false
    description: "When true, emits a single combined CSS file (custom-properties.css) instead of split outputs."
  - name: force
    type: boolean
    required: false
    default: false
    description: "When true, bypasses cache and regenerates all outputs unconditionally."
outputs:
  - name: registry
    type: path
    value: "docs/_generated/token-registry.json"
    description: "Generated token registry JSON. Required by all downstream doc generation skills."
  - name: primitives_css
    type: path
    value: "output/primitives.css"
    description: "Primitives CSS file (split mode only; omitted when single=true)."
  - name: tokens_css
    type: path
    value: "output/tokens.css"
    description: "Semantic tokens CSS file (split mode only; omitted when single=true)."
  - name: custom_properties_css
    type: path
    value: "output/custom-properties.css"
    description: "Combined CSS file (single mode only; omitted when single=false)."
  - name: report
    type: report
    description: "Mode used, input file count, output files generated or skipped, and suggested next step."
---

# ds-tokens-sync

## When to use

Use this skill when:

- Token JSON exports changed in `input/`
- You need refreshed token CSS outputs
- You need an updated `docs/_generated/token-registry.json` before docs validation

## Inputs (ask only if missing)

- `input_dir` (default: `input/`)
- `single` (default: `false`; when `true`, emits one CSS file)
- `force` (default: `false`; bypasses cache skip)

> Applicable rules are resolved from `context:` via `_manifest.yml`.

## Required behavior

1. Verify `input_dir` contains `.json` token files.
2. Run the project command (`ds:tokens-sync`) with requested flags.
3. Preserve deterministic outputs and cache behavior (`--force true` only when needed).
4. Do not claim markdown inventory artifacts from this command.
5. For dependency health diagnostics, run token graph analysis (`ds:token-graph`).

## Outputs

Default split mode (`single=false`):

- `output/primitives.css`
- `output/tokens.css`
- `docs/_generated/token-registry.json`

Single mode (`single=true`):

- `output/custom-properties.css`
- `docs/_generated/token-registry.json`

Non-goal:

- This command does **not** generate markdown inventory files such as `tokens.inventory.md` or `tokens.alias-resolution.md`.

## Commands

```bash
npm run ds:tokens-sync
```

```bash
npm run ds:tokens-sync -- --force true
```

```bash
npm run ds:tokens-sync -- --single true
```

```bash
# Analyze alias/dependency graph and detect cycles/indirection hotspots
npm run ds:token-graph
```

## End with a brief report

- Mode used (`split` or `single`)
- Input directory and JSON file count
- Output files generated (or skipped due to cache)
- Suggested next step (`validate:docs`, `ds:component-doc`, or `ds:spec-from-figma`)
