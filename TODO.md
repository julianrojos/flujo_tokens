# Propuestas de mejora

## DOCUMENTACIÓN

### 1. Skill de orquestación (`ds-pipeline`)

**Problema**  
Hoy cada skill es independiente y el usuario debe saber el orden correcto y ejecutarlos uno a uno. No hay validación cruzada entre pasos.

**Propuesta**  
Crear un skill orquestador que:

- Acepte un comando tipo `run pipeline [from-step]` o `run pipeline --component Alert`.
- Valide precondiciones antes de cada paso (existencia de JSON, `_generated/`, spec YAML).
- Ejecute la cadena completa o parcial, reportando progreso.
- Detecte qué componentes tienen docs pero no render en Figma (y viceversa).

### 2. Generación automática de spec YAML desde Figma

**Problema**  
El paso más manual y propenso a error es escribir el spec YAML de cada componente. El template `_template.yml` ayuda, pero hay que completarlo a mano inspeccionando Figma.

**Propuesta**  
Crear un skill `ds-spec-from-figma` que:

- Reciba un `component_set_node_id` o nombre.
- Use `figma_get_component_details` / `figma_get_component_for_development` para extraer variantes, propiedades y anatomía (capas).
- Cruce con los tokens de `Components.json` para prellenar `token_mapping`.
- Genere un spec YAML con datos reales y marque solo lo no inferible como `TBD`.
- Reduzca el trabajo manual de horas a minutos por componente.

### 3. Validación y QA automática (`ds-qa`)

**Problema**  
No existe validación formal de que los docs generados sean correctos, completos o consistentes con Figma.

**Propuesta**  
Crear un skill de auditoría que:

- Verifique que cada componente en Figma tiene su spec YAML, su `.md` y su sección `Doc/` renderizada.
- Detecte tokens referenciados en docs que no existen en los JSON.
- Detecte componentes en Figma sin documentar.
- Compare propiedades del spec YAML vs propiedades reales del `COMPONENT_SET` en Figma.
- Genere un reporte de cobertura y discrepancias.

### 4. Batch para `ds-component-doc` y `ds-markdown-to-figma`

**Problema**  
Ambos skills procesan un solo componente por invocación. Con un DS de 20-50 componentes esto es tedioso.

**Propuesta**  
Añadir modo batch:

- `ds-component-doc --all` para iterar sobre todos los `.yml` en `_spec/components/`.
- `ds-markdown-to-figma --all` para iterar sobre todos los `.md` en `docs/components/`.
- Reporte consolidado final (`N` procesados, `M` con errores, `K` omitidos).

### 5. Mejoras al parser Markdown -> Figma

**Problema**  
En el pipeline de render:

- El formato inline (`bold`, `italic`, `code`) se pierde completamente.
- Los code blocks se renderizan como placeholder `[code block omitted]`.
- No hay soporte para imágenes, links visuales ni badges de estado.

**Propuesta**  
Evolucionar `markdown_to_doc_model.mjs` y `build_figma_execute_code.mjs` para:

- Preservar marcas inline como anotaciones del modelo (ej.: `[{ text: "bold text", bold: true }]`).
- Aplicarlas como `TextSublayer` con `fontWeight` / `fontStyle` en Figma.
- Renderizar code blocks con fondo monospace en lugar de omitirlos.
- Soportar badges de estado (`draft` / `ready`) como chips coloreados.

### 6. Sincronización incremental (change detection)

**Problema**  
Cada ejecución regenera todo desde cero. Con un DS grande, esto es lento e innecesario.

**Propuesta**  
Añadir detección de cambios:

- `ds-tokens-sync`: comparar hash de los JSON de entrada vs última ejecución y hacer skip si no cambió.
- `ds-component-doc`: comparar timestamp del spec YAML vs el `.md` generado.
- `ds-markdown-to-figma`: comparar hash del `.md` vs el `doc-model.json` existente.
- Añadir flag `--force` para ignorar cache y regenerar todo.

## COMPILACIÓN DE TOKENS

### **Testing para scripts/pipeline**

Falta una regla que obligue a tests en el pipeline `markdown -> doc model -> figma execute` (casos felices, edge cases y regresiones).  
 Fuente: <https://raw.githubusercontent.com/mondaycom/vibe/master/.cursor/rules/300_testing.mdc>

### **Error handling y códigos de salida en CLI**

No hay una regla formal sobre errores recuperables/no recuperables, mensajes accionables y `exit codes` consistentes en scripts.  
 Fuente: <https://raw.githubusercontent.com/mondaycom/vibe/master/.cursor/rules/400_error_handling.mdc>

