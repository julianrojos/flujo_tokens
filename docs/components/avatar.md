---
doc_type: component
doc_status: needs-review
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=146-474
  page: Avatar
  component: Avatar
  component_set_node_id: '146:474'
  last_verified: '2026-02-19'
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: 39693a1eb5a40dc7623b6aeacb9ba3b59d3d3d61b9193e974b8187a1458ada31
    token_registry_sha256: 63fd456c9d17819aa952351ba1021104cbe9cb695874a3a78f4e52b35537f964
    generator_script_sha256: a1c709db54049eacb6f51b020134df6110fbfed9fcae5ba506df40502d85e7fc
---

# Avatar

The **Avatar** component displays a profile image inside a bordered rounded square.

## Overview

In Figma, this component is defined as a single `COMPONENT` (`Avatar`) with fixed structure:

- No variant properties
- No text overrides
- One image layer (`Img_bg`) inside a clipped container

Source: [Avatar in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=146-474)

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `146:474`
- Proof artifact: `TBD`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
Each avatar contains:

1. **Container** (`COMPONENT`, `90 x 90`)
2. **Img_bg** (`RECTANGLE`, `90 x 90`, image fill)

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name | Type | Default | Required | Description                                               |
| ---- | ---- | ------- | -------- | --------------------------------------------------------- |
| `—`  | `—`  | `—`     | `—`      | This component has no exposed Figma component properties. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
## Visual Specifications

### Container

- **Size**: `90 x 90`
- **Layout**: `NONE` (no Auto Layout)
- **Corner radius**: `8px` on all corners
- **Border**: `2px`, aligned `INSIDE`
- **Border color token**: `Color/Border/Neutral/Default`
- **Border color fallback**: `#9A9090`
- **Fill**: none
- **Clips content**: `true`

### Iconography

- Not applicable. This component renders an image surface, not an icon slot.

### Image Layer (`Img_bg`)

- **Node type**: `RECTANGLE`
- **Size**: `90 x 90`
- **Fill**: `IMAGE` with scale mode `FILL`
- **Strokes**: none

### Token Mapping

| Part                      | Condition    | Token                          | Fallback  |
| ------------------------- | ------------ | ------------------------------ | --------- |
| `container.border-color`  | all variants | `Color/Border/Neutral/Default` | `#9A9090` |
| `container.border-radius` | all variants | `Dimension/Border/Radius/200`  | `8px`     |
| `container.border-width`  | all variants | `Dimension/Border/Width/200`   | `2px`     |

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
This component has no variants in the current Figma definition.

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

This component has no interactive states.

## Usage Guidelines

- **When to use**: Use this component to represent a user or entity with a square profile image.
- **When not to use**: Do not use it for icon buttons or status indicators.
- **Do**: Use square image assets to avoid unpredictable cropping.
- **Do**: Keep avatar size consistent inside the same UI context.
- **Don't**: Stretch non-square images.
- **Don't**: Rely on this component for interaction states not defined in Figma.

## Content Guidelines

This component has no text content.

## Accessibility

### 1. ARIA role and semantics

- If rendered as a decorative image, use `aria-hidden="true"` or empty `alt`.
- If rendered as informative content, use semantic `img` with descriptive `alt`.
- For interactive usage, wrap in a semantic interactive element and define role semantics in implementation (`TBD`).

### 2. Keyboard navigation

This component is not keyboard-interactive by itself.

### 3. Focus management

- No focus behavior is defined in the Figma component.
- If used in an interactive wrapper, focus behavior is `TBD`.
- Focus outline tokens (`Semantic.Color.Focus-Outline.Inner` (`#FFFFFF`), `Semantic.Color.Focus-Outline.Outer` (`#567680`)) apply only when wrapped in a focusable control.

### 4. Labeling

- Informative usage requires descriptive `alt` text.
- Decorative usage should avoid redundant labeling.
- `aria-label` and `aria-labelledby` patterns are `TBD` for clickable wrappers.

### 5. Contrast and visibility

- Border visibility should remain distinguishable against surrounding surfaces.
- Contrast verification is `TBD (pending audit)`.

## Related Components

- [Bottom Bar](bottom_bar.md): Use for navigation actions; avatar may appear inside destinations opened from navigation.
- [Alert](alert.md): Use for feedback messaging; avatar should not be used as feedback status.
