---
description: FindBugs: finds up to 20 real, actionable bugs with evidence, root cause, repro/test, and fixes; then prioritizes them. No code changes.
---

# /findBugs — Bug hunting (actionable-only, no code changes)

Goal: find **up to 20** plausible, **actionable** bugs backed by evidence.  
Do **not** edit code in this workflow.

## Rules of engagement
1) **No positive validation** (no “looks good”, no ✅).
2) **Actionable-only:** if you cannot propose an action **or** a concrete verification step, **do not report it**.
3) A “BUG” must include: evidence + expected vs actual + why it matters.
4) If you suspect an issue but can’t reach the BUG confidence gate, convert it into a **QUESTION** (max 5).
5) **No duplicates:** if multiple symptoms share one root cause, merge them into one bug entry.

## Gates & limits
- **BUG:** report only if **Confidence ≥ 60%**
- **QUESTION:** if high-risk but **Confidence < 60%**
- **Limits:** max **20 BUG** + max **5 QUESTION**

## Step 1 — Determine scope (staged-first)

// turbo
1) Check status:
```bash
git status --porcelain=v1
```

// turbo
2) Get diff (staged first; fallback to working tree):
```bash
git diff --staged --no-color || git diff --no-color
```

// turbo
3) List changed files:
```bash
git diff --name-only --staged || git diff --name-only
```

## Step 2 — Pull expanded context (read-only)
For each relevant file (changed and highly coupled), capture surrounding context:

// turbo
```bash
git diff --staged --no-color -U30 -- <path> || git diff --no-color -U30 -- <path>
```

Also open the file(s) around the modified functions to understand full control flow (read-only).

## Step 3 — Bug-hunting heuristics (use what matches the stack)

Look especially for:
- **Contract & compatibility:** order dependence, defaults, coercions, “null vs empty”, deterministic output.
- **ESM/Node pitfalls:** JSON loading, `createRequire`, path resolution, `import type`, dual exports.
- **Type safety traps:** `any`/`unknown` without narrowing, unsafe casts, non-null assertions.
- **Silent failures:** swallowed exceptions, ambiguous fallbacks.
- **Concurrency:** `Promise.all` on dependent tasks, missing isolation, races.
- **I/O robustness:** FS/subprocess errors, path normalization.
- **Security basics:** secrets, unvalidated inputs, path traversal risk.
- **Regression risk:** behavior changed without tests/guards.

## Step 4 — Build candidates, then filter hard
For each candidate, produce:

1) **Evidence** (file + lines/hunk + minimal snippet)
2) **Expected vs actual** (1–2 sentences)
3) **Root cause (likely)** (1–3 sentences)
4) **How to confirm** (repro or smallest test to add)
5) **Fix recommended** (brief) + **1 alternative** (brief)  
6) **Scoring**
   - Confidence (0–100) that it is a real bug
   - Impact (0–5)
   - Likelihood (0–5)
   - Effort (S/M/L)

Discard:
- anything already fixed in the diff or nearby context
- anything that becomes “no action / no change needed”
- anything that is just preference

## Step 5 — Prioritize
Sort by:
1) **Severity = Impact × Likelihood** (descending)
2) Confidence (descending)
3) Effort (ascending) as tie-breaker

---

## Output template (MANDATORY)

# FindBugs Report v1

## BUGS (max 20; already prioritized)
- **BUG-001** — Severity: **I×L = X** | Confidence: **YY%** | Effort: **S/M/L**
  - **Location:** <file>:<lines> (or diff hunk)
  - **Evidence:** <minimal snippet/hunk>
  - **Expected vs actual:** <1–2 sentences>
  - **Likely root cause:** <1–3 sentences>
  - **How to confirm:** <repro steps or smallest test>
  - **Fix recommended:** <brief>
  - **Alternative:** <brief> / “No better alternative with current context”
  - **Regression risk:** <what could break + mitigation>

## QUESTIONS (max 5; only high-risk, below BUG gate)
- **Q-01** — <what to check to raise confidence>
  - Evidence partial:
  - What’s missing:
