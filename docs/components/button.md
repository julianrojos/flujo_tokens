---
doc_type: component
doc_status: needs-review
figma:
  file_url: "https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=68-4097"
  page: "Button"
  component: "Button"
  last_verified: "2026-02-18"
---

# Button

The **Button** component triggers a user action with optional leading and trailing icons.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Button`) with two variant properties:

- `State`: `Default`, `Hover`, `Active`, `Disabled`
- `Type`: `Primary`, `Secondary`, `Cancel`

It also exposes content and visibility properties for text and icon instances:

- `↳ Change txt` (`TEXT`)
- `View txt` (`BOOLEAN`)
- `View icn left` (`BOOLEAN`)
- `View icn right` (`BOOLEAN`)
- `↳ Change icn left` (`INSTANCE_SWAP`)
- `↳ Change icn right` (`INSTANCE_SWAP`)

All 12 variants share the same frame size and auto-layout structure.

Source: [Button in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=68-4097)

## Anatomy

1. **Container**: Horizontal auto-layout frame that carries background, border, radius, and state/type styling.
2. **Leading icon**: Optional `INSTANCE` (default icon: `arrow-left-square-contained`, `24 x 24`).
3. **Label**: Optional `TEXT` node (default content: `Button`).
4. **Trailing icon**: Optional `INSTANCE` (default icon: `arrow-right-square-contained`, `24 x 24`).

Current variant dimensions in Figma:

- All variants: `133 x 44`

## Component API

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `State` | `VARIANT` | `Default` | `true` | Interaction state axis. Options: `Default`, `Hover`, `Active`, `Disabled`. |
| `Type` | `VARIANT` | `Primary` | `true` | Semantic style axis. Options: `Primary`, `Secondary`, `Cancel`. |
| `↳ Change txt` | `TEXT` | `Button` | `TBD` | Overrides the label copy. |
| `View txt` | `BOOLEAN` | `true` | `TBD` | Toggles label visibility. |
| `View icn left` | `BOOLEAN` | `true` | `TBD` | Toggles leading icon visibility. |
| `View icn right` | `BOOLEAN` | `true` | `TBD` | Toggles trailing icon visibility. |
| `↳ Change icn left` | `INSTANCE_SWAP` | `65:430` | `TBD` | Swaps the leading icon instance from preferred icon options. |
| `↳ Change icn right` | `INSTANCE_SWAP` | `65:434` | `TBD` | Swaps the trailing icon instance from preferred icon options. |

## Visual Specifications

### Container

- **Layout**: Auto Layout, `HORIZONTAL`, center-aligned on both axes
- **Size**: `133 x 44`
- **Item spacing**: `8px` via `Dimension/Spacing/400` (`8`)
- **Padding**: `10px` all sides via `Dimension/Spacing/500` (`10`)
- **Corner radius**: `8px` via `Dimension/Border/Radius/200` (`8`)
- **Border width**: `1px` via `Dimension/Border/Width/100` (`1`)
- **Border color**: `Color/Border/Neutral/Alpha-10` (`#0000001A`)
- **Minimum height token**: `A11y/Dimension/Min-Hit-Area` (`24`)
- **Minimum width token**: `TBD` (binding exists but token name is unresolved in current file metadata)

### Typography

- **Font family**: `Nunito Sans` via `Font/Family/Body` (`Nunito Sans`)
- **Font style**: `Regular` via `Font/Weight/Regular` (`regular`)
- **Font size**: `16` via `Font/Size/300` (`16`)
- **Line height**: `24` via `Font/Line-Height/300` (`24`)
- **Letter spacing**: `0%`

### Iconography

- **Leading icon**: default `arrow-left-square-contained`, `24 x 24`
- **Trailing icon**: default `arrow-right-square-contained`, `24 x 24`
- **Icon color token mapping**: `TBD` at this component-set level (icons are nested instances)

### Elevation

- **Default state shadow tokens**: `Dimension/Shadow/X/Default/100` (`0`), `Dimension/Shadow/Y/Default/100` (`4`), `Dimension/Shadow/Blur/Default/100` (`12`), `Dimension/Shadow/Spread/Default/100` (`0`), `Color/Shadow/100` (`#00000014`)
- **Hover state shadow tokens**: `Dimension/Shadow/X/Default/200` (`0`), `Dimension/Shadow/Y/Default/200` (`4`), `Dimension/Shadow/Blur/Default/200` (`16`), `Dimension/Shadow/Spread/Default/200` (`0`), `Color/Shadow/200` (`#00000029`)
- **Active / Disabled**: no bound effect tokens in current variants

