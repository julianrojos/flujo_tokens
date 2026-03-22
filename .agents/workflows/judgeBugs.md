---
description: JudgeBugs (repo completo, iterativo): valida FindBugs v3.1, filtra falsos positivos, penaliza falta de consumidores, mejora diagnóstico/fixes y actualiza Bug Registry. No cambia código.
---

# /judgeBugs — Repo-wide Judge (v3.1, iterative, no code changes)

Input: el usuario pega un **FindBugs Report v3.1** (y opcionalmente el Bug Registry actual).  
Objetivo: maximizar **precisión** y mejorar calidad de razones/soluciones en iteraciones sucesivas.

> `// turbo` para pasos *read-only*. Evita `// turbo-all`.

---

## Workflow contract
state_file: `.agents/state/bug-registry.yml`  
consumes: `FindBugs Report v3.1` (+ optional registry)  
produces: `JudgeBugs Report v3.1` + `registry_patch` (autoridad de estado)  
next: (manual) aplicar patch + iterar con `/findBugs`

---

## Reglas de oro
1) No edites código. No hagas commits.
2) Mantén el **mismo orden** para la sección “veredictos por ítem”.
3) Sin validaciones positivas. Solo: **KEEP / NEEDS-VERIFY / DROP**.
4) No inventes: si falta evidencia, no “completes la historia”.
5) Recalcula tu confianza: no heredes el número del finder.
6) **Evidencia de consumo influye en confianza:** si `consumers == none_found` y NO parece entrypoint/hook/framework integration,
   aplica una penalización determinista **−15 puntos** a la confianza del judge.
   - Si hay duda razonable de consumo dinámico, usa `dynamic_possible` y NO penalices.
7) **Actionability importa:** si `actionability == low`, NO puede ser KEEP (como mucho NEEDS-VERIFY).
8) Si recomiendas un fix: incluye 1 alternativa; si no hay, admítelo.
9) Si un ítem es realmente “refactor/smell”, mándalo a `/scanRepoExcellence` en vez de convertirlo en bug.

## Gates
- **KEEP** (bug real): Confianza (judge, tras penalizaciones) **≥ 70%** y `actionability ∈ {high, medium}`
- **NEEDS-VERIFY:** 40–69% o falta evidencia o actionability low
- **DROP:** < 40% o contradicho por evidencia o ya mitigado

---

## Paso 0 — Prerrequisitos operacionales (manual)
Lee `AGENTS.md` antes de actuar.

---

## Paso 1 — Verificación repo-wide (read-only)

// turbo
```bash
command -v rg >/dev/null 2>&1 && echo "rg: OK" || echo "rg: MISSING"
```

---

## Paso 2 — Validar contrato del informe (antes de juzgar)
Para cada BUG-XXX deben existir:
- Location + Evidence snippet
- context_signature + context_window
- Expected vs actual
- How to confirm

Si falta algo esencial → NEEDS-VERIFY o DROP (no rellenes huecos).

---

## Paso 3 — Verificación por ítem (repo completo)
Para cada BUG-XXX:
1) Abre el archivo y valida el snippet en contexto.
2) Verifica consumidores (si el informe no es convincente):

// turbo
```bash
rg -n "<symbol/function name>" --hidden --glob '!**/node_modules/**' || true
```

3) Si el símbolo parece entrypoint/hook (CLI main, framework hook, config loader), marca `dynamic_possible`.
4) Comprueba mitigaciones/guards existentes que invaliden el hallazgo.
5) Evalúa si el repro/test propuesto confirmaría el bug.

---

## Output (MANDATORY)

# JudgeBugs Report v3.1 (repo-wide, iterative)

## Verdicts (same order as input)
- **BUG-001** — Verdict: **KEEP | NEEDS-VERIFY | DROP**
  - **Confidence (judge):** YY%
  - **Confidence adjustments:** <e.g. "−15 (no consumers)" or "none">
  - **Actionability:** <high|medium|low>
  - **Consumers:** <found|none_found|dynamic_possible>
  - **Severity (if KEEP):** I×P = X (adjusted if needed)
  - **What holds / what doesn’t:** <1–3 bullets>
  - **Improved diagnosis (if applicable):** <1–3 sentences>
  - **Improved fix (A):** <brief>
  - **Alternative (B):** <brief> / “none”
  - **Introduced risk (by applying the fix):** <short>
  - **Mitigation:** <test/guard/flag/doc>
  - **How to verify (if NEEDS-VERIFY):** <minimal test/repro>
  - **Reason for DROP (if DROP):** <false positive / already mitigated / not demonstrable / duplicate>

## Final ranking (KEEP only; re-ordered by priority)
- **BUG-AAA** — Severity X — Confidence YY% — reason (1 sentence)
- ...

---

## Registry patch (authoritative)
registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert:
    - id: "BUG-001"
      title: "<short title>"
      status: "<KEEP|NEEDS_VERIFY|DROP|FIXED|DUPLICATE>"
      severity:
        impact: <0-5>
        probability: <0-5>
        score: <0-25>
      confidence_finder: <0-100 or unknown>
      confidence_judge: <0-100>
      confidence_adjustments: "<short or none>"
      actionability: "<high|medium|low>"
      consumers: "<found|none_found|dynamic_possible>"
      consumers_evidence: "<knip|rg|manual + brief>"
      location: "<file>:<lines>"
      evidence_snippet: "<1-5 lines>"
      context_signature: "<signature/header>"
      context_window: "<±3 lines>"
      expected_vs_actual: "<short>"
      root_cause: "<short>"
      verification: "<short repro/test>"
      fix_a: "<short>"
      fix_b: "<short or none>"
      introduced_risk: "<short>"
      mitigation: "<short>"
      drop_reason: "<if DROP>"
      notes: "<short>"
      evidence_delta: "<short or none>"
      verification_delta: "<short or none>"
      fix_delta: "<short or none>"
