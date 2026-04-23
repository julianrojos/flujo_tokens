---
doc_type: workflow
---

# Destructive Confirmation Pattern

A reusable pattern for confirming irreversible or high-impact actions before execution.

## Overview

- Pattern intent: prevent accidental destructive actions while preserving task flow.
- Typical scope: delete, remove, reset, and revoke operations with user impact.
- Out of scope: routine low-risk actions and undo-only safeguards without confirmation.

## Problem

- Users can trigger destructive actions unintentionally in dense interfaces.
- Teams often apply inconsistent confirmation thresholds and messaging.
- Without a shared pattern, risk communication and recovery options diverge.

## Decision Guide

- Use this pattern when the action is irreversible or has high recovery cost.
- Prefer inline confirmation only for low-complexity contexts.
- Use overlay-based confirmation when user focus and explicit acknowledgement are required.
- Tradeoff:
  - Stronger confirmation reduces accidental loss.
  - Additional steps increase task completion time.

## Pattern Structure

1. User initiates destructive intent.
2. System presents confirmation context and consequence summary.
3. User chooses cancel or confirm.
4. System executes action and returns success/failure feedback.
5. System provides recovery guidance when possible.

## Composition

- [Overlay](../../components/overlay.md): focus and context isolation for confirmation.
- [Alert](../../components/alert.md): consequence and status messaging.
- [Button](../../components/button.md): confirm/cancel actions.
- [Text Input](../../components/text_input.md): optional typed confirmation for critical actions.

## Button Contract

- Use the canonical `Button` `destructive` variant for the confirm action.
- Keep the cancel or close action neutral.
- Keep the destructive label explicit so the outcome stays visible in dense layouts.
- Do not introduce local red button styles inside pattern-specific dialogs.

## Behavior

- Interaction:
  - Default focus should land on safe action when risk is high.
  - Confirm action must require explicit user intent and use the canonical destructive button treatment from the component registry.
- Responsive:
  - Use a vertically stacked confirmation layout on compact viewports with clear action separation.
  - Keep both cancel and confirm actions visible without horizontal scrolling.
- Overflow and long content:
  - Wrap consequence text and preserve full warning content without truncation.
  - Keep destructive action label explicit even when message length increases.
- Failure states:
  - On execution failure, keep the confirmation context visible and show an alert with retry or safe exit action.
  - For partial batch failure, provide per-item failure summary and recovery actions.

## Accessibility

- Confirmation prompt must expose clear role/labeling and focus order.
- Keyboard users must reach cancel/confirm paths predictably.
- Do not communicate risk only through color.
- Announce the confirmation context and destructive consequence summary when the prompt opens.
- Announce success/failure outcome after action completion through a live region or alert pattern.

## Internationalization

- RTL behavior:
  - Mirror horizontal action placement while preserving semantic action meaning and emphasis hierarchy.
- Text expansion:
  - Support at least 30% expansion for warning and consequence copy without clipping.
- Locale formats:
  - Format impacted counts and dates with locale-aware `Intl` formatting.
- Reduced motion and zoom:
  - Under `prefers-reduced-motion`, disable animated overlay transitions and present state changes instantly.
  - At 200% zoom, preserve full readability of consequence text and direct access to cancel/confirm actions without horizontal scrolling.

## Implementation Links

- Component sources:
  - [Overlay](../../components/overlay.md)
  - [Alert](../../components/alert.md)
  - [Button](../../components/button.md)
  - [Text Input](../../components/text_input.md)
- Risk taxonomy:
  - Classify actions as low/medium/high risk and require confirmation for high-risk or irreversible actions.
- Recovery playbook:
  - Track recovery expectations and rollback availability in repository issues labeled `workflow:destructive-confirmation`.

## Governance

- Owner role: Design System Lead.
- Co-owner role: Safety and Trust Maintainer.
- Change approval path:
  - Open a workflow change issue with risk classification impact.
  - Require one design review and one engineering review.
  - Require Design System Lead approval before merge.
- Deprecation trigger:
  - Replace only after successor confirmation model is validated.
- Migration expectation:
  - Document copy and interaction migration from legacy confirmations with a two-minor-release transition window.

## Metrics and Feedback

- Adoption metric:
  - `adoption_rate = high_risk_actions_using_confirmation_pattern / total_high_risk_actions * 100`.
- Quality metric:
  - `accidental_action_rate = accidental_destructive_actions / destructive_actions_total`.
- Maintenance metric:
  - `mttr = median(days_to_close_workflow_destructive_confirmation_issues)`.
- Feedback intake channel:
  - Repository issues labeled `workflow:destructive-confirmation`.
- Reporting cadence:
  - Monthly KPI review in the workflow governance sync.

## Related Components

- [Overlay](../../components/overlay.md): context isolation.
- [Alert](../../components/alert.md): consequence/status messaging.
- [Button](../../components/button.md): user decision controls.
- [Text Input](../../components/text_input.md): typed confirmation variant.
