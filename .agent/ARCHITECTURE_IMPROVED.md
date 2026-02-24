# Improved Architecture: Rules + Skills Validation Pipeline

**Current State vs. Proposed State**

---

## CURRENT ARCHITECTURE (Problems)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DESIGNER / DEVELOPER                        │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────────┐
            │  Writes Markdown   │
            │   or YAML Spec     │
            └────────────────┬───┘
                             │
                    ❌ No validation
                    ❌ Depends on AI interpretation
                    ❌ Rules are prose only
                             │
                             ▼
        ┌────────────────────────────────────┐
        │   Manual Review by Domain Expert   │
        │   (Time-consuming, error-prone)    │
        └────────────┬───────────────────────┘
                     │
        ❌ Errors slip through
        ❌ Agent compatibility unknown
        ❌ Violations not caught pre-commit
                     │
                     ▼
        ┌────────────────────────────────────┐
        │  Committed to Repository           │
        │  (Documentation Quality = Unknown) │
        └────────────────────────────────────┘

RESULT: 40% error catch rate, agent-dependent behavior, ambiguous rules
```

---

## PROPOSED ARCHITECTURE (Solution)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      DESIGNER / DEVELOPER                                │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                    ┌───────────┴────────────┐
                    ▼                        ▼
            ┌──────────────────┐   ┌────────────────────┐
            │  Writes Markdown │   │  Writes YAML Spec  │
            │   or Skill.md    │   │  or .mdc Rule      │
            └────────┬─────────┘   └─────────┬──────────┘
                     │                       │
                     │                       │
        ╔════════════════════════════════════════════════════╗
        ║  ✅ NEW: VALIDATION LAYER (Automated)             ║
        ╠════════════════════════════════════════════════════╣
        ║                                                    ║
        ║  1. JSON SCHEMA VALIDATION                        ║
        ║     ├─ .agent/rules/_schemas/*.json               ║
        ║     └─ Validates structure (not prose)            ║
        ║                                                    ║
        ║  2. RULE COMPLIANCE CHECKER                       ║
        ║     ├─ Enforces agent_expectations                ║
        ║     ├─ Checks requires_rules versions             ║
        ║     └─ Verifies all required fields present       ║
        ║                                                    ║
        ║  3. SLOT CONTRACT VALIDATOR                       ║
        ║     ├─ inputs/outputs match types                 ║
        ║     └─ Default values resolve correctly           ║
        ║                                                    ║
        ║  4. PROHIBITED PATTERNS DETECTOR                  ║
        ║     ├─ VariableID: not in prose                   ║
        ║     ├─ TBD placement correct                      ║
        ║     └─ Token references resolvable                ║
        ║                                                    ║
        ║  5. AGENT COMPATIBILITY TESTER                    ║
        ║     ├─ Run skill with each compatible_agents      ║
        ║     └─ Validate output vs. expectations           ║
        ║                                                    ║
        ║  6. VERSION COMPATIBILITY CHECKER                 ║
        ║     ├─ requires_rules satisfied                   ║
        ║     └─ No breaking changes detected               ║
        ║                                                    ║
        ║  ⏱️  TOTAL TIME: <30 seconds per commit           ║
        ║                                                    ║
        ╚════════════════════════════════════════════════════╝
                             │
                    ┌────────┴────────┐
                    │                 │
                ✅ PASS         ❌ FAIL
                    │                 │
                    ▼                 ▼
        ┌───────────────────┐  ┌──────────────────┐
        │  Merge Allowed    │  │  Block PR        │
        │  (Automated)      │  │  Show Violations │
        │                   │  │  Suggest Fix     │
        └─────────┬─────────┘  └────────┬─────────┘
                  │                     │
                  │          ┌──────────┘
                  │          │
                  │          ▼
                  │     ┌──────────────────┐
                  │     │  Developer Fixes │
                  │     │  Issues & Retries│
                  │     └────────┬─────────┘
                  │              │
                  │              └─────────┐
                  │                        │
                  ▼                        ▼
        ┌─────────────────────────────────────┐
        │  Committed to Repository            │
        │  (✅ Validation Passed)              │
        │  (✅ All Rules Compliant)            │
        │  (✅ Agent-Agnostic)                 │
        │  (✅ Quality Assured)                │
        └─────────────────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────────────────┐
        │  Weekly Coverage Report             │
        │  (Rule compliance metrics)          │
        │  Monthly Quality Audit              │
        │  (Ambiguity score, skill health)    │
        └─────────────────────────────────────┘

RESULT: 95% error catch rate, agent-agnostic, unambiguous rules
```

