---
name: ds-pattern-doc
description: Generate a reusable UX pattern page as a workflow document using a decision-first structure and explicit governance metadata.
version: "1.0.0"
context:
  doc_type: workflow
  stage: markdown
compatible_agents:
  - codex
  - claude
  - gemini
inputs:
  - name: pattern_name
    type: component_name
    required: true
    description: "Display name of the pattern (for example: 'Checkout Form Validation')."
  - name: docs_root
    type: path
    required: false
    default: "docs/"
    description: "Root documentation directory."
  - name: related_components
    type: path[]
    required: false
    description: "Optional list of component markdown paths to reference."
  - name: source_notes
    type: string
    required: false
    description: "Optional brief evidence notes (research links, issues, analytics signal)."
outputs:
  - name: markdown_file
    type: path
    value: "${docs_root}/workflows/patterns/${pattern_name_snake_case}.md"
    description: "Generated or updated workflow pattern page."
  - name: workflows_overview
    type: path
    value: "${docs_root}/workflows/overview.md"
    description: "Workflow overview page to update with pattern link when needed."
  - name: report
    type: report
    description: "Summary of created/updated files, unresolved TBD fields, and governance/i18n gaps."
---

# ds-pattern-doc

## When to use

Use this skill when:

- A repeated product-flow solution needs canonical documentation.
- Teams need a decision guide that maps problem -> pattern -> components.
- You need pattern docs with governance, metrics, and i18n coverage.

## Required behavior

- Output path defaults to `docs/workflows/patterns/<snake_case>.md`.
- Use workflow frontmatter:
  - `doc_type: workflow`
- Do not duplicate component API tables from component docs.
- Use `TBD` for unknowns and collect them in `## Gaps / TBD`.

## Minimum page skeleton

1. `# <PatternName>` + one-line purpose
2. `## Overview`
3. `## Problem`
4. `## Decision Guide`
5. `## Pattern Structure`
6. `## Composition`
7. `## Behavior`
8. `## Accessibility`
9. `## Internationalization`
10. `## Implementation Links`
11. `## Governance`
12. `## Metrics and Feedback`
13. `## Related Components`
14. `## Gaps / TBD` (only when unresolved)

## End with a report

- Written file path
- Related component links included
- Unresolved `TBD` list
- Governance/i18n follow-ups
