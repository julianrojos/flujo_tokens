---
description: FindBugs (repo completo, iterativo): descubre y refina bugs reales en todo el proyecto con evidencia rica (incluye contexto), actionability y señales de consumo. Usa Bug Registry para evitar repetición. No cambia código.
---

# /findBugs — Repo-wide bug hunting (v3.1, iterative, actionable-only, no code changes)

Este workflow busca bugs en **todo el repositorio** (no solo en el diff) y mejora en cada iteración usando un **Bug Registry** como memoria persistente.
No edites código ni hagas commits.

> `// turbo` solo para comandos *read-only*. Evita `// turbo-all`.

---

## Workflow contract
state_file: `.agents/state/bug-registry.yml`  
produces: `FindBugs Report v3.1` + `registry_seed|registry_patch` (para aplicar manualmente)  
next: `/judgeBugs`

---

## Reglas de oro
1) **No validaciones positivas** (sin ✅, sin “looks good”).
2) **Actionable-only:** si no puedes proponer una acción o una verificación concreta, **no lo reportes**.
3) Un “BUG” requiere: **evidencia + expected vs actual + por qué importa + cómo confirmarlo**.
4) **No repetición:** si un bug ya está en el registry como **DROP/DUPLICATE/FIXED**, no lo vuelvas a reportar salvo que aportes **evidencia nueva** y lo declares como `delta`.
5) **No duplicados:** fusiona síntomas con misma raíz.
6) **Señales ≠ bugs:** patrones (ts-ignore, catch vacío, etc.) son pistas; solo son BUG si se puede argumentar expected vs actual y verificación.
7) **No crear/editar archivos automáticamente.** Si necesitas crear/actualizar el registry, produce el bloque YAML para que el usuario lo copie.

## Umbrales y límites
- **BUG:** reporta solo si **Confianza (finder) ≥ 60%** **y** `actionability ∈ {high, medium}`
- **QUESTION:** riesgo plausible pero no concluyente (máx. 5)
- **Límites:** máx. **20 BUG** + máx. **5 QUESTION**

### Definición determinista de actionability
- **high:** hay verificación mínima clara **y** un fix plan A razonable (y opcional B)
- **medium:** hay verificación mínima clara, pero el fix requiere investigación o tiene incertidumbre relevante
- **low:** no hay verificación mínima clara (→ debe ser QUESTION, no BUG)

---

## Paso 0 — Prerrequisitos operacionales (manual)
- Lee `AGENTS.md` en la raíz antes de actuar.
- No hagas commits ni modifiques código.

---

## Paso 1 — Cargar Bug Registry (si existe)

Ruta estándar: `.agents/state/bug-registry.yml`

Si existe, úsalo como fuente de verdad para:
- no repetir items descartados
- priorizar convertir `NEEDS_VERIFY → KEEP/DROP`
- evitar duplicados

Si NO existe, continúa con un registry vacío y al final genera `registry_seed`.

---

## Paso 2 — Mapear repo (inventario rápido)

// turbo
```bash
git rev-parse --show-toplevel
```

// turbo
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
```

// turbo
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'   | xargs -I{} wc -l "{}" 2>/dev/null   | sort -nr   | head -n 30
```

---

## Paso 3 — Señales repo-wide (rápido, read-only)

// turbo
```bash
command -v rg >/dev/null 2>&1 && echo "rg: OK" || echo "rg: MISSING"
```

// turbo
```bash
rg -n "(ts-ignore|ts-expect-error|eslint-disable)" --hidden --glob '!**/node_modules/**' || true
```

// turbo
```bash
rg -n "(forEach\(async|await\s+.*for\s*\(|Promise\.all\(|JSON\.parse\(|readFileSync|writeFileSync|spawnSync\(|execSync\()"
  --hidden --glob '!**/node_modules/**' || true
```

// turbo
```bash
rg -n "(catch\s*\(.*\)\s*\{\s*\}|\.catch\(\s*\(.*\)\s*=>\s*\{\s*\}\s*\))"
  --hidden --glob '!**/node_modules/**' || true
```

---

## Paso 4 — Dead code / unused exports (opcional, preferido si está disponible)

Este paso ayuda a identificar código sin consumidores (no siempre es bug, pero ajusta prioridad/confianza).

### Opción A (preferida): Knip (si está disponible)
// turbo
```bash
npx -y knip --version >/dev/null 2>&1 && echo "knip: OK" || echo "knip: MISSING"
```

// turbo
```bash
npx -y knip --include exports,types,nsExports,nsTypes || true
```

