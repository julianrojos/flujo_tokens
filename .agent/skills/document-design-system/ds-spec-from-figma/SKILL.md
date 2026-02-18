---
name: ds-spec-from-figma
description: Generate one component spec YAML from a Figma component set (URL or node-id), then validate it against the token registry.
---

# ds-spec-from-figma

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
- Prefills `token_mapping` TBD values using `docs/_generated/token-registry.json`.
- Validates the generated spec via `validateDocs` (`SPEC01` checks).

## Useful flags

- `--url <figma-url>`
- `--component-set-node-id <node-id>`
- `--component-name <Name>`
- `--output <path/to/spec.yml>`
- `--spec-root <dir>` (default: `docs/_spec/components`)
- `--template <path>` (default: `docs/_spec/components/_template.yml`)
- `--registry <path>` (default: `docs/_generated/token-registry.json`)
- `--skip-validation true`
- `--agent <codex|claude|gemini>`
