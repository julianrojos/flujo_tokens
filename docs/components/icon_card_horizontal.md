---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2097-613
  page: Cards
  component: Icon-Card-Horizontal
  component_set_node_id: '2097:613'
  last_verified: '2026-02-20'
  component_hash: 97b54a18f3ac6b335fd582a41817c1dc5f287c619ebacf8a6ae45b2658e5bfd2
  properties_count: 2
  variants_count: 2
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: f707bc6fbf24543eb9ec10240bbb8669d3fafdacd195b482062b62b914fa37a2
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
    generator_script_sha256: 58f557ac1ccb13d42ebfed358e645442256abb548e5aad6635c2672f31d7dfca
---

# Icon Card Horizontal

The **Icon Card Horizontal** component is documented from Figma component-set metadata and pending token-level verification.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Icon-Card-Horizontal`) with the following properties:

- `Icon_Position`: `Left`, `Right`
- `Show_Card_Footer`: `BOOLEAN` (default: `true`)

Source: [Icon-Card-Horizontal in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2097-613)

### Visual Proof

![Visual proof snapshot](../_generated/visual-proofs/images/icon_card_horizontal.png)

- Screenshot: [Captured (2026-02-21)](https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/c59571aa-f925-4a98-9f22-4214394804a9)
- Source node: `2097:613`
- Image hash: `c1659855665707566eabf32f3987859932d25bf246eaea7090abe652bd52cb50`
- Variants captured: `2`
- Artifact: `../_generated/visual-proofs/icon_card_horizontal.json`

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
| `Icon_Position` | `VARIANT` | `Left` | `true` | Variant selector extracted from Figma property `Icon_Position`. Allowed values: `Left`, `Right`. |
| `Show_Card_Footer` | `BOOLEAN` | `true` | `false` | Property extracted from Figma property `Show_Card_Footer`. |

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
| `container.background` | `icon_position=Left` | `TBD` | `TBD` |
| `container.background` | `icon_position=Right` | `TBD` | `TBD` |

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `Icon_Position=Left` | `TBD` | `TBD` | Variant captured from Figma property `Icon_Position`. |
| `Icon_Position=Right` | `TBD` | `TBD` | Variant captured from Figma property `Icon_Position`. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

This component has no interactive states in the current Figma definition.

## Usage Guidelines

### Behavior

- **When to use**: Use Icon Card Horizontal when this pattern is needed in the interface and matches its Figma variants.
- **When not to use**: Do not use Icon Card Horizontal for scenarios not represented by its current variant/property contract.
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

- [ ] [SCHEMA_TBD] `token_mapping.container.background.icon_position=Left` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.icon_position=Right` is `TBD`. Specification value is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
