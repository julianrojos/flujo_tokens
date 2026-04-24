---
description: "FindExcellence (repo-wide, iterative): detects refactors, cleanup, architecture/consistency improvements, and performance opportunities (excludes bugs). Includes 14-day churn, max 2 plans per item, and a registry to avoid repetition. Stop condition: if there are no real deltas, does not re-emit items."
---

# /findExcellence — Repo-wide excellence scan (v2.2, iterative, no code changes)

This workflow inspects **all project code** (not the diff) and improves each iteration using an **Excellence Registry** as persistent memory.
Do not edit code or make commits.

> `// turbo` only for *read-only* commands. Avoid `// turbo-all`.

---

## Workflow contract
state_file: `.agents/state/excellence-registry.yml`  
produces: `Repo Excellence Report v2.2` + `registry_seed|registry_patch` (to be applied manually)  
next: `/judgeExcellence`

---

## Golden rules
1) **Do not change code.** Analysis only.
2) **Actionable-only:** if you cannot propose a **concrete action** or a **verification/measurement step**, **do not report it**.
3) **No positive validations:** no ✅, no "this is fine", no "valid pattern".
4) **Exclude bugs:** if you see a probable bug (incorrect behavior), send it to **OUT OF SCOPE (BUG?)** and recommend `/findBugs` (max 5).
5) **No redundancies:** if the improvement is already implemented in the repo, **omit it**.
6) **Performance with discipline:** do not propose micro-optimizations without a hot-path hypothesis + measurement plan.
7) **No duplicates:** if several observations share the same root, merge into 1 item.
8) **Max 2 plans per item:** Plan A (required) and Plan B (optional).
9) **Iteration = real improvement:** if an item already exists in the registry, do not re-report it unless you provide real `delta`.
10) **Stop condition (anti-repetition):** if after filtering there are no `NEW` items and no existing items with real `delta`, **do not re-emit items**. Return **only** the "NO_UPDATES" output (defined at the end).

## Gates and limits
- **IMPROVEMENT:** Confidence ≥ 80% **and** actionability ∈ {high, medium}
- **QUESTION:** high value but missing context (max 5)
- **OUT OF SCOPE (BUG?)**: max 5
- **Limits:** max 20 improvements

### Deterministic actionability definition
- **high:** clear steps + clear verification + reasonable cost/risk
- **medium:** clear steps, but verification or impact requires an extra decision/context
- **low:** vague or without verification (→ must be QUESTION, not IMPROVEMENT)

---

## Step 0 — Operational prerequisites (manual)
- Read `AGENTS.md` at the root before acting.
- Do not propose commits or code modifications here.

---

## Step 1 — Map the repo (inventory + churn hotspots)

// turbo
1) Root and structure:
```bash
git rev-parse --show-toplevel
ls -la
```

// turbo
2) Detect workspace (if applicable):
```bash
ls -la package.json pnpm-workspace.yaml yarn.lock package-lock.json 2>/dev/null || true
```

// turbo
3) List code files (tracked):
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
```

// turbo
4) Top largest files (by lines):
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'   | xargs -I{} wc -l "{}" 2>/dev/null   | sort -nr   | head -n 30
```

// turbo
5) Churn hotspots (last 14 days) — top 30 by frequency:
```bash
git log --since="14 days ago" --name-only --pretty=format:   | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$'   | grep -vE '^$'   | sort   | uniq -c   | sort -nr   | head -n 30 || true
```

> Rule: **top churn files** automatically enter hotspot selection, even if they are not the largest.

---

## Step 2 — Repo-wide quick signal scan (read-only)

// turbo
1) Check if `rg` exists:
```bash
command -v rg >/dev/null 2>&1 && echo "rg: OK" || echo "rg: MISSING"
```

// turbo
2) Obvious debt:
```bash
rg -n "(TODO|FIXME|HACK)" --hidden --glob '!**/node_modules/**' || true
```

// turbo
3) Quality degradations:
```bash
rg -n "(eslint-disable|ts-ignore|ts-expect-error)" --hidden --glob '!**/node_modules/**' || true
```

// turbo
4) Accidental noise:
```bash
rg -n "(console\.log|debugger)" --hidden --glob '!**/node_modules/**' || true
```

// turbo
5) Performance signals (candidates; do not assert without context):
```bash
rg -n "(readFileSync|writeFileSync|JSON\.parse\(|forEach\(async|await .*for\s*\()"
  --hidden --glob '!**/node_modules/**' || true
```

// turbo
6) Architecture/consistency signals:
```bash
rg -n "(export \* from|index\.ts$)" --hidden --glob '!**/node_modules/**' || true
```

---

## Step 3 — Select hotspots for deep reading (8–12)
To maintain high signal in large repos, choose **8–12 hotspots** combining:

