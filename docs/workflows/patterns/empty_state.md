---
doc_type: workflow
---

# Empty State Pattern

A reusable pattern for informing users when no data is available and guiding the next meaningful action.

## Overview

- Pattern intent: replace blank screens with clear context and a recommended next step.
- Typical scope: first-use views, zero-results scenarios, and post-action empty collections.
- Out of scope: error recovery for system failures and loading placeholders.

## Problem

- Users can misinterpret an empty interface as a broken experience.
- Teams often provide inconsistent copy, visuals, and call-to-action hierarchy.
- Without a shared pattern, empty-state behavior diverges across products.

## Decision Guide

- Use this pattern when content is intentionally absent and user action can progress the flow.
- Prefer a single primary action; add secondary help only when it reduces confusion.
- Use a neutral explanation for first-use states and contextual explanation for filtered zero-results.
- Tradeoff:
  - More guidance improves clarity.
  - Excessive actions increase decision friction.

## Pattern Structure

1. Render contextual title and explanation.
2. Show supporting visual cue when it helps comprehension.
3. Present one primary action.
4. Optionally present one secondary action (documentation/help/back).
5. Re-evaluate state after user action or filter change.

## Composition

- [Illustration Block](../../components/illustration_block.md): visual reinforcement for state meaning.
- [Button](../../components/button.md): primary and optional secondary actions.
- [Image](../../components/image.md): optional contextual graphic.
- [Tag](../../components/tag.md): optional state qualifier (for example applied filter context).

## Behavior

- Interaction:
  - Primary action must be keyboard reachable and visually dominant.
  - Secondary action should never visually compete with primary action.
- Responsive:
  - Use vertical stacking with consistent spacing between title, description, and actions on compact viewports.
  - Keep primary action visible without requiring horizontal scrolling.
- Overflow and long content:
  - Allow title and body copy to wrap; avoid truncating the primary message.
  - If description exceeds the preferred layout, preserve full text and increase container height.
- Failure states:
  - If the primary action is unavailable, replace it with a deterministic alternative action and explanatory text.
  - If no direct action is possible, provide a help path and a clear return option.

## Accessibility

- Provide semantic heading and descriptive body text.
- Ensure CTA labels are explicit and action-oriented.
- Do not rely on illustration alone to communicate meaning.
- When the view transitions to an empty state dynamically, announce the state summary through an alert or live region.
- Ensure action controls preserve logical tab order immediately after state changes.

## Internationalization

- RTL behavior:
  - Mirror horizontal alignment and action placement while preserving semantic heading order.
- Text expansion:
  - Support at least 30% text expansion for title and description without clipping.
- Locale formats:
  - Use locale-aware `Intl` formatting for date/number placeholders when the empty state includes dynamic values.
- Reduced motion and zoom:
  - Under `prefers-reduced-motion`, use static presentation without decorative transition motion.
  - At 200% zoom, keep title, description, and primary action visible without horizontal scrolling in the content container.

## Implementation Links

- Component sources:
  - [Illustration Block](../../components/illustration_block.md)
  - [Button](../../components/button.md)
  - [Image](../../components/image.md)
  - [Tag](../../components/tag.md)
- Product implementation references are tracked under repository issues labeled `workflow:empty-state`.
- Content guidance aligns with action-first, plain-language copy rules used in component docs.

## Governance

- Owner role: Design System Lead.
- Co-owner role: Content Design Maintainer.
- Change approval path:
  - Open a workflow change issue with before/after rationale.
  - Require one content/design review and one engineering review.
  - Require Design System Lead approval before merge.
- Deprecation trigger:
  - Replacement pattern must be available before deprecation.
- Migration expectation:
  - Document mapping from legacy variants to canonical structure with a two-minor-release migration window.

## Metrics and Feedback

- Adoption metric:
  - `adoption_rate = screens_using_empty_state_pattern / eligible_empty_state_screens * 100`.
- Quality metric:
  - `abandonment_rate = sessions_exiting_after_empty_state / sessions_showing_empty_state`.
- Maintenance metric:
  - `backlog_sla_breach = open_workflow_empty_state_issues_older_than_30d`.
- Feedback intake channel:
  - Repository issues labeled `workflow:empty-state`.
- Reporting cadence:
  - Monthly KPI review in the workflow governance sync.

## Related Components

- [Illustration Block](../../components/illustration_block.md): primary visual scaffold.
- [Button](../../components/button.md): action controls.
- [Image](../../components/image.md): optional visual content.
- [Tag](../../components/tag.md): optional contextual qualifier.
