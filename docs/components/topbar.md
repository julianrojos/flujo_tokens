---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2065-95
  page: Bars
  component: Topbar
  last_verified: '2026-02-19'
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: c94ca514e64c6b254b2990ae0ff769c748a7f78163c628f4827dafcfa7cb96e7
    token_registry_sha256: 1a773a12e76d7b30306dc82ad2b838888cfca8f408f2dfcef6049153f2b36054
    generator_script_sha256: d1a7b2a3735f7e1e853c3a53811b9edec4b68c51b73d75b1ed818033f2baba15
---

# Topbar

The **Topbar** component provides the upper app header area with title and optional back affordance.

## Overview

In Figma, this component is defined as a single `COMPONENT` (`Topbar`) with two exposed properties:

- `Show_Back`: `BOOLEAN` (`false` default)
- `Change_Text`: `TEXT` (`View header` default)

Source: [Topbar in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2065-95)

### Visual Proof

- Screenshot URL: `TBD`
- Source node id: `2065:95`
- Proof artifact: `TBD`

## Anatomy

<!-- AUTO-GENERATED-ANATOMY:START -->
The topbar includes:

1. **Header container** (`FRAME`)
2. **Back section** (optional, controlled by `Show_Back`)
3. **Title text** (controlled by `Change_Text`)
4. **Right-side icon area** (`Topbar_Icons`)
5. **Secondary navigation area** (`Secondary_Navigation`)

<!-- AUTO-GENERATED-ANATOMY:END -->
## Component API

### Properties

<!-- AUTO-GENERATED-PROPERTIES:START -->
| Name          | Type      | Default       | Required | Description |
| ------------- | --------- | ------------- | -------- | ----------- |
| `Show_Back`   | `BOOLEAN` | `false`       | `false`  | Toggles visibility of the back affordance section. |
| `Change_Text` | `TEXT`    | `View header` | `false`  | Overrides the header title text. |

<!-- AUTO-GENERATED-PROPERTIES:END -->
## Visual Specifications

### Container

- Root dimensions: `TBD`
- Layout direction: `TBD`
- Padding and spacing: `TBD`
- Border and elevation: `TBD`

### Typography

- Title text style: `TBD`
- Title token mapping: `TBD`

### Iconography

- Icon slot count and sizing: `TBD`
- Icon token mapping: `TBD`

### Token Mapping

| Part           | Condition      | Token | Fallback |
| -------------- | -------------- | ----- | -------- |
| `container.*`  | base           | `TBD` | `TBD`    |
| `title.*`      | base           | `TBD` | `TBD`    |
| `icons.*`      | base           | `TBD` | `TBD`    |
| `back.*`       | `Show_Back`    | `TBD` | `TBD`    |

## Variants

<!-- AUTO-GENERATED-VARIANTS:START -->
This component has no `VARIANT` axis in the current Figma definition.

Behavioral variation is controlled by component properties (`Show_Back`, `Change_Text`).

<!-- AUTO-GENERATED-VARIANTS:END -->
## States

- No explicit interactive state variants are defined at root component level.
- Hover/focus/pressed/disabled behavior is `TBD` and depends on nested interactive elements.

## Usage Guidelines

### Behavior

- **When to use**: Use as the top app/header bar in mobile layouts.
- **When not to use**: Do not use as a generic content container.
- **Do**: Keep title concise and meaningful.
- **Do**: Show back affordance only when navigation hierarchy requires it.
- **Don't**: Overload with excessive controls.
- Responsive behavior: `TBD`
- Overflow / truncation behavior: `TBD`
- i18n / RTL behavior: `TBD`

### Examples

- Basic example: title only, `Show_Back=false`.
- Contextual example: title plus back affordance, `Show_Back=true`.

## Content Guidelines

- Prefer short titles.
- Avoid redundant words already visible in surrounding context.
- Keep naming consistent with screen purpose.

## Accessibility

### 1. ARIA role and semantics

- Header landmark semantics (`header`/`banner`) are `TBD` by implementation context.
- Nested controls require explicit semantic roles according to control type.

### 2. Keyboard navigation

- Keyboard order among back action, title context, and right actions is `TBD`.
- Activation keys for actionable controls are expected to include `Enter` and `Space` (`TBD` confirmation).

### 3. Focus management

- Focus behavior for nested controls is `TBD`.
- Focus outline token mapping is `TBD`.

### 4. Labeling

- Back control labeling should expose clear action intent.
- Icon-only controls require accessible naming (`TBD` per control).

### 5. Contrast and visibility

- Title and controls must stay readable against header background.
- Contrast verification is `TBD (pending audit)`.

## Related Components

- [Status Bar](status_bar.md): Often paired above or with top app chrome in mobile templates.
- [Bottom Bar](bottom_bar.md): Complementary bottom navigation area.

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.back_section.color.show_back_true` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.container.background.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.icons.color.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.title.color.default` is `TBD`. Specification value is unresolved.
- [ ] [A11Y_TBD] `accessibility.role` is `TBD`. Accessibility detail is unresolved.
