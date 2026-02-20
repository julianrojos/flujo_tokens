---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2371-2320&t=Ct0aRp93us7M1VzZ-4
  page: Checkbox
  component: Checkbox-Label-List
  last_verified: "2026-02-20"
pipeline:
  ds_component_doc:
    contract_version: "1"
    spec_sha256: ba950a3aeabb7c886654b4e63de6f9458cdf7479dcc99e418568ef4d853adb34
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
---

# Checkbox Label List

The **Checkbox Label List** component composes multiple labeled checkbox rows in a vertical stack.

## Overview

- Purpose: Present a grouped list of selectable options with consistent spacing.
- Figma component: `Checkbox-Label-List` (`COMPONENT`).
- Exposed properties: 10 boolean toggles (`Show_Checkbox__Label_*`) controlling row visibility.
- Source: [Checkbox-Label-List in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2371-2320&t=Ct0aRp93us7M1VzZ-4).

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `2371:2320`
- Proof artifact: `TBD`

## Anatomy

1. **Vertical container**: Auto Layout `VERTICAL` list wrapper.
2. **Row instances**: Repeated `Checkbox-Label` instances (10 in source node).
3. **Visibility toggles**: Boolean component properties per row to show/hide items.

## Component API

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Show_Checkbox__Label_1` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 1. |
| `Show_Checkbox__Label_2` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 2. |
| `Show_Checkbox__Label_3` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 3. |
| `Show_Checkbox__Label_4` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 4. |
| `Show_Checkbox__Label_6` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 6. |
| `Show_Checkbox__Label_7` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 7. |
| `Show_Checkbox__Label_8` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 8. |
| `Show_Checkbox__Label_9` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 9. |
| `Show_Checkbox__Label_10` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 10. |
| `Show_Checkbox__Label_11` | `BOOLEAN` | `true` | `false` | Toggles visibility of row 11. |

## Visual Specifications

### Container

- Layout: `VERTICAL` Auto Layout.
- Width / height: `72 x 276` in the source node.
- Item spacing: `4px`.
- Padding: `0`.
- Child row size: each nested `Checkbox-Label` row is `72 x 24` in source.

### Typography

- Inherited from nested `Checkbox-Label` component.
- Typography token mapping: `TBD`.
- Font family / size / line height: `TBD`.

## Variants

| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| `N/A` | `TBD` | `TBD` | No variant axis; behavior is controlled by boolean row visibility properties. |

## States

- Default: All row-visibility booleans are `true` in the source node.
- Checked/Unchecked per row: Inherited from each nested checkbox item.
- Disabled / Hover / Focus / Pressed: `TBD` at list container level.

## Usage Guidelines

### When to use

- Use when multiple related options need independent checkbox selection.
- Use for compact preference groups and filter blocks.

### When not to use

- Do not use for single-option checkbox scenarios; use `Checkbox-Label`.
- Do not use for mutually exclusive options.

### Behavior

- Interactions: Each row behaves independently via nested checkbox controls.
- Responsive behavior: `TBD`.
- Overflow/truncation: `TBD` for long labels or long lists.
- i18n/RTL: `TBD` for mirrored layouts and localization growth.

### Examples

1. Basic: Vertical list of selectable interests.
2. Contextual: Filter panel section with multiple toggles.

## Content Guidelines

- Keep option labels concise and unambiguous.
- Use consistent grammatical structure across rows.
- Avoid mixing sentence styles within the same list.

## Accessibility

### 1. ARIA role and semantics

- Container semantic for grouped checkboxes: `TBD` (`fieldset`/`legend` pattern recommended when applicable).
- Each row should preserve checkbox semantics from nested controls.
- Group-level labeling semantics: `TBD`.

### 2. Keyboard navigation

- `Tab`: Moves through each checkbox in sequence.
- `Space`: Toggles the focused checkbox.
- Additional keyboard shortcuts for group operations: `TBD`.

### 3. Focus management

- Focus should move row-by-row in visual order.
- Focus ring consistency across repeated rows: `TBD`.
- Focus restoration after dynamic row hide/show: `TBD`.

### 4. Labeling

- Each row requires a clear, programmatically associated label.
- Group labeling (for example section title) is `TBD` in this source artifact.

### 5. Contrast and visibility

- Row text and checkbox indicators must remain readable in stacked layouts.
- Verified contrast values for list usage contexts: `TBD (pending audit)`.

## Related Components

- [Checkbox](checkbox.md): Base binary control used by list rows.
- [Checkbox Label](checkbox_label.md): Single labeled row used as repeated list item.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.list.spacing.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.row.item.default` is `TBD`. Specification value is unresolved.