---

## Detailed Validation Pipeline Flow

### Flow 1: Spec YAML Validation

```
Developer writes: docs/_spec/components/alert.yml
                            │
                            ▼
        ┌──────────────────────────────────────┐
        │  1. Schema Validation                │
        │     Validate against:                │
        │     .agent/rules/_schemas/           │
        │     component-spec-yaml.schema.json  │
        └────┬─────────────────────────────────┘
             │
        ❌ ERROR: status = "in_progress" (not in enum ["draft", "ready"])
        ❌ ERROR: Missing required field "anatomy"
        ✅ PASS: All structure correct
             │
             ▼
        ┌──────────────────────────────────────┐
        │  2. Rule Compliance                  │
        │                                      │
        │  ✅ component-name-normalization:   │
        │     name = "Alert" (PascalCase OK)  │
        │                                      │
        │  ✅ component-spec-properties-order:│
        │     properties sorted correctly      │
        │                                      │
        │  ❌ token-references:                │
        │     Token path "Primary" unresolved  │
        │     (not in token-registry.json)     │
        └────┬─────────────────────────────────┘
             │
        ❌ BLOCK: Add to ## Gaps / TBD
        ✅ PASS: All checks passed
             │
             ▼
        ┌──────────────────────────────────────┐
        │  3. Evidence Gating                  │
        │                                      │
        │  ✅ No invented properties           │
        │  ✅ All values from Figma source     │
        │  ✅ Accessibility documented        │
        └────┬─────────────────────────────────┘
             │
        ✅ PASS: Ready for markdown generation
```

### Flow 2: Markdown Generation + Validation

```
Skill: ds-component-doc generates markdown
       from spec YAML
                │
                ▼
    ┌───────────────────────────────────┐
    │  1. Frontmatter Validation        │
    │                                   │
    │  doc_type: component ✅           │
    │  doc_status: draft ✅             │
    │  figma.component_set_node_id: 123:456 ✅
    │  pipeline.spec_sha256: <hash> ✅  │
    └────┬──────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │  2. Content Structure Validation  │
    │                                   │
    │  ## Overview ✅                   │
    │  ## Anatomy ✅                    │
    │  ## Component API ✅              │
    │  ## Visual Specifications ✅      │
    │  ## Variants ✅                   │
    │  ## States ✅                     │
    │  ## Usage Guidelines ✅           │
    │  ## Content Guidelines ✅         │
    │  ## Accessibility ✅              │
    │  ## Related Components ✅         │
    │  ## Gaps / TBD ✅                 │
    │                                   │
    │  ❌ EXTRA: ## Examples (not allowed)
    └────┬──────────────────────────────┘
         │
    ❌ FAIL: Remove ## Examples section
    ✅ PASS: All sections canonical
         │
         ▼
    ┌───────────────────────────────────┐
    │  3. Language & Tone Check         │
    │                                   │
    │  ❌ Found: "intuitive" (marketing)│
    │  ❌ Found: "seamless" (marketing) │
    │  ✅ All evidence-based            │
    └────┬──────────────────────────────┘
         │
    ❌ FAIL: Rewrite with neutral tone
    ✅ PASS: Tone is technical
         │
         ▼
    ┌───────────────────────────────────┐
    │  4. Token Reference Check         │
    │                                   │
    │  ✅ `Semantic.Color.Primary`      │
    │     → #3B82F6                     │
    │                                   │
    │  ❌ `Invalid.Token.Path`          │
    │     (not in registry)             │
    │                                   │
    │  ❌ `VariableID:12345:6789`       │
    │     (internal ID in prose)        │
    └────┬──────────────────────────────┘
         │
    ❌ FAIL: Fix token references
    ✅ PASS: All tokens valid
         │
         ▼
    ┌───────────────────────────────────┐
    │  5. Gaps / TBD Determinism        │
    │                                   │
    │  ✅ Present: has unresolved gaps  │
    │  ✅ Format: checkbox list         │
    │  ✅ Ordering: canonical           │
    │  ✅ Or: Absent when no gaps       │
    └────┬──────────────────────────────┘
         │
    ✅ PASS: Deterministic contract
         │
         ▼
    ┌───────────────────────────────────┐
    │  6. Figma Traceability            │
    │                                   │
    │  ✅ node-id included in URL       │
    │  ✅ component_set_node_id matches │
    │  ✅ last_verified: date           │
    └────┬──────────────────────────────┘
         │
    ✅ PASS: All validations succeeded
         │
         ▼
    ┌───────────────────────────────────┐
    │  ✅ MARKDOWN READY FOR COMMIT     │
    │  (Auto-update overview.md)        │
    │  (Refresh component-registry.json)│
    └───────────────────────────────────┘
```

