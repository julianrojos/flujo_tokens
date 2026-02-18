---
doc_type: component
doc_status: draft
figma:
  file_url: "https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System"
  page: "Bars"
  component: "Status-Bar"
  last_verified: "2026-02-18"
---

# Status Bar

The **Status Bar** component represents the top system status row for iPhone layouts.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Status-Bar`) with one variant property:

- `Background`: `Transparent`, `Brand`

Default variant in Figma: `Background=Transparent`.

All variants share the same structure and dimensions (`440 x 44`).

Source: [Status-Bar in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System)

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

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Background` | `VARIANT` | `Transparent` | `true` | Background style. Options: `Transparent`, `Brand`. |

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

### Iconography

- **Icons**: `Cellular Connection`, `Wifi`, `Battery`
- **Icons color token**: `Color/BW/Black`
- **Icons fallback**: `#000000`

### Token Mapping

| Part | Condition | Token | Fallback |
| --- | --- | --- | --- |
| `container.background` | `Background=Brand` | `Color/Background/Brand/Secondary` | `#C9E0BE` |
| `time.color` | all variants | `Color/BW/Black` | `#000000` |
| `icons.color` | all variants | `Color/BW/Black` | `#000000` |

## Variants

| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `Background=Transparent` | `—` | `Transparent` | No background fill |
| `Background=Brand` | `Color/Background/Brand/Secondary` | `#C9E0BE` | Brand secondary surface fill |

## States

This component has no interactive states.

## Usage Guidelines

- **When to use**: Use at the top edge of iPhone-oriented mockups and mobile layout compositions.
- **When not to use**: Do not use as an interactive toolbar or as a content container.
- **Do**: Keep internal layout structure unchanged (time left, icons right).
- **Do**: Use `Background=Transparent` or `Background=Brand` according to the parent surface.
- **Don't**: Override icon/time color without validating contrast.
- **Don't**: Treat this component as a replacement for app-level navigation.

## Content Guidelines

This component has no user-authored text content. Time/system indicators are system-driven.

## Accessibility

### 1. ARIA role and semantics

- In most documentation/prototype contexts, this component is decorative system chrome.
- If rendered in product UI, semantic treatment is `TBD` and should follow platform conventions.
- Required ARIA attributes are `TBD`.

### 2. Keyboard navigation

This component is not keyboard-interactive.

### 3. Focus management

- No focus behavior is defined in Figma.
- Focus outline tokens are not applicable unless this component becomes interactive (`TBD`).

### 4. Labeling

- If status data is meaningful for assistive tech, provide equivalent accessible text outside this visual component.
- Labeling strategy for implementation is `TBD`.

### 5. Contrast and visibility

- Time and icon foreground should remain visible against both transparent and brand backgrounds.
- Contrast verification is `TBD (pending audit)`.

## Related Components

- [Bottom Bar](bottom_bar.md): Use as complementary bottom navigation in mobile page chrome.
- [Alert](alert.md): Use for contextual feedback content, not for fixed device chrome.

## Gaps / TBD

- No dark mode or high-contrast variant.
- No configurable properties for time or signal/battery values.
- No platform variants beyond the current iPhone layout.
