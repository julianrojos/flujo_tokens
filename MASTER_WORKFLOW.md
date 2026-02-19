# Master Workflow

This is the single entry point for the Design System documentation pipeline.

Canonical sequence:

1. `spec` -> create/update `docs/_spec/components/<snake_case>.yml`
2. `markdown` -> generate/update `docs/components/<snake_case>.md`
3. `figma` -> render markdown to Figma section (optional)
4. `visual-proof` -> capture screenshot evidence and update `### Visual Proof`
5. `lifecycle` -> auto-mark stale docs as `needs-review`

## Prerequisites

- Token registry available: `docs/_generated/token-registry.json`
- Agent CLI available (`codex`, `claude`, or `gemini`)
- Figma MCP configured for the selected agent
- For write operations in Figma: Desktop Bridge/plugin running

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

### 3) Render markdown back to Figma

```bash
npm run ds:active-md-to-figma -- \
  --markdown docs/components/alert.md \
  --agent codex
```

### 4) Capture/update visual proof

```bash
npm run ds:capture-visual-proof -- \
  --component-name Alert \
  --agent codex
```

### 5) Auto-mark stale docs as `needs-review`

```bash
npm run ds:mark-needs-review
```

### 6) Validate and audit

```bash
npm run validate:docs
npm run ds:audit-consistency -- --component-name Alert
npm run ds:doctor
```

## Guardrails

- Never skip stage order (`spec` -> `markdown` -> `figma` -> `visual-proof`).
- Keep one spec and one markdown file per component slug.
- Keep `### Visual Proof` inside `## Overview` (not as a new H2).
- For `doc_status: ready`, visual proof must contain a concrete screenshot URL.