### Opción B (fallback rápido): búsquedas aproximadas (menos fiable)
- Usa `rg` para encontrar símbolos/exports y luego `rg` para call sites/imports.
- Trátalo como evidencia **débil** (marcar `consumers: dynamic_possible` si no puedes asegurar).

---

## Paso 5 — Selección guiada por iteración (mejora continua)

### 5.1 Iteración 1 (si el registry está vacío)
- Elige **8–12 hotspots**: archivos grandes + señales + módulos core.
- Descubre candidatos nuevos hasta `max 20` (con gates).

### 5.2 Iteraciones 2+ (si hay registry)
Prioriza:
1) `NEEDS_VERIFY`: confirmar o descartar con evidencia nueva y verificación más sólida.
2) `KEEP` con fix débil: mejorar verificación/fix **solo si aportas delta real**.
3) Solo si queda margen (< 20 activos): descubrir bugs nuevos.

---

## Paso 6 — Construcción y filtrado de bugs (contrato obligatorio)

Por cada BUG candidato:

### 6.1 Evidencia (incluye contexto)
- `evidence_snippet`: 1–5 líneas del sitio exacto
- `file_context`:
  - `context_signature`: firma de función/clase o encabezado del bloque contenedor
  - `context_window`: ±3 líneas alrededor del bug (o el bloque condicional relevante)

### 6.2 Expected vs actual
1–2 frases. Debe ser verificable.

### 6.3 Consumers (señal)
Incluye un campo `consumers` con uno de:
- `found`
- `none_found`
- `dynamic_possible` (framework hooks, entrypoints, imports dinámicos, etc.)

Y una evidencia breve (`consumers_evidence`): cómo lo determinaste (knip/rg/manual).

### 6.4 Verificación mínima
Un repro o test mínimo a añadir.

### 6.5 Fix
Fix recomendado + 1 alternativa (solo si realmente difiere).

### 6.6 Scoring
- Confianza (0–100)
- Actionability (high|medium|low)
- Impacto (0–5)
- Probabilidad (0–5)
- Esfuerzo (S/M/L)

### 6.7 Delta (si no es NEW)
Si el bug ya existía, añade:
- `evidence_delta`
- `verification_delta`
- `fix_delta`

Si no hay delta real → no lo vuelvas a reportar.

---

## Output (MANDATORY)

# FindBugs Report v3.1 (repo-wide, iterative)

## Metadata
- iteration: <number or unknown>
- registry_path: ".agents/state/bug-registry.yml"
- registry_loaded: <true|false>
- focus: <discovery|verification|mixed>

## BUGS (max 20; prioritized)
- **BUG-001** — Severity: **I×P = X** | Confidence (finder): **YY%** | Actionability: **high|medium** | Effort: **S/M/L**
  - **Status (from registry):** <NEW|NEEDS_VERIFY|KEEP|DROP|FIXED|DUPLICATE|unknown>
  - **Location:** <file>:<lines>
  - **Evidence (minimal):** <evidence_snippet>
  - **File context:**
    - context_signature: <signature/header>
    - context_window: |
        <±3 lines around the bug>
  - **Consumers:** <found|none_found|dynamic_possible>
  - **Consumers evidence:** <knip|rg|manual + brief>
  - **Expected vs actual:** <1–2 sentences>
  - **Likely root cause:** <1–3 sentences>
  - **How to confirm:** <repro or minimal test>
  - **Fix recommended (A):** <brief>
  - **Fix alternative (B):** <brief> / “none”
  - **Regression risk:** <what could break + mitigation>
  - **Delta (required if not NEW):**
    - evidence_delta: <what is new vs previous iteration>
    - verification_delta: <what improved in repro/test plan>
    - fix_delta: <what improved in fix plan>

## QUESTIONS (max 5; high-risk but inconclusive)
- **Q-01** — <what to check to raise confidence>
  - Evidence partial:
  - What’s missing:

---

## Registry delta (for the user to apply)
registry_seed:
  schema_version: 1
  updated_at: "<YYYY-MM-DD or unknown>"
  bugs: []

registry_patch:
  updated_at: "<YYYY-MM-DD or unknown>"
  upsert:
    - id: "BUG-001"
      title: "<short title>"
      status: "<NEW|NEEDS_VERIFY|KEEP|DROP|FIXED|DUPLICATE>"
      severity:
        impact: <0-5>
        probability: <0-5>
        score: <0-25>
      confidence_finder: <0-100>
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
      introduced_risk: "<short (risk introduced by applying the fix) or none>"
      mitigation: "<short mitigation (test/guard) or none>"
      notes: "<short>"
      evidence_delta: "<short or none>"
      verification_delta: "<short or none>"
      fix_delta: "<short or none>"
