---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2335-2158&t=Ct0aRp93us7M1VzZ-4
  page: Radio Button
  component: Radio-Button-List
  last_verified: '2026-02-20'
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: 8577a31fb19bf7fc40c54a4ed3d22f19051234e4de51e868d4b472ce5d7bd58e
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
---

# Radio Button List

The **Radio Button List** component groups multiple labeled radio options into one exclusive-choice set.

## Overview

- Purpose: Present a set of mutually exclusive options with labels.
- Figma component: `Radio-Button-List`.
- Exposed properties: `Show_Radio_Button_Label_1` through `Show_Radio_Button_Label_6`.
- Source: [Radio-Button-List in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2335-2158&t=Ct0aRp93us7M1VzZ-4).

### Visual Proof

- Screenshot: `TBD`
- Source node: `2335:2158`
- Artifact: `TBD`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
1. **List container**: Wrapper for the option rows.
2. **Option rows**: Repeated `Radio-Button-Label` instances.
3. **Visibility toggles**: Boolean properties controlling each option slot.

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Show_Radio_Button_Label_1` | `BOOLEAN` | `true` | `false` | Toggles visibility of option 1. |
| `Show_Radio_Button_Label_2` | `BOOLEAN` | `true` | `false` | Toggles visibility of option 2. |
| `Show_Radio_Button_Label_3` | `BOOLEAN` | `true` | `false` | Toggles visibility of option 3. |
| `Show_Radio_Button_Label_4` | `BOOLEAN` | `true` | `false` | Toggles visibility of option 4. |
| `Show_Radio_Button_Label_5` | `BOOLEAN` | `true` | `false` | Toggles visibility of option 5. |
| `Show_Radio_Button_Label_6` | `BOOLEAN` | `true` | `false` | Toggles visibility of option 6. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
## Visual Specifications

### Container

- Composed group of radio option rows.
- Group gap and row text token mapping: `TBD`.

### Typography

- Inherited from nested `Radio-Button-Label` instances.
- Group-specific typography mapping: `TBD`.

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| `N/A` | `TBD` | `TBD` | No variant axis; configuration is driven by option visibility booleans. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

- Default: All option toggles `true` in source component.
- Checked state behavior is delegated to nested radio controls.
- Disabled / Hover / Focus / Pressed: `TBD` at list container level.

## Usage Guidelines

### When to use

- Use for single-choice option groups.
- Use where labels must clearly describe each option.

### When not to use

- Do not use for multi-select choice sets.
- Do not use where options are unordered or independent.

### Behavior

- Interactions: Selecting one option should unselect any previously selected option.
- Responsive behavior: `TBD`.
- Overflow/truncation: `TBD`.
- i18n/RTL: `TBD`.

### Examples

1. Basic: 3-option preference selector.
2. Contextual: Form section with dynamic number of visible options.

## Content Guidelines

- Keep labels unique and concise.
- Keep option ordering stable for comprehension.

## Accessibility

- ARIA: Group should expose radiogroup semantics in implementation.
- Keyboard: Roving focus and arrow-key behavior are implementation-defined.
- Focus: `Semantic.Color.Focus-Outline.Inner` (`#FFFFFF`) and `Semantic.Color.Focus-Outline.Outer` (`#567680`).
- Labeling: Group-level label semantics are `TBD`.
- Hit area: `A11y.A11y.Dimension.Min-Hit-Area` (`24px`) and `Primitives.Dimension.A11y.Min-Hit-Area-Mobile-AAA` (`48px`).
- Contrast: Option text and control contrast values are `TBD (pending audit)`.

## Related Components

- [Radio Button](radio_button.md): Base control for exclusive selection.
- [Radio Button Label](radio_button_label.md): Labeled option row used in this list.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.list_container.gap.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.option_item.text_color.default` is `TBD`. Specification value is unresolved.
