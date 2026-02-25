---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2046-7286
  page: Cards
  component: User-Card
  component_set_node_id: '2046:7286'
  last_verified: '2026-02-20'
  component_hash: a3a58e31f4b55d178e987bdd7ff4206904b6014508a7d843194200a989d2c105
  properties_count: 5
  variants_count: 2
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: f217e8821b368a7c450090ec5009a2756bf9e4568c95a983784c9aeb5cab660c
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
    generator_script_sha256: 58f557ac1ccb13d42ebfed358e645442256abb548e5aad6635c2672f31d7dfca
---

# User Card

The **User Card** component is documented from Figma component-set metadata and pending token-level verification.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`User-Card`) with the following properties:

- `Property 1`: `Person_Left`, `Person_Right`
- `Show_Tags_List`: `BOOLEAN` (default: `true`)
- `Show_User_Rating`: `BOOLEAN` (default: `true`)
- `Show_User_Right`: `BOOLEAN` (default: `true`)
- `Show_User_Stats`: `BOOLEAN` (default: `true`)

Source: [User-Card in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2046-7286)

### Visual Proof

![Visual proof snapshot](../_generated/visual-proofs/images/user_card.png)

- Screenshot: [Captured (2026-02-21)](https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/71856f73-f68e-4047-a3d7-fd4a1998e21a)
- Source node: `2046:7286`
- Image hash: `ff3613ebef0b86f854f05ab3e2f64ff7f41af058e14764a7fc3e846c2fb3fdfb`
- Variants captured: `2`
- Artifact: `../_generated/visual-proofs/user_card.json`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
1. **Container** (`COMPONENT`): hosts the primary layout and visual surface.
2. **Content** (`TEXT/INSTANCE`): variant-dependent content slots and text values.

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Property 1` | `VARIANT` | `Person_Left` | `true` | Variant selector extracted from Figma property `Property 1`. Allowed values: `Person_Left`, `Person_Right`. |
| `Show_Tags_List` | `BOOLEAN` | `true` | `false` | Property extracted from Figma property `Show_Tags_List`. |
| `Show_User_Rating` | `BOOLEAN` | `true` | `false` | Property extracted from Figma property `Show_User_Rating`. |
| `Show_User_Right` | `BOOLEAN` | `true` | `false` | Property extracted from Figma property `Show_User_Right`. |
| `Show_User_Stats` | `BOOLEAN` | `true` | `false` | Property extracted from Figma property `Show_User_Stats`. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
## Visual Specifications

### Container

- Layout and spacing values are pending verification from production token mappings.
- Variant-specific visual values should be captured in token mappings below.

### Typography

- Typography tokens: `TBD`.

### Token Mapping

| Part | Condition | Token | Fallback |
| --- | --- | --- | --- |
| `container.background` | `property_1=Person_Left` | `TBD` | `TBD` |
| `container.background` | `property_1=Person_Right` | `TBD` | `TBD` |

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `Property 1=Person_Left` | `TBD` | `TBD` | Variant captured from Figma property `Property 1`. |
| `Property 1=Person_Right` | `TBD` | `TBD` | Variant captured from Figma property `Property 1`. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

This component has no interactive states in the current Figma definition.

## Usage Guidelines

### Behavior

- **When to use**: Use User Card when this pattern is needed in the interface and matches its Figma variants.
- **When not to use**: Do not use User Card for scenarios not represented by its current variant/property contract.
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

- [ ] [SCHEMA_TBD] `token_mapping.container.background.property_1=Person_Left` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.property_1=Person_Right` is `TBD`. Specification value is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
