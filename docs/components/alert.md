# Alert

The **Alert** component communicates concise feedback messages in a highly visible inline block.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Alert`) with one variant property:

- `Type`: `Information`, `Warning`, `Positive`

All variants share the same structure, spacing, and typography. Visual meaning is conveyed through semantic border and icon color tokens.

## Anatomy

Each alert contains:

1. **Container** (`Auto Layout`, horizontal)
2. **Leading icon** (`24 x 24`, internal vector `18 x 18`)
3. **Text container** with a single message text node

Current variant dimensions in Figma:

- `Type=Information`: `383 x 38`
- `Type=Warning`: `383 x 38`
- `Type=Positive`: `383 x 38`

## Component API

### Properties

| Name                  | Type      | Default Value    | Description                                                          |
| :-------------------- | :-------- | :--------------- | :------------------------------------------------------------------- |
| `Type`                | `VARIANT` | `Information`    | Semantic alert state. Options: `Information`, `Warning`, `Positive`. |
| `Change_Message_Text` | `TEXT`    | `Text text text` | Main alert message content.                                          |

## Visual Specifications

### Container

- **Layout**: Auto Layout, `HORIZONTAL`
- **Item spacing**: `8px`
- **Padding**: `7px` top and bottom, `8px` left and right
- **Corner radius**: `8px`
- **Border**: `2px`, aligned `INSIDE`
- **Background token**: `Color/Background/Feedback/Default`
- **Background fallback**: `#FFFFFF`

### Typography

- **Text style**: `Regular/Body 16`
- **Font**: `Nunito Sans Regular`
- **Size / line height**: `16 / 24`
- **Letter spacing**: `0%`
- **Text color token**: `Color/Text/Neutral/Default`
- **Text color fallback**: `#483F3F`

### Variants

| Variant       | Border token                                                | Border fallback | Icon component                 | Icon token                                                 | Icon fallback |
| :------------ | :---------------------------------------------------------- | :-------------- | :----------------------------- | :--------------------------------------------------------- | :------------ |
| `Information` | `Color/Border/Feedback/Information` | `#BAA06B`       | `information-circle-contained` | `Color/Icon/Feedback/Information` | `#9D8555`     |
| `Warning`     | `Color/Border/Feedback/Danger`      | `#B22222`       | `x-circle-contained`           | `Color/Icon/Feedback/Danger`      | `#B22222`     |
| `Positive`    | `Color/Border/Feedback/Success`     | `#299157`       | `check-contained`              | `Color/Icon/Feedback/Success`     | `#299157`     |

## Usage Guidelines

- Use `Information` for neutral status or contextual updates.
- Use `Warning` for error or risky states that require user attention.
- Use `Positive` for successful outcomes and confirmations.
- Keep message copy short and direct, ideally one sentence.

## Notes For Implementation

- Keep icon size fixed at `24 x 24` to preserve alignment.
- Keep the 8px horizontal gap between icon and text container.
- Do not replace semantic feedback tokens with neutral borders, as this removes the state meaning.
