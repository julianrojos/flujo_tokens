---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1984&t=Ct0aRp93us7M1VzZ-4
  page: Radio Button
  component: Radio-Button-Label
  last_verified: "2026-02-20"
pipeline:
  ds_component_doc:
    contract_version: "1"
    spec_sha256: fc92b9a400baf17ddaba4f0c0f39d88e7019982b7fa4662de5bd6f54d55a1ae8
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
---

# Radio Button Label

The **Radio Button Label** component combines one radio control with adjacent label text.

## Overview

- Purpose: Provide a readable, selectable radio option row.
- Figma component: `Radio-Button-Label`.
- Exposed properties: `Change_Radio_Label_Text`.
- Source: [Radio-Button-Label in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1984&t=Ct0aRp93us7M1VzZ-4).

### Visual Proof

![Visual proof snapshot](../_generated/visual-proofs/images/radio_button_label.png)

- Screenshot: [Captured (2026-02-23)](https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/7713216a-abe3-4a11-aa9c-64ef1df5ca75)
- Source node: `2304:1984`
- Image hash: `f7f1c0d341b9f9c934bdd37af8862b077cd87fd60e6d986c3d6fca38b89022a3`
- Variants captured: `1`
- Artifact: `../_generated/visual-proofs/radio_button_label.json`

## Anatomy


1. **Radio-Button** — Width 24, Height 24, Border weight 1, Aspect ratio 1:1, Instance of Radio-Button
2. **Radio_Button_Label** — Width 40, Height 24, Border weight 1
3. **Label** — Width 40, Height 24, Border weight 1, Text color `#483F3F`, Text align LEFT, Text style Nunito Sans/16


2. **Label frame**: Text container for option label.

## Component API


### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| Change_Radio_Label_Text#2304:48 | TEXT | Label | false | Text content value. |



| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Change_Radio_Label_Text` | `TEXT` | `Label` | `false` | Overrides visible option label text. |

## Visual Specifications


### Per-variant attributes

- `TBD`

### Layout and spacing

Auto-layout tree describing direction, alignment, resizing, spacing, and padding for each node.

| Node | Direction | Alignment | H Sizing | V Sizing | Item Spacing | Padding (T/R/B/L) |
| --- | --- | --- | --- | --- | --- | --- |
| container | Horizontal | Center top | Fixed | Fixed | 8 | — |
| radiobutton | Horizontal | Center center | Fixed | Fixed | 10 | 4/4/4/4 |
| radio_button_label | Horizontal | Center top | Fixed | Fixed | 8 | — |



- Composed row with radio control and label.
- Row spacing and label color token mapping: `TBD`.

### Typography

- Label text style and size: `TBD`.

## Variants

| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| `N/A` | `TBD` | `TBD` | No variant axis on this composed component. |

## States

- Default/Checked state behavior is delegated to nested `Radio-Button` instance.
- Disabled / Hover / Focus / Pressed: `TBD` at composed-row level.

## Usage Guidelines

### When to use

- Use as one option row in radio groups.
- Use when option labels must be explicit and scanable.

### When not to use

- Do not use for multi-select option sets.
- Do not use duplicate labels in the same option group.

### Behavior

- Interactions: Selecting row should set radio selection in parent group.
- Responsive behavior: `TBD`.
- Overflow/truncation: `TBD`.
- i18n/RTL: `TBD`.

### Examples

1. Basic: Single labeled radio row.
2. Contextual: Repeated rows inside `Radio-Button-List`.

## Content Guidelines

- Keep option labels concise and distinct.
- Use consistent grammar across all options in a group.

## Accessibility

- ARIA: Row should map to radio semantics through nested control and group context.
- Keyboard: Keyboard behavior is defined by parent radiogroup implementation.
- Focus: `Semantic.Color.Focus-Outline.Inner` (`#FFFFFF`) and `Semantic.Color.Focus-Outline.Outer` (`#567680`).
- Labeling: Label text should provide the accessible name for the option.
- Hit area: `A11y.A11y.Dimension.Min-Hit-Area` (`24px`) and `Primitives.Dimension.A11y.Min-Hit-Area-Mobile-AAA` (`48px`).
- Contrast: Label and control contrast values are `TBD (pending audit)`.

## Related Components

- [Radio Button](radio_button.md): Base selection control used in this row.
- [Radio Button List](radio_button_list.md): Grouped list of labeled radio options.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.label_text.color.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.row.spacing.default` is `TBD`. Specification value is unresolved.
