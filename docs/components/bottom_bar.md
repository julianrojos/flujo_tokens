---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2064-65
  page: Bars
  component: Bottom_Bar
  last_verified: '2026-02-19'
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: 7a9fdf8644079fcfd33f4cd1348bc05a2089479725a707611914fada694de898
    token_registry_sha256: 1a773a12e76d7b30306dc82ad2b838888cfca8f408f2dfcef6049153f2b36054
    generator_script_sha256: b339a68ac7ef34b3cfc99b8b3afecc126fe2a21056182b8d0ffe5642a7925158
---

# Bottom Bar

The **Bottom Bar** component defines a fixed bottom navigation container with five action slots.

## Overview

In Figma, this component is defined as a `COMPONENT` (`Bottom_Bar`) without root variants or root component properties.

It contains five `Bottom_Bar_Button` instances arranged horizontally.

Source: [Bottom_Bar in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2064-65)

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `2064:65`
- Proof artifact: `TBD`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
Each bottom bar contains:

1. **Container** (`COMPONENT`, `440 x 80`)
2. **Five button slots** (`Bottom_Bar_Button` instances)
3. **Per-button icon slot** (`INSTANCE`, default icon component)
4. **Per-button text label** (`TEXT`, default `Text`)

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

The root `Bottom_Bar` component does not expose root-level component properties. Available properties are exposed by each nested `Bottom_Bar_Button` item.

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name                                 | Type            | Default                 | Required | Description                                        |
| ------------------------------------ | --------------- | ----------------------- | -------- | -------------------------------------------------- |
| `Item.Change_Bottom_Bar_Button_Icon` | `INSTANCE_SWAP` | `default icon instance` | `TBD`    | Replaces the icon rendered in each button item.    |
| `Item.Change_Text`                   | `TEXT`          | `Text`                  | `TBD`    | Overrides the label text for each button item.     |
| `Item.State`                         | `VARIANT`       | `Default`               | `true`   | Item visual state. Options: `Default`, `Selected`. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
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

| Part                     | Condition      | Token                         | Fallback      |
| ------------------------ | -------------- | ----------------------------- | ------------- |
| `item_slot.padding`      | all items      | `Dimension/Spacing/400`       | `8px`         |
| `item_slot.radius`       | all items      | `Dimension/Border/Radius/200` | `8px`         |
| `item_icon.color`        | all items      | `Color/Icon/Neutral/Default`  | `#483F3F`     |
| `item_label.color`       | all items      | `Color/Text/Neutral/Default`  | `#483F3F`     |
| `item_label.font-family` | all items      | `Font/Family/Body`            | `Nunito Sans` |
| `item_label.font-size`   | all items      | `Font/Size/100`               | `12px`        |
| `item_label.font-weight` | all items      | `Font/Weight/Regular`         | `Regular`     |
| `item_label.line-height` | all items      | `Font/Line-Height/100`        | `16px`        |
| `container.background`   | root container | `TBD`                         | `#ECECEC`     |

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
| Variant group | Variant name | Differentiating token(s) | Fallback value(s) | Visual indicator                       |
| ------------- | ------------ | ------------------------ | ----------------- | -------------------------------------- |
| `Item.State`  | `Default`    | `TBD`                    | `TBD`             | Neutral, unselected item appearance    |
| `Item.State`  | `Selected`   | `TBD`                    | `TBD`             | Selected/active destination appearance |

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

The root container has no independent interaction state. State behavior is controlled by each nested button item.

| State      | What changes visually         | Tokens | Notes                            |
| ---------- | ----------------------------- | ------ | -------------------------------- |
| `Default`  | Baseline item appearance      | `TBD`  | Defined by nested button variant |
| `Selected` | Active destination appearance | `TBD`  | Defined by nested button variant |

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

| Key          | Action                                                    |
| ------------ | --------------------------------------------------------- |
| `Tab`        | Moves focus between interactive items                     |
| `Enter`      | Activates focused item                                    |
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

- Desktop minimum hit area token: `A11y.A11y.modeDesktop.Dimension.Min-Hit-Area` (`24px`).
- Mobile minimum hit area token: `A11y.A11y.modeMobile.Dimension.Min-Hit-Area` (`44px`).

## Related Components

- [Status Bar](status_bar.md): Use together with bottom navigation in full mobile chrome compositions.
- [Alert](alert.md): Use for contextual feedback, not for destination switching.

## Design–Token Discrepancies

| Discrepancy                                                                       | Impact                                                      | Pending action                                                                          | Status |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| Container background is hardcoded as `#ECECEC` instead of using a semantic token. | Reduces token governance consistency and theme portability. | Map container background to a semantic token or document this as an accepted exception. | `open` |

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.container.background.default` is `TBD`. Specification value is unresolved.
- [ ] [TOKEN_INVALID] `token_mapping.item_icon.color.default` references `Color/Icon/Neutral/Default` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.item_label.color.default` references `Color/Text/Neutral/Default` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.item_label.font-family.default` references `Font/Family/Body` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.item_label.font-size.default` references `Font/Size/100` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.item_label.font-weight.default` references `Font/Weight/Regular` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.item_label.line-height.default` references `Font/Line-Height/100` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.item_slot.padding.default` references `Dimension/Spacing/400` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.item_slot.radius.default` references `Dimension/Border/Radius/200` but it is missing in token registry.
