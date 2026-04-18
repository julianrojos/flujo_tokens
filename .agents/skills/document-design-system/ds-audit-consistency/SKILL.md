---
name: ds-audit-consistency
description: Audit consistency across component specs, markdown docs, and token registry traceability checks.
version: "1.1.1"
context:
  doc_type: component
  stage: visual-proof
compatible_agents:
  - codex
  - claude
  - gemini
inputs:
  - name: component_name
    type: component_name
    required: false
    description: "Display name of the component to audit (e.g. 'Button'). When omitted, all components are audited."
  - name: docs_root
    type: path
    required: false
    default: "docs/components"
    description: "Directory containing component markdown files."
  - name: spec_root
    type: path
    required: false
    default: "docs/_spec/components"
    description: "Directory containing component specs."
  - name: registry
    type: path
    required: false
    default: "docs/_generated/token-registry.json"
    description: "Token registry used to validate token references."
outputs:
  - name: report
    type: report
    description: "JSON audit report with per-component pass/fail results and suggested fix commands."
---

# ds-audit-consistency

## When to use

- Before moving a component to `ready`
- After updating specs, markdown docs, or token mappings
- After design-system updates that may introduce drift

## What it checks

1. **Spec ↔ Markdown consistency**
- Spec `properties` are represented in markdown `## Component API`
- Variant values (`type: enum`) appear in markdown `## Component API`
- Spec `token_mapping` values are represented in markdown `## Visual Specifications`
- Lifecycle alignment gate: `ready` must match between spec and markdown

2. **Markdown ↔ Figma traceability consistency**
- `figma.component` in markdown matches spec `figma.component_set`
- `figma.page` in markdown matches spec `figma.page`
- `figma.component_set_node_id` consistency when both are present
- `State` values from spec appear in markdown `## States` when state axis exists

3. **Token validity**
- Token references validated against `docs/_generated/token-registry.json`
- No forbidden `VariableID:*` usage in docs/spec checks

## Command

```bash
npm run ds:audit-consistency
```

Single component:

```bash
npm run ds:audit-consistency -- --component-name Button
```

Custom paths:

```bash
npm run ds:audit-consistency -- \
  --docs-root docs/components \
  --spec-root docs/_spec/components \
  --registry docs/_generated/token-registry.json
```

## Output

- JSON report with per-component checks and pass/fail
- Suggested fix commands for regeneration and validation
