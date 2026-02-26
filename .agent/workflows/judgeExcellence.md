---
description: "JudgeExcellence (repo completo): evalúa un Repo Excellence Report v2, valida evidencia, selecciona Plan A/B y solo propone Plan C si ≥80% seguro de que es mejor. No cambia código."
---

# /judgeExcellence — Validar y mejorar el informe de excelencia (sin diff, no tocar código)

Input: el usuario pega un **Repo Excellence Report v2** de `/findExcellence`.  
Objetivo: maximizar **señal/ruido**, descartar falsos positivos y mejorar diagnósticos/propuestas.

> `// turbo` solo para comandos *read-only*. Evita `// turbo-all`.

---

## Reglas de oro
1) **No cambies el código.**
2) Evalúa ítems en el **mismo orden** (sección “veredictos”), para auditar.
3) **Sin validaciones positivas.** Solo: KEEP / NEEDS-CONTEXT / DROP / ROUTE-TO-FINDBUGS.
4) **No inventes**: si la evidencia no sostiene, baja confianza o descarta.
5) **Recalcula tu confianza**: no heredes los números del finder.
6) Performance: exige **plan de medición** + hipótesis de hot-path; si no, degrada.
7) **Plan C solo con alta certeza:** solo propón un Plan C si estás **≥ 80% seguro** de que es mejor que **ambos** Plan A y Plan B del informe.
8) Si no llegas a ese 80%, **NO inventes un plan nuevo**: elige A o B y (si hace falta) sugiere **ajustes menores** como “tweaks” dentro del plan elegido (sin convertirlo en un plan distinto).

## Gates (alta precisión)
- **KEEP:** Confianza (juez) **≥ 85%**
- **NEEDS-CONTEXT:** 55–84%
- **DROP:** < 55% o contradicho o ya existe / no accionable
- **ROUTE-TO-FINDBUGS:** si el ítem realmente describe comportamiento incorrecto (bug)

---

## Paso 1 — Preparar verificación repo-wide (sin diff)

// turbo
1) Listar archivos de código (tracked):
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
```

// turbo
2) Confirmar herramienta de búsqueda:
```bash
command -v rg >/dev/null 2>&1 && echo "rg: OK" || echo "rg: MISSING"
```

---

## Paso 2 — Validar contrato del informe (antes de juzgar)
Para cada **IMP-XXX**:
- ¿Trae **ubicación** + **evidencia** (snippet mínimo)?
- ¿Trae **Plan A** completo (pasos + trade-offs + verificación)?
- Si hay Plan B, ¿es realmente distinto o es ruido?
Si faltan datos esenciales → tendencia a **NEEDS-CONTEXT** o **DROP** (no rellenes huecos inventando).

---

## Paso 3 — Verificación por ítem (repo completo)

Para cada ítem, verifica abriendo el archivo y, si hace falta, buscando referencias:

// turbo
```bash
rg -n "<token/snippet clave del ítem>" --hidden --glob '!**/node_modules/**' || true
```

- Para duplicación: busca el mismo patrón en varios archivos.
- Para arquitectura: busca consumidores (imports/exports/call sites).
- Para performance: decide si hay hot-path plausible; si no, degrada.

---

## Paso 4 — Juicio por ítem (mismo orden)
Para cada **IMP-XXX**:

1) **¿Es realmente no-bug?** Si describe comportamiento incorrecto → ROUTE-TO-FINDBUGS.
2) **¿Es mejora real en este repo?** (impacto > preferencia)
3) **¿Es accionable?** (pasos claros)
4) **¿Riesgos/trade-offs** bien definidos?
5) **¿Verificación realista?**
6) **Evaluación de planes (máx. 2):**
   - Evalúa Plan A: puntos fuertes/débiles, riesgos, verificación.
   - Evalúa Plan B (si existe): idem.
   - Elige el plan recomendado: A o B.
7) **Plan C (solo si ≥80% mejor):**
   - Solo si estás ≥80% seguro de que tu plan es mejor que A y B.
   - Si no, no lo incluyas. En su lugar, aporta “tweaks” al plan elegido.

---

## Output (plantilla obligatoria)

# Judge Repo Excellence Report v2

## Veredictos por ítem (mismo orden que el input)
- **IMP-001** — Veredicto: **KEEP | NEEDS-CONTEXT | DROP | ROUTE-TO-FINDBUGS**
  - **Confianza (juez):** YY%
  - **Tipo ajustado:** <REFACTOR/CLEANUP/ARCH/CONSISTENCY/PERF/TEST-DX> (si cambia)
  - **Prioridad ajustada:** (B−R)=X | Esfuerzo: S/M/L (si cambia)
  - **Qué se sostiene / qué no:** <1–3 bullets>

  - **Evaluación Plan A:** <1–3 bullets>
  - **Evaluación Plan B:** <1–3 bullets> / “No aplica (no hay Plan B)”
  - **Plan recomendado:** A | B
  - **Tweaks al plan recomendado (si aplica):** <1–4 bullets concretos>

  - **Plan C (solo si ≥80% seguro de que es mejor):**
    - Confianza (Plan C mejor): **ZZ%**
    - Pasos: <2–6 bullets concretos>
    - Trade-offs / riesgo: <1–2 bullets>
    - Verificación: <test/benchmark/check>
    - Por qué es mejor que A/B: <1–2 frases>

  - **Si ROUTE-TO-FINDBUGS:** <qué parece bug + repro/test sugerido>

## Ranking final (solo KEEP; reordenado por prioridad)
- **IMP-AAA** — Prioridad X — Confianza YY% — razón (1 frase)
- ...

## Top 5 next actions (opcional)
- 1) <acción de mayor leverage>
- 2) ...
