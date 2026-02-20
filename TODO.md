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

### DESIGN SYSTEM ADMIN

Estado en URL + deep links de filtros/orden
Valor: compartir vistas exactas (/tokens?type=color&collection=Semantic...) y reproducibilidad total.
Prioridad: P0.

Indicador de frescura de datos + refresh unificado
Valor: saber si component-registry/token-usage-index están desactualizados y refrescar todo en un solo botón.
Prioridad: P0.

Buscador global (command palette)
Valor: buscar componentes, tokens y paths desde un único input con atajo de teclado.
Prioridad: P0.

Panel de detalle (drawer) para fila seleccionada
Valor: ver trazabilidad completa sin salir de la tabla (spec/doc/proof/figma/used-in).
Prioridad: P1.

Mapa de impacto cruzado Token → Componentes y Componente → Dependencias
Valor: análisis de impacto antes de cambiar tokens o componentes.
Prioridad: P1.

Vista “Health Board” con issues accionables
Valor: agrupar en bloques: missing proof, needs-review, missing figma link, tokens sin uso, etc.
Prioridad: P1.

Centro de ejecuciones del pipeline dentro del dashboard
Valor: lanzar scripts (ds:registry:refresh, ds:token-usage-index, etc.) y ver resultado/logs en UI.
Prioridad: P1.

Virtualización/paginación de tablas grandes
Valor: rendimiento estable cuando crezcan tokens/componentes.
Prioridad: P1.

Integración visual de ds-token-diff y ds-token-graph
Valor: convertir scripts CLI en vistas operativas (cambios y cadenas de alias/ciclos).
Prioridad: P2.

Capa de robustez: validación runtime + error boundary + tests clave
Valor: menos roturas silenciosas ante cambios de esquema en JSON generados.
Prioridad: P2.

🔝 TOP 10 PROPUESTAS PRIORIZADAS

1. Vista de Detalle de Token/Componente (Drawer/Modal)
   Impacto: Alto | Esfuerzo: Medio

Descripción: Al hacer click en una fila, abrir un drawer lateral con:

Para Tokens:
Todos los metadatos (path completo, alias, referencias)
Historial de cambios (si hay git)
Lista completa de usos con contexto (archivo + línea + snippet)
Enlace a documentación si existe
Para Componentes:
Spec completo embebido
Visual proof en grande
Lista de tokens usados
Timeline de pipeline
Por qué es #1: Centraliza información dispersa, reduce necesidad de navegar entre archivos.

2. Búsqueda Global con Atajo de Teclado (Cmd+K)
   Impacto: Alto | Esfuerzo: Bajo-Medio

Descripción:

Modal de búsqueda global accesible con Cmd+K o Ctrl+K
Búsqueda unificada en tokens y componentes
Resultados agrupados por tipo
Navegación con teclado
Recientes y favoritos
Por qué es #2: Mejora radicalmente la discoverability y velocidad de navegación.

3. Exportar Datos Filtrados (CSV/JSON)
   Impacto: Alto | Esfuerzo: Bajo

Descripción:

Botón “Export” en cada página
Opciones: CSV, JSON, Markdown table
Exporta datos actuales (con filtros aplicados)
Útil para reportes, auditorías, compartir con stakeholders
Por qué es #3: Habilita workflows externos y reporting sin esfuerzo adicional.

4. Vista de Comparación (Diff View) para Tokens
   Impacto: Alto | Esfuerzo: Medio

Descripción:

Comparar token registry actual vs versión anterior (git diff)
Highlight de cambios: añadidos (verde), modificados (amarillo), eliminados (rojo)
Mostrar impacto del cambio (dónde se usa el token modificado)
Integración con npm run ds:token-diff
Por qué es #4: Crítico para change management y breaking changes detection.

5. Gráfico de Dependencias de Tokens (Graph Visualization)
   Impacto: Medio-Alto | Esfuerzo: Medio-Alto

Descripción:

Visualización gráfica del árbol de dependencias
Nodos: tokens, aristas: referencias
Filtrado por token seleccionado
Detección visual de ciclos
Zoom + pan
Integración con npm run ds:token-graph
Por qué es #5: Hace tangible la complejidad del sistema de tokens.

6. Favoritos / Bookmarks
   Impacto: Medio | Esfuerzo: Bajo

Descripción:

Marcar tokens/componentes como favoritos (localStorage)
Sección “Favorites” en sidebar
Quick access para revisión frecuente
Útil para auditors y maintainers
Por qué es #6: Baja fricción para workflows recurrentes.

7. Vista de “Token Health” Dashboard
   Impacto: Medio | Esfuerzo: Medio

Descripción:

Métricas de salud del design system:
Tokens sin usar (unused)
Tokens con muchos usos (high coupling)
Aliases rotos
Colores que no pasan WCAG
Componentes sin spec/doc
Gráficos de tendencias (si hay histórico)
Por qué es #7: Proporciona visibilidad operativa del estado del DS.

8. Filtros Avanzados con Guardado de Vistas
   Impacto: Medio | Esfuerzo: Medio

Descripción:

Filtros combinados complejos (ej: “color tokens de Primitives sin usar”)
Guardar combinaciones de filtros como “vistas”
Vistas compartidas vía URL params
Ej: /tokens?view=unused-colors
Por qué es #8: Potencia la capacidad de análisis sin añadir complejidad permanente.

9. Integración de Visual Proof en Components Page
   Impacto: Medio | Esfuerzo: Bajo

Descripción:

Thumbnail de visual proof en la tabla
Hover para ver preview en popover
Click para abrir en modal con zoom
Indicador visual de “needs update” si el spec cambió
Por qué es #9: Hace tangible el estado de los componentes sin salir del dashboard.

10. Dark/Light Theme Toggle para el Dashboard
    Impacto: Bajo-Medio | Esfuerzo: Bajo

Descripción:

Toggle en header para cambiar tema del dashboard
Respetar preferencia del sistema
Persistir en localStorage
Coherente con el DS que está documentando
Por qué es #10: Meta: el dashboard debe ejemplificar el DS que documenta.

📋 Otras 10 Propuestas (No priorizadas top 10)
Historial de Cambios por Token (git blame embebido)
Búsqueda por Imagen (subir screenshot → encontrar componente)
Modo “Review” (marcar tokens/componentes para revisión)
Comentarios/Notas en tokens (para documentación interna)
Integración con GitHub Issues (crear issue desde token/componente)
Vista de “Orphaned Tokens” (sin alias ni usos)
Timeline de Pipeline (cuándo se generó cada doc)
Búsqueda por Valor (ej: “#ffffff” → encontrar todos los blancos)
Agrupación por “Owner” (quién mantiene cada token/componente)
Modo Presentación (ocultar UI, solo datos para demos)
