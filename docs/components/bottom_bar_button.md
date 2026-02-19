---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=694-170
  page: Bars
  component: Bottom_Bar_Button
  component_set_node_id: 694:170
  last_verified: "2026-02-19"
pipeline:
  ds_component_doc:
    contract_version: "1"
    spec_sha256: 241db2197bc8ac26f02b9c727694cf95e706546ceb47128b1debdc8e5c863cb1
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
    generator_script_sha256: d1a7b2a3735f7e1e853c3a53811b9edec4b68c51b73d75b1ed818033f2baba15
---

# Bottom Bar Button

The **Bottom Bar Button** component represents one navigation item slot inside the bottom navigation bar.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Bottom_Bar_Button`) with one variant property and two content properties:

- `State`: `Default`, `Selected`
- `Change_Text`: `Text` (default)
- `Change_Bottom_Bar_Button_Icon`: `INSTANCE_SWAP` (default instance: `TBD`)

Source: [Bottom_Bar_Button in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=694-170)

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `694:170`
- Proof artifact: `TBD`

## Anatomy

Each button item contains:

1. **Container** (`Auto Layout`, vertical)
2. **Icon slot** (`INSTANCE_SWAP`)
3. **Label text** (`TEXT`)

## Component API

### Properties

| Name                                 | Type            | Default   | Required | Description                                 |
| ------------------------------------ | --------------- | --------- | -------- | ------------------------------------------- |
| `State`                              | `VARIANT`       | `Default` | `true`   | Visual state. Options: `Default`, `Selected`. |
| `Change_Text`                        | `TEXT`          | `Text`    | `false`  | Overrides the button label text.            |
| `Change_Bottom_Bar_Button_Icon`      | `INSTANCE_SWAP` | `TBD`     | `false`  | Replaces the icon instance rendered in slot. |

## Visual Specifications

### Container

- Root layout: `TBD`
- Dimensions: `TBD`
- Padding and spacing: `TBD`
- Border and radius: `TBD`

### Typography

- Label style: `TBD`
- Label color token: `TBD`

### Iconography

- Icon slot size: `TBD`
- Icon color token: `TBD`

### Token Mapping

| Part           | Condition     | Token | Fallback |
| -------------- | ------------- | ----- | -------- |
| `container.*`  | all variants  | `TBD` | `TBD`    |
| `icon.*`       | all variants  | `TBD` | `TBD`    |
| `label.*`      | all variants  | `TBD` | `TBD`    |

## Variants

| Variant    | Differentiating token(s) | Fallback value(s) | Visual indicator |
| ---------- | ------------------------ | ----------------- | ---------------- |
| `Default`  | `TBD`                    | `TBD`             | Unselected item appearance. |
| `Selected` | `TBD`                    | `TBD`             | Selected item appearance. |

## States

- `Default`: baseline navigation item style.
- `Selected`: active destination style.
- Hover, focus, pressed, and disabled behavior: `TBD`.

## Usage Guidelines

### Behavior

- **When to use**: Use inside `Bottom_Bar` as one destination/action item.
- **When not to use**: Do not use as a standalone primary button pattern.
- **Do**: Keep one selected item when used in navigation.
- **Don't**: Use long labels that break item width.
- Responsive behavior: `TBD`
- Overflow / truncation behavior: `TBD`
- i18n / RTL behavior: `TBD`

### Examples

- Basic example: one item in `Default` state with short label.
- Contextual example: one item in `Selected` state for current destination.

## Content Guidelines

- Keep labels short and scannable.
- Use consistent casing for all items in the same bar.
- Avoid ambiguous labels.

## Accessibility

### 1. ARIA role and semantics

- Expected semantic role in implementation: interactive control (`button` or `link`), `TBD` by final platform.
- `aria-current` strategy for selected item is `TBD`.

### 2. Keyboard navigation

- Keyboard model for item-to-item navigation is `TBD`.
- Activation keys are expected to be `Enter` and `Space` (`TBD` confirmation).

### 3. Focus management

- Focus ring token mapping is `TBD`.
- Focus order should follow visual order in parent `Bottom_Bar`.

### 4. Labeling

- Visible label should provide accessible name by default.
- Icon-only configuration requires explicit accessible labeling (`TBD`).

### 5. Contrast and visibility

- Selected and default styles must remain distinguishable without relying on color only.
- Contrast verification is `TBD (pending audit)`.

## Related Components

- [Bottom Bar](bottom_bar.md): Parent container that composes this item component.
- [Button](button.md): General action button component, different semantic intent.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.container.background.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.selected` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.icon.color.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.icon.color.selected` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.label.color.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.label.color.selected` is `TBD`. Specification value is unresolved.
- [ ] [CONTENT_UNKNOWN] `properties.[2].default` is `TBD`. Content/anatomy/property detail is unresolved.
- [ ] [CONTENT_UNKNOWN] `properties.[2].values.[0]` is `TBD`. Content/anatomy/property detail is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
