# Avatar

The **Avatar** component displays a profile image inside a bordered rounded square.

## Overview

In Figma, this component is defined as a single `COMPONENT` (`Avatar`) with fixed structure:

- No variant properties
- No text overrides
- One image layer (`Img_bg`) inside a clipped container

Source node: [Avatar (node `146:474`)](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=146-474)

## Anatomy

Each avatar contains:

1. **Container** (`COMPONENT`, `90 x 90`)
2. **Img_bg** (`RECTANGLE`, `90 x 90`, image fill)

## Component API

### Properties

| Name | Type | Default Value | Description |
| :--- | :--- | :------------ | :---------- |
| — | — | — | No exposed Figma properties. |

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

### Image Layer (`Img_bg`)

- **Node type**: `RECTANGLE`
- **Size**: `90 x 90`
- **Fill**: `IMAGE` with scale mode `FILL`
- **Strokes**: none

## Tokens Used

| Slot | Figma binding | Semantic token | Primitive alias | Resolved value |
| :--- | :------------ | :------------- | :-------------- | :------------- |
| Border color | `strokes` | `Color/Border/Neutral/Default` | `Color/Grey/500` | `#9A9090` |
| Border radius | `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius` | `Dimension/Border/Radius/200` | `Dimension/Border/Radius/8` | `8` |
| Border width | `strokeTopWeight`, `strokeBottomWeight`, `strokeLeftWeight`, `strokeRightWeight` | `Dimension/Border/Width/200` | `Dimension/Border/Width/2` | `2` |

## Usage Guidelines

- Use square source images whenever possible to avoid unexpected crops.
- Keep avatar sizes consistent within the same UI context.
- For missing images, define a product fallback strategy (initials or placeholder icon) in code.

## Accessibility

- If decorative only, set `aria-hidden="true"`.
- If informative, provide descriptive `alt` text.
- If clickable, use an interactive wrapper (`button`/`a`) with an accessible name.
- This Figma component does not define a dedicated focus/interaction state.

## Gaps / TBD

- No size variants (`sm`, `md`, `lg`, etc.) in Figma.
- No explicit fallback variant for empty/missing image.
- No explicit interaction states (`hover`, `focus`, `selected`, `disabled`).
