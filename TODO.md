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
Phase 1 (Foundation): [7] Shared lib + js-yaml + [3] Inline formatting
↓
Phase 2 (Bridge): [1] Token Registry
↓
Phase 3 (Enforcement): [2] Validation Layer + [6] QA Audit
↓
Phase 4 (Orchestration): [4] ds-pipeline skill
↓
Phase 5 (Automation): [5] ds-spec-from-figma skill

~~### Improvement 1: Token Registry — The Bridge Between Pipelines~~

~~Problem: Pipeline A (token compilation) knows all 318 token paths. Pipeline B (documentation) references tokens by path. Nothing connects them — docs can reference non-existent tokens.~~
~~Solution: Pipeline A exports docs/\_generated/token-registry.json that Pipeline B validates against.~~
~~Files to create~~

~~tooling/src/core/registry.ts — new module, exports exportTokenRegistry(ctx: EmissionContext): TokenRegistryEntry[]~~

~~Files to modify~~

~~tooling/src/cli/index.ts — add --registry flag, call exportTokenRegistry() after emit phase~~
~~package.json — add script "generate:registry"~~

~~Output schema~~
~~typescriptinterface TokenRegistryEntry {~~
~~path: string; // "Semantic.Color.Focus-Outline.Inner"~~
~~slashPath: string; // "Color/Focus-Outline/Inner" (Figma-style)~~
~~cssVar: string; // "--semantic-color-focus-outline-inner"~~
~~type: string; // "color" | "dimension" | ...~~
~~resolvedValue: string; // "#1C6B4A" | "24px"~~
~~aliasOf?: string; // original alias target~~
~~collection: string; // "Semantic" | "Components" | ...~~
~~}~~
~~Key detail~~
~~Must emit both dot-path and slash-path because docs use Figma-style slash paths (Color/Background/Feedback/Default) while token JSON uses dot paths. The registry bridges both conventions.~~

### Improvement 2: Validation Layer (validate-docs.mjs)

Problem: 14 governance rules exist but zero are machine-enforced. Wrong section order, missing frontmatter, references to non-existent tokens — all pass silently.
Files to create

tooling/scripts/validate-docs.mjs

Checks to implement (mapped to rules)
CheckRule sourceWhat it validatesFM01component-figma-traceability.mdcFrontmatter has required fields (doc_type, doc_status, figma.\*)FM02markdown-lifecycle-status.mdcdoc_status ∈ {draft, ready, needs-review}SEC01component-doc-structure.mdcH2 headings present in correct orderTOK01token-references.mdc + registryToken paths in backticks exist in token-registry.jsonTOK02token-references.mdcToken references have hex/px fallbackTOK03ds-docs-guardrails.mdcNo VariableID: in prose/tablesSPEC01component-spec-yaml.mdcSpec YAML has all required top-level fieldsLINK01overview-index-maintenance.mdcOverview links match actual files (no dead links, no orphans)
Files to modify

package.json — add script "validate:docs" and dependency js-yaml

Expected section order constant
javascriptconst REQUIRED_H2 = [
"Overview", "Anatomy", "Component API", "Visual Specifications",
"Variants", "States", "Usage Guidelines", "Content Guidelines",
"Accessibility", "Related Components"
];
const OPTIONAL_H2_TAIL = ["Design–Token Discrepancies", "Gaps / TBD"];
Exit behavior
Exit code 0 if all pass, 1 if any fail. JSON report to stdout.

~~### Improvement 3: Inline Formatting in MD→Figma Pipeline~~

~~Problem: markdown*to_doc_model.mjs strips **bold**, \_italic*, `code`. The Figma render is plain text only.~~
~~Files to modify~~
~~A) markdown_to_doc_model.mjs — add parseInlineFormatting(raw):~~

~~Returns { text: "plain string", segments: [{text, style}] } where style ∈ normal|bold|italic|code~~
~~Apply to: paragraphs, list items, table cells, headings~~
~~Regex order: **bold** before _italic_ before `code`~~
~~Bump doc model version: 1 → version: 2. Keep text field for backward compat.~~

~~B) build_figma_execute_code.mjs — replace extractBoldRanges() with applySegmentFormatting(node, segments, family, theme):~~
~~bold → setRangeFontName(offset, end, { family, style: "Bold" })~~
~~italic → setRangeFontName(offset, end, { family, style: "Italic" })~~
~~code → setRangeFontName(offset, end, { family: monoFamily, style: "Regular" })~~
~~Replace hand-rolled YAML parser with js-yaml (removes ~90 lines)~~

~~C) docs/\_spec/figma_doc_theme.yml — add:~~
~~yaml~~theme:~~typography:~~font_family_mono: "Roboto Mono"~~~~```~~

~~D) `figma-doc-rendering.mdc`\*\* — document inline formatting support in block types section~~
~~```~~

~~### Improvement 4: Pipeline Orchestration (`ds-pipeline`)~~

~~Problem: Running the full pipeline is 5+ manual steps with no precondition checking.~~

~~Files to create~~

- `.agent/skills/.../ds-pipeline/SKILL.md`~~
- `tooling/scripts/ds-pipeline.mjs`~~

~~Pipeline stages~~

~~Stage 0: Token compile~~ `npm run generate -- --registry`~~
~~Stage 1: Validate docs~~ `npm run validate:docs`~~
~~Stage 2: Run QA audit~~ `npm run ds:qa`~~
~~Stage 3: Generate missing specs~~ `npm run ds:spec-from-figma -- --component <name>`~~
~~Stage 4: Build Figma docs~~ `npm run build:figma -- --component <name>`~~
~~Stage 5: Publish to Figma~~ `npm run publish:figma -- --component <name>`~~

~~Shared library~~

~~tooling/scripts/lib/~~

~~bold → setRangeFontName(offset, end, { family, style: "Bold" })~~
~~italic → setRangeFontName(offset, end, { family, style: "Italic" })~~
~~code → setRangeFontName(offset, end, { family: monoFamily, style: "Regular" })~~
~~Replace hand-rolled YAML parser with js-yaml (removes ~90 lines)~~

~~C) docs/\_spec/figma_doc_theme.yml — add:~~
~~yamltheme:~~
~~typography:~~
~~font_family_mono: "Roboto Mono"~~

```

~~D) `figma-doc-rendering.mdc`** — document inline formatting support in block types section~~
```

---

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

~~### Improvement 7: Shared Library + Dependency Rationalization~~

~~**Problem**: Hand-rolled YAML parser (~170 lines), hand-rolled MD parser, duplicated `parseArgs()` across 4 files, no real YAML library.~~

~~#### Files to create~~

```
~~tooling/scripts/lib/~~
~~parse-args.mjs — shared CLI arg parser (extract from existing copies)~~
~~parse-frontmatter.mjs — YAML frontmatter parser using js-yaml~~
~~token-registry.mjs — load/query token-registry.json~~
~~paths.mjs — shared path constants (docs root, spec dir, generated dir)~~
```

~~Files to modify~~

~~package.json — add "js-yaml": "^4.1.0" to dependencies~~
~~build_figma_execute_code.mjs — replace hand-rolled parseYaml() with import yaml from 'js-yaml' (deletes ~90 lines)~~
~~validate-docs.mjs, ds-qa.mjs, ds-pipeline.mjs — import from lib/~~
