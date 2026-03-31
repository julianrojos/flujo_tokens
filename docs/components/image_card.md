---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=124-4606
  page: Cards
  component: Image-Card
  component_set_node_id: '124:4606'
  last_verified: '2026-02-20'
  component_hash: fd031206779d01c9b6a4770ea206f6c1afee8bf5cef0050e867651acec9b4b7f
  properties_count: 5
  variants_count: 2
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: 85e2b82e326f4061e5b09fe88766da4cb4e320d2439305eafbbfe1b5c7062390
    token_registry_sha256: 1a773a12e76d7b30306dc82ad2b838888cfca8f408f2dfcef6049153f2b36054
    generator_script_sha256: 58f557ac1ccb13d42ebfed358e645442256abb548e5aad6635c2672f31d7dfca
---

# Image Card

The **Image Card** component is documented from Figma component-set metadata and pending token-level verification.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Image-Card`) with the following properties:

- `Type`: `Vertical`, `Horizontal`
- `Change_Coments_Count`: `TEXT` (default: `TBD`)
- `Show_Body`: `BOOLEAN` (default: `true`)
- `Show_Footer`: `BOOLEAN` (default: `true`)
- `Show_Title`: `BOOLEAN` (default: `true`)

Source: [Image-Card in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=124-4606)

### Visual Proof

![Visual proof snapshot](../_generated/visual-proofs/images/image_card.png)

- Screenshot: [Captured (2026-02-21)](https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/ed3ab793-eb9b-48a9-a856-1f1b104ec1d4)
- Source node: `124:4606`
- Image hash: `fc3c1cb2c256dcf23d3b75a286b052aa3d4b01ebd84d3df16fc2528b10d4048b`
- Variants captured: `2`

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
| `Type` | `VARIANT` | `Vertical` | `true` | Variant selector extracted from Figma property `Type`. Allowed values: `Vertical`, `Horizontal`. |
| `Change_Coments_Count` | `TEXT` | `TBD` | `false` | Property extracted from Figma property `Change_Coments_Count`. |
| `Show_Body` | `BOOLEAN` | `true` | `false` | Property extracted from Figma property `Show_Body`. |
| `Show_Footer` | `BOOLEAN` | `true` | `false` | Property extracted from Figma property `Show_Footer`. |
| `Show_Title` | `BOOLEAN` | `true` | `false` | Property extracted from Figma property `Show_Title`. |

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
| `container.background` | `type=Vertical` | `TBD` | `TBD` |
| `container.background` | `type=Horizontal` | `TBD` | `TBD` |

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `Type=Vertical` | `TBD` | `TBD` | Variant captured from Figma property `Type`. |
| `Type=Horizontal` | `TBD` | `TBD` | Variant captured from Figma property `Type`. |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

This component has no interactive states in the current Figma definition.

## Usage Guidelines

### Behavior

- **When to use**: Use Image Card when this pattern is needed in the interface and matches its Figma variants.
- **When not to use**: Do not use Image Card for scenarios not represented by its current variant/property contract.
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

- [ ] [SCHEMA_TBD] `token_mapping.container.background.type=Horizontal` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.type=Vertical` is `TBD`. Specification value is unresolved.
- [ ] [CONTENT_UNKNOWN] `properties.[1].default` is `TBD`. Content/anatomy/property detail is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
