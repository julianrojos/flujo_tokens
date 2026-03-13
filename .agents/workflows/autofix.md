---
description: "Autofix working tree (repo-wide working tree only): review and improve unstaged + untracked files file-by-file. Apply bugfixes/refactors only when ≥80% confident the new code is strictly better. Includes safety backups and do-not-touch guards. No branches, no stage/commit."
---

# /autofix — Improve working tree (file-by-file, gated edits)

This workflow reviews and improves the **working tree** (unstaged + untracked) file-by-file.
It may edit code, but only under strict confidence gates.

> IMPORTANT:
> - Do **not** stage (`git add`) or commit (`git commit`) or push.
> - Do **not** create or switch branches.
> - Follow `AGENTS.md` (repo root) and the repo’s coding rules (e.g. `.agent/rules/general-programming-principles.mdc`, or the path specified by `AGENTS.md`).

---

## Core goals
1) Understand working-tree changes file-by-file (internal reasoning; no verbose narration).
2) Fix **bugs** only if you are **≥ 80% confident** your code is strictly better than the current code.
3) Apply **improvements/refactors/optimizations** only if you are **≥ 80% confident** the change is strictly better.
4) Produce a **short final report** of what changed and why.

---

## Hard constraints (MUST)
- MUST NOT run `git add`, `git commit`, `git push`.
- MUST NOT create/switch branches.
- MUST restrict edits to working-tree files (unstaged/untracked) and the minimum adjacent code needed.
- MUST keep diffs minimal and reversible.
- MUST preserve public contracts unless explicitly requested.
- MUST prefer root-cause fixes over symptom patches.

---

## What “strictly better” means (deterministic)
A proposed change is “strictly better” only if:
- It improves **at least 2** of these without clearly worsening any **critical** one:
  - **Critical:** correctness/root cause, regression risk, verifiability (testability / repro clarity)
  - Non-critical: readability, consistency with repo rules, performance (measurable/hot path), smaller blast radius, simpler API
- And you can assign `better_confidence >= 80%`.

If `better_confidence < 80%`, do **not** modify code; only report the issue.

---

## Do-not-touch guard (still review, but never auto-edit)
Some file classes are high-risk to auto-edit. If a file matches any of these, you MUST still review it, but you MUST NOT edit it in this workflow. Only report findings.

