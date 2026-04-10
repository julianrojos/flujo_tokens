# Paquete de skills y rules para documentar componentes desde Figma/MCP

Este paquete está pensado para una IA que genera documentación en **dos llamadas**:

1. **Primera llamada** → `ComponentDocOutput`
2. **Segunda llamada** → `EditorialPatch`
3. **tercera pasada silenciosa: Validación** → `ValidationReport`

## Objetivo

Convertir un generador de documentación en un sistema **con criterio, trazabilidad y límites claros**.

## Principios no negociables

- Nada que no sea visible o trazable desde Figma/MCP o desde una convención explícita del sistema puede presentarse como hecho.
- Mejor dejar un campo vacío o marcado como pendiente que rellenarlo con una inferencia convincente pero falsa.
- Separar **estado visual observable** de **comportamiento real implementado**.
- Si la estructura del componente en Figma es pobre, el sistema debe degradar la confianza y emitir `StructureWarning`.
- El patch editorial complementa; no reescribe ni contradice la extracción factual.

## Stack recomendado

- `figma-component-extractor`
- `variant-state-classifier`
- `editorial-patch-writer`
- `doc-consistency-checker`

## Orden recomendado de implementación

1. Añadir `states[]` al schema base.
2. Reemplazar `accessibilityNotes[]` por `accessibilityFacts[]` con niveles de confianza.
3. Implementar `StructureWarning`.
4. Implementar `doc-consistency-checker`.
5. Añadir `ValidationReport` silencioso.

## Archivos incluidos

### Skills

- `skills/figma-component-extractor.SKILL.md`
- `skills/variant-state-classifier.SKILL.md`
- `skills/editorial-patch-writer.SKILL.md`
- `skills/doc-consistency-checker.SKILL.md`

### Reglas

- `rules/RULES.md`

## Recomendaciones de schema

### ComponentDocOutput

Recomendado ampliar con:

- `states[]`
- `accessibilityFacts[]`
- `structureWarning?`
- `confidence?`
- `unresolvedQuestions[]?`

### EditorialPatch

Mantener como capa prescriptiva:

- `purpose`
- `when_to_use`
- `when_not_to_use`
- `do[]`
- `dont[]`
- `best_practices`
- `content_guidelines`
- `rules[]`
- `accessibility`
- `qa[]`
- `related_components[]`

### ValidationReport

Sugerido:

- `passes: boolean`
- `severity: "blocking" | "warning" | "info"`
- `score: number`
- `structureWarnings[]`
- `missingSections[]`
- `unsupportedClaims[]`
- `editorialConflicts[]`
- `terminologyMismatches[]`
- `a11yWarnings[]`
- `notes[]`

## Convenciones de etiquetas

Usar placeholders explícitos cuando haga falta:

- `[Requiere revisión]`
- `[Por confirmar con dev]`
- `[Descripción inferida]`
- `[Fuera de scope Figma]`

## Notas de implementación

- Si no hay fuente de gobernanza real, no generar `owner`, `reviewedAt` o `status` como hechos.
