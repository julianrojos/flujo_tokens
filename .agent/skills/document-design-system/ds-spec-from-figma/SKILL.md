---
name: ds-spec-from-figma
description: Generate one component spec YAML from a Figma component set (URL or node-id), then validate it against the token registry.
version: "1.1.1"
requires_rules:
  - component-spec-yaml: ">=1.0.0"
  - component-spec-properties-order: ">=1.0.0"
  - component-name-normalization: ">=1.0.0"
  - token-references: ">=1.0.0"
  - token-registry-validation: ">=1.0.0"
  - ds-docs-guardrails: ">=1.0.0"
  - docs-pipeline-contract: ">=1.0.0"
compatible_agents:
  - codex
  - claude
  - gemini
---

# ds-spec-from-figma

## Applicable rules

This skill must comply with:

- `component-spec-yaml.mdc`
- `component-spec-properties-order.mdc`
- `component-name-normalization.mdc`
- `token-references.mdc`
- `token-registry-validation.mdc`
- `ds-docs-guardrails.mdc`
- `docs-pipeline-contract.mdc`

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
