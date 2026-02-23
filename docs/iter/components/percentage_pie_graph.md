---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2479-2696
  page: Pie Graph
  component: Percentage-Pie-Graph
  component_set_node_id: 2479:2696
  last_verified: "2026-02-19"
pipeline:
  ds_component_doc:
    contract_version: "1"
    spec_sha256: 283b67380c19c35c2febe521545185c6faabb85e8722a790ef854d6cdbc323fd
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
    generator_script_sha256: a1c709db54049eacb6f51b020134df6110fbfed9fcae5ba506df40502d85e7fc
---

# Percentage Pie Graph

The **Percentage Pie Graph** component visualizes a single percentage value in a circular chart.

## Overview

In Figma, this component is defined as a single `COMPONENT` (`Percentage-Pie-Graph`) with two text properties:

- `Change_Graph_Number`: `65%` (default)
- `Change_Graph_Text`: `Graph text` (default)

Source: [Percentage Pie Graph in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2479-2696)

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `2479:2696`
- Proof artifact: `TBD`

## Anatomy

The component includes:

1. **Background ring** (`ELLIPSE`)
2. **Base ring** (`ELLIPSE`)
3. **Progress ring** (`ELLIPSE`)
4. **Content frame** (`FRAME`, vertical)
5. **Value text** (percentage)
6. **Label text** (supporting label)

## Component API

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Change_Graph_Number` | `TEXT` | `65%` | `false` | Overrides the central percentage value text. |
| `Change_Graph_Text` | `TEXT` | `Graph text` | `false` | Overrides the supporting graph label text. |

## Visual Specifications

### Container

- Component size: `174 x 177`
- Root layout: `NONE`
- Content frame size: `122 x 95`
- Content frame layout: `VERTICAL`

### Token Mapping

| Part | Condition | Token | Fallback |
| --- | --- | --- | --- |
| `background_ring.stroke` | default | `TBD` | `TBD` |
| `base_ring.stroke` | default | `TBD` | `TBD` |
| `progress_ring.stroke` | default | `TBD` | `TBD` |
| `value_text.color` | default | `TBD` | `TBD` |
| `label_text.color` | default | `TBD` | `TBD` |

## Variants

This component has no variant axis in the current Figma definition.

## States

This component has no interactive states in the current Figma definition.

## Usage Guidelines

### Behavior

- **When to use**: Use to display one compact progress percentage metric.
- **When not to use**: Do not use for complex comparative analytics.
- **Do**: Keep value and label concise and readable in the center frame.
- **Don't**: Overload with long descriptive strings.
- Responsive behavior: `TBD`
- Overflow / truncation behavior: `TBD`
- i18n / RTL behavior: `TBD`

### Examples

- Basic example: `65%` value with short label in dashboard card.
- Contextual example: completion indicator in summary section.

## Content Guidelines

- Keep percentage values normalized and consistent.
- Keep label text short enough to avoid center overflow.

## Accessibility

### 1. ARIA role and semantics

- Expected semantic role: `img` with equivalent text alternative.
- Provide accessible text that includes both value and metric meaning.

### 2. Keyboard navigation

This component is not keyboard-interactive by itself.

### 3. Focus management

- No focus behavior is defined for this visual component.
- Focus behavior for wrappers is `TBD`.

### 4. Labeling

- Accessible label should include percentage and contextual metric.
- Do not rely only on color to communicate meaning.

### 5. Contrast and visibility

- Contrast validation for ring and text colors is `TBD (pending audit)`.

## Related Components

- [Image](image.md): Both are visual-only elements but serve different semantic purposes.
- [Alert](alert.md): Use Alert for textual feedback, not metric visualization.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.background_ring.stroke.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.base_ring.stroke.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.label_text.color.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.progress_ring.stroke.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.value_text.color.default` is `TBD`. Specification value is unresolved.
