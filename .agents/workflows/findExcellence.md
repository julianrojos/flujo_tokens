---
description: "FindExcellence (repo completo, iterativo): detecta refactors, limpieza, mejoras de arquitectura/consistencia y oportunidades de performance (excluye bugs). Incluye churn (14d), máx. 2 planes por ítem y registry para evitar repetición. Stop-condition: si no hay deltas reales, no re-emite ítems."
---

# /findExcellence — Repo-wide excellence scan (v2.2, iterative, no code changes)

Este workflow inspecciona **todo el código del proyecto** (no el diff) y mejora en cada iteración usando un **Excellence Registry** como memoria persistente.
No edites código ni hagas commits.

> `// turbo` solo para comandos *read-only*. Evita `// turbo-all`.

---

## Workflow contract
state_file: `.agents/state/excellence-registry.yml`  
produces: `Repo Excellence Report v2.2` + `registry_seed|registry_patch` (para aplicar manualmente)  
next: `/judgeExcellence`

---

## Reglas de oro
1) **No cambies el código.** Solo análisis.
2) **Actionable-only:** si no puedes proponer una **acción concreta** o un **paso de verificación/medición**, **no lo reportes**.
3) **Nada de validaciones positivas:** sin ✅, sin “está bien”, sin “patrón válido”.
4) **Excluye bugs:** si ves probable bug (comportamiento incorrecto), mándalo a **OUT OF SCOPE (BUG?)** y recomienda `/findBugs` (máx. 5).
5) **No redundancias:** si la mejora ya está implementada en el repo, **omítela**.
6) **Performance con disciplina:** no propongas micro-optis sin hipótesis de hot-path + plan de medición.
7) **Sin duplicados:** si varias observaciones comparten la misma raíz, fusiona en 1 ítem.
8) **Máx. 2 planes por ítem:** Plan A (obligatorio) y Plan B (opcional).
9) **Iteración = mejora real:** si un ítem ya existe en el registry, no lo re‑reportes salvo que aportes `delta` real.
10) **Stop condition (anti-repetición):** si tras filtrar NO hay ningún ítem `NEW` ni ningún ítem existente con `delta` real, **no re-emitas ítems**. Devuelve **solo** el output “NO_UPDATES” (definido al final).

## Gates y límites
- **IMPROVEMENT:** Confianza ≥ 80% **y** actionability ∈ {high, medium}
- **QUESTION:** alto valor pero falta contexto (máx. 5)
- **OUT OF SCOPE (BUG?)**: máx. 5
- **Límites:** máx. 20 improvements

### Definición determinista de actionability
- **high:** pasos claros + verificación clara + coste/riesgo razonable
- **medium:** pasos claros, pero verificación o impacto requieren una decisión/contexto extra
- **low:** vago o sin verificación (→ debe ser QUESTION, no IMPROVEMENT)

---

## Paso 0 — Prerrequisitos operacionales (manual)
- Lee `AGENTS.md` en la raíz antes de actuar.
- No propongas commits ni modificaciones de código aquí.

---

## Paso 1 — Mapear el repo (inventario + churn hotspots)

// turbo
1) Raíz y estructura:
```bash
git rev-parse --show-toplevel
ls -la
```

// turbo
2) Detectar workspace (si aplica):
```bash
ls -la package.json pnpm-workspace.yaml yarn.lock package-lock.json 2>/dev/null || true
```

// turbo
3) Listar archivos de código (tracked):
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
```

// turbo
4) Top archivos más grandes (por líneas):
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'   | xargs -I{} wc -l "{}" 2>/dev/null   | sort -nr   | head -n 30
```

// turbo
5) Hotspots por churn (últimos 14 días) — top 30 por frecuencia:
```bash
git log --since="14 days ago" --name-only --pretty=format:   | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$'   | grep -vE '^$'   | sort   | uniq -c   | sort -nr   | head -n 30 || true
```

> Regla: los **top churn files** entran automáticamente en la selección de hotspots, aunque no sean los más grandes.

---

## Paso 2 — Barrido repo-wide de señales rápidas (read-only)

// turbo
1) Detectar si `rg` existe:
```bash
command -v rg >/dev/null 2>&1 && echo "rg: OK" || echo "rg: MISSING"
```

// turbo
2) Deuda obvia:
```bash
rg -n "(TODO|FIXME|HACK)" --hidden --glob '!**/node_modules/**' || true
```

// turbo
3) Degradaciones de calidad:
```bash
rg -n "(eslint-disable|ts-ignore|ts-expect-error)" --hidden --glob '!**/node_modules/**' || true
```

// turbo
4) Ruido accidental:
```bash
rg -n "(console\.log|debugger)" --hidden --glob '!**/node_modules/**' || true
```

// turbo
5) Señales de performance (candidatos; no afirmar sin contexto):
```bash
rg -n "(readFileSync|writeFileSync|JSON\.parse\(|forEach\(async|await .*for\s*\()"
  --hidden --glob '!**/node_modules/**' || true
```

// turbo
6) Señales de arquitectura/consistencia:
```bash
rg -n "(export \* from|index\.ts$)" --hidden --glob '!**/node_modules/**' || true
```

---

## Paso 3 — Seleccionar hotspots para lectura profunda (8–12)
Para mantener señal alta en repos grandes, elige **8–12 hotspots** combinando:

