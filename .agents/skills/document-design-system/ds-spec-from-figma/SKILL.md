---
name: ds-spec-from-figma
description: Generate one component spec YAML from a Figma component set (URL or node-id), then validate it against the token registry.
version: "1.1.1"
context:
  doc_type: spec
  stage: spec
compatible_agents:
  - codex
  - claude
  - gemini
inputs:
  - name: component_name
    type: component_name
    required: true
    description: "Display name of the component (e.g. 'Alert', 'Status Bar'). Normalized to snake_case for file paths."
  - name: figma_url
    type: string
    required: false
    description: "Full Figma design URL including node-id. Either this or component_set_node_id must be supplied."
  - name: component_set_node_id
    type: string
    required: false
    description: "Figma component set node ID in '1234:567' format. Either this or figma_url must be supplied."
  - name: spec_root
    type: path
    required: false
    default: "docs/_spec/components"
    description: "Directory where spec YAML files are stored."
  - name: output
    type: path
    required: false
    default: "${spec_root}/${component_name_snake_case}.yml"
    description: "Destination path for the generated spec YAML. Pass --output to override."
  - name: template
    type: path
    required: false
    default: "docs/_spec/components/_template.yml"
    description: "Spec template to copy from."
  - name: registry
    type: path
    required: false
    default: "docs/_generated/token-registry.json"
    description: "Token registry for prefilling token_mapping TBD values."
  - name: skip_validation
    type: boolean
    required: false
    default: false
    description: "Skip SPEC01 validation after generation. Requires force: true."
  - name: force
    type: boolean
    required: false
    default: false
    description: "Force overwrite of an existing spec file."
outputs:
  - name: spec_file
    type: path
    value: "${output}"
    description: "Generated component spec YAML."
  - name: report
    type: report
    description: "Summary of fields written, prefilled tokens, and validation results."
---

# ds-spec-from-figma

> Applicable rules are resolved from `context:` via `_manifest.yml`.

## When to use

Use this skill when:

- You have a component in Figma and need `docs/_spec/components/<component>.yml`.
- You want to reduce manual authoring of spec YAMLs.
- You want token mappings prefilled from `docs/_generated/token-registry.json`.

## Command

```bash
npm run ds:spec-from-figma -- \
  --url "https://www.figma.com/design/<file>/<name>?node-id=<node>" \
  --component-name Alert \
  --output docs/_spec/components/alert.yml \
  --agent codex
```

Alternative deterministic input:

```bash
npm run ds:spec-from-figma -- \
  --component-set-node-id 2304:1892 \
  --component-name Alert \
  --agent codex
```

## Behavior

- Uses the agent + Figma MCP workflow to inspect the component set.
- Writes one YAML file using the project spec template.
- Normalizes `component_name` as display name and infers default path as `docs/_spec/components/<snake_case>.yml`.
- Prefills `token_mapping` TBD values using `docs/_generated/token-registry.json`.
- Validates the generated spec via `validateDocs` (`SPEC01` checks).

## Naming contract

- `component_name` is display name input (`Alert`, `StatusBar`, `Status Bar`).
- Default output path uses `snake_case`:
  - `Alert` -> `docs/_spec/components/alert.yml`
  - `StatusBar` / `Status Bar` -> `docs/_spec/components/status_bar.yml`
- If `--output` is provided, it takes precedence.

## Useful flags

- `--url <figma-url>`
- `--component-set-node-id <node-id>`
- `--component-name <Name>`
- `--output <path/to/spec.yml>`
- `--spec-root <dir>` (default: `docs/_spec/components`)
- `--template <path>` (default: `docs/_spec/components/_template.yml`)
- `--registry <path>` (default: `docs/_generated/token-registry.json`)
- `--skip-validation true`
- `--force true` (required when using `--skip-validation true`)
- `--agent <codex|claude|gemini>`