### Flow 3: Skill Compatibility Testing

```
Developer pushes: .agent/skills/document-design-system/
                  ds-component-doc/SKILL.md
                             │
                             ▼
        ┌─────────────────────────────────────┐
        │  1. Load SKILL.md Frontmatter       │
        │                                     │
        │  name: ds-component-doc             │
        │  version: 1.3.0                     │
        │  requires_rules:                    │
        │    - component-doc: >=1.0.0         │
        │    - token-references: >=1.1.0      │
        │  compatible_agents:                 │
        │    - claude                         │
        │    - codex                          │
        │    - gemini                         │
        └────┬──────────────────────────────┘
             │
        ┌────▼──────────────────────────────┐
        │  2. Version Compatibility Check   │
        │                                   │
        │  ✅ component-doc v1.0.0 avail   │
        │     (>=1.0.0 satisfied)           │
        │                                   │
        │  ❌ token-references v1.0.5      │
        │     (requires >=1.1.0, missing!)  │
        └────┬──────────────────────────────┘
             │
        ❌ FAIL: Update requires_rules range
        ✅ PASS: All dependencies satisfied
             │
             ▼
        ┌──────────────────────────────────────┐
        │  3. Agent Compatibility Testing      │
        │                                      │
        │  For each in [claude, codex, gemini]:│
        │                                      │
        │  Agent: claude                       │
        │  ├─ Run skill with fixture.yml       │
        │  ├─ Validate vs. agent_expectations │
        │  │  ✅ No invention                  │
        │  │  ✅ TBD placement correct         │
        │  │  ✅ Token resolution deterministic│
        │  │  ✅ Canonical headings only       │
        │  └─ ✅ PASS                          │
        │                                      │
        │  Agent: codex                        │
        │  └─ ✅ PASS                          │
        │                                      │
        │  Agent: gemini                       │
        │  ├─ Run skill with fixture.yml       │
        │  ├─ ❌ Output has ## Examples (not   │
        │  │     in canonical list)            │
        │  └─ ❌ FAIL: Gemini compatibility   │
        │                                      │
        └────┬─────────────────────────────────┘
             │
        ❌ BLOCK: Fix gemini behavior or remove from compatible_agents
        ✅ PASS: All agents compatible
             │
             ▼
        ┌──────────────────────────────────────┐
        │  4. Slot Contract Validation         │
        │                                      │
        │  inputs:                             │
        │  ├─ component_name: required ✅      │
        │  ├─ spec_file: path, has default ✅ │
        │  └─ token_files: path[], optional ✅ │
        │                                      │
        │  outputs:                            │
        │  ├─ markdown_file: path expression ✅│
        │  ├─ overview_file: path expression ✅│
        │  └─ report: report type ✅           │
        │                                      │
        └────┬─────────────────────────────────┘
             │
        ✅ PASS: All slots valid
             │
             ▼
        ┌──────────────────────────────────────┐
        │  ✅ SKILL APPROVED FOR MERGE         │
        │  (Health score: 92/100)              │
        │  (All agents compatible)             │
        │  (Dependencies satisfied)            │
        └──────────────────────────────────────┘
```