- **churn hotspots** (Paso 1.5): incluye 4–6 de los más tocados
- top archivos grandes (Paso 1.4): incluye 2–4
- archivos con más señales (Paso 2): incluye 2–4
- módulos “core” (tooling, servicios, shared libs, runtime entrypoints)

---

## Paso 4 — Construir candidatos y filtrar duro (excluyendo bugs)

Para cada candidato, produce:
1) **Evidencia**: archivo + líneas + snippet mínimo
2) **Contexto**:
   - `context_signature` (firma de función/clase o encabezado del bloque contenedor)
   - `context_window` (±3 líneas alrededor)
3) **Por qué mejora el repo** (1–3 frases)
4) **Planes (máx. 2)**:
   - Plan A: el más razonable/seguro
   - Plan B: alternativa solo si aporta algo distinto
5) **Verificación**: test/benchmark/check seguro
6) **Scoring**:
   - Confianza (0–100)
   - Actionability (high|medium|low)
   - Beneficio (0–5)
   - Riesgo (0–5)
   - Esfuerzo (S/M/L)
7) **Hotspot rationale**: `churn|size|signals|core`

Si el ítem ya existía en registry, añade `delta` (obligatorio):
- `evidence_delta`, `plan_delta`, `verification_delta`, `priority_delta`
Si no hay delta real → **no lo reportes**.

---

## Paso 5 — Stop condition (OBLIGATORIO)
Tras aplicar gates + filtro de deltas:
- Si el conjunto final de `IMPROVEMENTS` está vacío **y**
- no hay `registry_patch.upsert` con deltas reales **y**
- no hay `QUESTIONS` nuevas de alto valor,

Entonces devuelve **solo** el bloque `NO_UPDATES OUTPUT` (abajo).

---

## Output A — Reporte normal (plantilla obligatoria)

# Repo Excellence Report v2.2 (repo-wide, iterative)

## Metadata
- iteration: <number or unknown>
- registry_path: ".agents/state/excellence-registry.yml"
- registry_loaded: <true|false>
- churn_window_days: 14
- churn_hotspots_top: ["<file1>", "<file2>", "<file3>"]

## IMPROVEMENTS (máx. 20; priorizados)
- **IMP-001** — Tipo: **REFACTOR | CLEANUP | ARCH | CONSISTENCY | PERF | TEST/DX**
  Prioridad: **(B−R)=X** | Confianza (finder): **YY%** | Actionability: **high|medium** | Esfuerzo: **S/M/L**
  - **Status (from registry):** <NEW|NEEDS_CONTEXT|KEEP|DROP|IMPLEMENTED|DUPLICATE|unknown>
  - **Ubicación:** <archivo>:<líneas>
  - **Evidencia:** <snippet mínimo>
  - **Contexto:**
    - context_signature: <signature/header>
    - context_window: |
        <±3 lines>
  - **Hotspot rationale:** <churn|size|signals|core>
  - **Por qué es mejora:** <1–3 frases>

  - **Plan A (obligatorio):** <título corto>
    - Pasos: <2–6 bullets concretos>
    - Trade-offs / riesgo: <1–2 bullets>
    - Verificación: <test/benchmark/check>

  - **Plan B (opcional, máx. 1):** <título corto>
    - Pasos: <2–6 bullets concretos>
    - Trade-offs / riesgo: <1–2 bullets>
    - Verificación: <test/benchmark/check>

  - **Delta (required if not NEW):**
    - evidence_delta: <nuevo>
    - plan_delta: <nuevo>
    - verification_delta: <nuevo>
    - priority_delta: <nuevo>

## QUESTIONS (máx. 5; alto valor pero falta contexto)
- **Q-01** — <qué decidir/verificar>
  - Evidencia parcial:
  - Qué falta:
  - Qué decisión desbloquea:

## OUT OF SCOPE (BUG?) (máx. 5)
- **BUG?-01** — <breve>
  - Evidencia:
  - Por qué parece bug:
  - Siguiente paso: ejecutar `/findBugs` con repro/test.

---

## Registry delta (for the user to apply)
registry_seed:
  schema_version: 1
  updated_at: "<YYYY-MM-DD or unknown>"
  items: []

registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert:
    - id: "IMP-001"
      title: "<short>"
      status: "<NEW|NEEDS_CONTEXT|KEEP|DROP|IMPLEMENTED|DUPLICATE>"
      type: "<REFACTOR|CLEANUP|ARCH|CONSISTENCY|PERF|TEST_DX>"
      confidence_finder: <0-100>
      actionability: "<high|medium|low>"
      priority:
        benefit: <0-5>
        risk: <0-5>
        score: < -5 to 5 >
      location: "<file>:<lines>"
      evidence_snippet: "<one-line>"
      context_signature: "<signature/header>"
      verification: "<short>"
      plan_a: "<short>"
      plan_b: "<short or none>"
      churn_signal: "<high|medium|low|unknown>"
      notes: "<short>"
      evidence_delta: "<short or none>"
      plan_delta: "<short or none>"
      verification_delta: "<short or none>"
      priority_delta: "<short or none>"

---

## Output B — NO_UPDATES OUTPUT (OBLIGATORIO si aplica)
> Devuelve exactamente este formato, sin secciones adicionales.

# Repo Excellence Report v2.2 — NO_UPDATES

✅ Sin novedades: no hay `NEW` ni deltas reales en ítems existentes; nada que re‑emitir con señal suficiente.

registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert: []
