---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1892
  page: Alert
  component: Alert
  component_set_node_id: "2304:1892"
  last_verified: "2026-03-26"
pipeline:
  ds_component_doc:
    contract_version: "1"
    spec_sha256: 501ff5f17bc8d5129dd49e8ab8aca625df7e5e00dd3f1356fa6a5dc892f2615d
    token_registry_sha256: 1a773a12e76d7b30306dc82ad2b838888cfca8f408f2dfcef6049153f2b36054
    generator_script_sha256: a76a99f010d13a911e723ab243f10953a604ff553b6d48faa3a1bdc584ee8a0d
---

# Alert

## Overview

The **Alert** component communicates concise feedback messages in a visible inline container.

## Anatomy

1. **Container**
2. **Leading Icon**
3. **Message Text**

## Component API

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `Type` | `ENUM` | `Information` | `true` | Semantic alert type. |
| `Change_Message_Text` | `TEXT` | `Text text text` | `false` | Overrides the main alert message copy. |

## Visual Specifications

### Container

- `TBD`

### Typography

- `TBD`

### Token Mapping

| Part | Condition | Token | Fallback |
| --- | --- | --- | --- |
| `container.background` | `default` | `Color/Background/Feedback/Default` | `TBD` |
| `container.border` | `type=Information` | `Color/Border/Feedback/Information` | `TBD` |
| `container.border` | `type=Warning` | `Color/Border/Feedback/Danger` | `TBD` |
| `container.border` | `type=Positive` | `Color/Border/Feedback/Success` | `TBD` |
| `leading_icon.color` | `type=Information` | `Color/Icon/Feedback/Information` | `TBD` |
| `leading_icon.color` | `type=Warning` | `Color/Icon/Feedback/Danger` | `TBD` |
| `leading_icon.color` | `type=Positive` | `Color/Icon/Feedback/Success` | `TBD` |
| `message_text.color` | `default` | `Color/Text/Neutral/Default` | `TBD` |

## Variants

| Variant | Differentiating token(s) | Fallback value(s) | Visual indicator |
| --- | --- | --- | --- |
| `Type=Information` | `TBD` | `TBD` | `TBD` |
| `Type=Warning` | `TBD` | `TBD` | `TBD` |
| `Type=Positive` | `TBD` | `TBD` | `TBD` |

## States

This component has no interactive states in the current documented contract.

## Usage Guidelines

### Behavior

- **When to use**: Use for contextual status feedback (information, warning, positive).
- **When not to use**: Do not use for navigation, long-form guidance, or persistent layout chrome.
- **Do**: Keep icon size and spacing unchanged to preserve visual rhythm.
- **Don't**: Replace semantic border/icon tokens with neutral values.
- Responsive behavior: `TBD`
- Overflow / truncation behavior: `TBD`
- i18n / RTL behavior: `TBD`

## Content Guidelines

- Use short, direct message copy.
- Prefer one sentence per alert.
- Use sentence case.

## Accessibility

- Role: `alert`
- Focus tokens:
  - Inner: `Semantic.Color.Focus-Outline.Inner`
  - Outer: `Semantic.Color.Focus-Outline.Outer`
- Additional interactive labeling behavior: `TBD`

## Related Components

- `TBD`

## Gaps / TBD

- [ ] [TOKEN_INVALID] `token_mapping.container.background.default` references `Color/Background/Feedback/Default` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.border.type=Information` references `Color/Border/Feedback/Information` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.border.type=Positive` references `Color/Border/Feedback/Success` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.border.type=Warning` references `Color/Border/Feedback/Danger` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.leading_icon.color.type=Information` references `Color/Icon/Feedback/Information` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.leading_icon.color.type=Positive` references `Color/Icon/Feedback/Success` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.leading_icon.color.type=Warning` references `Color/Icon/Feedback/Danger` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.message_text.color.default` references `Color/Text/Neutral/Default` but it is missing in token registry.
