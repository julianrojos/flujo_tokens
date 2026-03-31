---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2053-7862
  page: Cards
  component: Card-Icon-Container
  component_set_node_id: '2053:7862'
  last_verified: '2026-02-20'
  component_hash: 39d08fd18b0278dc470f12d2216ef10afe3aa6ffbc667c558c2edeebfd1e5be5
  properties_count: 2
  variants_count: 6
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: 88ca15df3e5dd43b2dab1c9498dae6bc1516ba774647ba31bfa688d00ba7c321
    token_registry_sha256: 1a773a12e76d7b30306dc82ad2b838888cfca8f408f2dfcef6049153f2b36054
    generator_script_sha256: 58f557ac1ccb13d42ebfed358e645442256abb548e5aad6635c2672f31d7dfca
---

# Card Icon Container

The **Card Icon Container** component is documented from Figma component-set metadata and pending token-level verification.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Card-Icon-Container`) with the following properties:

- `Background_Color`: `Background_Color1`, `Background_Color2`, `Background_Color3`, `Background_Color4`, `Background_Color5`, `Background_Color6`
- `Change_Icon`: `INSTANCE_SWAP` (default: `65:710`)

Source: [Card-Icon-Container in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2053-7862)

### Visual Proof

![Visual proof snapshot](../_generated/visual-proofs/images/card_icon_container.png)

- Screenshot: [Captured (2026-02-21)](https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/055475f8-c777-46e4-81f9-28c00443abe2)
- Source node: `2053:7862`
- Image hash: `24eda7362b4193d85778248d1a4f97744d8ce0a998b7faac4e6b8b5564c2d43e`
- Variants captured: `6`

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
| `Background_Color` | `VARIANT` | `Background_Color1` | `true` | Variant selector extracted from Figma property `Background_Color`. Allowed values: `Background_Color1`, `Background_Color2`, `Background_Color3`, `Background_Color4`, `Background_Color5`, `Background_Color6`. |
| `Change_Icon` | `INSTANCE_SWAP` | `65:710` | `false` | Property extracted from Figma property `Change_Icon`. |

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
| `container.background` | `background_color=Background_Color1` | `TBD` | `TBD` |
| `container.background` | `background_color=Background_Color2` | `TBD` | `TBD` |
| `container.background` | `background_color=Background_Color3` | `TBD` | `TBD` |
| `container.background` | `background_color=Background_Color4` | `TBD` | `TBD` |
| `container.background` | `background_color=Background_Color5` | `TBD` | `TBD` |
| `container.background` | `background_color=Background_Color6` | `TBD` | `TBD` |

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `Background_Color=Background_Color1` | `TBD` | `TBD` | Variant captured from Figma property `Background_Color`. |
| `Background_Color=Background_Color2` | `TBD` | `TBD` | Variant captured from Figma property `Background_Color`. |
| `Background_Color=Background_Color3` | `TBD` | `TBD` | Variant captured from Figma property `Background_Color`. |
| `Background_Color=Background_Color4` | `TBD` | `TBD` | Variant captured from Figma property `Background_Color`. |
| `Background_Color=Background_Color5` | `TBD` | `TBD` | Variant captured from Figma property `Background_Color`. |
| `Background_Color=Background_Color6` | `TBD` | `TBD` | Variant captured from Figma property `Background_Color`. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

This component has no interactive states in the current Figma definition.

## Usage Guidelines

### Behavior

- **When to use**: Use Card Icon Container when this pattern is needed in the interface and matches its Figma variants.
- **When not to use**: Do not use Card Icon Container for scenarios not represented by its current variant/property contract.
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

- [ ] [SCHEMA_TBD] `token_mapping.container.background.background_color=Background_Color1` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background_color=Background_Color2` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background_color=Background_Color3` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background_color=Background_Color4` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background_color=Background_Color5` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.background_color=Background_Color6` is `TBD`. Specification value is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