---

## Metrics & Observability

### Weekly Coverage Report

```
Rule Coverage Analysis (2026-02-24)
═══════════════════════════════════════════════════════════════

✅ HIGH COMPLIANCE (95-100%)
───────────────────────────────────────────────────────────────
component-spec-yaml       29/30 docs  (96%) ─→ 1 violation: alert.yml
inclusive-docs           28/30 docs  (93%) ─→ 2 violations: button.md, card.md
component-doc           30/30 docs  (100%) ✅

⚠️  MEDIUM COMPLIANCE (80-94%)
───────────────────────────────────────────────────────────────
token-references        24/30 docs  (80%) ─→ 6 violations: unresolved tokens
component-figma-trace   25/30 docs  (83%) ─→ 5 violations: missing node-id

❌ LOW COMPLIANCE (<80%)
───────────────────────────────────────────────────────────────
design-token-discrepancies  12/30 docs  (40%) ─→ DEPRECATED? Consider consolidating
markdown-lifecycle-status   22/30 docs  (73%) ─→ Needs examples
docs-language-tone        18/30 docs  (60%) ─→ Still ambiguous after examples

RECOMMENDATIONS:
1. High compliance rules: No action (maintain)
2. Medium compliance rules: Review violations, update docs
3. Low compliance rules:
   - design-token-discrepancies: Merge into component-doc or deprecate?
   - markdown-lifecycle-status: Add more violation examples
   - docs-language-tone: Review rule definition for clarity
```

### Monthly Health Dashboard

```
SKILL HEALTH REPORT (2026-02-28)
═══════════════════════════════════════════════════════════════

ds-component-doc (v1.3.0)
├─ Inputs/Outputs: ✅ 5/5 slots defined
├─ Has Test Fixtures: ✅ 8 test fixtures
├─ Version Metadata: ✅ SemVer + changelog
├─ Agent Compatibility: ✅ 3/3 agents passing
├─ Rule Dependencies: ✅ 16/16 satisfied
├─ Health Score: 92/100
└─ Status: ✅ PRODUCTION READY

ds-spec-from-figma (v1.1.1)
├─ Inputs/Outputs: ✅ 6/6 slots
├─ Has Test Fixtures: ⚠️ 2/5 test cases
├─ Version Metadata: ✅ SemVer
├─ Agent Compatibility: ✅ 3/3 agents
├─ Rule Dependencies: ✅ 7/7 satisfied
├─ Health Score: 76/100
└─ Status: ⚠️  NEEDS WORK (add test fixtures)

ds-markdown-to-figma-section (v0.8.0)
├─ Inputs/Outputs: ❌ Missing outputs block
├─ Has Test Fixtures: ❌ 0 fixtures
├─ Version Metadata: ⚠️ No changelog
├─ Agent Compatibility: ❌ Not tested
├─ Rule Dependencies: ❌ Not declared
├─ Health Score: 32/100
└─ Status: 🔴 BLOCKERS (multiple issues)

MONTHLY TREND:
═════════════════════════════════════════════════════════════
                Week 1   Week 2   Week 3   Week 4   Trend
ds-component-doc  85 ──→  88 ──→  90 ──→  92 ────→  ↑ IMPROVING
ds-spec-from-figma 70 ──→  72 ──→  75 ──→  76 ────→  ↑ SLOW
ds-markdown-...    25 ──→  28 ──→  32 ──→  32 ────→  ⚠️  STALLED

ACTION ITEMS:
1. ds-markdown-to-figma-section: URGENT
   - Add inputs/outputs slots
   - Create test fixtures
   - Declare requires_rules dependencies

2. ds-spec-from-figma:
   - Add remaining 3 test fixtures

3. Review rule coverage regressions in week 2-3 for token-references
```

