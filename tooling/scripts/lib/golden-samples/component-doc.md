---
doc_type: component
doc_status: ready
figma:
  file_url: https://www.figma.com/design/example-file
  page: Components
  component: Example Button
  last_verified: 2026-02-19
---

# Example Button

The **Example Button** triggers a primary action in flows where a single clear next step is required.

## Overview

- Purpose: Trigger a user action with clear visual hierarchy.
- Figma component set: Example Button
- Variant properties: \`Type\`, \`Size\`, \`State\`.

### Visual Proof

- Screenshot: [Captured (2026-02-19)](https://example.com/figma-proof/example-button.png)
- Source node: \`123:456\`
- Artifact: \`../_generated/visual-proofs/example_button.json\`

## Anatomy

1. **Container**: Hosts background, border, and interaction state.
2. **Label**: Communicates the action in concise sentence case.
3. **Icon (optional)**: Reinforces the action when context requires it.

## Component API

### Properties

| Name  | Type    | Default | Required | Description                             |
| ----- | ------- | ------- | -------- | --------------------------------------- |
| Type  | VARIANT | Primary | Yes      | Visual emphasis style.                  |
| Size  | VARIANT | Medium  | Yes      | Controls height and horizontal padding. |
| Label | TEXT    | Button  | Yes      | Visible action text.                    |

## Visual Specifications

### Container

- Background: \`Components.Button.Background.Primary.Default\` (#1C6B4A)
- Border radius: \`Semantic.Dimension.Border.Radius.200\` (8px)

### Typography

- Font size: \`Semantic.Dimension.Font.Size.300\` (16px)
- Text color: \`Semantic.Color.Text.On-Primary\` (#FFFFFF)

## Variants

| Variant   | Token                                              | Fallback | Notes             |
| --------- | -------------------------------------------------- | -------- | ----------------- |
| Primary   | \`Components.Button.Background.Primary.Default\`   | #1C6B4A  | Highest emphasis. |
| Secondary | \`Components.Button.Background.Secondary.Default\` | #E5E7EB  | Lower emphasis.   |

## States

- Default: Base visual style with full contrast.
- Disabled: Reduced contrast and pointer interaction blocked.

## Usage Guidelines

### When to use

- Use for the main action in a section or dialog.

### When not to use

- Do not use for passive navigation links.

## Content Guidelines

- Use imperative verbs (for example: "Save", "Continue", "Send").
- Keep labels short (1-3 words when possible).

## Accessibility

- Role: native button semantics.
- Keyboard: reachable by tab and activated with Enter/Space.
- Contrast: maintain minimum 4.5:1 for text.

## Related Components

- [alert.md](alert.md): Use when feedback is informational, not actionable.