Default do-not-touch patterns:
- Lockfiles/manifests: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock`, `go.sum`, `go.mod`
- Generated/build output: `dist/`, `build/`, `coverage/`
- Snapshots: `*.snap`

You may override this guard only if the user explicitly instructs you to edit such files.

---

## Step 0 — Read project rules (no edits)
// turbo
```bash
git rev-parse --show-toplevel
```

Read (no edits):
- `AGENTS.md`
- Coding principles file (e.g. `.agent/rules/general-programming-principles.mdc`, or locate per `AGENTS.md`)

// turbo
```bash
git ls-files | grep -E 'AGENTS\.md$|general-programming-principles\.mdc$' || true
```

---

## Step 1 — Collect working-tree scope (unstaged + untracked)

// turbo
```bash
git status --porcelain=v1
```

### 1.1 Unstaged tracked files (exclude deletes; stable list)
// turbo
```bash
git diff --name-only --diff-filter=ACMRTUXB --no-color
```

### 1.2 Untracked files (new, not staged)
// turbo
```bash
git ls-files --others --exclude-standard
```

### 1.3 Staged files (guard rail)
// turbo
```bash
git diff --staged --name-only --no-color || true
```

Rules:
- Primary target set = `unstaged_tracked_files + untracked_files` (sorted, unique).
- If a file is present in `staged_files`, you MUST still **review** it, but you SHOULD avoid editing it:
  - Default: **NO EDIT** for staged files (report only).
  - Exception: only edit if `better_confidence >= 90%` and the change is clearly confined to the working-tree delta, and you explicitly report that the file had staged changes.

---

## Step 1.5 — Safety snapshot (recommended before editing)

These backups are written inside `.git/` and do not stage/commit anything.

// turbo
```bash
# tracked working-tree diff backup (includes --binary so it can be reversed more reliably)
git diff --binary --no-color > .git/autofix.before.patch 2>/dev/null || true
```

// turbo
```bash
# untracked list (always)
git ls-files --others --exclude-standard > .git/autofix.untracked.list 2>/dev/null || true
```

(Optional, if `tar` is available: backup untracked contents)
// turbo
```bash
command -v tar >/dev/null 2>&1 && git ls-files --others --exclude-standard -z | tar --null -T - -czf .git/autofix.untracked.tgz || true
```

Rollback note:
- To revert tracked changes you made during this workflow:
  - `git apply -R .git/autofix.before.patch` (may fail if later edits diverge; report if it fails)

---

## Step 2 — Review each file (internal comprehension, then gated edits)

Process files in stable order: lexicographically by path.

For each file in the target set:

### 2.1 Get the delta
- If **unstaged tracked** file:
  // turbo
  ```bash
  git diff --no-color -- <path>
  ```
- If **untracked** file:
  // turbo
  ```bash
  git diff --no-index --no-color -- /dev/null "<path>" || true
  ```

### 2.2 Read surrounding context (as needed, read-only)
// turbo
```bash
sed -n '1,260p' "<path>" 2>/dev/null || true
```

### 2.3 Identify candidates (two buckets)
A) **BUG candidates** (root-cause issues)
- Wrong logic, incorrect assumptions, unsafe coercions, missing validation, error handling holes, concurrency issues, etc.

B) **IMPROVEMENT candidates**
- Small refactors, clarity improvements, architecture consistency, measurable hot-path optimizations.

### 2.4 Gate and apply edits (ONLY if allowed and ≥80% better)
For each candidate:
- Decide:
  - `type`: BUGFIX | IMPROVEMENT
  - `better_confidence`: 0–100
  - `why_strictly_better`: 2–4 bullets (criteria-based)
  - `verification`: minimal test/repro or safe command

Rules:
- If file matches do-not-touch patterns: **NEVER EDIT** (report only).
- If file is staged: default **NEVER EDIT**; exception only with `better_confidence >= 90%` (report that staged existed).
- If `better_confidence >= 80%` and edits are allowed: apply the change **now** to the working tree.
- Else: do **not** edit; record it as “Detected but not changed (below threshold or guarded)”.

Additional constraints:
- Avoid style-only churn (rename/reformat) unless it reduces risk or clarifies correctness.
- Avoid large mechanical changes (mass reformat, wide renames) in this workflow.

---

## Step 3 — Verify locally (cheap + safe)

After edits:

// turbo
```bash
git diff --no-color
```

### 3.1 Whitespace/error check (cheap)
// turbo
```bash
git diff --check --no-color || true
```

### 3.2 Conflict marker scan (only in working tree files)
Prefer `rg` if available, otherwise fallback to `grep`.

// turbo
```bash
command -v rg >/dev/null 2>&1 && rg -n "^(<<<<<<<|=======|>>>>>>>)" --hidden --glob '!**/node_modules/**' || true
```

// turbo
```bash
command -v rg >/dev/null 2>&1 || grep -RIn "^(<<<<<<<|=======|>>>>>>>)" . 2>/dev/null || true
```

Then:
- Prefer the repo’s recommended commands from `AGENTS.md` (tests/typecheck).
- If none are specified, run only quick sanity checks that are clearly safe for your stack.
- Do not install dependencies or run destructive commands without permission.

If verification fails:
- Stop.
- If you can safely revert the last change, do it.
- Otherwise, propose rollback via `.git/autofix.before.patch` and report failure with evidence.

---

## Step 4 — Final report (SHORT, mandatory)

Output ONLY this structure:

# /autofix report

## Changed (applied, ≥80%)
- <file>
  - <BUGFIX|IMPROVEMENT> — better_confidence: XX%
  - what changed (1–2 sentences)
  - why strictly better (2 bullets max)
  - verification (what ran / what to run)

## Detected but NOT changed (below threshold or guarded)
- <file>
  - <BUG|IMPROVEMENT> — reason not changed (1 sentence)
  - suggested next check (1 bullet)

## Skipped edits (guard rails)
- staged files (no-edit by default): [<paths>]
- do-not-touch matches (review-only): [<paths>]

## Notes
- untracked included: <list or []>
- reminder: no branch/stage/commit performed
