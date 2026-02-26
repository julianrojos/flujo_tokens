---
description: 2ª opinión sobre un informe /review: valida cada punto en orden, decide si merece la pena y propone alternativas (sin cambiar código).
---

# /judge — Validar informe de /review (pre-commit, sin tocar código)

Este workflow se usa **después** de ejecutar `/review` (otro workflow o IA).  
El usuario **pegará un informe** y el agente emitirá una **segunda opinión** punto por punto, manteniendo el **mismo orden**.

> Workflows en Antigravity se definen como archivos Markdown en `.agent/workflows/` con **YAML frontmatter** `description:` y pasos en el cuerpo.  
> `// turbo` se reserva para pasos con comandos seguros (*read-only*) y se aplica **al paso inmediatamente siguiente**.  
> No uses `// turbo-all` en este workflow.

---

## Reglas de oro (obligatorias)

1) **No cambies el código.** Solo crítica y análisis.
2) **Mantén el MISMO orden** que el informe pegado (1:1).
3) **Nada de validaciones positivas.** Solo informa si hay algo que objetar o decidir.
4) **No inventes.** Si no puedes verificar con evidencia del diff/código, marca el punto como **No concluyente**.
5) **Umbrales de acción (gates)** aplicados sobre **Confianza (juez)**:
   - **BUG** y **REGRESIÓN**: recomendar “Acometer ahora” solo si **≥ 50%**
   - **MEJORA**: recomendar “Acometer” solo si **≥ 70%**
6) **Causa raíz sobre síntoma.** Si criticas un punto, explica brevemente por qué su causa raíz es distinta o por qué no está demostrada.
7) **Humildad en soluciones.** Si recomiendas un fix, da una solución breve y añade **1 alternativa** que podría ser mejor. Si no se te ocurre, **admítelo**.
8) **Sin nitpicks cosméticos.** Solo comenta si hay impacto (correctitud, regresión, mantenibilidad, DX, accesibilidad, seguridad, rendimiento en dataset grande).
9) **Respeta el contrato del informe:** si un punto carece de datos mínimos (TIPO/Confianza/Evidencia), **no rellenes huecos**: marca “Formato insuficiente” y sugiere relanzar `/review` con el formato actualizado.

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

> Si no puedes acceder a git/diff, continúa solo con el informe pegado y **eleva el rigor**: más “No concluyente” y menos recomendaciones.

---

## Paso 2 — Parsear el informe + validar contrato

### 2.1 Identificación de ítems (sin reordenar)
- Identifica cada hallazgo del informe (por ejemplo: `- [TIPO] (Confianza: XX%) — ...` o equivalente).
- No combines ni dividas: **1 hallazgo = 1 respuesta numerada**.
- Si el informe agrupa por archivo y tiene múltiples bullets, conserva el orden de lectura natural.

### 2.2 Tipos admitidos
- **BUG**, **REGRESIÓN**, **MEJORA**
- **PREGUNTA** (si el informe contiene “Preguntas de verificación” o equivalente)

### 2.3 Contrato mínimo por ítem (si falta → “Formato insuficiente”)
Para poder validar un punto como “Cierto/Probable” debe existir:
- **TIPO**
- **Confianza (informe)** (si no existe, se permite, pero se marca “no indicada”)
- **Evidencia** (idealmente: archivo + hunk/fragmento; si no existe → “Formato insuficiente”)
- Para **BUG/REGRESIÓN**, idealmente también: **Causa raíz probable** (si falta, reduce confianza del juez).

---

## Paso 3 — Verificación con evidencia (contexto ampliado)

Si el informe cita archivos, para cada archivo mencionado obtén contexto ampliado (read-only) antes de juzgar ítems de ese archivo:

// turbo
```bash
git diff --staged --no-color -U20 -- <ruta-del-archivo> || git diff --no-color -U20 -- <ruta-del-archivo>
```

> Si el informe NO cita rutas, intenta inferirlas solo si el diff lo hace obvio; si no, mantén “No concluyente”.

---

## Paso 4 — Evaluación punto por punto (núcleo)

Para **cada ítem** del informe (en orden):

1) **Qué afirma el punto** (1 frase, sin reinterpretar).
2) **Veracidad / verificabilidad**
   - Si tienes diff/código: cita **archivo + hunk** o fragmento breve.
   - Si falta evidencia o depende de supuestos externos: **No concluyente** y especifica qué evidencia faltaría.
3) **Confianza (juez)**
   - Recalcula tu propia confianza: NO heredes el número del informe.
   - Si el ítem no pasa contrato mínimo (sin evidencia), etiqueta “Formato insuficiente” y mantén confianza baja.
4) **Decisión de acometer**
   - Aplica gates a **Confianza (juez)**.
   - Si el informe propone un hallazgo que **no pasa sus propios gates**, trátalo como “No merece la pena (no pasa gate)”, salvo que tu evidencia eleve tu confianza por encima del umbral.
5) **Solución**
   - Si se debe acometer: solución recomendada breve + por qué es la mejor primera opción.
   - Añade **una alternativa** que podría ser mejor y por qué (si no se te ocurre, dilo).
6) **Riesgo de regresión**
   - Si aplica, indica qué podría romper y cómo mitigarlo (test/guard/feature flag/documentación).
7) **Prioridad (opcional pero recomendada)**
   - P0: seguridad/datos/regresión core
   - P1: bug funcional relevante
   - P2: mejora/limpieza

---

## Formato de salida (OBLIGATORIO)

Responde **solo** con una lista numerada y **en el mismo orden** que el informe de entrada.  
Cada ítem debe respetar esta plantilla:

1) **[TIPO]** — Veredicto: {Cierto | Probable | No concluyente | Probable falso}
   - Confianza (juez): **XX%**
   - Confianza (informe): **YY%** / “no indicada”
   - ¿Acometer?: {Sí ahora | Sí, pero después | No merece la pena} — razón (1–2 frases)
   - Solución recomendada: <breve> (por qué es la mejor primera opción)
   - Alternativa a considerar: <breve> (por qué podría ser mejor) / “No se me ocurre una alternativa mejor con el contexto actual”
   - Evidencia: <archivo + hunk del diff> o “Solo informe (sin diff disponible)”
   - Prioridad: {P0 | P1 | P2} (si aplica)
   - Nota de formato (solo si aplica): {Formato insuficiente: falta evidencia/causa raíz/confianza}

---

## Cierre

Si **no hay nada accionable** tras revisar todos los puntos, termina igualmente la lista (sin texto extra) marcando cada ítem como “No merece la pena” o “No concluyente” según corresponda.
