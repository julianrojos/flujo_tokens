# Master Workflow

This is the single entry point for the Design System documentation pipeline.

Canonical sequence:

1. `spec` -> create/update `docs/_spec/components/<snake_case>.yml`
2. `markdown` -> generate/update `docs/components/<snake_case>.md`

## Prerequisites

- Token registry available: `docs/_generated/token-registry.json`
- Agent CLI available (`codex`, `claude`, or `gemini`)

## Recommended commands

### 1) Generate or refresh spec from Figma

```bash
npm run ds:spec-from-figma -- \
  --component-name Alert \
  --component-set-node-id 2304:1892 \
  --agent codex
```

### 2) Generate markdown from spec

```bash
npm run ds:component-doc -- \
  --component-name Alert \
  --agent codex
```

### 3) Capture/update visual proof (standalone)

```bash
npm run ds:capture-visual-proof -- \
  --component-name Alert \
  --agent codex
```

### 4) Auto-mark stale docs as `needs-review`

```bash
npm run ds:mark-needs-review
```

### 5) Validate and audit

```bash
npm run validate:docs
npm run ds:audit-consistency -- --component-name Alert
npm run ds:doctor
```

## Guardrails

- Never skip stage order (`spec` -> `markdown`).
- Keep one spec and one markdown file per component slug.
- Visual proof capture (`ds:capture-visual-proof`) is a standalone operation, not part of the canonical pipeline.
- For `doc_status: ready`, visual proof must contain a concrete screenshot URL.
