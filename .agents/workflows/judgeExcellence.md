---
description: "JudgeExcellence (repo-wide, iterative): evaluates a Repo Excellence Report v2.2. If NO_UPDATES, responds without changes. If items exist, validates evidence, selects Plan A/B, and only proposes Plan C if ≥80% confident. Emits authoritative registry_patch. Does not change code."
---

# /judgeExcellence — Repo-wide excellence judge (v2.2, iterative, no code changes)

Input: the user pastes a **Repo Excellence Report v2.2** (and optionally the current Excellence Registry).  
Goal: maximize **signal/noise ratio**, discard false positives, and improve diagnoses/proposals in each iteration.

> `// turbo` only for *read-only* commands. Avoid `// turbo-all`.

---

## Workflow contract
state_file: `.agents/state/excellence-registry.yml`  
consumes: `Repo Excellence Report v2.2` (+ optional registry)  
produces: `Judge Repo Excellence Report v2.2` + `registry_patch` (authority on status)  
next: (manual) apply patch + iterate with `/findExcellence`

---

## Golden rules
1) **Do not change code.**
2) Evaluate items in the **same order** ("verdicts" section), for auditability.
3) **No positive validations.**
4) **Do not invent**: if the evidence does not support it, lower confidence or discard.
5) **Recalculate your confidence**: do not inherit the finder's numbers.
6) **Plan C only with high certainty:** only propose Plan C if you are **≥ 80% confident** it is better than Plan A and Plan B.
7) If you do not reach 80%, **do not invent a new plan**: choose A or B and add "tweaks" within the chosen plan.
8) Performance: require a **measurement plan** + hot-path hypothesis; if absent, downgrade.
9) **Anti-repetition:** if an item was already DROP/DUPLICATE/IMPLEMENTED and there is no real delta, tend toward DROP.

## Gates (high precision)
- **KEEP:** Confidence (judge) ≥ 85% and actionability ∈ {high, medium}
- **NEEDS-CONTEXT:** 55–84% or missing evidence/delta
- **DROP:** < 55% or contradicted or already exists / not actionable
- **ROUTE-TO-FINDBUGS:** if the item describes incorrect behavior (bug)

---

## Step 0 — Special case: NO_UPDATES
If the input is `Repo Excellence Report v2.2 — NO_UPDATES`, respond **only** with this:

# Judge Repo Excellence Report v2.2 — NO_UPDATES

✅ Nothing to judge: the finder has not provided real deltas in this iteration.

registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert: []

And stop. Do not add anything else.

---

## Step 1 — Prepare repo-wide verification (no diff)

// turbo
```bash
command -v rg >/dev/null 2>&1 && echo "rg: OK" || echo "rg: MISSING"
```

---

## Step 2 — Validate report contract (before judging)
For each **IMP-XXX** the following must exist:
- Location + evidence
- context_signature + context_window
- Complete Plan A (steps + trade-offs + verification)
- If Plan B exists, it must be genuinely different — otherwise it is noise

If anything essential is missing → NEEDS-CONTEXT or DROP.

---

## Step 3 — Per-item verification (full repo)
For each item:
- Open the file and validate snippet and context.
- If needed, search for references and duplication:

// turbo
```bash
rg -n "<key token/snippet from the item>" --hidden --glob '!**/node_modules/**' || true
```

---

## Output — normal (mandatory template)

# Judge Repo Excellence Report v2.2 (repo-wide, iterative)

## Verdicts per item (same order as input)
- **IMP-001** — Verdict: **KEEP | NEEDS-CONTEXT | DROP | ROUTE-TO-FINDBUGS**
  - **Confidence (judge):** YY%
  - **Actionability:** <high|medium|low>
  - **Adjusted type:** <REFACTOR/CLEANUP/ARCH/CONSISTENCY/PERF/TEST-DX> (if changed)
  - **Adjusted priority:** (B−R)=X | Effort: S/M/L (if changed)
  - **What holds / what doesn't:** <1–3 bullets>

  - **Plan A evaluation:** <1–3 bullets>
  - **Plan B evaluation:** <1–3 bullets> / "Not applicable (no Plan B)"
  - **Recommended plan:** A | B
  - **Tweaks to recommended plan (if applicable):** <1–4 concrete bullets>

  - **Plan C (only if ≥80% confident it's better):**
    - Confidence (Plan C is better): **ZZ%**
    - Steps: <2–6 concrete bullets>
    - Trade-offs / risk: <1–2 bullets>
    - Verification: <test/benchmark/check>
    - Why it's better than A/B: <1–2 sentences>

  - **Reason for DROP/NEEDS-CONTEXT (if applicable):** <brief>
  - **If ROUTE-TO-FINDBUGS:** <what looks like a bug + suggested repro/test>

## Final ranking (KEEP only; re-ordered by priority)
- **IMP-AAA** — Priority X — Confidence YY% — reason (1 sentence)
- ...

---

## Registry patch (authoritative)
registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert:
    - id: "IMP-001"
      title: "<short>"
      status: "<KEEP|NEEDS_CONTEXT|DROP|IMPLEMENTED|DUPLICATE>"
      type: "<REFACTOR|CLEANUP|ARCH|CONSISTENCY|PERF|TEST_DX>"
      confidence_finder: <0-100 or unknown>
      confidence_judge: <0-100>
      actionability: "<high|medium|low>"
      priority:
        benefit: <0-5>
        risk: <0-5>
        score: < -5 to 5 >
      location: "<file>:<lines>"
      evidence_snippet: "<one-line>"
      context_signature: "<signature/header>"
      plan_a: "<short>"
      plan_b: "<short or none>"
      recommended_plan: "<A|B|C>"
      churn_signal: "<high|medium|low|unknown>"
      verification: "<short>"
      notes: "<short>"
      delta_summary: "<what improved in this iteration>"
      drop_reason: "<if DROP>"
