---
description: "Senior planner: design first-class architecture + a deterministic implementation plan to hand off to another AI. Planning only: no code changes, no branches, no stage/commit."
---

# /planCreate — Senior planning handoff (architecture + execution plan)

This workflow produces an **Implementation Pack** that another AI must execute step-by-step with high code quality and minimal regressions.

---

## Hard constraints (MUST)
- **Planning only**: do not modify code in this workflow.
- **No branches**: do not create or switch branches.
- **No staging/commits**: never run `git add`, `git commit`, `git push` unless the user explicitly asks.
- **Read & follow `AGENTS.md` first** (repo root).
- **Read & follow project coding principles**: `.agent/rules/general-programming-principles.mdc`.

## Quality bar (MUST)
- Root-cause oriented.
- Strong typing by default; exceptions only at untrusted boundaries.
- Small, reversible steps; avoid wide refactors unless required.
- Every step has a verification checkpoint.

---


---

## Step 1 — Gather minimal repo context (read-only)

// turbo
```bash
git status --porcelain=v1
```

// turbo
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' | head -n 50
```

// turbo
```bash
git log -n 10 --oneline
```

(Optional, if useful for architecture context)
// turbo
```bash
ls -la package.json pnpm-workspace.yaml yarn.lock package-lock.json 2>/dev/null || true
```

---

## Step 2 — Build the Implementation Pack (MANDATORY OUTPUT)

Return **only** the pack below, in this exact order.

### Implementation Pack v1

#### 1) Context (brief)
- 3–6 bullets: what we’re doing, why, constraints, and what *not* to do.

#### 2) Goal and Definition of Done
- Goal (1–2 sentences)
- DoD (5–12 checkboxes), including:
- **STEP_ID** (S-01…S-12)
  - typecheck/build (where applicable)
  - tests (where applicable)
  - no regressions in touched contracts
  - adherence to `general-programming-principles.mdc`

#### 3) Architecture proposal
- Modules/components involved (by folder/path)
- Data flow (inputs → transforms → outputs)
- Public contracts to preserve (types, function boundaries, CLI contracts)
- Error handling strategy (including “fail fast” vs recoverable)
- Naming/layout conventions for new code
- Tradeoffs (max 5 bullets)

#### 4) Execution plan (ordered, reversible steps)
For **each step** (max 12 steps):
- **Target files** (paths)
- **Intent** (1 sentence)
- **Procedure** (2–6 bullets)
- **Acceptance check** (what should be true after)
- **Verify** (exact command(s) to run; read-only safe commands only)
- **Rollback note** (1 sentence: what to revert if it goes wrong)

- Each step MUST start with `STEP_ID: S-XX` and the junior AI MUST reference `STEP_ID` in its running log and final report.
Rules:
- Prefer narrow, composable commits *conceptually* (but do not instruct to commit).
- Avoid TODOs in new/modified logic.
- If a step needs permission (e.g., installing deps), mark it explicitly as `PERMISSION_GATE`.

#### 5) Senior calls (hotspots; max 6)
Only for delicate areas where senior judgment matters:
- Decision
- Recommended approach (pseudocode/snippet allowed)
- Why it’s safer/better (2–4 bullets)
- Alternatives (1–2 bullets) and when to choose them

#### 6) Verification plan
- Tests to add/update (by area)
- Edge cases to validate
- Commands to run (explicit)
- Regression checks (contracts, consumers, interfaces)

#### 7) Risk register (max 10)
For each risk:
- Risk
- Impact (low/med/high)
- Likelihood (low/med/high)
- Mitigation
- Detection (how we’ll notice it broke)

#### 8) Handoff instructions for the other AI (MUST)
- No branches.
- No stage/commit/push without explicit user instruction.
- Implement step-by-step; after each step, run the “Verify” commands.
- If blocked: stop and report blocker + evidence + 1–2 options.
- Produce a brief end report: what changed, what verified, remaining risks.

#### 9) Open questions (max 5)
Only if strictly needed to proceed; otherwise keep empty.
