---
description: "FindExcellence (repo completo): detecta refactors, limpieza, mejoras de arquitectura/consistencia y oportunidades de performance (excluye bugs). Incluye máx. 2 planes por punto. No cambia código."
---

# /findExcellence — Excelencia del repositorio (sin diff, actionable-only, no tocar código)

Este workflow inspecciona **todo el código del proyecto**, no el diff.  
Objetivo: encontrar mejoras de alto impacto (refactor, cleanup, arquitectura, consistencia, performance, testing/DX) **excluyendo bugs**.

> Nota operativa: `// turbo` solo para comandos *read-only*. Evita `// turbo-all`.

---

## Reglas de oro
1) **No cambies el código.** Solo análisis.
2) **Actionable-only:** si no puedes proponer una **acción concreta** o un **paso de verificación/medición**, **no lo reportes**.
3) **Nada de validaciones positivas:** sin ✅, sin “está bien”, sin “patrón válido”.
4) **Excluye bugs:** si ves probable bug (comportamiento incorrecto), mándalo a **OUT OF SCOPE (BUG?)** y recomienda ejecutar `/findBugs`.
5) **No redundancias:** no describas como “mejora” algo que ya existe; si ya está, **omítelo**.
6) **Performance con disciplina:** sin micro-optis sin hipótesis de hot-path + plan de medición.
7) **Sin duplicados:** si varias observaciones comparten la misma raíz, fusiona en 1 item.
8) **Máx. 2 planes por item:** para cada mejora detectada, propone como máximo **dos** planes de acometida (Plan A y Plan B). Si solo tienes uno sólido, incluye solo Plan A.

## Gates y límites
- **IMPROVEMENT:** solo si **Confianza ≥ 80%** de que es una mejora real en este repo.
- **QUESTION:** si podría ser valioso pero falta contexto (máx. 5).
- **OUT OF SCOPE (BUG?)**: máx. 5.
- **Límites:** máx. **20 IMPROVEMENTS**.

---

## Paso 1 — Mapear el repo (inventario rápido)

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
4) Top archivos más grandes (por líneas) — hotspots potenciales:
```bash
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'   | xargs -I{} wc -l "{}" 2>/dev/null   | sort -nr   | head -n 30
```

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
Para mantener señal alta en repos grandes:

Elige **8–12 hotspots** combinando:
- top archivos más largos,
- archivos con más señales (TODO/disable/perf),
- módulos “core” (tooling, servicios, librerías compartidas, dominio).

Revisa cada hotspot buscando mejoras en:
- SRP / cohesión (funciones y módulos),
- duplicación,
- consistencia de patrones (errores, imports, naming),
- APIs públicas / exports,
- performance (solo si hay hot-path plausible y medible),
- tests / DX (gaps de calidad, no “bugs”).

---

## Paso 4 — Construir candidatos y filtrar duro (excluyendo bugs)

Para cada candidato, produce:
1) **Evidencia**: archivo + líneas/snippet (mínimo).
2) **Por qué mejora el repo**: 1–3 frases (impacto real).
3) **Planes (máx. 2):**
   - Plan A: el más razonable/seguro.
   - Plan B: alternativa viable (solo si aporta algo distinto).
4) **Verificación**: test/benchmark/check seguro.
5) **Scoring**:
   - Confianza (0–100)
   - Beneficio (0–5): claridad/arquitectura/consistencia/perf/DX
   - Riesgo (0–5)
   - Esfuerzo (S/M/L)

Descarta:
- preferencias sin impacto,
- “ya está bien / ya está hecho”,
- cosas que son realmente bugs → OUT OF SCOPE (BUG?).

---

## Paso 5 — Priorizar
Ordena por:
1) **Prioridad = Beneficio − Riesgo** (desc)
2) Confianza (desc)
3) Esfuerzo (asc)

---

## Output (plantilla obligatoria)

# Repo Excellence Report v2

## IMPROVEMENTS (máx. 20; priorizados)
- **IMP-001** — Tipo: **REFACTOR | CLEANUP | ARCH | CONSISTENCY | PERF | TEST/DX**
  Prioridad: **(B−R)=X** | Confianza: **YY%** | Esfuerzo: **S/M/L**
  - **Ubicación:** <archivo>:<líneas>
  - **Evidencia:** <snippet mínimo>
  - **Por qué es mejora:** <1–3 frases>

  - **Plan A (obligatorio):** <título corto>
    - Pasos: <2–6 bullets concretos>
    - Trade-offs / riesgo: <1–2 bullets>
    - Verificación: <test/benchmark/check>

  - **Plan B (opcional, máx. 1):** <título corto>
    - Pasos: <2–6 bullets concretos>
    - Trade-offs / riesgo: <1–2 bullets>
    - Verificación: <test/benchmark/check>

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