---

## Summary: Before vs. After

| Aspect | Before | After |
| ------ | ------ | ----- |
| **Validation** | Manual, error-prone (40% catch rate) | Automated, <30s (95% catch rate) |
| **Rules** | Prose, ambiguous | Prose + JSON Schema + Examples |
| **Agent Compatibility** | Unknown, breaks on agent change | Tested, declared, enforced |
| **Dependencies** | Manually tracked | Validated by CI |
| **Quality** | No metrics | Weekly coverage + health dashboard |
| **Developer Experience** | Feedback on commit/PR review | Real-time feedback on save (pre-commit) |
| **Time to Fix** | Hours (investigate → fix → review) | Minutes (see error → fix → auto-pass) |

---

## File Structure After Implementation

```
.agent/
├── rules/
│   ├── *.mdc                          ← 30 rule definitions
│   ├── CHANGELOG.md                   ← Version history
│   ├── _schemas/                      ← ✨ NEW
│   │   ├── component-spec-yaml.schema.json
│   │   ├── frontmatter-contract.schema.json
│   │   ├── component-doc.schema.json
│   │   ├── token-references.schema.json
│   │   ├── component-name-normalization.schema.json
│   │   ├── README.md
│   │   └── test-cases/                ← ✨ NEW
│   │       ├── component-spec-yaml.valid.yml
│   │       ├── component-spec-yaml.invalid-*.yml
│   │       └── ... (15+ test cases)
│   ├── _manifest.yml                  ← Updated with has_schema, has_examples
│   └── RULE_QUALITY_SCORECARD.md      ← ✨ NEW
│
├── skills/
│   ├── document-design-system/
│   │   ├── ds-component-doc/
│   │   │   ├── SKILL.md               ← Updated: agent_expectations
│   │   │   └── test-fixtures/         ← ✨ NEW
│   │   │       ├── spec_with_tbd.yml
│   │   │       └── ...
│   │   └── ...
│   └── design-tokens-advisor/
│
└── IMPLEMENTATION_ROADMAP.md           ← ✨ NEW (this planning doc)
└── QUICK_WINS.md                       ← ✨ NEW (quick start)
└── ARCHITECTURE_IMPROVED.md            ← ✨ NEW (this file)

tooling/scripts/
├── validate-rules.mjs                 ← ✨ NEW
├── validate-agent-compatibility.mjs   ← ✨ NEW
├── validate-skill-versions.mjs        ← ✨ NEW
├── measure-rule-coverage.mjs          ← ✨ NEW
├── measure-rule-ambiguity.mjs         ← ✨ NEW
└── measure-skill-health.mjs           ← ✨ NEW

.github/workflows/
├── validate-rules.yml                 ← ✨ NEW
├── validate-agents.yml                ← ✨ NEW
├── measure-coverage.yml               ← ✨ NEW
└── skill-health.yml                   ← ✨ NEW

.reports/
├── rule-coverage-2026-02-24.json      ← ✨ AUTO-GENERATED
├── rule-ambiguity-2026-02-24.json     ← ✨ AUTO-GENERATED
└── skill-health-2026-02-24.json       ← ✨ AUTO-GENERATED
```

---

## Next: Implementation

See **`.agent/QUICK_WINS.md`** for immediate actions you can take today.
See **`IMPROVEMENT_PLAN.md`** for full technical breakdown.
See **`IMPLEMENTATION_ROADMAP.md`** for team coordination.
