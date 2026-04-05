# RULES.md

## Rules transversales para todo el sistema

Estas reglas no pertenecen a un skill aislado. Deben vivir en la configuración base, system prompt o capa de validación común.

---

## 1. Regla madre

Nada que no sea visible o trazable desde Figma/MCP o desde una convención explícita del sistema puede presentarse como hecho.

---

## 2. Honestidad antes que completitud

- Mejor dejar un campo vacío que inventarlo.
- Mejor marcar una inferencia como baja confianza que presentarla como resuelta.
- Mejor devolver `[Por confirmar con dev]` que una certeza falsa.

---

## 3. Separación entre bloques

### ComponentDocOutput
Debe contener:
- hechos observables
- extracción estructurada
- inferencias mínimas y marcadas

### EditorialPatch
Debe contener:
- guidance
- rationale
- recomendaciones
- preguntas de QA
- notas de accesibilidad no verificadas

### Nunca
El patch no puede:
- crear variantes nuevas
- renombrar anatomy arbitrariamente
- describir tokens inexistentes
- contradecir el bloque base

---

## 4. Estado visual ≠ comportamiento real

Se puede afirmar:
- que existe una variante visual `hover`
- que existe una variante visual `focus`
- que existe una variante visual `disabled`

No se puede afirmar solo desde Figma:
- focus management real
- soporte de teclado real
- loading async real
- screen reader announcements correctos

---

## 5. Accesibilidad con niveles de confianza

Toda afirmación delicada de accesibilidad debería poder clasificarse como:
- `verified`
- `recommended`
- `unknown`

Por defecto, desde Figma:
- los roles son recomendados, no hechos
- labeling requiere confirmación
- teclado y SR suelen estar fuera de scope

---

## 6. Limitación de modo único de Figma

Si el plugin solo expone un modo activo:
- no asumir que el valor observado representa todos los modos
- no inferir dark mode, high contrast o brand modes completos
- marcar `modeCoverage: partial` o equivalente cuando proceda

---

## 7. Tokens

- Solo documentar tokens realmente vinculados al componente.
- No inventar alias chain si el plugin no la expone.
- No inventar capas de token si el plugin no las expone.
- La intención del token solo se infiere si la taxonomía es reconocible.
- Si el naming del token es malo, eso es deuda, no algo que haya que esconder.

---

## 8. StructureWarning

Si el componente no supera un umbral mínimo de estructura legible:
- emitir `StructureWarning`
- bajar confianza global
- no compensar con inferencia agresiva

Casos típicos:
- nombres de capas caóticos
- variantes mezcladas sin patrón
- anatomía pública indistinguible
- props o estados mal nombrados
- tokens no vinculados donde deberían existir

---

## 9. Coherencia terminológica

La terminología debe ser consistente entre extracción y patch.

Ejemplo:
- si base usa `leading-icon`, el patch no debe usar `prefix icon` sin justificación

El validador debe marcarlo como:
- `terminologyMismatch`

---

## 10. Placeholders obligatorios

Usar estas etiquetas cuando haga falta:

- `[Requiere revisión]`
- `[Por confirmar con dev]`
- `[Descripción inferida]`
- `[Fuera de scope Figma]`

No sustituirlas por lenguaje vago.

---

## 11. QA específico

`qa[]` debe contener preguntas verificables y específicas del componente.

Evitar:
- preguntas genéricas
- frases aspiracionales
- recordatorios abstractos de buenas prácticas

---

## 12. Gobernanza

No generar como hechos:
- `owner`
- `status`
- `reviewedAt`
- `deprecated`
- `replacement`

salvo que exista fuente real:
- metadata del sistema
- JSON de configuración
- spreadsheet
- CMS interno
- convención explícita verificable

---

## 13. Severidad de validación

### blocking
- contradicción factual
- accesibilidad presentada como verificada sin evidencia
- claims no trazables
- estructura ilegible grave

### warning
- terminología inconsistente
- clasificación ambigua
- theming parcial
- QA genérico
- token naming dudoso

### info
- mejora editorial opcional
- enriquecimiento futuro
- campos opcionales vacíos

---

## 14. Regla de publicación

No publicar documentación si:
- hay contradicciones factuales
- hay claims más fuertes que la evidencia
- la estructura del componente no alcanza umbral mínimo
- la accesibilidad parece “resuelta” pero no está trazada

---

## 15. Regla de diseño del sistema

No diseñar campos para el sistema que te gustaría tener, sino para el sistema que hoy puede sostener evidencia real.

---

## 16. Claims normativos

No afirmar cumplimiento normativo como hecho si no existe auditoría verificable.

No presentar como verificado:
- cumplimiento WCAG (AA/AAA)
- conformidad legal o regulatoria
- certificaciones de accesibilidad o calidad

Si no hay evidencia de auditoría:
- usar `TBD`
- usar `[Por confirmar con dev]`
- describir solo hechos observables o recomendaciones
