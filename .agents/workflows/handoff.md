---
description: "Handoff: packages the current work state to transfer it to another AI with maximum continuity (without editing code or committing)."
---

# /handoff — Transfer pack (no code changes)

This workflow generates a **handoff pack** so another AI can resume the work without ambiguity.

Workflows in this project are defined as Markdown files in `.agents/workflows/` with YAML frontmatter `description:` and steps in the body.  
`// turbo` is reserved for safe (*read-only*) commands.

## Rules
- Do not change code without prior permission.
- Do not make commits without prior permission.
- Do not write free prose: deliver **only** the final YAML block.
- Separate verifiable facts from opinions.
- If you are not certain about something, mark it as `unknown` (do not invent).
- Maximum 180 lines of YAML.

## Output (REQUIRED): exact YAML with this structure and order

handoff:
  summary:
    purpose: "<why this work exists (3-4 sentences)>"
    current_phase: "<e.g. 'designing workflows', 'calibrating thresholds', etc.>"
    current_task: "<what exact task you were on (2 sentences)>"
    definition_of_done: ["<bullet>", "<bullet>"]

  constraints:
    do_not:
      - "Do not modify code without explicit user permission."
      - "Do not commit without explicit user permission."
      - "<other important constraints>"
    must_read:
      - "AGENTS.md (repository root) — read, understand, and comply before doing anything else."
    quality_bar:
      - "<what 'good' means in this project (signal/noise, actionable-only, etc.)>"

  context:
    workflows_to_know:
      - name: "<workflow>"
        file: "<path>"
        purpose: "<when it is used>"
        inputs: ["<what it needs>"]
        outputs: ["<what it produces>"]
      # ...
    rules_to_know:
      - name: "<rule>"
        file: "<path>"
        purpose: "<what it governs>"
    key_files:
      - file: "<path>"
        why: "<why it matters>"

  decisions_log:
    - decision: "<what was decided>"
      rationale: "<why>"
      date: "<YYYY-MM-DD or unknown>"

  progress:
    completed:
      - "<what was completed (fact)>"
    pending:
      - "<what remains pending>"
    blockers:
      - "<blocker or unknown>"

  strategy:
    approach: "<general strategy (2–5 bullets)>"
    next_actions:
      - action: "<next concrete action>"
        how: ["<steps>"]
        expected_outcome: "<expected result>"
        risk: "<main risk>"
        mitigation: "<mitigation>"

  open_questions:
    - "<question the next AI must resolve to move forward>"

  handoff_note:
    what_to_do_first: "Read /AGENTS.md at the repo root, then follow this handoff pack."
    what_not_to_repeat: ["<things already resolved / do not reopen>"]
