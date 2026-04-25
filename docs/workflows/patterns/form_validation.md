---
doc_type: workflow
---

# Form Validation Pattern

A reusable pattern for validating form input fields and communicating validation status consistently.

## Overview

- Pattern intent: prevent invalid submissions while keeping feedback clear and actionable.
- Typical scope: forms with one or more text fields and a submit action.
- Out of scope: multi-step wizard orchestration and server-side retry strategy.

## Problem

- Users need to understand input issues quickly and recover without losing progress.
- Teams need consistent validation behavior across products and screens.
- Without a shared pattern, form feedback style and timing become inconsistent.

## Decision Guide

- Use this pattern when the screen contains user-editable input plus a submit action.
- Prefer inline field feedback for recoverable errors.
- Use global alerts only for cross-field or submission-level failures.
- Tradeoff:
  - Inline feedback improves local correction speed.
  - Submission-level feedback reduces visual noise but delays issue discovery.

## Pattern Structure

1. User edits one or more fields.
2. Field-level validation runs (on blur and/or submit).
3. Invalid fields show localized error feedback.
4. Submit action is blocked until required errors are resolved.
5. Successful validation enables normal submit flow.

## Composition

- [Text Input](../../components/text_input.md): primary single-line field input.
- [Text Area](../../components/text_area.md): multi-line field input when needed.
- [Alert](../../components/alert.md): submission-level error summary.
- [Button](../../components/button.md): submit and secondary actions.

## Behavior

- Interaction:
  - Run field checks when focus leaves a field and on submit.
  - Keep field value intact after errors; do not clear user input.
- Responsive:
  - Place field-level error text directly below its field with `8px` vertical spacing.
  - Stack field groups vertically on narrow layouts and keep submit actions at the end of the form flow.
- Overflow and long content:
  - Wrap validation text to multiple lines without truncating actionable guidance.
  - Keep labels and helper text visible at all times for invalid fields.
- Failure states:
  - If server validation returns additional errors, map errors to fields when possible and show an alert summary above the form.
  - Preserve user input and focus the first unresolved invalid field after submit.

## Accessibility

- Use semantic field labeling and programmatic error association.
- Error feedback must not rely only on color.
- Keyboard users must reach and correct each invalid field without pointer input.
- Inline errors must be connected through `aria-describedby`.
- Submission-level validation summary must be announced through an alert region with clear remediation text.

## Internationalization

- RTL behavior:
  - Mirror horizontal field affordances and icon placement while preserving logical field sequence.
  - Mirror directional icons used inside validation hints.
- Text expansion:
  - Support at least 30% text expansion without clipping labels or validation copy.
  - Maintain multi-line wrapping for error descriptions.
- Locale formats:
  - Use locale-aware parsing/formatting through platform `Intl` APIs for date/number/currency fields.
- Reduced motion and zoom:
  - Under `prefers-reduced-motion`, disable non-essential animation and reveal validation states without motion transitions.
  - At 200% zoom, keep field labels, messages, and actions readable without horizontal scrolling in the form container.

## Implementation Links

- Component sources:
  - [Text Input](../../components/text_input.md)
  - [Text Area](../../components/text_area.md)
  - [Alert](../../components/alert.md)
  - [Button](../../components/button.md)
- Workflow examples are versioned in product repositories using the `workflow:form-validation` tag.
- Validation incidents and follow-ups are tracked through repository issues labeled `workflow:form-validation`.

## Governance

- Owner role: Design System Lead.
- Co-owner role: Forms Domain Maintainer.
- Change approval path:
  - Open a workflow change issue with user impact and evidence.
  - Require one design review and one engineering review.
  - Require Design System Lead approval before merge.
- Deprecation trigger:
  - Introduce replacement pattern before marking deprecated.
- Migration expectation:
  - Publish replacement mapping and keep a two-minor-release migration window before removal.

## Metrics and Feedback

- Adoption metric:
  - `adoption_rate = screens_using_form_validation_pattern / eligible_form_screens * 100`.
- Quality metric:
  - `validation_issue_rate = validation_related_bugs / total_form_releases`.
- Maintenance metric:
  - `mttr = median(days_to_close_workflow_form_validation_issues)`.
- Feedback intake channel:
  - Repository issues labeled `workflow:form-validation`.
- Reporting cadence:
  - Monthly KPI review in the workflow governance sync.

## Related Components

- [Text Input](../../components/text_input.md): field-level entry and validation display.
- [Text Area](../../components/text_area.md): long-form entry variant.
- [Alert](../../components/alert.md): aggregated feedback container.
- [Button](../../components/button.md): submit state and action control.
