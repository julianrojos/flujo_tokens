# Component Docs Workflow

This is the canonical editing order for component documentation assets.

Sequence:

1. `spec` -> review/edit the DB-backed component spec in the dashboard
2. `markdown` -> download rendered markdown from DB-backed data; the spec remains the editable source of truth

## Prerequisites

- PostgreSQL must be available and at least one design system configured (`DATABASE_URL` must point to the dashboard database)
- Agent CLI available (`codex`, `claude`, or `gemini`)
- Confirm the active system in the dashboard or pass `--system <id>` explicitly when using CLI capture commands.

### System Bootstrap (once per environment)

1. Create at least one design system in the Dashboard Systems UI.
2. Set the default system (or always pass `--system <id>`).
3. Validate dashboard and tooling readiness:

```bash
npm run test:tooling:core
```

## Recommended commands

### 1) Review spec in the dashboard

Open the component spec editor in the dashboard and update the DB-backed spec fields. Structured Figma capture is consumed upstream; the dashboard persists spec state in PostgreSQL.

### 2) Edit component docs

Open the component docs page in the dashboard and update the editorial fields directly. AI suggestions are available. The dashboard renders documentation from DB-backed data for download.

### 3) Capture/update visual proof

Use `ds:capture-from-url` for import flows; it can add spec exhibits automatically. Use `ds:capture-visual-proof` only for isolated screenshots.

```bash
npm run ds:capture-from-url -- \
  --url "https://www.figma.com/design/<fileKey>/<name>" \
  --system my-system

npm run ds:capture-visual-proof -- \
  --system my-system \
  --component-name Alert \
  --agent codex
```

### 4) Validate and audit

```bash
npm run test:tooling:core
```

## Guardrails

- Never skip stage order (`spec` -> `markdown`).
- Always target the correct design system (`--system <id>`) for multi-system repositories.
- For `doc_status: ready`, visual proof must include a concrete screenshot URL.
- If no CLI is available, the dashboard stores a fallback prompt in `docs/_generated/agent_prompts/`.
- Use consistent terms: spec, rendered markdown, visual proof, dashboard.
