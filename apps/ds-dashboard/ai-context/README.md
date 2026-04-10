# Paquete de skills y rules para documentar componentes desde Figma/MCP

Este paquete está pensado para una IA que genera documentación con este pipeline:

1. **Primera llamada** → `ComponentDocModelOutput` (extracción estructurada)
2. **Paso backend** → normalización factual + render a `ComponentDocOutput`
3. **Segunda llamada** → `EditorialPatch`
4. **Tercera llamada opcional** → `ValidationReport` (no genera contenido final, pero sí afecta `canPublish`)

## Objetivo

Convertir un generador de documentación en un sistema **con criterio, trazabilidad y límites claros**.

## Principios no negociables

- Nada que no sea visible o trazable desde Figma/MCP o desde una convención explícita del sistema puede presentarse como hecho.
- Mejor dejar un campo vacío o marcado como pendiente que rellenarlo con una inferencia convincente pero falsa.
- Separar **estado visual observable** de **comportamiento real implementado**.
- Si la estructura del componente en Figma es pobre, el sistema debe degradar la confianza y emitir `StructureWarning`.
- El patch editorial complementa; no reescribe ni contradice la extracción factual.
- Document intent before visual detail.
- Prioritize: what it is, when to use it, when not to use it.

## Guardrails por etapa (qué NO debe hacer)

### Extracción (`ComponentDocModelOutput`)

- No generar `purpose`, `when_to_use`, `when_not_to_use` ni `do/dont`.
- No inferir comportamiento real desde estados visuales de Figma.
- No declarar accesibilidad como verificada sin evidencia.

### Editorial (`EditorialPatch`)

- No inventar variantes que no existan en `ComponentDocOutput`.
- No presentar accesibilidad inferida como verificada.
- No rellenar huecos con convenciones no declaradas.

### Validación (`ValidationReport`)

- Es una pasada interna de calidad, opcional según el job, no contenido para usuario final.
- Debe validar contradicciones, claims no soportados y trazabilidad antes de `canPublish`.

## Clasificación ambigua y deuda de diseño

- Si no hay confianza para clasificar (`state-*`, `variant-*`, `prop-*`), usar id estable y emitir warning.
- Si Figma mezcla categorías (ej. `primary-disabled` en un mismo eje), conservar el dato fuente y marcar deuda de diseño.
- No “corregir” naming en silencio.

## Calidad de `qa[]`

- `qa[]` debe contener preguntas específicas y verificables del componente.
- Evitar checklist genérica (ej. `¿Cumple accesibilidad?`).
- Priorizar preguntas accionables para revisión real.

## Stack recomendado

- `figma-component-extractor`
- `variant-state-classifier`
- `editorial-patch-writer`
- `doc-consistency-checker`

## Archivos incluidos

### Skills

- `skills/figma-component-extractor.SKILL.md`
- `skills/variant-state-classifier.SKILL.md`
- `skills/editorial-patch-writer.SKILL.md`
- `skills/doc-consistency-checker.SKILL.md`

### Reglas

- `rules/RULES.md`

## Contrato vigente (schema)

El contrato efectivo de salida lo define el backend y no este README:

- `ComponentDocModelOutput`, `ComponentDocOutput` y `AiJobState`: `apps/ds-dashboard/server/services/ai-component-doc-schema.ts`
- `EditorialPatch`: `apps/ds-dashboard/server/services/ai-editorial-patch-schema.ts`
- `ValidationReport`: `apps/ds-dashboard/server/services/ai-validation-report-schema.ts`

Notas:

- Este README describe intención y guardrails; no reemplaza los schemas.
- Si hay conflicto entre README y schema, prevalece el schema vigente.
- `ComponentDocModelOutput` es la extracción estructurada que devuelve el modelo.
- `ComponentDocOutput` es el artefacto final del backend después de renderizar `markdown`.

## Convenciones de etiquetas

Usar placeholders explícitos cuando haga falta:

- `[Requiere revisión]`
- `[Por confirmar con dev]`
- `[Descripción inferida]`
- `[Fuera de scope Figma]`
