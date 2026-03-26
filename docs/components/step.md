---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2282-1793&t=Ct0aRp93us7M1VzZ-4
  page: Stepper
  component: Step
  component_set_node_id: '2282:1793'
  last_verified: '2026-02-20'
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: cd7b99158d70dab5c06b75ecf57423e538d3a7831a4b6fef1a69bce186b0acbe
    token_registry_sha256: 1a773a12e76d7b30306dc82ad2b838888cfca8f408f2dfcef6049153f2b36054
---

# Step

The **Step** component represents one progress item in a multi-step flow.

## Overview

- Purpose: Show one step marker and label in a process sequence.
- Figma component set: `Step`.
- Variant properties: `State` (`Default`, `Active`).
- Source: [Step in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2282-1793&t=Ct0aRp93us7M1VzZ-4).

### Visual Proof

![Visual proof snapshot](../_generated/visual-proofs/images/step.png)

- Screenshot: [Captured (2026-02-21)](https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/4b1aa5e8-54eb-404c-bb6b-e6ad75badf37)
- Source node: `2282:1793`
- Image hash: `f52f4bef69c48dc916c46a2452bf1f3419083b47b15ca09116f083e92c3e2266`
- Variants captured: `2`
- Artifact: `../_generated/visual-proofs/step.json`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
1. **Marker**: Circular step indicator with step number.
2. **Label**: Text caption for the step.
3. **Connector context**: Visual relation to adjacent steps in composition.

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `State` | `VARIANT` | `Default` | `true` | Visual emphasis state for the step item. |
| `Change_Number` | `TEXT` | `1` | `false` | Step number content. |
| `Change_Text` | `TEXT` | `STEP TEXT` | `false` | Step label content. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
## Visual Specifications

### Container

- Component set with 2 variants.
- Marker/label token mapping is currently `TBD`.

### Typography

- Number and label text styles: `TBD`.
- State-based text color mapping: `TBD`.

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| `State=Default` | `TBD` | `TBD` | Inactive step visual. |
| `State=Active` | `TBD` | `TBD` | Current step visual emphasis. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

- Default: `State=Default`.
- Active: `State=Active`.
- Disabled / Hover / Focus / Pressed: `TBD` (not exposed as separate variant axis).

## Usage Guidelines

### When to use

- Use inside steppers for linear process progress.
- Use active state to identify current user position.

### When not to use

- Do not use as standalone action controls.
- Do not use for non-sequential option groups.

### Behavior

- Interactions: Step state changes based on process progress.
- Responsive behavior: `TBD`.
- Overflow/truncation: `TBD`.
- i18n/RTL: `TBD`.

### Examples

1. Basic: 4-step checkout flow with one active step.
2. Contextual: Account setup wizard with dynamic step labels.

## Content Guidelines

- Keep labels concise and task-oriented.
- Keep numbering aligned with process order.

## Accessibility

- ARIA: Component-level semantics are typically applied through stepper/radiogroup/list context.
- Keyboard: Navigation behavior is defined by parent stepper implementation.
- Focus: `Semantic.Color.Focus-Outline.Inner` (`#FFFFFF`) and `Semantic.Color.Focus-Outline.Outer` (`#567680`).
- Labeling: Step labels must provide meaningful process context.
- Hit area: `A11y.A11y.Dimension.Min-Hit-Area` (`24px`) and `Primitives.Dimension.A11y.Min-Hit-Area-Mobile-AAA` (`48px`).
- Contrast: Marker and label contrast values are `TBD (pending audit)`.

## Related Components

- [Stepper](stepper.md): Container that composes multiple `Step` items.
- [Topbar](topbar.md): Can include progress indicators in flow contexts.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.label.color.state=Active` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.label.color.state=Default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.marker.background.state=Active` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.marker.background.state=Default` is `TBD`. Specification value is unresolved.
