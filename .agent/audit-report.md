# Auditoría de Incoherencias y Solapamientos en `.agent/`

Tras una lectura exhaustiva de las más de 35 reglas (`.mdc`) y las Skills (`.md`) contenidas en el directorio `.agent/`, he identificado varios **solapamientos, incoherencias y duplicidades** que pueden confundir a los LLMs o causar comportamientos cíclicos.

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

## 3. Duplicidad en Generación a Figma: Rendering vs Subset

**Archivos implicados:**

- `figma-doc-rendering.mdc`
- `figma-doc-rendering-implementation.mdc`
- `markdown-figma-subset.mdc`

**Por qué es incoherente/solapado (Gravedad Media):**
Tienes **tres reglas separadas** regulando exactamente el mismo dominio: cómo convertir Markdown para que Figma lo pueda renderizar.

- `markdown-figma-subset.mdc` habla sobre etiquetas permitidas (h1, b, i).
- `figma-doc-rendering.mdc` dice que no se pongan colores _hardcoded_.
- `figma-doc-rendering-implementation.mdc` dice _cómo_ resolver esos colores.
- **Problema:** Un exceso de reglas con globs solapados (todos atacan a `docs/**/*.md`) consume contexto del LLM drásticamente y aumenta las alucinaciones.
- **Solución propuesta:** Unificar las 3 reglas en un único archivo `markdown-to-figma-rendering.mdc` que contenga el subset de HTML permitido y la directiva de usar tokens dinámicos.

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

- `accessibility-docs.mdc`
- `internationalization-docs.mdc`
- `ds-docs-guardrails.mdc`

**Por qué es incoherente/solapado (Gravedad Baja):**
`accessibility-docs.mdc` exige documentar el contraste y `hit_area`. `internationalization-docs.mdc` exige documentar `reduced-motion` y `zoom` (que son intrínsecamente a11y). `ds-docs-guardrails.mdc` dice "No asegures a11y sin pruebas".

- **Problema:** Están fragmentando la directiva de accesibilidad en tres archivos. Si un agente va a escribir documentación, tiene que machetear 3 archivos distintos para no romper los guardarraíles.
- **Solución propuesta:** Fusión del contenido de a11y de `internationalization` y `guardrails` dentro de `accessibility-docs.mdc` para que exista un único contrato de "Contenido inclusivo".
