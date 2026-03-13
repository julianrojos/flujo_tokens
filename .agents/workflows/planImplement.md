---
description:  "implementer: execute an Implementation Pack step-by-step with maximum code quality. No branches, no stage/commit without explicit user permission."
---

# /planImplement — Execute Implementation Pack (junior, high quality)

Input: the user pastes an **Implementation Pack v1** produced by `/planCreate`.

---

## Hard constraints (MUST)
- Do not create/switch branches.
- Do not stage/commit/push unless the user explicitly asks.
- Follow `AGENTS.md` and `.agent/rules/general-programming-principles.mdc`.
- Implement exactly step-by-step; do not reorder steps without a clear reason.
- After each step: run the specified verification commands.

---

## Step 0 — Read constraints (no edits)
Read:
- `AGENTS.md`
- `.agent/rules/general-programming-principles.mdc`.

---

## Step 1 — Validate the plan before touching code
- Confirm the pack has: DoD, steps with Verify commands, and Senior calls.
- If any is missing: stop and request the missing pieces.

---

## Step 2 — Execute steps (one by one)
For each step in the pack:
1) Apply the change in the specified target files.
2) Keep changes minimal and aligned with the plan.
3) Run the step’s Verify commands.
3.5) If the current step is marked `PERMISSION_GATE`: stop, list the exact commands/actions you intend to run, and ask the user for permission. Do not proceed until approved.
4) If Verify fails: revert the step’s changes and report:
   - what failed,
   - likely cause,
   - 1–2 options to proceed.

---

## Step 3 — Final report (MANDATORY)
Return:
- What changed (by file)
- Which Verify commands were run and their outcomes
- Remaining risks / follow-ups
- Do not stage/commit

Final report template (MANDATORY):
- DoD checklist: copy the DoD from the pack and mark each item as [x]/[ ].
- Steps executed:
  - For each `STEP_ID`: outcome (pass/fail), verify commands, verify result.
- Files changed: list paths (grouped by folder if many).
- Verification summary: which commands/tests ran and their outcomes.
- Remaining risks / follow-ups: bullets.
- Permission ask: “Do you want me to stage/commit? (I will not do it unless you explicitly instruct me.)”