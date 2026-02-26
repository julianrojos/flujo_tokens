---
description: Review pre-commit (staged-first): examina cambios línea a línea, detecta bugs/regresiones probables y propone mejoras con umbrales de confianza, minimizando ruido.
---

# /review — Pre-commit code review (staged-first)

Este comando realiza una auditoría crítica de los cambios locales **antes de commitear** (por defecto: **staged**, con fallback al working tree).  
**No se debe cambiar el código en este momento**: solo comprenderlo y revisarlo. Enfoque: calidad técnica, seguridad y prevención de regresiones, evitando ruido.

## Objetivos del Review

- **Bugs (Confianza ≥ 50%)**: identificar errores de lógica, fallos, fugas, edge cases relevantes. Buscar la **causa raíz**, no el síntoma.
- **Regresiones (Confianza ≥ 50%)**: detectar si el cambio rompe comportamiento previo o contratos existentes.
- **Mejoras técnicas (Confianza ≥ 70%)**: sugerir refactors/mejoras de legibilidad o patrones más adecuados al proyecto.

## Reglas de Oro

1) **No cambies el código**: solo revisión informada.  
2) **Scope staged-first**: revisa primero lo que realmente se va a commitear (staged). Si no hay staged, revisa working tree.  
3) **Línea a línea con contexto**: analiza cada hunk del diff, pero valida con el contexto del archivo cuando sea necesario.  
4) **Sin validaciones positivas**: no digas qué está bien. Si no hay hallazgos, termina con el mensaje final ✅.  
5) **Sin redundancias (filtrado)**: si un hallazgo ya está resuelto en el código actual (incluyendo contexto alrededor del diff) o en el propio diff, **no lo incluyas**. No escribas “ya está solucionado”: **omítelo**.  
6) **Laconismo y directo**: breve pero explicativo. Sin cortesías innecesarias.  
7) **Proactividad en soluciones**: en bugs/regresiones, sugiere una solución breve y **1 alternativa** que podría ser mejor (si no se te ocurre, admítelo).  
8) **Contexto real (anti-invención)**: basa todo en evidencia del diff/código/stack. Si no hay evidencia suficiente, **no lo afirmes como hallazgo**.  
9) **Gates (anti-ruido)**:  
   - No informes de **BUG/REGRESIÓN** por debajo de 50%.  
   - No informes de **MEJORA** por debajo de 70%.  
   - Excepción: si el riesgo potencial es alto pero no puedes superar el umbral, añádelo como **“Pregunta de verificación”** (máx. 3) al final, sin etiquetarlo como hallazgo.

---

## Paso 1 — Obtener los cambios (staged-first)

// turbo
1. Ejecuta:
   ```bash
   git status --porcelain=v1
   ```

// turbo
2. Si hay cambios staged, extrae el diff staged:
   ```bash
   git diff --staged --no-color
   ```
   Si **NO** hay cambios staged, avisa al usuario y extrae el diff del working tree:
   ```bash
   git diff --no-color
   ```

// turbo
3. Saca una vista rápida del alcance:
   ```bash
   git diff --staged --stat --no-color || git diff --stat --no-color
   ```

---

## Paso 2 — Análisis y Diagnóstico (línea a línea + checks)

Para cada archivo y hunk modificado:

1) **Verifica tipado**  
   - Riesgos de `any`, `unknown` mal acotado, `null/undefined` no controlados.  
   - Narrowing y guards consistentes con el estilo del repo.

2) **Contratos del proyecto**  
   - ¿Respeta `general-programming-principles.md`? (naming, early returns, etc.)

3) **Efectos secundarios / acoplamientos**  
   - Si toca `tooling/`, ¿afecta a otros comandos?  
   - Si toca APIs/utilidades, ¿rompe consumidores aguas abajo?

4) **Lógica de raíz**  
   - Si parece un “fix”: ¿arregla el origen del dato o solo tapa el síntoma (UI/handler)?

5) **Seguridad y secretos (check explícito)**  
   - ¿Se han añadido keys/tokens/URLs privadas?  
   - ¿Entradas validadas/sanitizadas donde toca?  
   - ¿Cambios en dependencias/lockfiles con riesgo? (si aplica)

### Filtro de redundancias (antes de reportar)
Antes de incluir un hallazgo:
- Verifica si ya está mitigado en el propio diff o en el contexto cercano del archivo.
- Si necesitas más contexto, obténlo de forma read-only (elige una):
  - Re-diff con más contexto del archivo:
    ```bash
    git diff --staged --no-color -U20 -- <ruta-del-archivo> || git diff --no-color -U20 -- <ruta-del-archivo>
    ```
  - O inspecciona el archivo alrededor del cambio (sin editar) con el visor/lectura del IDE.

Si está ya resuelto → **omite el punto** (no lo menciones).

---

## Paso 3 — Reporte de Hallazgos (solo si pasan gates)

Presenta resultados agrupados por archivo, en este formato:

### 📁 [Ruta del archivo]

- **[TIPO] (Confianza: XX%)** — _[Descripción concisa del hallazgo]_
  - **Evidencia:** [hunk/fragmento específico del diff o referencia clara]
  - **Causa raíz probable:** [1 frase]
  - **Sugerencia:** [solución recomendada, breve]
  - **Alternativa:** [otra opción que podría ser mejor + por qué] / “No se me ocurre una alternativa mejor con el contexto actual”
  - **Riesgo de regresión (si aplica):** [qué podría romper + mitigación breve]

_(Tipos: BUG, REGRESIÓN, MEJORA)_

### Preguntas de verificación (solo si alto riesgo y no supera umbral; máx. 3)
- **[Pregunta]** — _[qué habría que comprobar para elevar la confianza]_  
  - **Evidencia parcial:** [qué te lo sugiere]  
  - **Qué faltaría:** [test, contrato, caso borde, archivo relacionado, etc.]

---

### Si no hay hallazgos (y sin preguntas de verificación)
"✅ No se han detectado bugs, regresiones o mejoras críticas con el umbral de confianza requerido."
