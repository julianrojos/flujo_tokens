---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=683-264
  page: Rating Stars
  component: Rating_Stars
  component_set_node_id: '683:264'
  last_verified: '2026-02-20'
  component_hash: 61ac9cecad58b82805c6d263c95ffd782430b72be5cb7304bf8ae258f1f8bf16
  properties_count: 1
  variants_count: 6
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: 711db0b612f8b4f2b3a680e4fa493df88d9b556ca4f6f33ce6310d0030201123
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
    generator_script_sha256: 58f557ac1ccb13d42ebfed358e645442256abb548e5aad6635c2672f31d7dfca
---

# Rating Stars

The **Rating Stars** component is documented from Figma component-set metadata and pending token-level verification.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Rating_Stars`) with the following properties:

- `Stars_Number`: `5`, `4`, `3`, `1`, `2`, `0`

Source: [Rating_Stars in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=683-264)

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `683:264`
- Proof artifact: `TBD`

## Anatomy

1. **Container** (`COMPONENT`): hosts the primary layout and visual surface.
2. **Content** (`TEXT/INSTANCE`): variant-dependent content slots and text values.

## Component API

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Stars_Number` | `VARIANT` | `5` | `true` | Variant selector extracted from Figma property `Stars_Number`. Allowed values: `5`, `4`, `3`, `1`, `2`, `0`. |

## Visual Specifications

### Container

- Layout and spacing values are pending verification from production token mappings.
- Variant-specific visual values should be captured in token mappings below.

### Typography

- Typography tokens: `TBD`.

### Token Mapping

| Part | Condition | Token | Fallback |
| --- | --- | --- | --- |
| `container.background` | `stars_number=5` | `TBD` | `TBD` |
| `container.background` | `stars_number=4` | `TBD` | `TBD` |
| `container.background` | `stars_number=3` | `TBD` | `TBD` |
| `container.background` | `stars_number=1` | `TBD` | `TBD` |
| `container.background` | `stars_number=2` | `TBD` | `TBD` |
| `container.background` | `stars_number=0` | `TBD` | `TBD` |

## Variants

| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `Stars_Number=5` | `TBD` | `TBD` | Variant captured from Figma property `Stars_Number`. |
| `Stars_Number=4` | `TBD` | `TBD` | Variant captured from Figma property `Stars_Number`. |
| `Stars_Number=3` | `TBD` | `TBD` | Variant captured from Figma property `Stars_Number`. |
| `Stars_Number=1` | `TBD` | `TBD` | Variant captured from Figma property `Stars_Number`. |
| `Stars_Number=2` | `TBD` | `TBD` | Variant captured from Figma property `Stars_Number`. |
| `Stars_Number=0` | `TBD` | `TBD` | Variant captured from Figma property `Stars_Number`. |

## States

This component has no interactive states in the current Figma definition.

## Usage Guidelines

### Behavior

- **When to use**: Use Rating Stars when this pattern is needed in the interface and matches its Figma variants.
- **When not to use**: Do not use Rating Stars for scenarios not represented by its current variant/property contract.
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

- [ ] [SCHEMA_TBD] `token_mapping.container.background.stars_number=0` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.stars_number=1` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.stars_number=2` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.stars_number=3` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.stars_number=4` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.stars_number=5` is `TBD`. Specification value is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
