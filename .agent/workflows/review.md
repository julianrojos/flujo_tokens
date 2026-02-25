---
description: Review pre-commit: examina cambios línea a línea, detecta bugs/regresiones probables y propone mejoras con umbrales de confianza.
---

# /review — Pre-stage code review

Este comando realiza una auditoría crítica de los cambios locales antes de ser confirmados (staged o commit). No se debe cambiar el código en este momento, sólo comprenderlo y revisarlo. Se enfoca en la calidad técnica, la seguridad y la prevención de regresiones, evitando ruido innecesario.

## Objetivos del Review

- **Bugs Críticos (Confianza ≥ 50%):** Identificar errores de lógica, fugas de memoria o fallos. Buscar la **raíz**, no el síntoma.
- **Regresiones (Confianza ≥ 50%):** Detectar si el cambio rompe funcionalidades existentes en otras partes del sistema o invalida contratos previos.
- **Mejoras Técnicas (Confianza ≥ 70%):** Sugerir refactorizaciones, mejoras de legibilidad o uso de patrones más adecuados del proyecto.

## Reglas de Oro

1. **No cambies el código:** Limítate a emitir una revisión informada.
2. **Línea a línea:** Analiza cada cambio en el diff, pero entiende el contexto del archivo completo.
3. **Sin validaciones positivas:** No digas qué está bien. Si no hay nada que reportar, termina con un breve mensaje indicando que no se han encontrado problemas significativos.
4. **Sin redundancias:** Si una solución, mejora o fix ya está implementado en el código actual, no lo menciones: se trata de proponer mejoras o informar de posibles errores o regresiones, no de informar sobre qué se ha hecho.
5. **Laconismo y Directo:** Sé breve pero explicativo. Usa el mínimo de palabras posible para asegurar la claridad. Sin "sugarcoating" ni cortesías innecesarias.
6. **Humildad en soluciones:** Para bugs y regresiones, propón una solución breve pero **advirtiendo que debe explorarse una alternativa mejor** (incluye al menos una idea alternativa).
7. **Contexto Real:** No inventes errores. Basa tus sospechas en el código y el stack tecnológico del proyecto.

---

## Paso 1 — Obtener los cambios

// turbo

1. Ejecuta:
   ```bash
   git status --porcelain=v1
   ```
2. Si hay cambios en el **index (staged)**, extrae el diff de ellos:
   ```bash
   git diff --staged --no-color
   ```
3. Si **NO hay cambios staged**, avisa al usuario y extrae el diff del **working tree** (cambios sin stage):
   ```bash
   git diff --no-color
   ```

## Paso 2 — Análisis y Diagnóstico

Para cada archivo y bloque de código modificado:

1. **Verifica Tipado:** ¿Hay riesgos de `any`, `null` o `undefined` no controlados?
2. **Contratos:** ¿Se están respetando las reglas de `general-programming-principles.md?` (Early returns, naming, etc.)
3. **Efectos Secundarios:** En el pipeline de herramientas (`tooling/`), ¿el cambio afecta a otros comandos?
4. **Lógica de Raíz:** Si ves un fix, ¿está arreglando el origen del dato o solo "tapando" el error en la UI?

## Paso 3 — Reporte de Hallazgos

Presenta los resultados en este formato:

### 📁 [Ruta del archivo]

- **[TIPO] (Confianza: XX%)** — _[Descripción concisa del hallazgo]_
  - **Sugerencia:** [Solución recomendada]
  - **Nota:** Esta solución es inmediata, pero se debería considerar: _[Opción alternativa/mejor]_

_(Tipos: BUG, REGRESIÓN, MEJORA)_

---

_Si no hay hallazgos:_
"✅ No se han detectado bugs, regresiones o mejoras críticas con el umbral de confianza requerido."
