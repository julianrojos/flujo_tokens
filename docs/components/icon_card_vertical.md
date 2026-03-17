---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2168-1387
  page: Cards
  component: Icon-Card-Vertical
  component_set_node_id: '2168:1387'
  last_verified: '2026-02-20'
  component_hash: 524c77c56853ddfe2bbed4c19852a0bfa8eb0b036771f8ada30bc53514e82a6b
  properties_count: 4
  variants_count: 6
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: 610b2f1d2b4427f990e9c4bf28995f506e14b040df2f6a92a267cb9d6da63cfa
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
    generator_script_sha256: 58f557ac1ccb13d42ebfed358e645442256abb548e5aad6635c2672f31d7dfca
---

# Icon Card Vertical

The **Icon Card Vertical** component is documented from Figma component-set metadata and pending token-level verification.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Icon-Card-Vertical`) with the following properties:

- `Background`: `Palette_2`, `Palette_3`, `Palette_4`, `Palette_6`, `Palette_7`, `Palette_1`
- `Change_Card_Text`: `TEXT` (default: `Icon card text icon card text icon card text icon card text icon ca`)
- `Change_Card_Title`: `TEXT` (default: `Icon card title icon card title`)
- `Change_Icon`: `INSTANCE_SWAP` (default: `65:1033`)

Source: [Icon-Card-Vertical in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2168-1387)

### Visual Proof

![Visual proof snapshot](../_generated/visual-proofs/images/icon_card_vertical.png)

- Screenshot: [Captured (2026-02-21)](https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/d5b991d8-2b98-4593-ba80-a1d16042b83e)
- Source node: `2168:1387`
- Image hash: `381dda19495e8c38d2c50d225e5125cc0dc7971e1da525a20ead1e132d5e1fd5`
- Variants captured: `6`
- Artifact: `../_generated/visual-proofs/icon_card_vertical.json`

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
| `Background` | `VARIANT` | `Palette_1` | `true` | Variant selector extracted from Figma property `Background`. Allowed values: `Palette_2`, `Palette_3`, `Palette_4`, `Palette_6`, `Palette_7`, `Palette_1`. |
| `Change_Card_Text` | `TEXT` | `Icon card text icon card text icon card text icon card text icon ca` | `false` | Property extracted from Figma property `Change_Card_Text`. |
| `Change_Card_Title` | `TEXT` | `Icon card title icon card title` | `false` | Property extracted from Figma property `Change_Card_Title`. |
| `Change_Icon` | `INSTANCE_SWAP` | `65:1033` | `false` | Property extracted from Figma property `Change_Icon`. |

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
| `container.background` | `background=Palette_2` | `TBD` | `TBD` |
| `container.background` | `background=Palette_3` | `TBD` | `TBD` |
| `container.background` | `background=Palette_4` | `TBD` | `TBD` |
| `container.background` | `background=Palette_6` | `TBD` | `TBD` |
| `container.background` | `background=Palette_7` | `TBD` | `TBD` |
| `container.background` | `background=Palette_1` | `TBD` | `TBD` |

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `Background=Palette_2` | `TBD` | `TBD` | Variant captured from Figma property `Background`. |
| `Background=Palette_3` | `TBD` | `TBD` | Variant captured from Figma property `Background`. |
| `Background=Palette_4` | `TBD` | `TBD` | Variant captured from Figma property `Background`. |
| `Background=Palette_6` | `TBD` | `TBD` | Variant captured from Figma property `Background`. |
| `Background=Palette_7` | `TBD` | `TBD` | Variant captured from Figma property `Background`. |
| `Background=Palette_1` | `TBD` | `TBD` | Variant captured from Figma property `Background`. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

This component has no interactive states in the current Figma definition.

## Usage Guidelines

### Behavior

- **When to use**: Use Icon Card Vertical when this pattern is needed in the interface and matches its Figma variants.
- **When not to use**: Do not use Icon Card Vertical for scenarios not represented by its current variant/property contract.
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

- [ ] [SCHEMA_TBD] `token_mapping.container.background.background=Palette_1` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background=Palette_2` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background=Palette_3` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background=Palette_4` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background=Palette_6` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background=Palette_7` is `TBD`. Specification value is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
