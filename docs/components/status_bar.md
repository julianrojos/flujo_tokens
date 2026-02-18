# Status Bar

The **Status Bar** component represents the top system status row for iPhone layouts.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Status-Bar`) with one variant property:

- `Background`: `Transparent`, `Brand`

Default variant in Figma: `Background=Transparent`.

All variants share the same structure and dimensions (`440 x 44`).

Source node: [Status-Bar (node `713:202`)](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=713-202)

## Anatomy

Each status bar contains:

1. **Container** (`COMPONENT`, `440 x 44`)
2. **OS row** (`FRAME`, `376 x 18`) positioned at `x=32`, `y=13`
3. **Time group** with text `9:41`
4. **Icons row** (`FRAME`, horizontal) with:
   - `Cellular Connection` (`VECTOR`)
   - `Wifi` (`VECTOR`)
   - `Battery` (`VECTOR`)

## Component API

### Properties

| Name | Type | Default Value | Description |
| :--- | :--- | :------------ | :---------- |
| `Background` | `VARIANT` | `Transparent` | Background style. Options: `Transparent`, `Brand`. |

## Visual Specifications

### Container

- **Variant size**: `440 x 44`
- **Layout**: `NONE` (no Auto Layout at root)
- **Clips content**: `true`
- **Border**: none
- **Corner radius**: `0`

### OS Row

- **Node**: `FRAME`
- **Size**: `376 x 18`
- **Layout**: Auto Layout, `HORIZONTAL`
- **Item spacing**: `229`
- **Children**:
  - Left: time label (`9:41`)
  - Right: icons frame (`65.98 x 11`, Auto Layout `HORIZONTAL`, spacing `5`)

### Typography

- **Time text**: `9:41`
- **Font**: `Roboto Medium`
- **Size**: `15`
- **Line height**: `AUTO`
- **Letter spacing**: `0%`

### Variants

| Variant | Background fill | Token | Fallback |
| :------ | :-------------- | :---- | :------- |
| `Background=Transparent` | None | — | Transparent |
| `Background=Brand` | Solid fill | `Color/Background/Brand/Secondary` (`VariableID:4400:1267`) | `#C9E0BE` |

## Tokens Used

| Slot | Condition | Token | Alias chain | Resolved value |
| :--- | :-------- | :---- | :---------- | :------------- |
| Background fill | `Background=Brand` | `Color/Background/Brand/Secondary` (`VariableID:4400:1267`) | `Color/Cucumber/200` (`VariableID:40:206`) | `#C9E0BE` |
| Time text color | All variants | `Color/BW/Black` (`VariableID:40:195`) | — | `#000000` |
| Status icons color | All variants | `Color/BW/Black` (`VariableID:40:195`) | — | `#000000` |

## Usage Guidelines

- Use this component at the top edge of iPhone mockups and flows.
- Preserve the internal horizontal structure (time on the left, status icons on the right).
- Use `Background=Transparent` on light/neutral surfaces where the screen background should remain visible.
- Use `Background=Brand` when the status bar needs to sit on the brand secondary background.

## Accessibility

- This component is decorative UI chrome in most product contexts.
- If status information is meaningful in a prototype, provide equivalent text outside this component.
- No interaction or focus states are defined in Figma for this component.

## Gaps / TBD

- No dark mode or high-contrast variant.
- No configurable properties for time or signal/battery values.
- No platform variants beyond the current iPhone layout.
