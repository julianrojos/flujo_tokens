---
description: Review pre-commit (staged-first, actionable-only): revisa cambios línea a línea, detecta bugs/regresiones y propone mejoras con umbrales. Incluye untracked (sin stage), lockfiles como señal prioritaria y RIDs para quoting en /judge.
---

# /review — Pre-commit code review (staged-first, actionable-only)

Este comando realiza una auditoría crítica de los cambios locales **antes de commitear** (por defecto: **staged**, con fallback al **working tree**).
**No se debe cambiar el código**: solo comprenderlo y revisarlo. Enfoque: calidad técnica, seguridad y prevención de regresiones, minimizando ruido.

## Objetivos del Review
- **Bugs (Confianza ≥ 50%)**: identificar errores de lógica, fallos, fugas y edge cases relevantes. Buscar la **causa raíz**, no el síntoma.
- **Regresiones (Confianza ≥ 50%)**: detectar si el cambio rompe comportamiento previo o invalida contratos existentes.
- **Mejoras técnicas (Confianza ≥ 70%)**: proponer cambios **adicionales** (no ya implementados) para mejorar legibilidad, mantenibilidad o alineación con el proyecto.

## Reglas de Oro
1) **No cambies el código**: solo criterio de revisión informada.
2) **Scope staged-first**: revisa primero lo que realmente se va a commitear (staged). Si no hay staged, revisa working tree.
3) **Línea a línea con contexto**: analiza cada hunk del diff, pero valida con el contexto del archivo cuando sea necesario.

4) **Solo señal (actionable-only)**
   - **Prohibido**: validaciones positivas (“✅”, “correcto”, “bien”, “patrón válido”, “robusto”, “alineado”, “regresiones corregidas”, “exportaciones limpias”, etc).
   - **Prohibido**: “Sugerencia: Ninguna” o equivalentes.
   - Un punto **solo** se reporta si incluye una **acción concreta** (cambio recomendado) **o** una **pregunta de verificación** (algo que comprobar) con evidencia.
   - Si no hay acción, **no lo incluyas** (ni siquiera como “está solucionado”).

5) **Sin redundancias (filtrado)**: si un hallazgo ya está resuelto en el código actual (incluyendo contexto alrededor del diff) o en el propio diff, **omite**.
6) **Laconismo y directo**: breve pero explicativo. Sin cortesías innecesarias.
7) **Humildad en soluciones**: en bugs/regresiones, sugiere 1 alternativa  (si no se te ocurre, admítelo).
8) **Contexto real (anti-invención)**: todo debe apoyarse en evidencia del diff/código/stack. Si no hay evidencia suficiente, **no lo afirmes como hallazgo**.

9) **Gates (anti-ruido)**
   - No reportes **BUG/REGRESIÓN** < 50%.
   - No reportes **MEJORA** < 70%.
   - Si el riesgo es alto pero no supera umbral: añade **PREGUNTA** (máx. 3), sin etiquetarla como hallazgo.

10) **Definición estricta de “MEJORA”**
   - “MEJORA” = cambio adicional futuro (no lo ya implementado).

11) **RIDs obligatorios (para /judge)**
   - Cada elemento reportado (BUG/REGRESIÓN/MEJORA/PREGUNTA) debe llevar un identificador **RID** único.
   - Formato: `RID: R-001`, `R-002`, ... asignados en **orden de aparición** en el reporte.
   - /judge usará estos RIDs para citar el bloque **verbatim**.

---

## Paso 1 — Obtener los cambios (staged-first)

// turbo
1) Ejecuta:
```bash
git status --porcelain=v1
```

### 1.5 — Untracked files (solo si existen; sin stage)
> Objetivo: incluir archivos nuevos no trackeados en la revisión sin hacer stage.
**A. Lista untracked (si la lista está vacía, sáltate este paso):**

// turbo
```bash
git ls-files --others --exclude-standard
```

**B. Para cada archivo listado arriba, saca diff contra vacío (sin stage):**
```bash
git diff --no-index --no-color -- /dev/null "<ruta-del-archivo>" || true
```

### 1.6 — Detectar lockfiles/manifiestos de dependencias (señal prioritaria)
Regla: si hay cambios en lockfiles/manifiestos, **siempre** añade una **PREGUNTA PRIORITARIA** (con RID) aunque no pase gates, pidiendo confirmar intención del cambio y el impacto transitive.

// turbo
```bash
# staged-first: si hay staged, úsalo; si no, usa working tree
git diff --staged --name-only --no-color 2>/dev/null | grep -E '(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum|go\.mod)'   || git diff --name-only --no-color | grep -E '(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum|go\.mod)'   || true
```

// turbo
2) Si **NO** hay cambios staged, extrae diff del working tree:
```bash
git diff --no-color
```
Si hay cambios staged, extrae diff staged:
```bash
git diff --staged --no-color
```

// turbo
3) Vista rápida del alcance:
```bash
git diff --staged --stat --no-color || git diff --stat --no-color
```

### 1.7 — Diff fingerprint (para /judge)
Incluye un fingerprint del diff que estás revisando, para que /judge detecte si el informe está desactualizado.

// turbo
```bash
(git diff --staged --no-color || git diff --no-color) | git patch-id --stable 2>/dev/null | head -n 1 | awk '{print $1}' || true
```

---

## Paso 2 — Análisis y Diagnóstico (línea a línea + checks)

Para cada archivo y hunk modificado (incluyendo untracked revisados en 1.5):

1) **Tipado**: 
   - Riesgos de `any`, `unknown` mal acotado, `null/undefined` no controlados.
   - Narrowing y guards consistentes con el estilo del repo.
2) **Contratos del proyecto**:
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

### Metadatos del reporte (OBLIGATORIO)
Antes de los ítems, imprime:

- `diff_scope: staged|working_tree`
- `diff_fingerprint_patch_id: <valor o unknown>`
- `diff_stat: <salida de git diff --stat>`
- `untracked_included: [<rutas> | []]`

### Formato por ítem (OBLIGATORIO)
- **Cada ítem debe tener RID**.
- El bloque “📁 + ítem” debe ser autocontenido para que /judge pueda citarlo verbatim.

Ejemplo:

### 📁 [Ruta del archivo]
- **[TIPO] (Confianza: XX%) (RID: R-001)** — _[Descripción concisa del hallazgo]_
  - **Evidencia:** [hunk/fragmento específico del diff o referencia clara]
  - **Causa raíz probable:** [1 frase]
  - **Acción recomendada (A):** [cambio concreto en imperativo]
  - **Alternativa (B):** [otra opción + por qué] / “No se me ocurre una alternativa mejor…”
  - **Riesgo de regresión (si aplica):** [qué podría romper + mitigación breve]

_(Tipos: BUG, REGRESIÓN, MEJORA)_

### Preguntas de verificación (máx. 3; solo si alto riesgo y no supera umbral)
- **[PREGUNTA]** — _[qué habría que comprobar para elevar la confianza]_
  - **Evidencia parcial:** [qué te lo sugiere]
  - **Qué faltaría:** [test, contrato, caso borde, archivo relacionado, etc.]
---

### Si no hay elementos accionables
"✅ No se han detectado bugs, regresiones o mejoras críticas con el umbral de confianza requerido."
