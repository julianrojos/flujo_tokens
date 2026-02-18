---
doc_type: component
doc_status: draft
figma:
  file_url: "https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2064-65"
  page: "Bars"
  component: "Bottom_Bar"
  last_verified: "2026-02-18"
---

# Bottom Bar

The **Bottom Bar** component defines a fixed bottom navigation container with five action slots.

## Overview

In Figma, this component is defined as a `COMPONENT` (`Bottom_Bar`) without root variants or root component properties.

It contains five `Bottom_Bar_Button` instances arranged horizontally.

Source: [Bottom_Bar in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2064-65)

## Anatomy

Each bottom bar contains:

1. **Container** (`COMPONENT`, `440 x 80`)
2. **Five button slots** (`Bottom_Bar_Button` instances)
3. **Per-button icon slot** (`INSTANCE`, default icon component)
4. **Per-button text label** (`TEXT`, default `Text`)

## Component API

The root `Bottom_Bar` component does not expose root-level component properties. Available properties are exposed by each nested `Bottom_Bar_Button` item.

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Item.Change_Bottom_Bar_Button_Icon` | `INSTANCE_SWAP` | `default icon instance` | `TBD` | Replaces the icon rendered in each button item. |
| `Item.Change_Text` | `TEXT` | `Text` | `TBD` | Overrides the label text for each button item. |
| `Item.State` | `VARIANT` | `Default` | `true` | Item visual state. Options: `Default`, `Selected`. |

## Visual Specifications

### Container

- **Node**: `COMPONENT`
- **Size**: `440 x 80`
- **Layout**: Auto Layout, `HORIZONTAL`
- **Item spacing**: `8`
- **Padding**: `left 8`, `right 8`, `top 0`, `bottom 0`
- **Clips content**: `true`
- **Corner radius**: `0`
- **Fill**: `#ECECEC`
- **Effect**: `DROP_SHADOW` (`x=0`, `y=-18`, `blur=20`, `spread=-8`, `rgba(0,0,0,0.2)`)

### Button slot (each of 5)

- **Node**: `INSTANCE` (`Bottom_Bar_Button`)
- **Size**: `78.4 x 80`
- **Layout**: Auto Layout, `VERTICAL`
- **Padding**: `8` on all sides
- **Corner radius**: `8`
- **Children**:
  - Icon container: `48 x 48`
  - Label text: `Text` at `12 / 16`

### Typography

- **Label font family**: `Nunito Sans`
- **Label weight**: `Regular`
- **Label size**: `12`
- **Label line height**: `16`
- **Label color**: `Color/Text/Neutral/Default` (`#483F3F`)

### Iconography

- **Icon container size**: `48 x 48`
- **Icon color token**: `Color/Icon/Neutral/Default`
- **Icon fallback**: `#483F3F`

### Token Mapping

| Part | Condition | Token | Fallback |
| --- | --- | --- | --- |
| `item.padding` | all items | `Dimension/Spacing/400` | `8` |
| `item.radius` | all items | `Dimension/Border/Radius/200` | `8` |
| `item.icon-color` | all items | `Color/Icon/Neutral/Default` | `#483F3F` |
| `item.text-color` | all items | `Color/Text/Neutral/Default` | `#483F3F` |
| `item.label-font-family` | all items | `Font/Family/Body` | `Nunito Sans` |
| `item.label-font-size` | all items | `Font/Size/100` | `12` |
| `item.label-font-weight` | all items | `Font/Weight/Regular` | `regular` |
| `item.label-line-height` | all items | `Font/Line-Height/100` | `16` |
| `container.background` | root container | `TBD` | `#ECECEC` |

## Variants

| Variant group | Variant name | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- | --- |
| `Item.State` | `Default` | `TBD` | `TBD` | Neutral, unselected item appearance |
| `Item.State` | `Selected` | `TBD` | `TBD` | Selected/active destination appearance |

## States

The root container has no independent interaction state. State behavior is controlled by each nested button item.

| State | What changes visually | Tokens | Notes |
| --- | --- | --- | --- |
| `Default` | Baseline item appearance | `TBD` | Defined by nested button variant |
| `Selected` | Active destination appearance | `TBD` | Defined by nested button variant |

## Usage Guidelines

- **When to use**: Use as primary bottom navigation for mobile layouts with persistent destinations.
- **When not to use**: Do not use as a contextual action toolbar or for transient feedback actions.
- **Do**: Keep a stable action count and order.
- **Do**: Keep exactly one item in `Selected` state for the current destination.
- **Don't**: Use long labels that wrap or clip in item cells.
- **Don't**: Mix unrelated action types in the same bar.

## Content Guidelines

- Use concise labels (prefer one short word or short phrase).
- Use sentence case or title case consistently across all items.
- Keep labels semantically distinct to avoid ambiguous navigation choices.

## Accessibility

### 1. ARIA role and semantics

- Expected container role: `role="navigation"` (implementation-level, `TBD` pending audit).
- Item semantics should be interactive controls (for example buttons/links) in implementation.
- Required ARIA attributes for current implementation are `TBD`.

### 2. Keyboard navigation

| Key | Action |
| --- | --- |
| `Tab` | Moves focus between interactive items |
| `Enter` | Activates focused item |
| `Arrow keys` | `TBD` (optional pattern, pending implementation decision) |

### 3. Focus management

- Focus order should follow visual item order from left to right.
- No focus behavior is explicitly defined in Figma; implementation details are `TBD`.
- Focus outline tokens should use `Semantic.Color.Focus-Outline.Inner` (`#FFFFFF`) and `Semantic.Color.Focus-Outline.Outer` (`#567680`).

### 4. Labeling

- Each item label should be unique and meaningful.
- Icon-only usage is not defined; if introduced, labeling strategy is `TBD`.
- `aria-describedby` usage is `TBD`.

### 5. Contrast and visibility

- Selected vs non-selected states must remain distinguishable without relying on color alone.
- Contrast verification is `TBD (pending audit)`.

### Hit area requirements

- Desktop minimum hit area token: `A11y.A11y.modeDesktop.Dimension.Min-Hit-Area` (`TBD` resolved value).
- Mobile minimum hit area token: `A11y.A11y.modeMobile.Dimension.Min-Hit-Area` (`TBD` resolved value).

## Related Components

- [Status Bar](status_bar.md): Use together with bottom navigation in full mobile chrome compositions.
- [Alert](alert.md): Use for contextual feedback, not for destination switching.

## Design–Token Discrepancies

| Discrepancy | Impact | Pending action | Status |
| --- | --- | --- | --- |
| Container background is hardcoded as `#ECECEC` instead of using a semantic token. | Reduces token governance consistency and theme portability. | Map container background to a semantic token or document this as an accepted exception. | `open` |

## Gaps / TBD

- Item-level token differences for `Default` vs `Selected` are `TBD` in current docs.
- Root-level selected-index control is not exposed as a single property in this component.
- No badge/counter slot is defined for notifications.
- No documented dark-mode variant for the root container.
- No explicit overflow behavior is defined for long labels.
