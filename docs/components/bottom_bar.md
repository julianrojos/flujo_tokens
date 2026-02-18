# Bottom Bar

The **Bottom Bar** component defines a fixed bottom navigation container with five action slots.

## Overview

In Figma, this component is defined as a `COMPONENT` (`Bottom_Bar`) without root variants or root component properties.

It contains five `Bottom_Bar_Button` instances arranged horizontally.

Source node: [Bottom_Bar (node `2064:65`)](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2064-65)

## Anatomy

Each bottom bar contains:

1. **Container** (`COMPONENT`, `440 x 80`)
2. **Five button slots** (`Bottom_Bar_Button` instances)
3. **Per-button icon slot** (`INSTANCE`, default icon component)
4. **Per-button text label** (`TEXT`, default `Text`)

## Component API

### Root properties

| Name | Type | Default Value | Description |
| :--- | :--- | :------------ | :---------- |
| — | — | — | The root `Bottom_Bar` component does not expose component properties in Figma. |

### Nested button properties (per item)

| Name | Type | Default Value | Description |
| :--- | :--- | :------------ | :---------- |
| `Change_Bottom_Bar_Button_Icon` | `INSTANCE_SWAP` | icon node `65:924` | Replaces the icon rendered in each button. |
| `Change_Text` | `TEXT` | `Text` | Overrides the label for each button. |
| `State` | `VARIANT` | `Default` | Button visual state. Options in button set: `Default`, `Selected`. |

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
- **Label color**: `#483F3F`

## States

The `Bottom_Bar` root does not define container-level states.

State behavior is controlled per `Bottom_Bar_Button` through its nested `State` variant:

- `Default`
- `Selected`

## Tokens Used

| Slot | Condition | Token | Alias chain | Resolved value |
| :--- | :-------- | :---- | :---------- | :------------- |
| Button padding (`top/right/bottom/left`) | All buttons | `Dimension/Spacing/400` | `Dimension/Spacing/8` | `8` |
| Button radius (`top-left/top-right/bottom-left/bottom-right`) | All buttons | `Dimension/Border/Radius/200` | `Dimension/Border/Radius/8` | `8` |
| Button icon stroke | All buttons | `Color/Icon/Neutral/Default` | `Color/Grey/900` | `#483F3F` |
| Button text color | All buttons | `Color/Text/Neutral/Default` | `Color/Grey/900` | `#483F3F` |
| Label font family | All buttons | `Font/Family/Body` | `Font/Family/Nunito-Sans` | `Nunito Sans` |
| Label font size | All buttons | `Font/Size/100` | `Font/Size/12` | `12` |
| Label font weight | All buttons | `Font/Weight/Default` | `Font/Weight/Regular` | `regular` |
| Label line-height | All buttons | `Font/Line-Height/100` | `Font/Line-Height/12` | `16` |
| Container background | Root container | — (hardcoded) | — | `#ECECEC` |

## Usage Guidelines

- Use this component as the primary bottom navigation bar for mobile layouts.
- Keep a stable count and order of actions (five slots in this variant).
- Set exactly one button to `Selected` for the current destination when needed.
- Keep labels short to avoid wrapping or clipping inside button slots.

## Accessibility

- Ensure each button label is meaningful and unique when implemented in code.
- Expose proper button semantics for each action in the host UI.
- Provide a clear selected-state cue in code when using `State=Selected`.
- Verify touch targets remain at least `44 x 44` in implementation.

## Gaps / TBD

- Root-level selected index/state is not exposed as a single property in this component.
- No badge/counter slot is defined for notifications.
- No documented dark-mode variant for the root container.
- No explicit overflow behavior is defined for long labels.
