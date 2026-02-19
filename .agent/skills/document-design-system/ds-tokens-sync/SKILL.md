---
name: ds-tokens-sync
description: Regenerate token CSS outputs and token registry from JSON inputs using the project CLI.
version: "1.2.2"
requires_rules:
  - ds-docs-guardrails: ">=1.0.0"
  - token-registry-validation: ">=1.0.0"
compatible_agents:
  - codex
  - claude
  - gemini
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

## Applicable rules

This skill must produce output that complies with:

- `ds-docs-guardrails.mdc` — generated artifacts are deterministic and not hand-edited
- `token-registry-validation.mdc` — downstream docs/spec token references rely on this registry

## Required behavior

1. Verify `input_dir` contains `.json` token files.
2. Run the project command (`ds:tokens-sync`) with requested flags.
3. Preserve deterministic outputs and cache behavior (`--force true` only when needed).
4. Do not claim markdown inventory artifacts from this command.
5. When impact visibility is needed, run token diff after sync (`ds:token-diff`).
6. For dependency health diagnostics, run token graph analysis (`ds:token-graph`).

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
# Compare current token registry against HEAD snapshot
npm run ds:token-diff
```

```bash
# Compare against an explicit previous registry file
npm run ds:token-diff -- --before docs/_generated/token-registry.prev.json
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
