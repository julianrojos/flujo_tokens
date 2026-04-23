# Propuestas de mejora

## DOCUMENTACIÓN

### 3. Validación y QA automática (`ds-qa`)

**Problema**  
No existe validación formal de que los docs generados sean correctos, completos o consistentes con Figma.

**Propuesta**  
Crear un skill de auditoría que:

- Verifique que cada componente en Figma tiene su component spec, su `.md` y su sección `Doc/` renderizada.
- Detecte tokens referenciados en docs que no existen en los JSON.
- Detecte componentes en Figma sin documentar.
- Compare propiedades del component spec vs propiedades reales del `COMPONENT_SET` en Figma.
- Genere un reporte de cobertura y discrepancias.

## COMPILACIÓN DE TOKENS

### **Testing para scripts/pipeline**

Falta una regla que obligue a tests en el pipeline de documentación (`spec -> markdown -> visual-proof`) con casos felices, edge cases y regresiones.  
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
The documentation project has reached governance maturity (14 rules, 6 skills) but suffers from fundamental architectural gaps: the token compilation and documentation pipelines are completely disconnected, zero rules are machine-enforced, the MD→Figma pipeline loses inline formatting, there is no orchestration, and component specs are written entirely by hand. This plan introduces 7 improvements that connect the pipelines, automate validation, and add the missing infrastructure.
Implementation Order (Dependency Graph)

---

## Improvement 5: Spec capture from Figma

Keep the dashboard-driven spec editor aligned with Figma capture and docs validation.

#### Applicable rules

- component-spec rules — output must comply with spec schema
- `token-references.mdc` — token paths in token_mapping must use real paths
- `component-doc.mdc` — no invented content

---

### Improvement 6: QA/Audit Automation (`ds-qa`)

**Problem**: No way to answer: "How complete is our docs coverage? Which components lack docs? Which tokens are stale?"

#### Files to create

- `tooling/scripts/ds-qa.mjs`

#### Audit dimensions

**Coverage** (what exists vs. what should):

- `COV-01`: Component specs vs. markdown files
- `COV-02`: Markdown files vs. overview links
- `COV-03`: Token paths in docs vs. token registry

**Freshness** (what might be stale):

- `FRE-01`: Component specs still `draft`
- `FRE-02`: Markdown with lifecycle review needed
- `FRE-03`: `last_verified` dates older than 30 days

**Completeness** (what has TBD gaps):

- `COM-01`: Component specs with TBD values (count per file)
- `COM-02`: Markdowns with `## Gaps / TBD` section

**Integrity** (cross-pipeline):

- `INT-01`: Token paths in docs not in registry
- `INT-02`: Overview links vs. actual files

#### Output

JSON report to stdout + `docs/_generated/qa-report.json`

#### Files to modify

- `package.json` — add a documentation audit script

---

### DESIGN SYSTEM ADMIN

## Roadmap P0-P2 (DS Dashboard)

Objetivo: convertir el dashboard en referencia para gestión de tokens y documentación de design systems.

### P0 - Core product

3. **Health Action Board (de informativo a accionable)**  
   Impacto: Muy alto | Esfuerzo: Medio  
   Esbozo técnico:
   - Vista `/health/actions` con issues tipados: `unused`, `broken`, `wcag`, `missing-*`.
   - CTA por issue: abrir snippet, copiar ruta, ejecutar script, marcar como conocido.
   - Filtros por severidad y dominio (tokens/componentes).

4. **Deep Links + URL State + Saved Views**  
   Impacto: Muy alto | Esfuerzo: Bajo-Medio  
   Esbozo técnico:
   - Hook `useSearchParamsState` para filtros/sorts.
   - URL como source of truth en `tokens`, `components`, `health`, `diff`.
   - Guardar vistas en `localStorage` + botón "Copy link to this view".

5. **Pipeline Executor con progreso en tiempo real (SSE)**  
   Impacto: Alto | Esfuerzo: Alto  
   Esbozo técnico:
   - Endpoint `/api/run-pipeline` que reciba `steps[]`.
   - Streaming por `text/event-stream` con estado por paso y logs.
   - Panel runner reutilizable con resumen final de cambios.

6. **Release Workbench (pre-flight checks)**  
   Impacto: Alto | Esfuerzo: Medio  
   Esbozo técnico:
   - Vista `/release` con gates: diff estricto, health, unresolved, registry report.
   - Semáforo por gate y salida accionable por error.
   - Re-ejecución selectiva de checks fallidos.

### P1 - Diferenciación

7. **Token Exporter multi-formato**  
   Impacto: Alto | Esfuerzo: Bajo-Medio  
   Esbozo técnico:
   - Exportar subconjuntos filtrados/seleccionados a `CSS`, `JSON`, `Tailwind`, `Style Dictionary`.
   - Transformers puros en `src/lib/exporters/*`.
   - Preview + copy + download.

8. **Coverage Heatmap del design system**  
   Impacto: Alto | Esfuerzo: Medio  
   Esbozo técnico:
   - Vista `/coverage` con grid por componente.
   - Color/tamaño por métrica seleccionada (stage, coverage, adoption, proof).
   - Drilldown al detalle del componente.

9. **Triage de unresolved refs**  
   Impacto: Alto | Esfuerzo: Medio  
   Esbozo técnico:
   - Vista dedicada basada en `token-usage-index.unresolved`.
   - Agrupar por `kind/source/owner` y priorizar por riesgo.
   - Acceso directo a `/file-snippet`.

10. **Tendencias históricas de health**  
    Impacto: Alto | Esfuerzo: Medio  
    Esbozo técnico:
    - Guardar snapshots de KPIs por ejecución.
    - Serie temporal para breaking, WCAG fail, coverage, unresolved.
    - Vista de tendencia semanal/mensual.

