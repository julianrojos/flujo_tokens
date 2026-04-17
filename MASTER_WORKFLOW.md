# Master Workflow

This is the single entry point for the Design System documentation pipeline.

Canonical sequence:

1. `spec` -> create/update `design-systems/<system-id>/docs/_spec/components/<snake_case>.yml`
2. `markdown` -> generate/update `design-systems/<system-id>/docs/components/<snake_case>.md`

Global legacy roots (`docs/components/*` and `docs/_spec/components/*`) are not part of this workflow.

## Prerequisites

- Token registry available in system docs: `design-systems/<system-id>/docs/_generated/token-registry.json`
- Design systems PostgreSQL available and at least one system configured (`DATABASE_URL` must point to the dashboard database)
- Agent CLI available (`codex`, `claude`, or `gemini`)

### System Bootstrap (once per environment)

1. Create at least one design system in the Dashboard Systems UI.
2. Set the default system (or always pass `--system <id>`).
3. Validate environment:

```bash
npm run ds:doctor -- --system <id>
```

## Recommended commands

### 1) Generate or refresh spec from Figma

```bash
npm run ds:spec-from-figma -- \
  --system my-system \
  --component-name Alert \
  --component-set-node-id 2304:1892 \
  --agent codex
```

### 2) Generate markdown from spec

```bash
npm run ds:component-doc -- \
  --system my-system \
  --component-name Alert \
  --agent codex
```

### 3) Capture/update visual proof (standalone)

```bash
npm run ds:capture-visual-proof -- \
  --system my-system \
  --component-name Alert \
  --agent codex
```

### 4) Auto-mark stale docs as `needs-review`

```bash
npm run ds:mark-needs-review -- --system my-system
```

### 5) Validate and audit

```bash
npm run validate:docs -- --system my-system
npm run ds:audit-consistency -- --component-name Alert
npm run ds:doctor
```

## Guardrails

- Never skip stage order (`spec` -> `markdown`).
- Keep one spec and one markdown file per component slug.
- Always target the correct design system (`--system <id>`) for multi-system repositories.
- Visual proof capture (`ds:capture-visual-proof`) is a standalone operation, not part of the canonical pipeline.
- For `doc_status: ready`, visual proof must contain a concrete screenshot URL.
