---
description: JudgeBugs (repo-wide, iterative): validates a FindBugs v3.1 report, filters false positives, penalizes missing consumers, improves diagnosis/fixes, and updates the Bug Registry. Does not change code.
---

# /judgeBugs — Repo-wide Judge (v3.1, iterative, no code changes)

Input: the user pastes a **FindBugs Report v3.1** (and optionally the current Bug Registry).  
Goal: maximize **precision** and improve the quality of reasons/solutions across successive iterations.

> `// turbo` for *read-only* steps. Avoid `// turbo-all`.

---

## Workflow contract
state_file: `.agents/state/bug-registry.yml`  
consumes: `FindBugs Report v3.1` (+ optional registry)  
produces: `JudgeBugs Report v3.1` + `registry_patch` (authority on status)  
next: (manual) apply patch + iterate with `/findBugs`

---

## Golden rules
1) Do not edit code. Do not make commits.
2) Keep the **same order** for the "verdicts per item" section.
3) No positive validations. Only: **KEEP / NEEDS-VERIFY / DROP**.
4) Do not invent: if evidence is missing, do not "complete the story".
5) Recalculate your confidence: do not inherit the finder's number.
6) **Consumer evidence influences confidence:** if `consumers == none_found` and it does NOT appear to be an entrypoint/hook/framework integration, apply a deterministic penalty of **−15 points** to the judge's confidence.
   - If there is reasonable doubt about dynamic consumption, use `dynamic_possible` and do NOT penalize.
7) **Actionability matters:** if `actionability == low`, it CANNOT be KEEP (at most NEEDS-VERIFY).
8) If you recommend a fix: include 1 alternative; if there is none, say so.
9) If an item is really a "refactor/smell", route it to `/findExcellence` instead of treating it as a bug.

## Gates
- **KEEP** (real bug): Confidence (judge, after penalties) **≥ 70%** and `actionability ∈ {high, medium}`
- **NEEDS-VERIFY:** 40–69% or missing evidence or low actionability
- **DROP:** < 40% or contradicted by evidence or already mitigated

---

## Step 0 — Operational prerequisites (manual)
Read `AGENTS.md` before acting.

---

## Step 1 — Repo-wide verification (read-only)

// turbo
```bash
command -v rg >/dev/null 2>&1 && echo "rg: OK" || echo "rg: MISSING"
```

---

## Step 2 — Validate report contract (before judging)
For each BUG-XXX the following must exist:
- Location + Evidence snippet
- context_signature + context_window
- Expected vs actual
- How to confirm

If anything essential is missing → NEEDS-VERIFY or DROP (do not fill in the gaps).

---

## Step 3 — Per-item verification (full repo)
For each BUG-XXX:
1) Open the file and validate the snippet in context.
2) Verify consumers (if the report is not convincing):

// turbo
```bash
rg -n "<symbol/function name>" --hidden --glob '!**/node_modules/**' || true
```

3) If the symbol appears to be an entrypoint/hook (CLI main, framework hook, config loader), mark `dynamic_possible`.
4) Check for existing mitigations/guards that would invalidate the finding.
5) Evaluate whether the proposed repro/test would actually confirm the bug.

---

## Output (MANDATORY)

# JudgeBugs Report v3.1 (repo-wide, iterative)

## Verdicts (same order as input)
- **BUG-001** — Verdict: **KEEP | NEEDS-VERIFY | DROP**
  - **Confidence (judge):** YY%
  - **Confidence adjustments:** <e.g. "−15 (no consumers)" or "none">
  - **Actionability:** <high|medium|low>
  - **Consumers:** <found|none_found|dynamic_possible>
  - **Severity (if KEEP):** I×P = X (adjusted if needed)
  - **What holds / what doesn't:** <1–3 bullets>
  - **Improved diagnosis (if applicable):** <1–3 sentences>
  - **Improved fix (A):** <brief>
  - **Alternative (B):** <brief> / "none"
  - **Introduced risk (by applying the fix):** <short>
  - **Mitigation:** <test/guard/flag/doc>
  - **How to verify (if NEEDS-VERIFY):** <minimal test/repro>
  - **Reason for DROP (if DROP):** <false positive / already mitigated / not demonstrable / duplicate>

## Final ranking (KEEP only; re-ordered by priority)
- **BUG-AAA** — Severity X — Confidence YY% — reason (1 sentence)
- ...

---

## Registry patch (authoritative)
registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert:
    - id: "BUG-001"
      title: "<short title>"
      status: "<KEEP|NEEDS_VERIFY|DROP|FIXED|DUPLICATE>"
      severity:
        impact: <0-5>
        probability: <0-5>
        score: <0-25>
      confidence_finder: <0-100 or unknown>
      confidence_judge: <0-100>
      confidence_adjustments: "<short or none>"
      actionability: "<high|medium|low>"
      consumers: "<found|none_found|dynamic_possible>"
      consumers_evidence: "<knip|rg|manual + brief>"
      location: "<file>:<lines>"
      evidence_snippet: "<1-5 lines>"
      context_signature: "<signature/header>"
      context_window: "<±3 lines>"
      expected_vs_actual: "<short>"
      root_cause: "<short>"
      verification: "<short repro/test>"
      fix_a: "<short>"
      fix_b: "<short or none>"
      introduced_risk: "<short>"
      mitigation: "<short>"
      drop_reason: "<if DROP>"
      notes: "<short>"
      evidence_delta: "<short or none>"
      verification_delta: "<short or none>"
      fix_delta: "<short or none>"
