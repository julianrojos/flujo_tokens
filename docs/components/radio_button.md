---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1971&t=Ct0aRp93us7M1VzZ-4
  page: Radio Button
  component: Radio-Button
  component_set_node_id: '2304:1971'
  last_verified: '2026-02-20'
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: c79984d506e6fc2fdc9bec15b07ffabe9d0080ff379e65adb80ac1237cb35e97
    token_registry_sha256: 1a773a12e76d7b30306dc82ad2b838888cfca8f408f2dfcef6049153f2b36054
---

# Radio Button

The **Radio Button** component represents one mutually exclusive selection control.

## Overview

- Purpose: Capture one choice within a mutually exclusive option set.
- Figma component set: `Radio-Button`.
- Variant properties: `State` (`Default`, `Checked`).
- Source: [Radio-Button in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1971&t=Ct0aRp93us7M1VzZ-4).

### Visual Proof

![Visual proof snapshot](../_generated/visual-proofs/images/radio_button.png)

- Screenshot: [Captured (2026-02-21)](https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/22f87d2f-8ef1-45e7-a23f-9dac6a16dfcf)
- Source node: `2304:1971`
- Image hash: `46d3aebb56f22b9da60cbd1be3a12ecdafa8a4783260ef35c77d845ed2ea4606`
- Variants captured: `2`
- Artifact: `../_generated/visual-proofs/radio_button.json`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
1. **Control ring**: Outer circular radio control.
2. **Selected indicator**: Inner dot visible in checked state.

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `State` | `VARIANT` | `Default` | `true` | Visual state of the radio control. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
## Visual Specifications

### Container

- Component set with two variants.
- Control border and indicator token mapping: `TBD`.

### Typography

- Not applicable at control-only component level.

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| `State=Default` | `TBD` | `TBD` | Unselected radio visual. |
| `State=Checked` | `TBD` | `TBD` | Selected radio visual with inner indicator. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

- Default: `State=Default`.
- Checked: `State=Checked`.
- Disabled / Hover / Focus / Pressed: `TBD` (not exposed as separate variant axis).

## Usage Guidelines

### When to use

- Use in groups where only one option can be selected.
- Use for explicit single-choice decisions.

### When not to use

- Do not use for multi-select options.
- Do not use as a standalone binary switch.

### Behavior

- Interactions: Selecting one radio should unselect siblings in the same group.
- Responsive behavior: `TBD`.
- Overflow/truncation: `N/A` (no text layer).
- i18n/RTL: `TBD`.

### Examples

1. Basic: Two-option choice group with one selected value.
2. Contextual: Preferences group where each option is a `Radio-Button-Label` row.

## Content Guidelines

- This component has no direct text slot.
- Pair with a labeled wrapper for readable option content.

## Accessibility

- ARIA: Use native `input[type="radio"]` semantics or `role="radio"` in custom implementations.
- Keyboard: Arrow-key navigation behavior is defined by parent radiogroup implementation.
- Focus: `Semantic.Color.Focus-Outline.Inner` (`#FFFFFF`) and `Semantic.Color.Focus-Outline.Outer` (`#567680`).
- Labeling: Accessible label is expected from composed wrapper.
- Hit area: `A11y.A11y.Dimension.Min-Hit-Area` (`24px`) and `Primitives.Dimension.A11y.Min-Hit-Area-Mobile-AAA` (`48px`).
- Contrast: Indicator and border contrast values are `TBD (pending audit)`.

## Related Components

- [Radio Button Label](radio_button_label.md): Labeled row composition for a radio option.
- [Radio Button List](radio_button_list.md): Group container for mutually exclusive options.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.control.border.state=Checked` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.control.border.state=Default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.selected_indicator.fill.state=Checked` is `TBD`. Specification value is unresolved.
