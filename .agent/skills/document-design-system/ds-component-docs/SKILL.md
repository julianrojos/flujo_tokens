---
name: ds-component-docs
description: Orchestrate end-to-end component documentation using the existing spec -> markdown -> figma -> visual-proof pipeline.
version: "1.1.0"
requires_rules:
  - docs-pipeline-contract: ">=1.0.0"
  - component-spec-yaml: ">=1.0.0"
  - component-doc-structure: ">=1.0.0"
  - component-doc-content: ">=1.0.0"
  - component-figma-traceability: ">=1.0.0"
  - component-name-normalization: ">=1.0.0"
  - frontmatter-contract: ">=1.0.0"
  - markdown-lifecycle-status: ">=1.0.0"
  - ds-docs-guardrails: ">=1.0.0"
compatible_agents:
  - codex
  - claude
  - gemini
---

# ds-component-docs

## When to use

Use this skill when the user asks:

- "Document component X"
- "Update docs for component X"
- "Rebuild component docs end-to-end"

This skill orchestrates existing workflows. It does not replace specialized skills.

## Required inputs

- Exact component name (display name, for example `Button` or `Status Bar`)
- Documentation target path if non-default
- Available source(s): Figma URL/node-id, spec file, token registry

If the component name or source of truth is missing, ask before writing files.

## Orchestration flow

1. **Preflight**
- Run docs health preflight (`ds:doctor` or equivalent checks when needed).
- Confirm token registry is available (`docs/_generated/token-registry.json`).

2. **Spec stage**
- If spec is missing or outdated, run:
  - `ds:spec-from-figma` (preferred when Figma source is available), or
  - migrate/repair existing spec following `component-spec-yaml.mdc`.

3. **Markdown stage**
- Generate/update markdown via `ds:component-doc`.
- Preserve canonical H2 contract from `component-doc-structure.mdc`.
- Ensure `## Overview` includes `### Visual Proof`.
- Ensure `## Usage Guidelines` includes behavior/examples guidance.

4. **Figma render stage (optional)**
- When visual docs are requested, run `ds:active-md-to-figma`.

5. **Visual proof stage**
- Capture evidence with `ds:capture-visual-proof`.
- Keep proof metadata in `docs/_generated/visual-proofs/`.
- Required before promoting component docs to `doc_status: ready`.

6. **Lifecycle drift stage**
- Run `ds:mark-needs-review` when upstream inputs changed.

7. **Validation & audit**
- Run `validate:docs`.
- Run `ds:audit-consistency` for the target component before claiming `ready`.

## Output

- Updated spec (`docs/_spec/components/<snake_case>.yml`) when needed.
- Updated markdown (`docs/components/<snake_case>.md`).
- Updated overview entry (`docs/components/overview.md`) through existing generation flow.
- Visual proof artifact (`docs/_generated/visual-proofs/<snake_case>.json`) when claiming `doc_status: ready`.

## Completion report (required)

Provide:

- files changed
- commands run
- validation/audit status
- unresolved `TBD` or gaps
- next action to reach `doc_status: ready` when applicable