### Token Mapping

| Part | Condition | Token | Fallback |
| --- | --- | --- | --- |
| `container.background` | `type=Primary,state=Default` | `Color/Background/Action/Primary/Default` | `#ADD8E6` |
| `container.background` | `type=Primary,state=Hover` | `Color/Background/Action/Primary/Hover` | `#C5F0FF` |
| `container.background` | `type=Primary,state=Active` | `Color/Background/Action/Primary/Active` | `#96BFCC` |
| `container.background` | `type=Secondary,state=Default` | `Color/Background/Action/Secondary/Default` | `#C9E0BE` |
| `container.background` | `type=Secondary,state=Hover` | `Color/Background/Action/Secondary/Hover` | `#E0F7D6` |
| `container.background` | `type=Secondary,state=Active` | `Color/Background/Action/Secondary/Active` | `#B2C9A7` |
| `container.background` | `type=Cancel,state=Default` | `Color/Background/Action/Danger/Default` | `#B22222` |
| `container.background` | `type=Cancel,state=Hover` | `Color/Background/Action/Danger/Hover` | `#D43636` |
| `container.background` | `type=Cancel,state=Active` | `Color/Background/Action/Danger/Active` | `#901212` |
| `container.background` | `state=Disabled` | `Color/Background/Action/Disabled/Default` | `#ECECEC` |
| `container.border` | all variants | `Color/Border/Neutral/Alpha-10` | `#0000001A` |
| `label.color` | `type=Primary,state!=Disabled` | `Color/Text/Action/On-Primary` | `#483F3F` |
| `label.color` | `type=Secondary,state!=Disabled` | `Color/Text/Action/On-Secondary` | `#483F3F` |
| `label.color` | `type=Cancel,state!=Disabled` | `Color/Text/Action/On-Danger` | `#FFFFFF` |
| `label.color` | `state=Disabled` | `Color/Text/Action/On-Disabled` | `#5D5252` |

## Variants

| Type | State | Differentiating token(s) | Fallback value(s) | Visual indicator | Node |
| --- | --- | --- | --- | --- | --- |
| `Primary` | `Default` | `Color/Background/Action/Primary/Default`, `Color/Text/Action/On-Primary`, shadow `100` set | `#ADD8E6`, `#483F3F`, `#00000014` | Blue background, dark text/icons, medium shadow | `59:391` |
| `Primary` | `Hover` | `Color/Background/Action/Primary/Hover`, `Color/Text/Action/On-Primary`, shadow `200` set | `#C5F0FF`, `#483F3F`, `#00000029` | Lighter blue background, stronger shadow | `68:4126` |
| `Primary` | `Active` | `Color/Background/Action/Primary/Active`, `Color/Text/Action/On-Primary` | `#96BFCC`, `#483F3F` | Darker blue background, no shadow | `68:4157` |
| `Primary` | `Disabled` | `Color/Background/Action/Disabled/Default`, `Color/Text/Action/On-Disabled` | `#ECECEC`, `#5D5252` | Neutral disabled surface and text | `68:4185` |
| `Secondary` | `Default` | `Color/Background/Action/Secondary/Default`, `Color/Text/Action/On-Secondary`, shadow `100` set | `#C9E0BE`, `#483F3F`, `#00000014` | Light green background, dark text/icons | `68:4098` |
| `Secondary` | `Hover` | `Color/Background/Action/Secondary/Hover`, `Color/Text/Action/On-Secondary`, shadow `200` set | `#E0F7D6`, `#483F3F`, `#00000029` | Lighter green background, stronger shadow | `68:4236` |
| `Secondary` | `Active` | `Color/Background/Action/Secondary/Active`, `Color/Text/Action/On-Secondary` | `#B2C9A7`, `#483F3F` | Darker green background, no shadow | `68:4256` |
| `Secondary` | `Disabled` | `Color/Background/Action/Disabled/Default`, `Color/Text/Action/On-Disabled` | `#ECECEC`, `#5D5252` | Neutral disabled surface and text | `68:4276` |
| `Cancel` | `Default` | `Color/Background/Action/Danger/Default`, `Color/Text/Action/On-Danger`, shadow `100` set | `#B22222`, `#FFFFFF`, `#00000014` | Red background, white text/icons | `68:4104` |
| `Cancel` | `Hover` | `Color/Background/Action/Danger/Hover`, `Color/Text/Action/On-Danger`, shadow `200` set | `#D43636`, `#FFFFFF`, `#00000029` | Lighter red background, stronger shadow | `74:4294` |
| `Cancel` | `Active` | `Color/Background/Action/Danger/Active`, `Color/Text/Action/On-Danger` | `#901212`, `#FFFFFF` | Darker red background, no shadow | `77:4322` |
| `Cancel` | `Disabled` | `Color/Background/Action/Disabled/Default`, `Color/Text/Action/On-Disabled` | `#ECECEC`, `#5D5252` | Neutral disabled surface and text | `77:4374` |

