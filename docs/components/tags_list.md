---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2075-295
  page: Tag
  component: Tags-List
  component_set_node_id: 2075:295
  last_verified: "2026-02-19"
pipeline:
  ds_component_doc:
    contract_version: "1"
    spec_sha256: b33adff4e4836fa5a53ba35358117086ffb02089fbfd53a88e69cc0fb5beed9d
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
    generator_script_sha256: a1c709db54049eacb6f51b020134df6110fbfed9fcae5ba506df40502d85e7fc
---

# Tags List

The **Tags List** component displays a horizontal sequence of tags with per-item visibility controls.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Tags-List`) with:

- `Size` variant: `Small`, `Medium`
- Boolean properties: `Show Tag_1` through `Show Tag_10`

Source: [Tags-List in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2075-295)

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `2075:295`
- Proof artifact: `TBD`

## Anatomy

1. **Container** (`COMPONENT`): horizontal auto-layout wrapper.
2. **Tag item** (`INSTANCE`): repeated `Tag` components.
3. **Visibility controls** (`BOOLEAN` properties): toggle each slot independently.

## Component API

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Size` | `VARIANT` | `Small` | `true` | Controls size variant and spacing for the list. |
| `Show Tag_1` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 1. |
| `Show Tag_2` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 2. |
| `Show Tag_3` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 3. |
| `Show Tag_4` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 4. |
| `Show Tag_5` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 5. |
| `Show Tag_6` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 6. |
| `Show Tag_7` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 7. |
| `Show Tag_8` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 8. |
| `Show Tag_9` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 9. |
| `Show Tag_10` | `BOOLEAN` | `true` | `false` | Toggles visibility of tag item 10. |

## Visual Specifications

### Container

- `Size=Small`: `716 x 28`, horizontal auto-layout, gap `4`.
- `Size=Medium`: `862 x 36`, horizontal auto-layout, gap `8`.
- Child count: up to ten Tag instances.

### Token Mapping

| Part | Condition | Token | Fallback |
| --- | --- | --- | --- |
| `container.gap` | `size=Small` | `TBD` | `TBD` |
| `container.gap` | `size=Medium` | `TBD` | `TBD` |
| `tag_item.typography` | `size=Small` | `TBD` | `TBD` |
| `tag_item.typography` | `size=Medium` | `TBD` | `TBD` |
| `tag_item.background` | `size=Small` | `TBD` | `TBD` |
| `tag_item.background` | `size=Medium` | `TBD` | `TBD` |
| `tag_item.border-color` | `size=Small` | `TBD` | `TBD` |
| `tag_item.border-color` | `size=Medium` | `TBD` | `TBD` |
| `tag_item.text-color` | `size=Small` | `TBD` | `TBD` |
| `tag_item.text-color` | `size=Medium` | `TBD` | `TBD` |

## Variants

| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `Size=Small` | `TBD` | `TBD` | Dense row of compact tag items with 4px gap. |
| `Size=Medium` | `TBD` | `TBD` | Taller row with 8px spacing and larger tag instances. |

## States

This component has no internal interactive states in the current Figma definition.

## Usage Guidelines

### Behavior

- **When to use**: Present multiple related labels in one horizontal group.
- **When not to use**: Avoid for long lists requiring multi-line wrapping behavior not specified in Figma.
- **Do**: Use visibility toggles to show only relevant tags.
- **Don't**: Mix unrelated label taxonomies in one list.
- Responsive behavior: `TBD`
- Overflow / truncation behavior: `TBD`
- i18n / RTL behavior: `TBD`

### Examples

- Basic example: list of three metadata tags in a card header.
- Contextual example: up to ten tags in overview filters using consistent size variant.

## Content Guidelines

- Maintain a consistent order for visible tags.
- Keep labels short to preserve scanability in dense layouts.

## Accessibility

### 1. ARIA role and semantics

- Group semantic role is `TBD`.
- Item semantics are inherited from `Tag` wrappers in implementation.

### 2. Keyboard navigation

This component is not keyboard-interactive by itself.

### 3. Focus management

- No internal focus logic is defined in Figma.
- Focus behavior depends on wrapper semantics (`TBD`).

### 4. Labeling

- If tags are informative, surrounding context should provide group meaning.
- Accessible naming strategy for interactive usage is `TBD`.

### 5. Contrast and visibility

- Contrast verification is `TBD (pending audit)`.

## Related Components

- [Tag](tag.md): Base item component reused by each slot in the list.
- [Topbar](topbar.md): Can host filtered metadata regions that include tag groups.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.container.gap.size=Medium` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.gap.size=Small` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.tag_item.background.size=Medium` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.tag_item.background.size=Small` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.tag_item.border-color.size=Medium` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.tag_item.border-color.size=Small` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.tag_item.text-color.size=Medium` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.tag_item.text-color.size=Small` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.tag_item.typography.size=Medium` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.tag_item.typography.size=Small` is `TBD`. Specification value is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
