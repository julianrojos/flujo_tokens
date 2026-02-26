---
description: JudgeBugs: validates a FindBugs report point-by-point, drops false positives, improves diagnosis/fixes, and re-ranks. No code changes.
---

# /judgeBugs — Validate & improve FindBugs report (no code changes)

Input: user pastes a **FindBugs Report v1** produced by `/findBugs`.  
Goal: maximize **precision** (drop noise) and improve diagnosis/fixes.

## Rules of engagement
1) Do **not** edit code.
2) Keep the **same item order** for the per-item verdict section.
3) No positive validation. Only: KEEP / NEEDS-VERIFY / DROP.
4) Don’t invent: if evidence is insufficient, don’t “complete the story”.
5) If you recommend a fix: include **one alternative**; if none, admit it.

## Gates
- **KEEP** (as a real bug): Judge confidence **≥ 70%**
- **NEEDS-VERIFY:** 40–69%
- **DROP:** < 40% OR contradicted by evidence OR already mitigated

## Step 1 — Get evidence (staged-first)

// turbo
1) Status:
```bash
git status --porcelain=v1
```

// turbo
2) Diff:
```bash
git diff --staged --no-color || git diff --no-color
```

## Step 2 — Expanded context for cited files
If the report cites file paths, pull expanded context per file:

// turbo
```bash
git diff --staged --no-color -U30 -- <path> || git diff --no-color -U30 -- <path>
```

If a point lacks a path/hunk, treat it as **weaker evidence** (likely NEEDS-VERIFY or DROP).

## Step 3 — Judge each bug (same order as input)
For each BUG-XXX:

1) **Is it actually a bug?** (valid expected vs actual; not a preference)
2) **Is the evidence sufficient?** (hunk/lines; reproducible logic)
3) **Is the root cause coherent?** (or is it symptom-level?)
4) **Does the proposed verification really confirm it?** (test/repro is meaningful)
5) **Is there a better fix?** (simpler / safer / fewer regressions)

Then:
- Set verdict: KEEP / NEEDS-VERIFY / DROP
- Re-score severity if the report over/under-estimated impact/likelihood.

---

## Output template (MANDATORY)

# JudgeBugs Report v1

## Per-item verdicts (same order as input)
- **BUG-001** — Verdict: **KEEP | NEEDS-VERIFY | DROP**
  - **Judge confidence:** YY%
  - **Severity (if KEEP):** I×L = X (adjusted if needed)
  - **What’s true / what’s not:** <1–3 bullets>
  - **Improved diagnosis (if needed):** <1–3 sentences>
  - **Improved fix:** <brief>
  - **Better alternative (if any):** <brief> / “No better alternative with current context”
  - **How to verify (if NEEDS-VERIFY):** <minimal test/repro>
  - **Regression risk + mitigation:** <brief>
  - **Reason for DROP (if DROP):** <why: false positive / already mitigated / not demonstrable>

## Final ranking (KEEP only; re-ordered by priority)
- **BUG-AAA** — Severity X — Judge confidence YY% — reason (1 sentence)
- ...
