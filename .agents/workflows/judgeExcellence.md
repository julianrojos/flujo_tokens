---
description: "JudgeExcellence (repo completo, iterativo): evalúa Repo Excellence Report v2.2. Si NO_UPDATES, responde sin cambios. Si hay ítems, valida evidencia, selecciona Plan A/B y solo propone Plan C si ≥80% seguro. Emite registry_patch autoritativo. No cambia código."
---

# /judgeExcellence — Repo-wide excellence judge (v2.2, iterative, no code changes)

Input: el usuario pega un **Repo Excellence Report v2.2** (y opcionalmente el Excellence Registry actual).  
Objetivo: maximizar **señal/ruido**, descartar falsos positivos y mejorar diagnósticos/propuestas en cada iteración.

> `// turbo` solo para comandos *read-only*. Evita `// turbo-all`.

---

## Workflow contract
state_file: `.agents/state/excellence-registry.yml`  
consumes: `Repo Excellence Report v2.2` (+ optional registry)  
produces: `Judge Repo Excellence Report v2.2` + `registry_patch` (autoridad de estado)  
next: (manual) aplicar patch + iterar con `/findExcellence`

---

## Reglas de oro
1) **No cambies el código.**
2) Evalúa ítems en el **mismo orden** (sección “veredictos”), para auditar.
3) **Sin validaciones positivas.**
4) **No inventes**: si la evidencia no sostiene, baja confianza o descarta.
5) **Recalcula tu confianza**: no heredes los números del finder.
6) **Plan C solo con alta certeza:** solo propón Plan C si estás **≥ 80% seguro** de que es mejor que Plan A y Plan B.
7) Si no llegas a ese 80%, **NO inventes plan nuevo**: elige A o B y añade “tweaks” dentro del plan elegido.
8) Performance: exige **plan de medición** + hipótesis de hot-path; si no, degrada.
9) **Anti-repetición:** si el ítem ya estaba DROP/DUPLICATE/IMPLEMENTED y no hay delta real, tiende a DROP.

## Gates (alta precisión)
- **KEEP:** Confianza (juez) ≥ 85% y actionability ∈ {high, medium}
- **NEEDS-CONTEXT:** 55–84% o falta evidencia/delta
- **DROP:** < 55% o contradicho o ya existe / no accionable
- **ROUTE-TO-FINDBUGS:** si el ítem describe comportamiento incorrecto (bug)

---

## Paso 0 — Caso especial: NO_UPDATES
Si el input es `Repo Excellence Report v2.2 — NO_UPDATES`, responde **solo** con esto:

# Judge Repo Excellence Report v2.2 — NO_UPDATES

✅ Nada que juzgar: el finder no ha aportado deltas reales en esta iteración.

registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert: []

Y termina. No añadas nada más.

---

## Paso 1 — Preparar verificación repo-wide (sin diff)

// turbo
```bash
command -v rg >/dev/null 2>&1 && echo "rg: OK" || echo "rg: MISSING"
```

---

## Paso 2 — Validar contrato del informe (antes de juzgar)
Para cada **IMP-XXX** debe existir:
- Ubicación + evidencia
- context_signature + context_window
- Plan A completo (pasos + trade-offs + verificación)
- Si hay Plan B, que sea realmente distinto o se considera ruido

Si falta algo esencial → NEEDS-CONTEXT o DROP.

---

## Paso 3 — Verificación por ítem (repo completo)
Para cada ítem:
- Abre el archivo y valida snippet y contexto.
- Si hace falta, busca referencias y duplicación:

// turbo
```bash
rg -n "<token/snippet clave del ítem>" --hidden --glob '!**/node_modules/**' || true
```

---

## Output — normal (plantilla obligatoria)

# Judge Repo Excellence Report v2.2 (repo-wide, iterative)

## Veredictos por ítem (mismo orden que el input)
- **IMP-001** — Veredicto: **KEEP | NEEDS-CONTEXT | DROP | ROUTE-TO-FINDBUGS**
  - **Confianza (juez):** YY%
  - **Actionability:** <high|medium|low>
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

  - **Motivo de DROP/NEEDS-CONTEXT (si aplica):** <breve>
  - **Si ROUTE-TO-FINDBUGS:** <qué parece bug + repro/test sugerido>

## Ranking final (solo KEEP; reordenado por prioridad)
- **IMP-AAA** — Prioridad X — Confianza YY% — razón (1 frase)
- ...

---

## Registry patch (authoritative)
registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert:
    - id: "IMP-001"
      title: "<short>"
      status: "<KEEP|NEEDS_CONTEXT|DROP|IMPLEMENTED|DUPLICATE>"
      type: "<REFACTOR|CLEANUP|ARCH|CONSISTENCY|PERF|TEST_DX>"
      confidence_finder: <0-100 or unknown>
      confidence_judge: <0-100>
      actionability: "<high|medium|low>"
      priority:
        benefit: <0-5>
        risk: <0-5>
        score: < -5 to 5 >
      location: "<file>:<lines>"
      evidence_snippet: "<one-line>"
      context_signature: "<signature/header>"
      plan_a: "<short>"
      plan_b: "<short or none>"
      recommended_plan: "<A|B|C>"
      churn_signal: "<high|medium|low|unknown>"
      verification: "<short>"
      notes: "<short>"
      delta_summary: "<what improved in this iteration>"
      drop_reason: "<if DROP>"
