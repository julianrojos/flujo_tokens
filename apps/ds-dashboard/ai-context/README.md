# Skills and Rules Package for Documenting Components from Figma/MCP

This package is intended for an AI system that generates documentation with this pipeline:

1. **First call** -> `ComponentDocModelOutput` (structured extraction)
2. **Backend step** -> factual normalization + render to `ComponentDocOutput`
3. **Second call** -> `EditorialPatch`
4. **Optional third pass** -> `ValidationReport` (does not generate final content, but it does affect `canPublish`)

## Goal

Turn a documentation generator into a system with **judgment, traceability, and clear limits**.

## Non-negotiable Principles

- Nothing that is not visible or traceable from Figma/MCP or from an explicit system convention may be presented as fact.
- It is better to leave a field empty or marked as pending than to fill it with a convincing but false inference.
- Separate **observable visual state** from **real implemented behavior**.
- If the component structure in Figma is weak, the system must lower confidence and emit `StructureWarning`.
- The editorial patch complements; it does not rewrite or contradict the factual extraction.
- Document intent before visual detail.
- Prioritize: what it is, when to use it, when not to use it.

## Per-stage Guardrails (what it must NOT do)

### Extraction (`ComponentDocModelOutput`)

- Do not generate `purpose`, `when_to_use`, `when_not_to_use`, or `do/dont`.
- Do not infer real behavior from Figma visual states.
- Do not declare accessibility as verified without evidence.

### Editorial (`EditorialPatch`)

- Do not invent variants that do not exist in `ComponentDocOutput`.
- Do not present inferred accessibility as verified.
- Do not fill gaps with undeclared conventions.

### Validation (`ValidationReport`)

- It is an internal quality pass, optional depending on the job, not end-user content.
- It must validate contradictions, unsupported claims, and traceability before `canPublish`.

## Ambiguous Classification and Design Debt

- If there is not enough confidence to classify (`state-*`, `variant-*`, `prop-*`), use a stable id and emit a warning.
- If Figma mixes categories (for example `primary-disabled` on the same axis), preserve the source data and mark it as design debt.
- Do not silently “fix” naming.

## `qa[]` Quality

- `qa[]` must contain component-specific and verifiable questions.
- Avoid generic checklists (for example `Does it meet accessibility requirements?`).
- Prioritize actionable questions for real review.

## Recommended Stack

- `figma-component-extractor`
- `variant-state-classifier`
- `editorial-patch-writer`
- `doc-consistency-checker`

## Included Files

### Skills

- `skills/figma-component-extractor.SKILL.md`
- `skills/variant-state-classifier.SKILL.md`
- `skills/editorial-patch-writer.SKILL.md`
- `skills/doc-consistency-checker.SKILL.md`

### Rules

- `rules/RULES.md`

## Current Contract (schema)

The effective output contract is defined by the backend, not by this README:

- `ComponentDocModelOutput`, `ComponentDocOutput`, and `AiJobState`: `apps/ds-dashboard/server/services/ai-component-doc-schema.ts`
- `EditorialPatch`: `apps/ds-dashboard/server/services/ai-editorial-patch-schema.ts`
- `ValidationReport`: `apps/ds-dashboard/server/services/ai-validation-report-schema.ts`

Notes:

- This README describes intent and guardrails; it does not replace the schemas.
- If there is a conflict between this README and the schema, the current schema prevails.
- `ComponentDocModelOutput` is the structured extraction returned by the model.
- `ComponentDocOutput` is the final backend artifact after rendering `markdown`.

## Placeholder Conventions

Use explicit placeholders when needed:

- `[Requires review]`
- `[To confirm with dev]`
- `[Inferred description]`
- `[Outside Figma scope]`
