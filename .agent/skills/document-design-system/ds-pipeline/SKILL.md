---
name: ds-pipeline
version: "1.0.0"
description: >
  Orchestrate the full design system documentation pipeline across all
  components or a single one. Detects orphans, validates preconditions,
  executes stages in order, and reports progress.
inputs:
  - name: component
    type: string
    description: "Optional component slug to process individually (e.g. alert). If omitted, processes all components."
  - name: from-step
    type: string
    description: "Optional phase to start from: spec | markdown | render | proof | gate"
  - name: render-figma
    type: boolean
    description: "True to actively push markdown docs back to Figma"
  - name: dry-run
    type: boolean
    description: "Plan and validate preconditions without making real changes"
  - name: status-only
    type: boolean
    description: "Produce the orphan gaps and status report without executing any heavy actions"
  - name: json
    type: boolean
    description: "Output JSON formatted payload for Dashboard integrations"
outputs:
  - name: pipeline_report
    description: "JSON/Console summary of the execution plan and run results"
  - name: orphans_report
    description: "Report on components missing Figma mappings (doc_only), specs (figma_only), or docs (spec_only)"
requires_rules:
  - "ds-docs-guardrails.mdc"
compatible_agents:
  - "Antigravity"
  - "Codebase Editor"
---

# ds-pipeline Skill

This skill orchestrates the entire Design System documentation pipeline. Instead of running individual scripts manually in order, this skill acts as the entry point and executes a deterministic DAG of steps per component based on the `component-registry.json`.

## Architecture: Plan -> Execute -> Report

1. **PLAN**: Creates an execution graph based on current state across Tokens, Specs, and Figma registries. Detects missing files or drifts (e.g., `doc.status === 'needs-review'`) and flags if steps are required.
2. **EXECUTE**: Iterates through the plan (or a specific component) running the necessary stages:
   - **Stage A (Tokens)**: Sync tokens and update registry.
   - **Stage B (Spec)**: Generate spec from Figma if missing.
   - **Stage C (Markdown)**: Generate docs from spec.
   - **Stage D (Render)**: Push markdown changes to Figma (if `--render-figma`).
   - **Stage E (Proof)**: Capture visual proof.
   - **Stage F (Gate)**: Global validation & consistency audit.
3. **REPORT**: Summarizes actions taken, skipped components, errors, and orphans.

## Best Practices

- Run with `--status-only` first to detect orphaned components and drift before heavy computation.
- Output `--json` if you are integrating this action with the Dashboard or automated CI.

## CLI Execution

```bash
npm run ds:pipeline -- --component alert
npm run ds:pipeline -- --status-only
```
