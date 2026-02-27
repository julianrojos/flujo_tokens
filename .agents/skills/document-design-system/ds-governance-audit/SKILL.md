---
name: ds-governance-audit
description: Audit documentation governance maturity across ownership, lifecycle, deprecation, migration, feedback loops, and KPI definitions.
version: "1.0.0"
context:
  doc_type: workflow
  stage: markdown
compatible_agents:
  - codex
  - claude
  - gemini
inputs:
  - name: docs_root
    type: path
    required: false
    default: "docs/"
    description: "Root docs directory to audit."
  - name: include_components
    type: boolean
    required: false
    default: true
    description: "Include component pages in scope."
  - name: include_workflows
    type: boolean
    required: false
    default: true
    description: "Include workflow/pattern/governance pages in scope."
  - name: strict
    type: boolean
    required: false
    default: false
    description: "If true, treat missing governance evidence as blocking in the report."
outputs:
  - name: report
    type: report
    description: "Governance maturity report with pass/fail by category, coverage gaps, and prioritized next actions."
---

# ds-governance-audit

## When to use

Use this skill when:

- You need to assess documentation operations beyond schema validation.
- You are preparing a governance review, quarterly audit, or migration plan.
- You want a focused gap report for owners, cadence, deprecation, and KPIs.

## What it audits

1. Ownership clarity
- Explicit owner roles documented
- Review and approval path documented

2. Lifecycle and deprecation readiness
- Versioning/changelog policy present
- Deprecation policy includes replacement and migration window

3. Feedback and KPI loops
- Feedback intake channel exists
- KPI definitions include metric/source/cadence

4. Internationalization resilience
- Explicit RTL/text expansion/locale behavior notes in applicable docs
- Reduced-motion and zoom expectations documented or marked `TBD`

## Recommended command sequence

```bash
npm run ds:doctor
npm run validate:docs
npm run ds:audit-consistency
```

Then apply this skill-level governance audit on top of those outputs.

## Report format

- Category summary (`pass`, `partial`, `fail`)
- Coverage table by doc area (components, workflows, governance)
- Blocking gaps (when `strict=true`)
- Prioritized next actions (P1/P2/P3)
