---
description: 2ª opinión sobre un informe review: valida cada punto en orden, decide si merece la pena y propone alternativas (sin cambiar código).
---

# /judge — Validar informe de review (pre-commit, sin tocar código)

Este workflow se usa **después** de ejecutar `/review` (otro workflow o IA).  
Aquí el usuario **pegará un informe** y el agente emitirá una **segunda opinión** punto por punto, manteniendo el **mismo orden**.

> Workflows en Antigravity se definen como archivos Markdown en `.agent/workflows/` con **YAML frontmatter** `description:` y pasos en el cuerpo.  
> `// turbo` se reserva para pasos con comandos seguros (normalmente *read-only*).

---

## Reglas de oro (obligatorias)

1) **No cambies el código.** Solo crítica y análisis.
2) **Mantén el MISMO orden** que el informe pegado (1:1).
3) **Nada de validaciones positivas.** Solo reporta si hay algo que objetar o decidir.
4) **No inventes.** Si no puedes verificar con evidencia del diff/código, marca el punto como **No concluyente**.
5) **Umbrales de acción (gates):**
   - **BUG** y **REGRESIÓN**: recomendar “Acometer ahora” solo si **confianza ≥ 50%**
   - **MEJORA**: recomendar “Acometer” solo si **confianza ≥ 70%**
6) **Causa raíz sobre síntoma.** Si criticas un punto, explica brevemente por qué su causa raíz es distinta o por qué no está demostrada.
7) **Humildad en soluciones.** Si recomiendas un fix, da una solución breve y añade **1 alternativa** que podría ser mejor. Si no se te ocurre, **admítelo**.
8) **Sin nitpicks cosméticos.** Solo comenta si hay impacto (correctitud, regresión, mantenibilidad, DX, accesibilidad, seguridad, rendimiento en dataset grande).

---

## Input: el usuario pega el informe de `/review`

El agente debe conservar el orden original.

---

## Paso 1 — Obtener evidencia del cambio (si hay repo)

// turbo
1. Ejecuta:
   ```bash
   git status --porcelain=v1
   ```

// turbo
2. Si hay cambios staged, extrae:
   ```bash
   git diff --staged --no-color
   ```
   Si NO hay staged, extrae:
   ```bash
   git diff --no-color
   ```

**Si no puedes acceder a git/diff**, continúa solo con el informe pegado y eleva el rigor: marca más cosas como **No concluyente**.

---

## Paso 2 — Comprender el formato del informe

- Identifica cada hallazgo (por ejemplo: `- [TIPO] (Confianza: XX%) — ...` o equivalente).
- No combines ni dividas: **1 hallazgo = 1 respuesta numerada**.
- Si el informe agrupa por archivo y tiene múltiples bullets, conserva el orden de lectura natural.

---

## Paso 3 — Evaluación punto por punto (núcleo)

Para **cada hallazgo** del informe (en orden):

1) **Qué afirma el punto** (1 frase, sin reinterpretar).
2) **Veracidad / verificabilidad**
   - Si tienes diff/código: cita el **archivo** y el **hunk** o el fragmento relevante (breve).
   - Si falta evidencia o depende de supuestos externos: **No concluyente** y especifica qué evidencia faltaría.
3) **Decisión de acometer**
   - Aplica los umbrales:
     - BUG/REGRESIÓN: “Acometer ahora” solo si ≥50%
     - MEJORA: “Acometer” solo si ≥70%
   - Si no llega: “Sí, pero después” o “No merece la pena” (explica en 1–2 frases).
4) **Solución**
   - Si se debe acometer: da una solución recomendada **breve**.
   - Añade **una alternativa** que podría ser mejor y por qué (si no se te ocurre, dilo).
5) **Riesgo de regresión**
   - Si aplica, indica qué podría romper y cómo mitigarlo (test/guard/feature flag/documentación).

---

## Formato de salida (OBLIGATORIO)

Responde **solo** con una lista numerada y **en el mismo orden** que el informe de entrada.  
Cada ítem debe respetar esta plantilla:

1) **[TIPO]** — Veredicto: {Cierto | Probable | No concluyente | Probable falso} (Confianza: XX%)
   - ¿Acometer?: {Sí ahora | Sí, pero después | No merece la pena} — razón (1–2 frases)
   - Solución recomendada: <breve> (por qué es la mejor primera opción)
   - Alternativa a considerar: <breve> (por qué podría ser mejor) / “No se me ocurre una alternativa mejor con el contexto actual”
   - Evidencia: <archivo + hunk del diff> o “Solo informe (sin diff disponible)”

---

## Cierre

Si **no hay nada accionable** tras revisar todos los puntos, termina igualmente la lista (sin texto extra) marcando cada ítem como “No merece la pena” o “No concluyente” según corresponda.
