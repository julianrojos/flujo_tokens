---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2429-2493
  page: Tabs
  component: Tab
  component_set_node_id: '2429:2493'
  last_verified: '2026-02-20'
  component_hash: 2de047105e026a7dad3d44df54d77273464cfc078ef84457eed0db99eaf86be0
  properties_count: 2
  variants_count: 2
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: cf010a78745a69dd29156ace99791f65f19a8fb34b3af98f848654b8fec2e367
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
    generator_script_sha256: 58f557ac1ccb13d42ebfed358e645442256abb548e5aad6635c2672f31d7dfca
---

# Tab

The **Tab** component is documented from Figma component-set metadata and pending token-level verification.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Tab`) with the following properties:

- `State`: `Default`, `Selected`
- `Change_Tab_Text`: `TEXT` (default: `TBD`)

Source: [Tab in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2429-2493)

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `2429:2493`
- Proof artifact: `TBD`

## Anatomy

1. **Container** (`COMPONENT`): hosts the primary layout and visual surface.
2. **Content** (`TEXT/INSTANCE`): variant-dependent content slots and text values.

## Component API

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `State` | `VARIANT` | `Default` | `true` | Variant selector extracted from Figma property `State`. Allowed values: `Default`, `Selected`. |
| `Change_Tab_Text` | `TEXT` | `TBD` | `false` | Property extracted from Figma property `Change_Tab_Text`. |

## Visual Specifications

### Container

- Layout and spacing values are pending verification from production token mappings.
- Variant-specific visual values should be captured in token mappings below.

### Typography

- Typography tokens: `TBD`.

### Token Mapping

| Part | Condition | Token | Fallback |
| --- | --- | --- | --- |
| `container.background` | `state=Default` | `TBD` | `TBD` |
| `container.background` | `state=Selected` | `TBD` | `TBD` |

## Variants

| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `State=Default` | `TBD` | `TBD` | Variant captured from Figma property `State`. |
| `State=Selected` | `TBD` | `TBD` | Variant captured from Figma property `State`. |

## States

State variants in Figma:

- `default`
- `selected`

## Usage Guidelines

### Behavior

- **When to use**: Use Tab when this pattern is needed in the interface and matches its Figma variants.
- **When not to use**: Do not use Tab for scenarios not represented by its current variant/property contract.
- **Do**: Use the variant and property contract exactly as defined in Figma. Validate visual behavior before promoting to ready status.
- **Don't**: Do not overload this component with semantics it was not designed for. Do not hardcode colors or spacing outside the token system.
- Responsive behavior: `TBD`
- Overflow / truncation behavior: `TBD`
- i18n / RTL behavior: `TBD`

### Examples

- Basic example: use the default variant in its target layout.
- Contextual example: compose this component inside its parent pattern.

## Content Guidelines

- Keep content concise and aligned with product voice.
- Do not exceed space available in the default variant without overflow handling.

## Accessibility

### 1. ARIA role and semantics

- Role: `TBD`.

### 2. Keyboard navigation

- Keyboard behavior is `TBD` pending interaction audit.

### 3. Focus management

- Inner focus token: `TBD`.
- Outer focus token: `TBD`.

### 4. Labeling

- Provide an accessible name when interactive.
- Avoid redundant announcements for decorative content.

### 5. Contrast and visibility

- Contrast requirements are `TBD (pending audit)`.

## Related Components

- `TBD`

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.container.background.state=Default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.state=Selected` is `TBD`. Specification value is unresolved.
- [ ] [CONTENT_UNKNOWN] `properties.[1].default` is `TBD`. Content/anatomy/property detail is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
