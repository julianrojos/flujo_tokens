---
description: Inclusive AI-suggestion guardrails currently injected into the AI prompt policy.
---

# Inclusive suggestions policy

This file is intentionally narrow.
At the moment, the prompt policy injects only the `Prohibited claims` section from this file.
If broader accessibility or i18n guidance is needed in prompts, the wiring in `ai-prompt-policy.ts` must be expanded explicitly.

## Prohibited claims

- Do not claim WCAG level compliance (AA/AAA) without completed audit evidence.
- Do not invent contrast ratios, keyboard support, or screen reader behavior.
- Do not claim final ARIA role/labeling as verified when inferred from design only.
- Do not imply i18n/RTL readiness without explicit behavior notes.
- Do not hide uncertainty; unresolved points must remain explicit.
