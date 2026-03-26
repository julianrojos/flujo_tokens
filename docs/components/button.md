---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=59-391
  page: Buttons
  component: Button
  component_set_node_id: '68:4097'
  last_verified: '2026-03-26'
pipeline:
  ds_component_doc:
    contract_version: '1'
    spec_sha256: 6a4ac45f4663533fee5bf1c7b691edaed450aacdc08f0fbcb4f3d35a6796a970
    token_registry_sha256: 1a773a12e76d7b30306dc82ad2b838888cfca8f408f2dfcef6049153f2b36054
    generator_script_sha256: a76a99f010d13a911e723ab243f10953a604ff553b6d48faa3a1bdc584ee8a0d
---

# Button

## Overview

The **Button** component triggers user actions with variant-driven style and state.

## Anatomy

1. Container
2. Label
3. Optional leading/trailing icon

## Component API

### Properties

- `Type`: `Primary | Secondary | Cancel`
- `State`: `Default | Hover | Active | Disabled`

## Visual Specifications

### Token Mapping

- See token mapping in spec for variant/state combinations.

## Variants

- `Type`: `Primary`, `Secondary`, `Cancel`
- `State`: `Default`, `Hover`, `Active`, `Disabled`

## States

- Default, Hover, Active, Disabled

## Usage Guidelines

- Use for explicit user actions.

## Content Guidelines

- Keep labels concise and action-oriented.

## Accessibility

- Use native `<button>` semantics.

## Related Components

- [Bottom Bar](bottom_bar.md)
- [Alert](alert.md)

## Gaps / TBD

- [ ] [SCHEMA_TBD] `token_mapping.container.min_width.default` is `TBD`. Specification value is unresolved.
- [ ] [SCHEMA_TBD] `token_mapping.icon.color.default` is `TBD`. Specification value is unresolved.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.state=Disabled` references `Color/Background/Action/Disabled/Default` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.type=Cancel,state=Active` references `Color/Background/Action/Danger/Active` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.type=Cancel,state=Default` references `Color/Background/Action/Danger/Default` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.type=Cancel,state=Hover` references `Color/Background/Action/Danger/Hover` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.type=Primary,state=Active` references `Color/Background/Action/Primary/Active` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.type=Primary,state=Default` references `Color/Background/Action/Primary/Default` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.type=Primary,state=Hover` references `Color/Background/Action/Primary/Hover` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.type=Secondary,state=Active` references `Color/Background/Action/Secondary/Active` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.type=Secondary,state=Default` references `Color/Background/Action/Secondary/Default` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.background.type=Secondary,state=Hover` references `Color/Background/Action/Secondary/Hover` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.border.default` references `Color/Border/Neutral/Alpha-10` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.padding.default` references `Dimension/Spacing/500` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.container.radius.default` references `Dimension/Border/Radius/200` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.label.color.state=Disabled` references `Color/Text/Action/On-Disabled` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.label.color.type=Cancel,state!=Disabled` references `Color/Text/Action/On-Danger` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.label.color.type=Primary,state!=Disabled` references `Color/Text/Action/On-Primary` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.label.color.type=Secondary,state!=Disabled` references `Color/Text/Action/On-Secondary` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.label.typography.family.default` references `Font/Family/Body` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.label.typography.line_height.default` references `Font/Line-Height/300` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.label.typography.size.default` references `Font/Size/300` but it is missing in token registry.
- [ ] [TOKEN_INVALID] `token_mapping.label.typography.weight.default` references `Font/Weight/Regular` but it is missing in token registry.
