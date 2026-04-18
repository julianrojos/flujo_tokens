# Component Docs Workflow

This is the canonical editing order for component documentation assets.

Sequence:

1. `spec` -> create/update the component spec file at `design-systems/<system-id>/docs/_spec/components/<snake_case>.yml`
2. `markdown` -> create/update `design-systems/<system-id>/docs/components/<snake_case>.md`

## Prerequisites

- Token registry available in system docs: `design-systems/<system-id>/docs/_generated/token-registry.json`
- Design systems PostgreSQL available and at least one system configured (`DATABASE_URL` must point to the dashboard database)
- Agent CLI available (`codex`, `claude`, or `gemini`)

### System Bootstrap (once per environment)

1. Create at least one design system in the Dashboard Systems UI.
2. Set the default system (or always pass `--system <id>`).
3. Validate environment:

```bash
npm run ds:registry:validate -- --system <id>
```

## Recommended commands

### 1) Capture spec in the dashboard

Open the component spec editor in the dashboard and update the spec from captured Figma data.

### 2) Edit component docs

Open the component docs page in the dashboard and update the editorial fields directly.

### 3) Capture/update visual proof (standalone)

```bash
npm run ds:capture-visual-proof -- \
  --system my-system \
  --component-name Alert \
  --agent codex
```

### 4) Validate and audit

```bash
npm run ds:registry:validate -- --system my-system
npm run test:tooling:core
```

## Guardrails

- Never skip stage order (`spec` -> `markdown`).
- Keep one spec and one markdown file per component slug.
- Always target the correct design system (`--system <id>`) for multi-system repositories.
- Visual proof capture (`ds:capture-visual-proof`) is a standalone operation.
- For `doc_status: ready`, visual proof must contain a concrete screenshot URL.
