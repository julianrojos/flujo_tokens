---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=487-267&t=Ct0aRp93us7M1VzZ-4
  page: Checkbox
  component: Checkbox-Label
  last_verified: "2026-02-20"
pipeline:
  ds_component_doc:
    contract_version: "1"
    spec_sha256: 54dd15cc882f8ef9becb6551a906a1b31f3ff35fa3498aca93614cb0be7d8b23
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
---

# Checkbox Label

The **Checkbox Label** component combines a checkbox control with adjacent text for readable option selection.

## Overview

- Purpose: Pair a checkbox with a single inline label.
- Figma component: `Checkbox-Label` (`COMPONENT`).
- Exposed properties: `Change_Text` (`TEXT`).
- Source: [Checkbox-Label in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=487-267&t=Ct0aRp93us7M1VzZ-4).

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `487:267`
- Proof artifact: `TBD`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
1. **Checkbox instance**: Nested `Checkbox` instance (`24 x 24`).
2. **Label text**: Text layer (`Label`) rendered to the right of the control.
3. **Auto layout row**: Horizontal container with `8px` item spacing.

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Change_Text` | `TEXT` | `Label` | `false` | Overrides the visible label string. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
## Visual Specifications

### Container

- Layout: `HORIZONTAL` Auto Layout.
- Width / height: `72 x 24` in the source node.
- Item spacing: `8px`.
- Padding: `0`.
- Token mapping for spacing/typography/color: `TBD`.

### Typography

- Label text style: `TBD` (text style name not verified in source metadata).
- Font family: `TBD`.
- Font size: `TBD`.
- Line height: `TBD`.

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| `N/A` | `TBD` | `TBD` | This component has no variant axis in Figma. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

- Default: Visible checkbox plus label text.
- Checked: Inherited from nested `Checkbox` instance behavior.
- Disabled / Hover / Focus / Pressed: `TBD` (not exposed directly at this component level).

## Usage Guidelines

### When to use

- Use for standalone options where text must clarify checkbox meaning.
- Use in preference forms and settings lists.

### When not to use

- Do not use for mutually exclusive options.
- Do not use when no label is available and meaning is ambiguous.

### Behavior

- Interactions: Checkbox state changes are inherited from the nested checkbox instance.
- Responsive behavior: `TBD`.
- Overflow/truncation: `TBD` for long labels.
- i18n/RTL: `TBD` for bidirectional text and mirrored layout behavior.

### Examples

1. Basic: Single “Subscribe” option with one checkbox and text label.
2. Contextual: Inline agreement option in a checkout form.

## Content Guidelines

- Keep label text concise and action-oriented.
- Use sentence case.
- Avoid ambiguous labels like “Option 1”.

## Accessibility

### 1. ARIA role and semantics

- Use semantic checkbox role through native `input[type="checkbox"]` where possible.
- Label text should be programmatically associated with the checkbox control.
- Additional ARIA patterns for wrapper implementations: `TBD`.

### 2. Keyboard navigation

- `Tab`: Focuses checkbox control.
- `Space`: Toggles checkbox state.
- Keyboard behavior for full-row click/focus wrappers: `TBD`.

### 3. Focus management

- Focus should target the checkbox control, not only the text node.
- Focus ring style/token mapping: `TBD`.
- Group focus flow in forms: `TBD`.

### 4. Labeling

- Visible label text should be used as accessible name.
- If label is visually hidden, provide equivalent `aria-label`/`aria-labelledby`.

### 5. Contrast and visibility

- Text and checkbox indicator must remain legible across background surfaces.
- Verified contrast values: `TBD (pending audit)`.

## Related Components

- [Checkbox](checkbox.md): Base control used inside this component.
- [Checkbox Label List](checkbox_label_list.md): Multi-item vertical composition of labeled checkboxes.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.label.text_color.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.row.spacing.default` is `TBD`. Specification value is unresolved.
