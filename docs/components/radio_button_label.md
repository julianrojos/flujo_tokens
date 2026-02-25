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

- Screenshot: `TBD`
- Source node: `2304:1984`
- Artifact: `TBD`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
1. **Radio control**: Nested `Radio-Button` instance.
2. **Label frame**: Text container for option label.

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Change_Radio_Label_Text` | `TEXT` | `Label` | `false` | Overrides visible option label text. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
## Visual Specifications

### Container

- Composed row with radio control and label.
- Row spacing and label color token mapping: `TBD`.

### Typography

- Label text style and size: `TBD`.

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| `N/A` | `TBD` | `TBD` | No variant axis on this composed component. |

<!-- AUTO-GENERATED-VARIANTS:END -->
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
