---
doc_type: component
doc_status: needs-review
figma:
  file_url: "https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1892"
  page: "Alert"
  component: "Alert"
  last_verified: "2026-02-18"
---

# Alert

The **Alert** component communicates concise feedback messages in a highly visible inline block.

## Overview

In Figma, this component is defined as a `COMPONENT_SET` (`Alert`) with one variant property:

- `Type`: `Information`, `Warning`, `Positive`

All variants share the same structure, spacing, and typography. Visual meaning is conveyed through semantic border and icon color tokens.

Source: [Alert in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1892)

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

| Name                  | Type      | Default          | Required | Description                                                         |
| --------------------- | --------- | ---------------- | -------- | ------------------------------------------------------------------- |
| `Type`                | `VARIANT` | `Information`    | `true`   | Semantic alert type. Options: `Information`, `Warning`, `Positive`. |
| `Change_Message_Text` | `TEXT`    | `Text text text` | `TBD`    | Overrides the main alert message copy.                              |

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

### Iconography

- **Icon container size**: `24 x 24`
- **Internal vector size**: `18 x 18`

### Token Mapping

| Part                   | Condition    | Token                               | Fallback  |
| ---------------------- | ------------ | ----------------------------------- | --------- |
| `container.background` | all variants | `Color/Background/Feedback/Default` | `#FFFFFF` |
| `text.color`           | all variants | `Color/Text/Neutral/Default`        | `#483F3F` |

## Variants

| Variant       | Differentiating token(s)                                               | Fallback value(s)    | Visual indicator                                         |
| ------------- | ---------------------------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| `Information` | `Color/Border/Feedback/Information`, `Color/Icon/Feedback/Information` | `#BAA06B`, `#9D8555` | `information-circle-contained` icon + information border |
| `Warning`     | `Color/Border/Feedback/Danger`, `Color/Icon/Feedback/Danger`           | `#B22222`, `#B22222` | `x-circle-contained` icon + warning border               |
| `Positive`    | `Color/Border/Feedback/Success`, `Color/Icon/Feedback/Success`         | `#299157`, `#299157` | `check-contained` icon + success border                  |

## States

This component has no interactive states in the current Figma component set.

Feedback semantics are represented through the `Type` variant, not through `hover`/`focus`/`pressed` states.

## Usage Guidelines

- **When to use**: Use `Information`, `Warning`, and `Positive` to communicate concise status feedback in context.
- **When not to use**: Do not use this component for persistent page-level navigation or long-form guidance.
- **Do**: Keep icon size and spacing unchanged to preserve visual rhythm.
- **Do**: Keep semantic feedback tokens aligned with the selected variant.
- **Don't**: Replace semantic border/icon tokens with neutral values.
- **Don't**: Use this component for multi-paragraph content.

## Content Guidelines

- Use short, direct message text.
- Prefer one sentence per alert.
- Use sentence case.
- Avoid unnecessary punctuation and repeated emphasis.

## Accessibility

### 1. ARIA role and semantics

- Expected role for passive feedback: `role="alert"`.
- If the host context already conveys live feedback semantics, use semantic HTML and avoid duplicate ARIA.
- Required ARIA attributes are `TBD` for this component configuration.

### 2. Keyboard navigation

This component is not keyboard-interactive in the current Figma configuration.

### 3. Focus management

- This component has no focusable element in the current Figma definition.
- Focus behavior for dismissible/interactive alert variants is `TBD`.
- Focus outline tokens (`Semantic.Color.Focus-Outline.Inner`, `Semantic.Color.Focus-Outline.Outer`) are `TBD` for this component.

### 4. Labeling

- The message text itself provides the accessible content.
- Additional labeling patterns (`aria-label`, `aria-labelledby`, `aria-describedby`) are `TBD` for interactive variants.

### 5. Contrast and visibility

- The component should not rely on color alone; iconography and text must remain present with each variant.
- Verified contrast ratios are `TBD (pending audit)`.

## Related Components

- [Status Bar](status_bar.md): Use for fixed device/system chrome, not inline feedback messaging.
- [Bottom Bar](bottom_bar.md): Use for persistent action navigation, not semantic feedback.
