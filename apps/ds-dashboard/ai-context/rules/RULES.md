# RULES.md

## Cross-cutting Rules for the Entire System

These rules do not belong to a single isolated skill. They should live in the base configuration, system prompt, or shared validation layer.

---

## 1. Parent Rule

Nothing that is not visible or traceable from Figma/MCP or from an explicit system convention may be presented as fact.

---

## 2. Honesty Over Completeness

- Better to leave a field empty than invent it.
- Better to mark an inference as low confidence than present it as resolved.
- Better to return `[To confirm with dev]` than a false certainty.

---

## 3. Separation Between Blocks

### Factual Extraction (`ComponentDocModelOutput`)

Must contain:

- observable facts
- structured extraction
- minimal, clearly marked inferences

### Final Output (`ComponentDocOutput`)

Must contain:

- the validated factual extraction
- the `markdown` rendered by the backend
- the same structured content without expanding model claims

### EditorialPatch

Must contain:

- guidance
- rationale
- recommendations
- QA questions
- unverified accessibility notes

### Never

The patch cannot:

- create new variants
- contradict the base block

---

## 4. Visual State != Real Behavior

You may state:

- that a visual `hover` variant exists
- that a visual `focus` variant exists
- that a visual `disabled` variant exists

You may not state from Figma alone:

- real focus management
- real keyboard support
- real async loading
- correct screen reader announcements

### 4a. Behavior at Conceptual Level (corollary)

The `behavior` field in `EditorialPatch` occupies the legitimate space between "visual state observed" and "implementation confirmed."

It **may** describe:

- the interaction pattern type (`trigger`, `toggle`, `selection`, `disclosure`, `navigation`, `input`, `compound`, `unknown`)
- the expected user outcome in 1–2 sentences, from the user's perspective

It may infer the pattern from:

- component name
- states present in the extraction (`selected`, `checked`, `expanded`, `pressed`)
- the `purpose` field

It **may not** describe without `[To confirm with dev]`:

- keyboard key bindings
- focus order or focus management after activation
- screen reader behavior or ARIA live announcements
- async implementation details
- multi-step confirmation flows

If none of the inference sources yield a credible pattern, set `interactionPattern: unknown`.

---

## 5. Accessibility With Confidence Levels

Any sensitive accessibility claim should be classifiable as:

- `verified`
- `recommended`
- `unknown`

By default, from Figma:

- roles are recommendations, not facts
- labeling requires confirmation
- keyboard support and screen readers are usually outside scope

---

## 6. Single-Mode Figma Limitation

If the plugin exposes only one active mode:

- do not assume the observed value represents all modes
- do not infer full dark mode, high contrast, or brand modes
- mark `modeCoverage: partial` or equivalent when appropriate

---

## 7. StructureWarning

If the component does not meet a minimum readable structure threshold:

- emit `StructureWarning`
- lower overall confidence
- do not compensate with aggressive inference

Typical cases:

- mixed variants without a pattern
- poorly named props or states

---

## 8. Terminology Consistency

Terminology must be consistent between extraction and patch.

Example:

- if the base uses `leading-icon`, the patch must not use `prefix icon` without justification

The validator should mark it as:

- `terminologyMismatch`

---

## 9. Required Placeholders

Use these labels when needed:

- `[Requires review]`
- `[To confirm with dev]`
- `[Inferred description]`
- `[Outside Figma scope]`

Do not replace them with vague language.

---

## 10. Specific QA

`qa[]` must contain component-specific and verifiable questions.

Avoid:

- generic questions
- aspirational statements
- abstract reminders about best practices

---

## 11. Validation Severity

### blocking

- factual contradiction
- accessibility presented as verified without evidence
- untraceable claims
- severely unreadable structure

### warning

- inconsistent terminology
- ambiguous classification
- partial theming
- generic QA

### info

- optional editorial improvement
- future enrichment
- empty optional fields

---

## 12. Publication Rule

Do not publish documentation if:

- there are factual contradictions
- there are claims stronger than the evidence
- the component structure does not meet the minimum threshold
- accessibility looks “resolved” but is not traceable

---

## 13. System Design Rule

Do not design fields for the system you wish you had, but for the system that can support real evidence today.

---

## 14. Normative Claims

Do not claim normative compliance as fact if there is no verifiable audit.

Do not present as verified:

- WCAG compliance (AA/AAA)
- legal or regulatory compliance
- accessibility or quality certifications

If there is no audit evidence:

- use `TBD`
- use `[To confirm with dev]`
- describe only observable facts or recommendations
