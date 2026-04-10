# SKILL: variant-state-classifier

## Purpose

Avoid the most common mistake when documenting components from Figma:
mixing **states**, **structural variants**, and **optional props**.

This skill can be used:
- inside `figma-component-extractor`
- as a shared step before `editorial-patch-writer`
- as validator support

---

## Central Rule

Classify first. Document later.

---

## Official Categories

### 1. Visual states
A component can only be in one of these at a time within the same state axis.

Accepted states:
- `default`
- `hover`
- `pressed`
- `active`
- `focus`
- `disabled`
- `error`
- `success`
- `loading`
- `selected`
- `expanded`
- `checked`

### 2. Structural variants
Static component configuration.

Typical groups:
- `size`: `xs/sm/md/lg/xl`
- `hierarchy` or `emphasis`: `primary/secondary/tertiary/ghost`
- `style` or `appearance`: `filled/outlined/tonal`
- `density`: `compact/default/comfortable`

### 3. Optional props
Booleans or presence toggles.

Examples:
- `has-icon`
- `has-badge`
- `is-full-width`
- `show-label`
- `show-description`

---

## Classification Heuristics

### Detect states
If a property or a value contains:
- `hover`
- `focus`
- `pressed`
- `active`
- `disabled`
- `error`
- `loading`
- `selected`
- `checked`

Classify it as a state, unless there is clear evidence otherwise.

### Detect structural variants
If the value represents:
- size
- style
- hierarchy
- density
- layout

Classify it as a structural variant.

### Detect optional props
If the property is boolean or its naming implies presence/absence:
- `has`
- `show`
- `with`
- `is`

Classify it as an optional prop.

---

## ID Convention

Suggested:
- `state-*`
- `variant-*`
- `prop-*`

Examples:
- `state-disabled`
- `variant-size-sm`
- `variant-appearance-outlined`
- `prop-has-icon`

### Tolerance rule
If the classifier cannot determine a correct prefix with enough confidence:
- use a stable and readable id
- trigger a warning in validation
- do not block on that alone

## Design Debt

If a property mixes categories, for example:
- `Type: primary-disabled`
- `Size: small-loading`
- `State: secondary-hover`

then:
- document it exactly as it comes from Figma
- mark it as **design debt**
- note it in `qa[]`, `unresolvedQuestions[]`, or internal warnings

Do not try to silently “fix” the source.

## What It Must NOT Do

- Do not invent new categories
- Do not assume real behavior from states
- Do not rewrite Figma's exact values
- Do not hide bad naming behind “pretty” ids