11. **Alertas de regresión**  
    Impacto: Alto | Esfuerzo: Medio  
    Esbozo técnico:
    - Reglas de delta contra snapshot previo.
    - Banner de regresiones nuevas y listado priorizado.
    - Integración con Workbench para bloquear release.

12. **Virtualización de tablas grandes**  
    Impacto: Medio | Esfuerzo: Bajo-Medio  
    Esbozo técnico:
    - Integrar `@tanstack/react-virtual` empezando por `TokensPage`.
    - Mantener API visual actual de tablas.
    - Extender a `components` y tablas densas de detalle.

### P2 - Premium capabilities

17. **Visual Proof Compare (before/after)**  
    Impacto: Medio | Esfuerzo: Medio  
    Esbozo técnico:
    - Comparador visual split/slider entre versiones de proof.
    - Selección por fecha/hash.
    - Indicador de drift visual.

18. **Modo Review con anotaciones locales**  
    Impacto: Medio | Esfuerzo: Bajo-Medio  
    Esbozo técnico:
    - Checklist por item + notas persistidas en `localStorage`.
    - Filtros por estado (`pending`, `reviewed`, `blocked`).
    - Vista de seguimiento por sesión.

---

MEJORAS DE ARQUITECTURA:

Reorganizar el menú por flujo de trabajo: Monitorizar, Diagnosticar, Actuar, Administrar (en vez de System/Tokens/Components).
Crear una bandeja única de issues (/issues) que agregue token health y components health con prioridad/severidad.
Unificar análisis de tokens en un hub (/tokens/intelligence) con tabs Explorer, Graph, Diff, Impact, Naming.
Convertir Operations en “Automation Center” con secciones de Refresh, Pipelines, Figma Imports, Historial de ejecuciones.
Añadir un flujo guiado “de problema a resolución”: Issue -> raíz -> acción recomendada -> validación post-acción.
Pasar de navegación por tipo de entidad a navegación por estado operativo en componentes (At Risk, Blocked, Needs Review, Ready).
Hacer que la búsqueda global tenga modos explícitos: Go to, Find entity, Run action con filtros por sistema y dominio.
Introducir contexto persistente de sistema + filtros globales (scope) visible en todas las vistas y URLs compartibles.
Integrar File Viewer como panel lateral contextual en detalle de token/componente (evita ruptura de flujo al saltar a /file).
Añadir home contextual por rol/caso de uso (Token Maintainer, Component Maintainer, Ops) con KPIs y “next best actions”.

1. Homepage con estado real del sistema
   Hoy no hay una pantalla de inicio: el usuario aterriza en Operations o en Tokens sin contexto. Una home breve mostraría: salud del sistema, artefactos desactualizados, acciones rápidas y actividad reciente. Reduce la orientación inicial a 0 clics.

2. Componente como unidad narrativa única
   Cada componente tiene información esparcida en 4+ páginas (spec, screenshot, tokens usados, health, Figma link). Un hub de componente (/components/button) que agregue todo en una sola pantalla columnada eliminaría el contexto switching constante.

3. Token Explorer unificado
   Tokens, Grafo, Health y Usage Index son páginas separadas pero hablan del mismo dato. Una sola pantalla de explorador con vistas intercambiables (lista / grafo / health) y filtros persistentes sería más potente que 4 navegaciones distintas.

4. Búsqueda global como eje principal
   La paleta de comandos es secundaria (atajo de teclado). En un Design System con cientos de tokens y componentes, la búsqueda debería ser el elemento de navegación primario en la sidebar, siempre visible, con resultados agrupados por tipo (token / componente / archivo).

5. Sistema como workspace explícito
   El sistema activo es semioculto (selector en header). Si el usuario trabaja con múltiples sistemas, el concepto de "workspace" debería ser más prominent: sidebar o topbar que muestre claramente en qué contexto estás y permita cambiar sin perder la pantalla actual.

6. Audit log / historial de operaciones
   Las operaciones se ejecutan y desaparecen. Un log persistente (cuándo corrió cada pipeline, resultado, tiempo) sería valioso para debugging y auditoría. No requiere backend nuevo: los JSON de resultado ya existen.

7. Agrupación por estado en el registry de componentes
   La lista de componentes es plana. Agruparlos por estado del pipeline (complete, needs-review, draft, no-spec) convertiría el registry en una herramienta de trabajo priorizado, no solo un inventario.

8. Panel lateral contextual (en vez de navegación completa)
   Hacer clic en un token en el grafo o en el explorador podría abrir un slide-in panel con detalle, en lugar de navegar a una página nueva y perder el contexto de lo que estabas explorando. Patrón que GitHub, Linear y Figma usan con éxito.

9. Sección Settings/Config consolidada
   Hoy: Design Systems Admin, configuración Figma, Naming Debt config y WCAG Pairs están en lugares distintos. Una sección /settings unificada con subnav (Sistema → Figma → Calidad → Integraciones) reduciría la disorientación durante la configuración inicial.

10. Onboarding guiado para sistemas nuevos
    Crear un nuevo sistema tiene múltiples pasos no evidentes (URL Figma → scan → variables → compile → docs). Un flujo de onboarding en stepper (3-5 pasos visibles, con estado y validación inline) reduciría el abandono y el soporte necesario.

Las 3 de mayor impacto inmediato por coste/beneficio: la Homepage (#1), el Hub de componente (#2) y el Agrupamiento por estado (#7) — pueden implementarse sin cambiar la estructura de datos, solo reorganizando lo que ya existe.




---------------
Company Docs MCP

Añadir esto para buscar con IA en la docu:

https://github.com/southleft/company-docs-mcp
