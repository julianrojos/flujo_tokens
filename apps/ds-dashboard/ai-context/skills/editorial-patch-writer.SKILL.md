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
- `behavior`
- `accessibility`
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

### 6. behavior

`behavior` describes what the component does when a person interacts with it, at the **conceptual pattern level** — not at the implementation level.

#### Structure

```
behavior:
  interactionPattern: trigger | toggle | selection | disclosure | navigation | input | compound | unknown
  description: string          # 1–2 sentences, user perspective
  inferredFrom?: string        # brief note on inference source
  notes?: string[]             # [To confirm with dev] items
```

#### interactionPattern values

| Value | Meaning |
|---|---|
| `trigger` | Fires a one-time action (submit, delete, copy) |
| `toggle` | Alternates between two states (on/off, open/close) |
| `selection` | Picks one or more items from a set |
| `disclosure` | Reveals or hides associated content |
| `navigation` | Moves the user to another context or view |
| `input` | Captures user-provided data |
| `compound` | Combines two or more patterns |
| `unknown` | Cannot be determined from available evidence |

#### Inference sources

Derive `interactionPattern` from:

1. **Component name** — Button → `trigger`; Checkbox → `toggle`; Accordion → `disclosure`; Tab → `selection`
2. **States present in extraction** — `selected` or `checked` → strong signal for `toggle` or `selection`; `expanded` → strong signal for `disclosure`
3. **`purpose` field** — if it describes an action outcome, align the pattern with it

#### description

- 1–2 sentences maximum
- Written from the user's perspective: what they initiate and what outcome they expect
- Do not describe appearance
- Do not describe implementation

Correct:
- `Pressing this component submits the associated form or triggers the primary action of the current view.`
- `Activating this component reveals or hides a panel of related content without navigating away.`

Incorrect:
- `On click, it dispatches a Redux action.`
- `Uses useCallback to debounce the handler.`

#### What behavior CANNOT claim

Without `[To confirm with dev]`:

- Keyboard shortcuts or key bindings (Tab, Enter, Space, Arrow keys)
- Focus management after activation
- Screen reader announcements or ARIA live regions
- Async/loading behavior — unless a `loading` state exists in the extraction
- Multi-step or confirmation flows — unless visible in Figma

#### Confidence and markers

- Mark `inferredFrom` when the pattern is inferred rather than explicit
- Use `notes[]` for anything that requires dev confirmation
- If the pattern cannot be determined: set `interactionPattern: unknown` and a single note in `notes[]`

Do not skip the `behavior` block entirely if there is a reasonable inference available. `unknown` is a valid and honest answer.

### 7. qa[]

`qa[]` is not a generic checklist.
Each item must be a question specific to THIS component.

Incorrect:

- `Does it meet accessibility requirements?`

Correct:

- `Does the \`destructive\` variant require confirmation before executing the action?`

### 8. Terminology consistency

Reuse naming from `ComponentDocOutput`. Do not rename fields without justification (RULES.md Rule 8).

### 9. Normative claims

Do not claim normative compliance (WCAG, legal) without a verifiable audit. Use `TBD` or `[To confirm with dev]` (RULES.md Rule 14).

---

## What It Must NOT Do

- Do not invent variants that are not present in `ComponentDocOutput`
- Do not present inferred accessibility as verified
- Do not claim normative compliance without a verifiable audit
- Do not fill gaps with undeclared conventions
