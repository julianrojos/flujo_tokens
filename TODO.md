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
