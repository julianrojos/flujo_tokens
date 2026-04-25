---
description: FindBugs (repo-wide, iterative): discovers and refines real bugs across the entire project with rich evidence (including context), actionability scores, and consumption signals. Uses a Bug Registry to avoid repetition. Does not change code.
---

# /findBugs — Repo-wide bug hunting (v3.1, iterative, actionable-only, no code changes)

This workflow hunts bugs across the **entire repository** (not just the diff) and improves each iteration using a **Bug Registry** as persistent memory.
Do not edit code or make commits.

> `// turbo` only for *read-only* commands. Avoid `// turbo-all`.

---

## Workflow contract
state_file: `.agents/state/bug-registry.yml`  
produces: `FindBugs Report v3.1` + `registry_seed|registry_patch` (to be applied manually)  
next: `/judgeBugs`

---

## Golden rules
1) **No positive validations** (no ✅, no "looks good").
2) **Actionable-only:** if you cannot propose a concrete action or verification, **do not report it**.
3) A "BUG" requires: **evidence + expected vs actual + why it matters + how to confirm**.
4) **No repetition:** if a bug is already in the registry as **DROP/DUPLICATE/FIXED**, do not report it again unless you provide **new evidence** and declare it as `delta`.
5) **No duplicates:** merge symptoms with the same root cause.
6) **Signals ≠ bugs:** patterns (ts-ignore, empty catch, etc.) are hints; they are only a BUG if you can argue expected vs actual and a verification path.
7) **Do not create/edit files automatically.** If you need to create/update the registry, produce the YAML block for the user to copy.

## Thresholds and limits
- **BUG:** report only if **Confidence (finder) ≥ 60%** **and** `actionability ∈ {high, medium}`
- **QUESTION:** plausible risk but not conclusive (max 5)
- **Limits:** max **20 BUG** + max **5 QUESTION**

### Deterministic actionability definition
- **high:** clear minimum verification **and** a reasonable fix plan A (and optional B)
- **medium:** clear minimum verification, but the fix requires investigation or has relevant uncertainty
- **low:** no clear minimum verification (→ must be QUESTION, not BUG)

---

## Step 0 — Operational prerequisites (manual)
- Read `AGENTS.md` at the root before acting.
- Do not commit or modify code.

---

## Step 1 — Load Bug Registry (if it exists)

Standard path: `.agents/state/bug-registry.yml`

If it exists, use it as source of truth to:
- avoid repeating discarded items
- prioritize converting `NEEDS_VERIFY → KEEP/DROP`
- avoid duplicates

If it does NOT exist, continue with an empty registry and generate `registry_seed` at the end.

---

## Step 2 — Map the repo (quick inventory)

// turbo
```bash
git rev-parse --show-toplevel
```

// turbo
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
```

// turbo
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'   | xargs -I{} wc -l "{}" 2>/dev/null   | sort -nr   | head -n 30
```

---

## Step 3 — Repo-wide signals (fast, read-only)

// turbo
```bash
command -v rg >/dev/null 2>&1 && echo "rg: OK" || echo "rg: MISSING"
```

// turbo
```bash
rg -n "(ts-ignore|ts-expect-error|eslint-disable)" --hidden --glob '!**/node_modules/**' || true
```

// turbo
```bash
rg -n "(forEach\(async|await\s+.*for\s*\(|Promise\.all\(|JSON\.parse\(|readFileSync|writeFileSync|spawnSync\(|execSync\()"
  --hidden --glob '!**/node_modules/**' || true
```

// turbo
```bash
rg -n "(catch\s*\(.*\)\s*\{\s*\}|\.catch\(\s*\(.*\)\s*=>\s*\{\s*\}\s*\))"
  --hidden --glob '!**/node_modules/**' || true
```

---

## Step 4 — Dead code / unused exports (optional, preferred if available)

This step helps identify code with no consumers (not always a bug, but adjusts priority/confidence).

### Option A (preferred): Knip (if available)
// turbo
```bash
npx -y knip --version >/dev/null 2>&1 && echo "knip: OK" || echo "knip: MISSING"
```

// turbo
```bash
npx -y knip --include exports,types,nsExports,nsTypes || true
```

