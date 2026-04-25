---
doc_type: workflow
---

# Search Filters Pattern

A reusable pattern for narrowing result sets through query input, selectable filters, and visible active-filter feedback.

## Overview

- Pattern intent: help users find relevant results quickly while preserving filter clarity.
- Typical scope: lists, catalogs, and result-heavy views.
- Out of scope: ranking/relevance algorithm behavior and backend query optimization.

## Problem

- Users struggle when filter state is hidden or difficult to clear.
- Teams often implement incompatible filter controls and inconsistent state persistence.
- Without a shared pattern, discoverability and recovery behavior vary by product.

## Decision Guide

- Use this pattern when results exceed a quick-scan threshold or require multi-criteria refinement.
- Show active filter indicators whenever at least one filter is applied.
- Provide a global clear action when multiple filters can be active simultaneously.
- Tradeoff:
  - Rich filtering improves precision.
  - Additional controls increase cognitive load.

## Pattern Structure

1. Capture free-text query input.
2. Present filter controls grouped by domain.
3. Apply filters and refresh results.
4. Show active-filter summary.
5. Support clear-one and clear-all flows.

## Composition

- [Text Input](../../components/text_input.md): query entry and optional inline validation.
- [Checkbox](../../components/checkbox.md): multi-select filter options.
- [Radio Button](../../components/radio_button.md): single-select filter options.
- [Tag](../../components/tag.md): active filter token display.
- [Tags List](../../components/tags_list.md): grouped active filter display.
- [Button](../../components/button.md): clear/apply actions when explicit commit is required.

## Behavior

- Interaction:
  - Keep result updates deterministic (auto-apply or explicit apply, not mixed in one context).
  - Preserve active filters across in-view pagination/sorting where applicable.
- Responsive:
  - Collapse advanced filters into a toggleable panel on compact layouts.
  - Keep query input and active-filter summary visible above results on compact layouts.
- Overflow and long content:
  - Wrap active-filter tokens to multiple lines and preserve clear-one/clear-all affordances.
  - Do not hide applied filters when the list wraps.
- Failure states:
  - Empty result handling with applied filters: route to empty-state pattern.
  - If filter options fail to load, keep query input available and show a non-blocking alert with retry action.

## Accessibility

- Ensure filter groups expose clear labels and relationships.
- Active-filter summary must be perceivable by screen readers.
- Keyboard users must apply, remove, and clear filters without pointer-only actions.
- After clearing filters, return focus to the filter summary heading or query field consistently.
- Announce result-count updates through a polite live region when filters change.

## Internationalization

- RTL behavior:
  - Mirror filter-panel alignment and token-list flow for RTL locales.
- Text expansion:
  - Support at least 30% expansion of facet labels and active-filter token text without overlap.
- Locale formats:
  - Use locale-aware `Intl` formatting/parsing for date and number filter values.
- Reduced motion and zoom:
  - Under `prefers-reduced-motion`, disable animated panel transitions and update state instantly.
  - At 200% zoom, preserve full access to query, active filters, and clear actions without horizontal scrolling in the results container.

## Implementation Links

- Component sources:
  - [Text Input](../../components/text_input.md)
  - [Checkbox](../../components/checkbox.md)
  - [Radio Button](../../components/radio_button.md)
  - [Tag](../../components/tag.md)
  - [Tags List](../../components/tags_list.md)
  - [Button](../../components/button.md)
- Query-state URL contract:
  - Persist query and active filters in URL parameters to support reload and share behavior.
- Analytics naming:
  - Track `search_filter_applied`, `search_filter_cleared`, and `search_filters_cleared_all`.

## Governance

- Owner role: Design System Lead.
- Co-owner role: Search Experience Maintainer.
- Change approval path:
  - Open a workflow change issue with impact summary and migration risk.
  - Require one design review and one engineering review.
  - Require Design System Lead approval before merge.
- Deprecation trigger:
  - Deprecate only after replacement filter interaction model is available.
- Migration expectation:
  - Provide migration notes for URL/query-state compatibility changes and keep a two-minor-release transition window.

## Metrics and Feedback

- Adoption metric:
  - `adoption_rate = views_using_search_filters_pattern / eligible_search_views * 100`.
- Quality metric:
  - `filter_success_rate = filtered_sessions_with_result_click / filtered_sessions_total`.
- Maintenance metric:
  - `open_issue_age = median(days_open_for_workflow_search_filters_issues)`.
- Feedback intake channel:
  - Repository issues labeled `workflow:search-filters`.
- Reporting cadence:
  - Monthly KPI review in the workflow governance sync.

## Related Components

- [Text Input](../../components/text_input.md): query control.
- [Checkbox](../../components/checkbox.md): multi-select filters.
- [Radio Button](../../components/radio_button.md): single-select filters.
- [Tag](../../components/tag.md): applied filter token.
- [Tags List](../../components/tags_list.md): grouped token presentation.
- [Button](../../components/button.md): clear/apply controls.
