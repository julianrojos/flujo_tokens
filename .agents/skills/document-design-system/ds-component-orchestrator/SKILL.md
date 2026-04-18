---
name: ds-component-orchestrator
description: Orchestrate end-to-end component documentation using the existing spec -> markdown -> visual-proof pipeline.
version: '1.1.0'
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
    description: 'Figma design URL for spec extraction. Required when spec is missing or outdated.'
  - name: component_set_node_id
    type: string
    required: false
    description: "Figma component set node ID in '1234:567' format. Alternative to figma_url."
  - name: docs_root
    type: path
    required: false
    default: 'docs/'
    description: 'Root documentation directory.'
  - name: capture_visual_proof
    type: boolean
    required: false
    default: true
    description: 'Whether to run the visual proof capture stage (ds:capture-visual-proof). Breaking change: default is true as of v1.1.0.'
outputs:
  - name: spec_file
    type: path
    value: '${docs_root}/_spec/components/${component_name_snake_case}.yml'
    conditional: true
    condition: 'Only when the spec stage runs (spec is missing or outdated). Skipped when a valid up-to-date spec already exists.'
    description: 'Created or updated component spec.'
  - name: markdown_file
    type: path
    value: '${docs_root}/components/${component_name_snake_case}.md'
    description: 'Updated component documentation page (always produced).'
  - name: overview_file
    type: path
    value: '${docs_root}/components/overview.md'
    description: 'Updated overview index (always produced as part of markdown stage).'
  - name: visual_proof_file
    type: path
    value: '${docs_root}/_generated/visual-proofs/${component_name_snake_case}.json'
    conditional: true
    condition: 'Only when the visual proof stage runs (required before doc_status: ready).'
    description: 'Visual proof artifact capturing screenshot evidence for the component.'
  - name: report
    type: report
    description: 'Files changed, commands run, validation status, gaps, and next actions to reach doc_status: ready.'
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
- Available source(s): Figma URL/node-id, component spec, token registry

If the component name or source of truth is missing, ask before writing files.

## Orchestration flow

1. **Preflight**

- Run docs health preflight (`ds:doctor` or equivalent checks when needed).
- Confirm token registry is available (`docs/_generated/token-registry.json`).

2. **Spec stage**

- If spec is missing or outdated, update it in the dashboard or migrate/repair the existing spec following `component-spec-yaml.mdc`.

3. **Markdown stage**

- Generate/update markdown via the dashboard docs editor or the live API-backed docs flow.
- Preserve canonical H2 contract from `component-doc.mdc`.
- Ensure `## Overview` includes `### Visual Proof`.
- Ensure `## Usage Guidelines` includes behavior/examples guidance.

4. **Visual proof stage**

- Capture evidence with `ds:capture-visual-proof`.
- Keep proof metadata in `docs/_generated/visual-proofs/`.
- Required before promoting component docs to `doc_status: ready`.

5. **Lifecycle drift stage**

- Run `ds:mark-needs-review` when upstream inputs changed.

6. **Validation & audit**

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

## Breaking changes

- Since `v1.1.0`, `capture_visual_proof` defaults to `true` (previously `false`).
- Set `capture_visual_proof=false` explicitly if you want spec+markdown only runs.