## States

- **Default**: Uses each type’s `/Default` background token and the shadow `100` token set.
- **Hover**: Uses each type’s `/Hover` background token and the shadow `200` token set.
- **Active**: Uses each type’s `/Active` background token and removes shadow tokens.
- **Disabled**: Uses shared disabled tokens `Color/Background/Action/Disabled/Default` (`#ECECEC`) and `Color/Text/Action/On-Disabled` (`#5D5252`) across all three types.
- **Focus**: `TBD` in this component set (no dedicated focus variant axis in Figma).
- **Loading**: Not defined in this component set.

## Usage Guidelines

- **When to use**: Use for explicit user-triggered actions in flows where text and optional directional icons improve clarity.
- **When not to use**: Do not use this component as persistent navigation chrome.
- **Do**: Keep `State` and `Type` aligned with interaction and semantic intent.
- **Do**: Keep icon visibility and label visibility consistent with the accessible name strategy.
- **Don't**: Use disabled styling for non-disabled actions.
- **Don't**: Replace semantic action tokens with ad-hoc color values.

## Content Guidelines

- Prefer short action labels in sentence case (for example, imperative verb phrases).
- Keep punctuation minimal unless required by the product voice.
- Label length limit: `TBD` (no explicit max width/content rule found on the component set).
- Truncation behavior: `TBD` (no explicit truncation rule found on the component set).
- If `View txt=false`, accessible labeling requirements become mandatory (`aria-label`/`aria-labelledby`).

## Accessibility

### 1. ARIA role and semantics

- Expected semantic role: `button` (native `<button>` preferred).
- Required ARIA attributes for default text buttons: none when visible label is present.
- If label text is hidden (`View txt=false`), provide `aria-label` or `aria-labelledby`.

### 2. Keyboard navigation

| Key | Action |
| --- | --- |
| `Tab` | Moves focus to the button |
| `Shift+Tab` | Moves focus to the previous focusable element |
| `Enter` | Activates the button action |
| `Space` | Activates the button action |

### 3. Focus management

- Focus behavior should follow native button behavior in tab order.
- Focus outline token mapping is `TBD` in this component set.
- Expected focus tokens: `Semantic.Color.Focus-Outline.Inner` (`#FFFFFF`) and `Semantic.Color.Focus-Outline.Outer` (`#567680`).

### 4. Labeling

- With visible text (`View txt=true`), the label text provides the accessible name.
- For icon-only usage (`View txt=false`), set an explicit accessible name.
- Descriptive helper text linkage (`aria-describedby`) is `TBD` for this component family.

### 5. Contrast and visibility

- The component uses both color and icon/text content to convey meaning.
- Disabled variants remain visually distinct from interactive states.
- Verified contrast ratios are `TBD (pending audit)`.

## Related Components

- [Bottom Bar](bottom_bar.md): Use for persistent navigation/action regions, not for standalone action controls.
- [Alert](alert.md): Use for feedback messaging, not action triggering.

## Gaps / TBD

- Minimum width token binding is unresolved in current Figma variable metadata (`minWidth` token name returns `null`).
- Icon color token mapping is not directly exposed at the `Button` component-set level (icons are nested instances).
- Focus-state visual token mapping is not represented as a dedicated variant axis.
- Label-length and truncation policy for long button text are not specified in the current component set metadata.
- Contrast verification results are pending accessibility audit.
