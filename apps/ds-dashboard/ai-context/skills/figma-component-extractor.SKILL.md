# SKILL: figma-component-extractor

## Purpose

Read the output from the Figma MCP plugin and populate `ComponentDocModelOutput` with precision, traceability, and honesty.

This skill **extracts facts**. It does not write editorial guidance or fill gaps with intuition.

`ComponentDocOutput` is reserved for the final backend artifact, after rendering `markdown`.

---

## What It Must Produce

It must populate at least:

- `schemaVersion`
- `componentId`
- `title`
- `summary`
- `variants[]`
- `states[]` if the schema already supports it
- `accessibilityFacts[]` if the schema already supports it
- `metadata`

It may add:

- `confidence`
- `unresolvedQuestions[]`
- `structureWarning`

---

## Extraction Rules

### 1. Summary

- It must be brief and factual.
- Describe what the component is and which main parts or configurations it exposes.
- Do not include `purpose`, `when_to_use`, `when_not_to_use`, or usage recommendations.

### 2. Variants

Classify each variant property before documenting it. Apply `variant-state-classifier` rules for all classification decisions.

`properties` must preserve the exact values from Figma, without reinterpretation or translation.

### 3. States

If the schema supports `states[]`, populate it as a first-class field.

**Visual state yes; real behavior no** (RULES.md Rule 4). You may document that a visual `hover` or `disabled` variant exists; you may not claim real focus management, keyboard support, async loading, or screen reader behavior.

When documenting states, note which interaction-relevant states are present:

| State | Signal it provides |
|---|---|
| `hover` | Component responds to cursor — likely interactive |
| `pressed` | Responds to pointer press — likely a trigger |
| `selected` / `checked` | Can be in two logical states — likely toggle or selection |
| `expanded` | Has a collapsed counterpart — likely disclosure |
| `focus` | Participates in keyboard flow — confirm with dev |
| `loading` | Has async behavior — confirm with dev |

Do not interpret these as behavior. Document them as observable cues only. The `editorial-patch-writer` uses them as inference sources for the `behavior` field.

### 4. Accessibility facts

If the schema supports `accessibilityFacts[]`, limit it to observable facts or clearly marked inferences.

Allowed examples:

- `isInteractive: inferred`
- `hasTextLabel: observed`
- `possibleRole: recommended`
- `requiresAccessibleName: recommended`

Never present as verified:

- definitive ARIA role
- final labeling
- keyboard behavior
- real announcements

### 5. StructureWarning

Emit `StructureWarning` when:

- variants mix categories without a clear pattern
- the component does not meet a minimum readable structure threshold

In that case:

- lower overall confidence
- do not compensate with aggressive inference

## What This Call Must NOT Do

- Do not generate `purpose`
- Do not generate `when_to_use`
- Do not generate `when_not_to_use`
- Do not generate `do/dont`
- Do not infer real behavior from Figma visual states
- Do not declare accessibility as verified without evidence