### Option B (quick fallback): approximate searches (less reliable)
- Use `rg` to find symbols/exports and then `rg` for call sites/imports.
- Treat as **weak evidence** (mark `consumers: dynamic_possible` if you cannot be certain).

---

## Step 5 — Iteration-guided selection (continuous improvement)

### 5.1 Iteration 1 (if registry is empty)
- Choose **8–12 hotspots**: large files + signals + core modules.
- Discover new candidates up to `max 20` (with gates).

### 5.2 Iterations 2+ (if registry exists)
Prioritize:
1) `NEEDS_VERIFY`: confirm or discard with new evidence and stronger verification.
2) `KEEP` with weak fix: improve verification/fix **only if you provide real delta**.
3) Only if room remains (< 20 active): discover new bugs.

---

## Step 6 — Bug construction and filtering (mandatory contract)

For each BUG candidate:

### 6.1 Evidence (includes context)
- `evidence_snippet`: 1–5 lines from the exact location
- `file_context`:
  - `context_signature`: function/class signature or enclosing block header
  - `context_window`: ±3 lines around the bug (or the relevant conditional block)

### 6.2 Expected vs actual
1–2 sentences. Must be verifiable.

### 6.3 Consumers (signal)
Include a `consumers` field with one of:
- `found`
- `none_found`
- `dynamic_possible` (framework hooks, entrypoints, dynamic imports, etc.)

And brief evidence (`consumers_evidence`): how you determined it (knip/rg/manual).

### 6.4 Minimum verification
A minimal repro or test to add.

### 6.5 Fix
Recommended fix + 1 alternative (only if genuinely different).

### 6.6 Scoring
- Confidence (0–100)
- Actionability (high|medium|low)
- Impact (0–5)
- Probability (0–5)
- Effort (S/M/L)

### 6.7 Delta (if not NEW)
If the bug already existed, add:
- `evidence_delta`
- `verification_delta`
- `fix_delta`

If there is no real delta → do not report it again.

---

## Output (MANDATORY)

# FindBugs Report v3.1 (repo-wide, iterative)

## Metadata
- iteration: <number or unknown>
- registry_path: ".agents/state/bug-registry.yml"
- registry_loaded: <true|false>
- focus: <discovery|verification|mixed>

## BUGS (max 20; prioritized)
- **BUG-001** — Severity: **I×P = X** | Confidence (finder): **YY%** | Actionability: **high|medium** | Effort: **S/M/L**
  - **Status (from registry):** <NEW|NEEDS_VERIFY|KEEP|DROP|FIXED|DUPLICATE|unknown>
  - **Location:** <file>:<lines>
  - **Evidence (minimal):** <evidence_snippet>
  - **File context:**
    - context_signature: <signature/header>
    - context_window: |
        <±3 lines around the bug>
  - **Consumers:** <found|none_found|dynamic_possible>
  - **Consumers evidence:** <knip|rg|manual + brief>
  - **Expected vs actual:** <1–2 sentences>
  - **Likely root cause:** <1–3 sentences>
  - **How to confirm:** <repro or minimal test>
  - **Fix recommended (A):** <brief>
  - **Fix alternative (B):** <brief> / "none"
  - **Regression risk:** <what could break + mitigation>
  - **Delta (required if not NEW):**
    - evidence_delta: <what is new vs previous iteration>
    - verification_delta: <what improved in repro/test plan>
    - fix_delta: <what improved in fix plan>

## QUESTIONS (max 5; high-risk but inconclusive)
- **Q-01** — <what to check to raise confidence>
  - Evidence partial:
  - What's missing:

---

## Registry delta (for the user to apply)
registry_seed:
  schema_version: 1
  updated_at: "<YYYY-MM-DD or unknown>"
  bugs: []

registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert:
    - id: "BUG-001"
      title: "<short title>"
      status: "<NEW|NEEDS_VERIFY|KEEP|DROP|FIXED|DUPLICATE>"
      severity:
        impact: <0-5>
        probability: <0-5>
        score: <0-25>
      confidence_finder: <0-100>
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
      introduced_risk: "<short (risk introduced by applying the fix) or none>"
      mitigation: "<short mitigation (test/guard) or none>"
      notes: "<short>"
      evidence_delta: "<short or none>"
      verification_delta: "<short or none>"
      fix_delta: "<short or none>"
