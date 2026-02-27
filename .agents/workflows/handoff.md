---
description: "Handoff: empaqueta el estado del trabajo para transferirlo a otra IA con máxima continuidad (sin editar código ni commitear)."
---

# /handoff — Transfer pack (no code changes)

Este workflow genera un **handoff pack** para que otra IA pueda retomar el trabajo sin dudas.

Workflows en Antigravity se definen como archivos Markdown en `.agents/workflows/` con YAML frontmatter `description:` y pasos en el cuerpo.  
`// turbo` se reserva para comandos seguros (*read-only*).

## Reglas
- No cambies código sin permiso previo.
- No hagas commits sin permiso previo.
- No escribas prosa libre: entrega **solo** el bloque YAML final.
- Separa hechos verificables de opiniones.
- Si algo no lo sabes con seguridad, márcalo como `unknown` (no lo inventes).
- Máximo 180 líneas de YAML.

## Output (OBLIGATORIO): YAML exacto con esta estructura y este orden

handoff:
  summary:
    purpose: "<por qué existe este trabajo (3-4 frases)>"
    current_phase: "<p.ej. 'designing workflows', 'calibrating thresholds', etc.>"
    current_task: "<en qué tarea exacta estabas (2 frases)>"
    definition_of_done: ["<bullet>", "<bullet>"]

  constraints:
    do_not:
      - "Do not modify code without explicit user permission."
      - "Do not commit without explicit user permission."
      - "<otras restricciones importantes>"
    must_read:
      - "AGENTS.md (repository root) — read, understand, and comply before doing anything else."
    quality_bar:
      - "<qué significa 'bien' en este proyecto (señal/ruido, actionable-only, etc.)>"

  context:
    workflows_to_know:
      - name: "<workflow>"
        file: "<path>"
        purpose: "<cuándo se usa>"
        inputs: ["<qué necesita>"]
        outputs: ["<qué produce>"]
      # ...
    rules_to_know:
      - name: "<rule>"
        file: "<path>"
        purpose: "<qué gobierna>"
    key_files:
      - file: "<path>"
        why: "<por qué importa>"

  decisions_log:
    - decision: "<qué se decidió>"
      rationale: "<por qué>"
      date: "<YYYY-MM-DD or unknown>"

  progress:
    completed:
      - "<qué se completó (hecho)>"
    pending:
      - "<qué queda pendiente>"
    blockers:
      - "<bloqueo o unknown>"

  strategy:
    approach: "<estrategia general (2–5 bullets)>"
    next_actions:
      - action: "<siguiente acción concreta>"
        how: ["<pasos>"]
        expected_outcome: "<resultado esperado>"
        risk: "<riesgo principal>"
        mitigation: "<mitigación>"

  open_questions:
    - "<pregunta que la siguiente IA debe resolver para avanzar>"

  handoff_note:
    what_to_do_first: "Read /AGENTS.md at the repo root, then follow this handoff pack."
    what_not_to_repeat: ["<cosas ya resueltas/no reabrir>"]
