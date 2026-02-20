---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=225-420&t=Ct0aRp93us7M1VzZ-4
  page: Text Fields
  component: Text-Area
  component_set_node_id: 225:420
  last_verified: "2026-02-20"
pipeline:
  ds_component_doc:
    contract_version: "1"
    spec_sha256: 391e560fc5ed7e86a98280f32fe0f878a2ac1f6853f2678fa9faed7ab217e3d3
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
---

# Text Area

The **Text Area** component captures multi-line textual input with optional label, icon, and support message.

## Overview

- Purpose: Capture medium and long-form user input.
- Figma component set: `Text-Area`.
- Variant properties: `Type` with `Default`, `Active`, `Success`, `Error`.
- Source: [Text-Area in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=225-420&t=Ct0aRp93us7M1VzZ-4).

### Visual Proof

- Screenshot: `TBD`
- Source node: `225:420`
- Artifact: `TBD`

## Anatomy

1. **Field container**: Main multi-line input surface and border.
2. **Label**: Optional field label text.
3. **Value/Placeholder**: Multi-line content area.
4. **Type icon**: Optional leading icon slot.
5. **Support message**: Optional helper/validation text.

## Component API

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Type` | `VARIANT` | `Default` | `true` | Visual and semantic state of the text area. |
| `↳ Change_Placeholder` | `TEXT` | `Placeholder` | `false` | Placeholder content. |
| `Change_Value` | `TEXT` | `Value` | `false` | Current value content. |
| `↳ Change_Label` | `TEXT` | `Label` | `false` | Label text override. |
| `↳ Change_Message` | `TEXT` | `Message` | `false` | Support message text override. |
| `↳ Type_Icon` | `INSTANCE_SWAP` | `65:928` | `false` | Leading icon slot instance. |
| `Show_Icon` | `BOOLEAN` | `true` | `false` | Toggles icon visibility. |
| `Show Placeholder` | `BOOLEAN` | `true` | `false` | Toggles placeholder visibility. |
| `Show Message` | `BOOLEAN` | `true` | `false` | Toggles support message visibility. |
| `Show_Label` | `BOOLEAN` | `true` | `false` | Toggles label visibility. |
| `Show_message_layer` | `BOOLEAN` | `true` | `false` | Toggles message layer container visibility. |

## Visual Specifications

### Container

- Root type: `COMPONENT_SET` with four variants.
- Variant axis: `Type` (`Default`, `Active`, `Success`, `Error`).
- Multi-line content area and spacing token mapping: `TBD`.
- Support message color token mapping: `TBD`.

### Typography

- Label/value/message typography tokens: `TBD`.
- Placeholder typography token: `TBD`.
- Text style names: `TBD`.

## Variants

| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| `Type=Default` | `TBD` | `TBD` | Neutral text-area state. |
| `Type=Active` | `TBD` | `TBD` | Active/focused interaction style. |
| `Type=Success` | `TBD` | `TBD` | Validation success style. |
| `Type=Error` | `TBD` | `TBD` | Validation error style. |

## States

- Default: `Type=Default`.
- Active: `Type=Active`.
- Success: `Type=Success`.
- Error: `Type=Error`.
- Hover/Pressed: `TBD` (not exposed as separate Figma variant axis).

## Usage Guidelines

### When to use

- Use for multi-line user responses.
- Use when additional context/helper text is needed.

### When not to use

- Do not use for short single-line values.
- Do not rely on placeholder-only labeling.

### Behavior

- Interactions: Accepts multi-line text input.
- Responsive behavior: `TBD`.
- Overflow/truncation: `TBD`.
- i18n/RTL: `TBD`.

### Examples

1. Basic: Default state with label and placeholder.
2. Contextual: Error state with validation message after submission.

## Content Guidelines

- Use explicit labels and concise helper text.
- Keep validation feedback actionable and short.

## Accessibility

- ARIA: Use native textarea semantics, with associated label and describedby support text where applicable.
- Keyboard: Standard multi-line text-area keyboard behavior.
- Focus: `Semantic.Color.Focus-Outline.Inner` (`#FFFFFF`) and `Semantic.Color.Focus-Outline.Outer` (`#567680`).
- Labeling: Label must be programmatically associated with the text area control.
- Hit area: `A11y.A11y.Dimension.Min-Hit-Area` (`24px`) and `Primitives.Dimension.A11y.Min-Hit-Area-Mobile-AAA` (`48px`).
- Contrast: Validation and text contrast values are `TBD (pending audit)`.

## Related Components

- [Text Input](text_input.md): Single-line companion field.
- [Alert](alert.md): Validation feedback container in broader form flows.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.field_container.background.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.support_message.color.error` is `TBD`. Specification value is unresolved.
