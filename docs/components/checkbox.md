---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu?node-id=524-494
  page: Checkbox
  component: Checkbox
  component_set_node_id: '524:494'
  last_verified: TBD
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: a6aa1a89b22ba492900f8bdbd398ec92b389fdfa850b8888aad8dd7bd1965fee
    token_registry_sha256: 1a773a12e76d7b30306dc82ad2b838888cfca8f408f2dfcef6049153f2b36054
---

# Checkbox

The **Checkbox** component captures a binary checked or unchecked selection state.

## Overview

- Purpose: Captures a binary checked or unchecked selection state.
- Figma component set: `Checkbox`.
- Variant properties: `State` (`Default`, `Checked`).
- Source: [Checkbox in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu?node-id=524-494).

### Visual Proof

![Visual proof snapshot](../_generated/visual-proofs/images/checkbox.png)

- Screenshot: [Captured (2026-02-21)](https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/d0cff6fe-ec45-48d8-9f9c-bd9eb1697512)
- Source node: `524:494`
- Image hash: `a8ae5f9a168e2cffbd434baf1f95f23a1f04a416d84d297fb546d59b984258b8`
- Variants captured: `2`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
1. **Variant container**: Per-variant frame with fixed `24 x 24` dimensions.
2. **Icon instance**: Nested icon instance that represents checked or unchecked visuals.

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `State` | `VARIANT` | `Default` | `true` | Visual selection state axis. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
## Visual Specifications

### Container

- Variant size: `24 x 24`.
- Token mapping for background, border, and radius: `TBD`.
- Token mapping for `control.icon_color` (`default`): `TBD` (`TBD`).

### Typography

- Font family: `N/A` (no text slot in this component).
- Font size: `N/A` (no text slot in this component).
- Line height: `N/A` (no text slot in this component).

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| `Default` | `TBD` | `TBD` | Unchecked selection visual. |
| `Checked` | `TBD` | `TBD` | Checked selection visual. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

- Default: Represented by `State=Default`.
- Checked: Represented by `State=Checked`.
- Disabled: `TBD` (not defined in the current spec).
- Hover / Focus / Pressed: `TBD` (not defined in the current spec).

## Usage Guidelines

### When to use

- Use for independent multi-select options.
- Use for on/off preferences.

### When not to use

- Do not use for mutually exclusive choices.

### Behavior

- Interactions: Toggle between `Default` and `Checked`.
- Responsive behavior: `TBD`.
- Overflow/truncation: `N/A` (no text slot).
- i18n/RTL: `TBD`.

### Examples

1. Basic: Checkbox used as an independent on/off preference in settings.
2. Contextual: Checkbox used in a multi-select option list where each choice is independent.

## Content Guidelines

- This component has no text slot.
- Pair with a label component when user-facing meaning is required.

## Accessibility

- ARIA: Use native `input[type="checkbox"]` semantics or `role="checkbox"` with `aria-checked`; additional ARIA attributes are `TBD`.
- Keyboard: `Tab` moves focus to the checkbox; `Space` toggles checked state.
- Focus: `Semantic.Color.Focus-Outline.Inner` (`#FFFFFF`) and `Semantic.Color.Focus-Outline.Outer` (`#567680`) are the focus outline tokens; programmatic focus behavior is `TBD`.
- Labeling: Checkbox must have a visible label or `aria-label` / `aria-labelledby`; project labeling strategy is `TBD`.
- Hit area: `A11y.A11y.Dimension.Min-Hit-Area` (`24px`) and `Primitives.Dimension.A11y.Min-Hit-Area-Mobile-AAA` (`48px`).
- Contrast: Selection state must not rely on color alone; contrast verification is `TBD (pending audit)`.

## Related Components

- [Checkbox Label](checkbox_label.md): Adds inline label text to a checkbox control.
- [Checkbox Label List](checkbox_label_list.md): Groups multiple labeled checkbox controls in a list.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.control.icon_color.default` is `TBD`. Specification value is unresolved.
