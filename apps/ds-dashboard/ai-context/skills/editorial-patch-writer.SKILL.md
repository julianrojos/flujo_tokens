# SKILL: editorial-patch-writer

## Purpose

Use `ComponentDocOutput` as the canonical base and enrich it with editorial judgment through `EditorialPatch`, without contradicting or rewriting it.

---

## Golden Rule

The patch complements, it does not rewrite.

If the first call extracted:

- 4 variants, the patch cannot ignore them or invent a fifth

## What It Must Produce

It may populate:

- `summary`
- `purpose`
- `when_to_use`
- `when_not_to_use`
- `content_guidelines`
- `rules[]`
- `accessibility`
- `related_components[]`
- `qa[]`

---

## Editorial Rules

### 1. Summary

- It may improve the clarity or scannability of the summary
- It must not contradict facts from the base block

### 2. Purpose

- One sentence
- Describe the user or interface problem it solves
- Do not describe its appearance
- Do not use empty language

Correct:

- `Allows a primary action to be started with high visibility within a view.`

Incorrect:

- `It is a blue button with an optional icon.`

### 3. when_to_use / when_not_to_use

Base this on:

- variants
- states
- component type

If the component has a `destructive` variant, it should be reflected if relevant.
If it does not have a `loading` state, do not invent it.

### 4. content_guidelines

Only include this when the component has real content:

- labels
- helper text
- placeholders
- titles
- descriptions

It must be actionable and component-specific.

### 4.1 Content Resilience

When applicable, document how the component should behave with non-ideal content:

- long text in labels, titles, or descriptions
- truncation (if it exists) and its usage criteria
- wrapping (if it exists) and expected limits

Do not assume browser default behavior as a component rule.
If the behavior is not verifiable from available evidence:

- use `[To confirm with dev]`
- use `TBD`

### 5. accessibility

Accessibility in the patch must reflect Figma's limits.

#### Mandatory editorial minimum

The patch must always include the `accessibility` block.
If there is not enough evidence, include at least one note in `notes[]` with:

- `TBD`
- `[To confirm with dev]`

#### role

Do not treat the role as fact unless there is very strong evidence.
Use this logic:

- `verified` if there is verifiable external evidence
- `recommended` if it is the most likely option based on name + structure
- `unknown` if there is not enough basis

From Figma-only, by default:

- use a conservative suggestion
- mark with `[To confirm with dev]`

#### labeling.rules[]

They must be actionable instructions:

- `If the component renders without visible text, provide an accessible name through aria-label or an equivalent mechanism.`
- `If the visible label changes by variant, verify that the accessible name remains stable.`

Do not use generic reminders such as “meets WCAG”.

#### notes[]

Use for:

- keyboard
- screen reader
- focus management
- announcements

whenever they cannot be verified from Figma.

Mark with:

- `[To confirm with dev]`
- `[Outside Figma scope]`

### 7. related_components[]

Be very conservative.
Only include when there is enough evidence, ideally:

- shared naming
- common prefix in the library
- very clear proximity in the system family

If there is no evidence, leave it empty.

### 8. qa[]

`qa[]` is not a generic checklist.
Each item must be a question specific to THIS component.

Incorrect:

- `Does it meet accessibility requirements?`

Correct:

- `Does the \`destructive\` variant require confirmation before executing the action?`

### 9. Terminology consistency

Reuse naming from `ComponentDocOutput`. Do not rename fields without justification (RULES.md Rule 8).

### 10. Normative claims

Do not claim normative compliance (WCAG, legal) without a verifiable audit. Use `TBD` or `[To confirm with dev]` (RULES.md Rule 14).

---

## What It Must NOT Do

- Do not invent variants that are not present in `ComponentDocOutput`
- Do not present inferred accessibility as verified
- Do not claim normative compliance without a verifiable audit
- Do not fill gaps with undeclared conventions
