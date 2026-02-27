# Auditoría de Incoherencias y Solapamientos en `.agents/`

Tras una lectura exhaustiva de las más de 35 reglas (`.mdc`) y las Skills (`.md`) contenidas en el directorio `.agents/`, he identificado varios **solapamientos, incoherencias y duplicidades** que pueden confundir a los LLMs o causar comportamientos cíclicos.

Aquí tienes el listado priorizado, ordenado de mayor a menor gravedad, junto con la justificación y propuesta de resolución:

---

## 1. Solapamiento Crítico: Contrato de Frontmatter vs Reglas Específicas

**Archivos implicados:**

- `frontmatter-contract.mdc`
- `component-spec-yaml.mdc`
- `docs-taxonomy.mdc`
- `markdown-lifecycle-status.mdc`

**Por qué es incoherente/solapado (Gravedad Alta):**
`frontmatter-contract.mdc` intenta ser la fuente de verdad absoluta para el YAML Frontmatter de **todos** los archivos markdown referenciando un esquema JSON (`tooling/schemas/frontmatter.schema.json`). Sin embargo, `component-spec-yaml.mdc` y `docs-taxonomy.mdc` también dictan reglas estrictas sobre cómo deben ser esos mismos campos (`doc_type`, `status`, `figma_node_id`).

- **Problema:** Si el esquema JSON se actualiza pero `component-spec-yaml.mdc` no, el Agente recibirá instrucciones contradictorias sobre qué campos son requeridos en un componente.
- **Solución propuesta:** `frontmatter-contract.mdc` debe ser la única regla que hable de Frontmatter en Markdown. Las demás reglas deben _apuntar_ a este contrato y limitarse a hablar del contenido del _cuerpo_ del documento o del YAML de la especificación técnica en `_spec/`.

## 2. Incoherencia de Taxonomía: Workflow Patterns vs Componentes

**Archivos implicados:**

- `pattern-doc-workflow.mdc`
- `docs-taxonomy.mdc`
- `overview-components-canonical-list.mdc`

**Por qué es incoherente/solapado (Gravedad Media):**
`pattern-doc-workflow.mdc` establece que los "Patrones" (Patterns) van en `docs/workflows/patterns/*.md` y no detallan la API del componente. Pero `overview-components-canonical-list.mdc` asume que cualquier cosa que agrupe funcionalidad de UI es un "componente" y debe indexarse en el índice principal.

- **Problema:** Un Agente que intente crear "Empty State" podría dudar si tratarlo como un "Componente" (por la regla index) o como un "Workflow Pattern" (por la nueva regla).
- **Solución propuesta:** Actualizar `overview-components-canonical-list.mdc` para excluir explícitamente la carpeta `docs/workflows/patterns/` del escaneo automático de componentes canónicos.

## 3. Duplicidad en Generación a Figma: Rendering unificado

**Archivo implicado (estado actual):**

- `figma-rendering.mdc`

**Por qué era incoherente/solapado (Gravedad Media):**
Antes había tres reglas separadas regulando el mismo dominio (subset de Markdown, contrato de render, e implementación).

- **Problema:** exceso de reglas con globs solapados y carga de contexto innecesaria.
- **Resolución aplicada:** unificación en `figma-rendering.mdc` con secciones de authoring constraints, pipeline contract e implementation guide.

## 4. Skills Duplicadas: Documentación de Sistema vs Pipeline

**Archivos implicados:**

- Skill: `document-design-system` (varias sub-skills)
- Skill: `ds-pipeline` (varias sub-skills)
- Regla: `docs-pipeline-contract.mdc`

**Por qué es incoherente/solapado (Gravedad Baja - Riesgo Operativo):**
El directorio de Skills tiene `document-design-system/ds-component-doc` pero también existe lógica solapada en `ds-pipeline/ds-init-docs`. Ambas carpetas invocan los mismos scripts (`ds-regenerate-docs`) pero bajo distintos nombres de sub-skills.

- **Problema:** El usuario le pide al Agente "Genera la documentación del botón". El agente tiene dos Skills que dicen ser capaces de hacer esto. Elegirá una al azar o se quedará en loop intentando coordinar ambas.
- **Solución propuesta:** Integrar la generación de componentes de `ds-pipeline` dentro de `document-design-system` o dejar `ds-pipeline` **estrictamente** para tareas de sincronización (JSON -> CSS) y la otra para redacción de Markdown.

## 5. Referencias Circulares en Accesibilidad

**Archivos implicados:**

- `inclusive-docs.mdc`
- `ds-docs-guardrails.mdc`

**Por qué es incoherente/solapado (Gravedad Baja):**
Antes, el contenido estaba separado en dos reglas distintas (accesibilidad e internacionalización): una exigía contraste y `hit_area`; la otra pedía `reduced-motion` y `zoom` (también a11y). `ds-docs-guardrails.mdc` añadía la restricción de no afirmar a11y sin pruebas.

- **Problema:** Están fragmentando la directiva de accesibilidad en tres archivos. Si un agente va a escribir documentación, tiene que machetear 3 archivos distintos para no romper los guardarraíles.
- **Resolución aplicada:** Fusión en `inclusive-docs.mdc` como contrato único de contenido inclusivo.