- **churn hotspots** (Step 1.5): include 4–6 of the most touched
- top large files (Step 1.4): include 2–4
- files with most signals (Step 2): include 2–4
- "core" modules (tooling, services, shared libs, runtime entrypoints)

---

## Step 4 — Build candidates and filter hard (excluding bugs)

For each candidate, produce:
1) **Evidence**: file + lines + minimal snippet
2) **Context**:
   - `context_signature` (function/class signature or enclosing block header)
   - `context_window` (±3 lines around)
3) **Why it improves the repo** (1–3 sentences)
4) **Plans (max 2)**:
   - Plan A: the most reasonable/safe
   - Plan B: alternative only if it adds something different
5) **Verification**: safe test/benchmark/check
6) **Scoring**:
   - Confidence (0–100)
   - Actionability (high|medium|low)
   - Benefit (0–5)
   - Risk (0–5)
   - Effort (S/M/L)
7) **Hotspot rationale**: `churn|size|signals|core`

If the item already existed in the registry, add `delta` (required):
- `evidence_delta`, `plan_delta`, `verification_delta`, `priority_delta`
If there is no real delta → **do not report it**.

---

## Step 5 — Stop condition (REQUIRED)
After applying gates + delta filter:
- If the final `IMPROVEMENTS` set is empty **and**
- there are no `registry_patch.upsert` with real deltas **and**
- there are no new high-value `QUESTIONS`,

Then return **only** the `NO_UPDATES OUTPUT` block (below).

---

## Output A — Normal report (mandatory template)

# Repo Excellence Report v2.2 (repo-wide, iterative)

## Metadata
- iteration: <number or unknown>
- registry_path: ".agents/state/excellence-registry.yml"
- registry_loaded: <true|false>
- churn_window_days: 14
- churn_hotspots_top: ["<file1>", "<file2>", "<file3>"]

## IMPROVEMENTS (max 20; prioritized)
- **IMP-001** — Type: **REFACTOR | CLEANUP | ARCH | CONSISTENCY | PERF | TEST/DX**
  Priority: **(B−R)=X** | Confidence (finder): **YY%** | Actionability: **high|medium** | Effort: **S/M/L**
  - **Status (from registry):** <NEW|NEEDS_CONTEXT|KEEP|DROP|IMPLEMENTED|DUPLICATE|unknown>
  - **Location:** <file>:<lines>
  - **Evidence:** <minimal snippet>
  - **Context:**
    - context_signature: <signature/header>
    - context_window: |
        <±3 lines>
  - **Hotspot rationale:** <churn|size|signals|core>
  - **Why it's an improvement:** <1–3 sentences>

  - **Plan A (required):** <short title>
    - Steps: <2–6 concrete bullets>
    - Trade-offs / risk: <1–2 bullets>
    - Verification: <test/benchmark/check>

  - **Plan B (optional, max 1):** <short title>
    - Steps: <2–6 concrete bullets>
    - Trade-offs / risk: <1–2 bullets>
    - Verification: <test/benchmark/check>

  - **Delta (required if not NEW):**
    - evidence_delta: <new>
    - plan_delta: <new>
    - verification_delta: <new>
    - priority_delta: <new>

## QUESTIONS (max 5; high value but missing context)
- **Q-01** — <what to decide/verify>
  - Partial evidence:
  - What's missing:
  - What decision it unblocks:

## OUT OF SCOPE (BUG?) (max 5)
- **BUG?-01** — <brief>
  - Evidence:
  - Why it looks like a bug:
  - Next step: run `/findBugs` with repro/test.

---

## Registry delta (for the user to apply)
registry_seed:
  schema_version: 1
  updated_at: "<YYYY-MM-DD or unknown>"
  items: []

registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert:
    - id: "IMP-001"
      title: "<short>"
      status: "<NEW|NEEDS_CONTEXT|KEEP|DROP|IMPLEMENTED|DUPLICATE>"
      type: "<REFACTOR|CLEANUP|ARCH|CONSISTENCY|PERF|TEST_DX>"
      confidence_finder: <0-100>
      actionability: "<high|medium|low>"
      priority:
        benefit: <0-5>
        risk: <0-5>
        score: < -5 to 5 >
      location: "<file>:<lines>"
      evidence_snippet: "<one-line>"
      context_signature: "<signature/header>"
      verification: "<short>"
      plan_a: "<short>"
      plan_b: "<short or none>"
      churn_signal: "<high|medium|low|unknown>"
      notes: "<short>"
      evidence_delta: "<short or none>"
      plan_delta: "<short or none>"
      verification_delta: "<short or none>"
      priority_delta: "<short or none>"

---

## Output B — NO_UPDATES OUTPUT (REQUIRED if applicable)
> Return exactly this format, no additional sections.

# Repo Excellence Report v2.2 — NO_UPDATES

✅ No updates: no `NEW` items and no real deltas in existing items; nothing to re-emit with sufficient signal.

registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert: []
