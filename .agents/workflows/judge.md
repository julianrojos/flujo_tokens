---
description: "Judge post-review: valida un informe /review contra el diff/código actual. Output: SOLO Action Units que pasan umbral; cada unidad incluye el bloque review verbatim + veredicto. Override de solución solo si es estrictamente mejor que la mejor de (A,B) con ≥80% confianza."
---

# /judge — Action Units only (verbatim review + judge resolution)

Este workflow se usa **después** de ejecutar `/review`.  
El usuario pegará un informe de review y el agente emitirá **solo** las unidades accionables que pasan umbrales, autocontenidas (para copiar/pegar).

> No cambies código. No hagas commits. No hagas stage sin permiso.

---

## Workflow contract
consumes: `/review output (pasted)`  
produces: `ACTION_UNITS_ONLY` (cada unidad incluye review verbatim)  
goal: que cada unidad copiable contenga el “diálogo” completo (review + judge) y una solución final.

---

## Reglas de oro
1) **No cambies el código.** Solo crítica/análisis.
2) **Output solo Action Units**: NO incluyas ítems que no se vayan a acometer ahora.
3) **Verbatim obligatorio**: cada Action Unit debe incluir el bloque original del review **tal cual**, sin reformatear.
4) **No inventes**: si no puedes verificar con evidencia, no lo eleves a Action Unit.
5) **Gates**:
   - BUG/REGRESIÓN: “Acometer ahora” solo si **confianza_judge ≥ 50%**
   - MEJORA: “Acometer ahora” solo si **confianza_judge ≥ 70%**
6) **Diff desactualizado**:
   - Si el `diff_fingerprint_patch_id` del review NO coincide con el actual, debes ser más estricto.
   - Si un ítem cita archivos que no aparecen en el diff actual, NO lo conviertas en Action Unit.
7) **Override de solución (regla crítica)**:
   - El review trae: **Acción recomendada (A)** y **Alternativa (B)**.
   - Primero elige la **mejor de (A,B)** como `baseline_fix` (A o B).
   - Solo puedes proponer un fix/plan nuevo (Plan J) si estás **≥ 80% seguro** de que es **estrictamente mejor** que `baseline_fix`.
   - Si NO cumples ese 80%: **no inventes**. Remite al `baseline_fix` del review (sin reescribirlo).
8) **Qué significa “estrictamente mejor” (determinista)**
   - Debe mejorar **al menos 2** criterios SIN empeorar claramente ninguno de los críticos:
     - Críticos: (a) causa raíz/correctitud, (b) riesgo de regresión, (c) verificabilidad (test/repro).
     - No críticos: tamaño de cambio, complejidad, consistencia con reglas del repo, DX/legibilidad.
   - Si hay tradeoff, decláralo en 1 línea.

---

## Paso 1 — Obtener evidencia del cambio (repo)

// turbo
1) Ejecuta:
```bash
git status --porcelain=v1
```

// turbo
2) Extrae diff staged-first:
```bash
git diff --staged --no-color || git diff --no-color
```

// turbo
3) Saca stat:
```bash
git diff --staged --stat --no-color || git diff --stat --no-color
```

// turbo
4) Diff fingerprint (patch-id):
```bash
(git diff --staged --no-color || git diff --no-color) | git patch-id --stable 2>/dev/null | head -n 1 | awk '{print $1}' || true
```

---

## Paso 2 — Parsear el informe de /review (entrada)
- Identifica cada ítem por `RID: R-XXX`.
- Para cada RID, captura el **bloque completo** del review que lo contiene (incluyendo `### 📁 ...` y todos sus bullets).
- Si falta RID en un ítem, NO lo conviertas en Action Unit (pide que se regenere review con RID).

---

## Paso 3 — Evaluación por ítem (solo para decidir Action Unit)
Para cada RID del review:

1) **Verificar**: ¿hay evidencia en el diff/código actual que lo soporte?
2) **Clasificar**: BUG / REGRESIÓN / MEJORA / PREGUNTA
3) **Calcular confianza_judge** y decidir “Acometer ahora” según gates.
4) **Seleccionar baseline_fix (A o B)**  
   Elige la mejor entre A y B según criterios críticos (raíz, riesgo, verificabilidad).
5) **Decidir solución final**
   - Si propones Plan J (override): requiere `confidence_better ≥ 80%` y `why_better` explícito.
   - Si no: `solution_source: REVIEW` y `use: baseline_fix` (sin reescritura).

---

## Output (OBLIGATORIO): ACTION_UNITS_ONLY

Responde **solo** con una lista numerada de Action Units.  
Cada Action Unit debe ser autocontenida.

Plantilla:

1) **RID: R-001 — [TIPO]** — Veredicto: {Cierto | Probable} (Confianza: XX%) — ¿Acometer ahora?: Sí
   - **Review (verbatim):**
     ```text
     <pegar aquí el bloque EXACTO del review para este RID>
     ```
   - **Evidence (current diff/code):** <archivo + hunk breve o “verified in code context”>
   - **Baseline fix (best of A/B):** <A|B>
   - **Solution source:** {REVIEW | JUDGE_OVERRIDE}
   - **Final solution:**
     - Si REVIEW: “Use baseline fix <A|B> exactly as written in the Review block.”
     - Si JUDGE_OVERRIDE:
       - Plan J: <breve>
       - confidence_better: <80–100%>
       - why_better: <2–4 bullets, criterios>
       - tradeoff (si aplica): <1 línea>
   - **Verification:** <test/repro mínimo>
   - **Introduced risk:** <breve> + mitigación

Si no hay Action Units:
"✅ No hay puntos que superen los umbrales para acometer ahora."