### **Convenciones de estilo para código (no solo docs)**

Hay reglas sólidas para documentación, pero faltan guías equivalentes para scripts (readability, comentarios, complejidad, etc.).  
 Fuente: <https://raw.githubusercontent.com/mondaycom/vibe/master/.cursor/rules/110_code_style.mdc>

### **Reusabilidad / anti-duplicación en scripts de skills**

No hay guardrail explícito para evitar lógica duplicada entre skills/scripts (shared helpers, funciones comunes, etc.).  
 Fuente: <https://raw.githubusercontent.com/mondaycom/vibe/master/.cursor/rules/120_reusability.mdc>

### **Estructura de proyecto para tooling interno**

Falta una regla de organización para ubicar claramente scripts, generated artifacts y utilidades compartidas.  
 Fuente: <https://raw.githubusercontent.com/mondaycom/vibe/master/.cursor/rules/100_project_structure.mdc>

---

## COMUNES

Context
The documentation project has reached governance maturity (14 rules, 6 skills) but suffers from fundamental architectural gaps: the token compilation and documentation pipelines are completely disconnected, zero rules are machine-enforced, the MD→Figma pipeline loses inline formatting, there is no orchestration, and spec YAMLs are written entirely by hand. This plan introduces 7 improvements that connect the pipelines, automate validation, and add the missing infrastructure.
Implementation Order (Dependency Graph)

### Improvement 4: Pipeline Orchestration (`ds-pipeline`)

**Problem**: Running the full pipeline is 5+ manual steps with no precondition checking.

#### Files to create

- `.agent/skills/document-design-system/ds-pipeline/SKILL.md`
- `tooling/scripts/ds-pipeline.mjs`

#### Pipeline stages

Stage 0: Token compile npm run generate -- --registry
Stage 1: Validate docs npm run validate:docs
Stage 2: Component doc gen ds-component-doc (per component, agent-driven)
Stage 3: MD→Figma render ds-markdown-to-figma-section (per component, agent-driven)
Stage 4: QA audit npm run ds:qa
CLI interface
bashnode tooling/scripts/ds-pipeline.mjs --component alert # single component
node tooling/scripts/ds-pipeline.mjs --all # all components
node tooling/scripts/ds-pipeline.mjs --from-stage 2 # resume from stage
node tooling/scripts/ds-pipeline.mjs --strict # fail on first error

```

### Files to modify
- `package.json` — add script `"ds:pipeline"`
```

---

## Improvement 5: Spec Auto-Generation from Figma (`ds-spec-from-figma`)

**Problem**: Writing spec YAMLs by hand is the slowest bottleneck. User must inspect Figma, extract properties, map tokens — all manually.

### Files to create

- `.agent/skills/document-design-system/ds-spec-from-figma/SKILL.md`

#### Skill workflow (agent-driven, uses Figma MCP)

1. `figma_search_components` / `figma_get_component_details` → extract `name`, `properties`, layer tree
2. Read `input/Components.json` → match token entries for this component → pre-fill `token_mapping`
3. Pre-fill `accessibility` with standard tokens from `_template.yml`
4. Leave subjective fields (`summary`, `best_practices`, `content_guidelines`) as `TBD`
5. Write to `docs/_spec/components/{snake_name}.yml`

#### Applicable rules

- `component-spec-yaml.mdc` — output must comply with spec schema
- `token-references.mdc` — token paths in token_mapping must use real paths
- `ds-docs-guardrails.mdc` — no invented content

---

### Improvement 6: QA/Audit Automation (`ds-qa`)

**Problem**: No way to answer: "How complete is our docs coverage? Which components lack docs? Which tokens are stale?"

#### Files to create

- `tooling/scripts/ds-qa.mjs`

#### Audit dimensions

**Coverage** (what exists vs. what should):

- `COV-01`: Spec YAMLs vs. markdown files
- `COV-02`: Markdown files vs. overview links
- `COV-03`: Token paths in docs vs. token registry

**Freshness** (what might be stale):

- `FRE-01`: Spec YAMLs still `draft`
- `FRE-02`: Markdown with `doc_status: needs-review`
- `FRE-03`: `last_verified` dates older than 30 days

**Completeness** (what has TBD gaps):

- `COM-01`: Spec YAMLs with TBD values (count per file)
- `COM-02`: Markdowns with `## Gaps / TBD` section

**Integrity** (cross-pipeline):

- `INT-01`: Token paths in docs not in registry
- `INT-02`: Overview links vs. actual files

#### Output

JSON report to stdout + `docs/_generated/qa-report.json`

#### Files to modify

- `package.json` — add script `"ds:qa"`

---
