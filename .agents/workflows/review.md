---
description: Review pre-commit (unstaged-first): examina cambios línea a línea, detecta bugs/regresiones probables y propone mejoras con umbrales de confianza, minimizando ruido.
---

# /review — Pre-commit code review (staged-first, actionable-only)

Este comando realiza una auditoría crítica de los cambios locales **antes de commitear** (por defecto: **working tree**, con fallback al staged).  
**No se debe cambiar el código**: solo comprenderlo y revisarlo. Enfoque: calidad técnica, seguridad y prevención de regresiones, minimizando ruido.

## Objetivos del Review

- **Bugs (Confianza ≥ 50%)**: identificar errores de lógica, fallos, fugas y edge cases relevantes. Buscar la **causa raíz**, no el síntoma.
- **Regresiones (Confianza ≥ 50%)**: detectar si el cambio rompe comportamiento previo o invalida contratos existentes.
- **Mejoras técnicas (Confianza ≥ 70%)**: proponer cambios **adicionales** (no ya implementados) para mejorar legibilidad, mantenibilidad o alineación con el proyecto.

## Reglas de Oro

1) **No cambies el código**: solo revisión informada.  
2) **Scope staged-first**: revisa primero lo que realmente se va a commitear (staged). Si no hay staged, revisa working tree.  
3) **Línea a línea con contexto**: analiza cada hunk del diff, pero valida con el contexto del archivo cuando sea necesario.  

4) **Solo señal (actionable-only)**  
   - **Prohibido**: validaciones positivas, “✅”, “correcto”, “bien”, “patrón válido”, “robusto”, “alineado”, “regresiones corregidas”, “exportaciones limpias”, etc.  
   - **Prohibido**: “Sugerencia: Ninguna” o equivalentes.  
   - Un punto **solo** se reporta si incluye una **acción concreta** (cambio recomendado) **o** una **pregunta de verificación** (algo que comprobar) con evidencia.  
   - Si no hay acción, **no lo incluyas** (ni siquiera como “está solucionado”).

5) **Sin redundancias (filtrado)**: si un hallazgo ya está resuelto en el código actual (incluyendo contexto alrededor del diff) o en el propio diff, **no lo incluyas**.  
6) **Laconismo y directo**: breve pero explicativo. Sin cortesías innecesarias.  
7) **Humildad en soluciones**: en bugs/regresiones, sugiere una solución breve y **1 alternativa** que podría ser mejor (si no se te ocurre, admítelo).  
8) **Contexto real (anti-invención)**: todo debe apoyarse en evidencia del diff/código/stack. Si no hay evidencia suficiente, **no lo afirmes como hallazgo**.  

9) **Gates (anti-ruido)**  
   - No reportes **BUG/REGRESIÓN** por debajo de 50%.  
   - No reportes **MEJORA** por debajo de 70%.  
   - Si el riesgo potencial es alto pero no superas el umbral: añade una **Pregunta de verificación** (máx. 3), sin etiquetarla como hallazgo.

10) **Definición estricta de “MEJORA”**  
   - “MEJORA” significa **algo que propones hacer a partir de ahora** (cambio adicional).  
   - **No** uses “MEJORA” para describir algo que el diff ya implementa (eso se omite).

---

## Paso 1 — Obtener los cambios (staged-first)

// turbo
1. Ejecuta:
   ```bash
   git status --porcelain=v1
   ```

// turbo
2. Si **NO** hay cambios staged, avisa al usuario y extrae el diff del working tree:
   ```bash
   git diff --no-color
   ```

   Si hay cambios staged, extrae el diff staged:
   ```bash
   git diff --staged --no-color
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

5) **Seguridad y secretos**  
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
- Si está ya resuelto → **omite el punto** (no lo menciones).

---

## Paso 3 — Reporte (solo items accionables que pasan gates)

### Regla de impresión por archivo
- **Solo imprime** un bloque `📁 <archivo>` si dentro hay **≥ 1** item accionable (hallazgo o pregunta de verificación).  
- No imprimas bloques vacíos ni “resúmenes por archivo”.

### Formato de hallazgos (OBLIGATORIO)
Para cada hallazgo (que pasa gates y es accionable) lista únicamente (no introduzcas más información):

1) ### 📁 [Ruta del archivo]
- **[TIPO] (Confianza: XX%)** — _[Descripción concisa del hallazgo]_
  - **Evidencia:** [hunk/fragmento específico del diff o referencia clara]
  - **Causa raíz probable:** [1 frase]
  - **Acción recomendada (obligatoria):** [cambio concreto en imperativo]
  - **Alternativa:** [otra opción que podría ser mejor + por qué] / “No se me ocurre una alternativa mejor con el contexto actual”
  - **Riesgo de regresión (si aplica):** [qué podría romper + mitigación breve]
_(Tipos: BUG, REGRESIÓN, MEJORA)_
### Preguntas de verificación (máx. 3; solo si alto riesgo y no supera umbral)
- **[PREGUNTA]** — _[qué habría que comprobar para elevar la confianza]_  
  - **Evidencia parcial:** [qué te lo sugiere]  
  - **Qué faltaría:** [test, contrato, caso borde, archivo relacionado, etc.]

---

### Si no hay items accionables
"✅ No se han detectado bugs, regresiones o mejoras críticas con el umbral de confianza requerido."
