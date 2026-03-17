---
name: ds-component-orchestrator
description: Orchestrate end-to-end component documentation using the existing spec -> markdown -> figma -> visual-proof pipeline.
version: "1.1.0"
context:
  doc_type: component
  stage: pipeline
compatible_agents:
  - codex
  - claude
  - gemini
inputs:
  - name: component_name
    type: component_name
    required: true
    description: "Display name of the component to document end-to-end (e.g. 'Button', 'Status Bar')."
  - name: figma_url
    type: string
    required: false
    description: "Figma design URL for spec extraction. Required when spec is missing or outdated."
  - name: component_set_node_id
    type: string
    required: false
    description: "Figma component set node ID in '1234:567' format. Alternative to figma_url."
  - name: docs_root
    type: path
    required: false
    default: "docs/"
    description: "Root documentation directory."
  - name: render_figma
    type: boolean
    required: false
    default: false
    description: "Whether to run the Figma render stage (ds:active-md-to-figma)."
outputs:
  - name: spec_file
    type: path
    value: "${docs_root}/_spec/components/${component_name_snake_case}.yml"
    conditional: true
    condition: "Only when the spec stage runs (spec is missing or outdated). Skipped when a valid up-to-date spec already exists."
    description: "Created or updated spec YAML."
  - name: markdown_file
    type: path
    value: "${docs_root}/components/${component_name_snake_case}.md"
    description: "Updated component documentation page (always produced)."
  - name: overview_file
    type: path
    value: "${docs_root}/components/overview.md"
    description: "Updated overview index (always produced as part of markdown stage)."
  - name: visual_proof_file
    type: path
    value: "${docs_root}/_generated/visual-proofs/${component_name_snake_case}.json"
    conditional: true
    condition: "Only when the visual proof stage runs (required before doc_status: ready)."
    description: "Visual proof artifact capturing screenshot evidence for the component."
  - name: report
    type: report
    description: "Files changed, commands run, validation status, gaps, and next actions to reach doc_status: ready."
---

# ds-component-orchestrator

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
- Preserve canonical H2 contract from `component-doc.mdc`.
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
