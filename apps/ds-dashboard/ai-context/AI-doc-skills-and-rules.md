# Skills y rules para documentar componentes desde Figma/MCP

---

## README.md

# Paquete de skills y rules para documentar componentes desde Figma/MCP

Este paquete está pensado para una IA que genera documentación en **dos llamadas**:

1. **Primera llamada** → `ComponentDocOutput`
2. **Segunda llamada** → `EditorialPatch`

Y una **tercera pasada silenciosa**: 3. **Validación** → `ValidationReport`

## Objetivo

Convertir un generador de documentación en un sistema **con criterio, trazabilidad y límites claros**.

## Principios no negociables

- Nada que no sea visible o trazable desde Figma/MCP o desde una convención explícita del sistema puede presentarse como hecho.
- Mejor dejar un campo vacío o marcado como pendiente que rellenarlo con una inferencia convincente pero falsa.
- Separar **estado visual observable** de **comportamiento real implementado**.
- Si la estructura del componente en Figma es pobre, el sistema debe degradar la confianza y emitir `StructureWarning`.
- El patch editorial complementa; no reescribe ni contradice la extracción factual.

## Stack recomendado

- `figma-component-extractor`
- `variant-state-classifier`
- `editorial-patch-writer`
- `doc-consistency-checker`

## Orden recomendado de implementación

1. Añadir `states[]` al schema base.
2. Reemplazar `accessibilityNotes[]` por `accessibilityFacts[]` con niveles de confianza.
3. Implementar `StructureWarning`.
4. Implementar `doc-consistency-checker`.
5. Añadir `ValidationReport` silencioso.

## Archivos incluidos

### Skills

- `skills/figma-component-extractor.SKILL.md`
- `skills/variant-state-classifier.SKILL.md`
- `skills/editorial-patch-writer.SKILL.md`
- `skills/doc-consistency-checker.SKILL.md`

### Reglas

- `rules/RULES.md`

## Recomendaciones de schema

### ComponentDocOutput

Recomendado ampliar con:

- `states[]`
- `accessibilityFacts[]`
- `structureWarning?`
- `confidence?`
- `unresolvedQuestions[]?`

### EditorialPatch

Mantener como capa prescriptiva:

- `purpose`
- `when_to_use`
- `when_not_to_use`
- `do[]`
- `dont[]`
- `best_practices`
- `content_guidelines`
- `rules[]`
- `accessibility`
- `qa[]`
- `related_components[]`

### ValidationReport

Sugerido:

- `passes: boolean`
- `severity: "blocking" | "warning" | "info"`
- `score: number`
- `structureWarnings[]`
- `missingSections[]`
- `unsupportedClaims[]`
- `editorialConflicts[]`
- `terminologyMismatches[]`
- `a11yWarnings[]`
- `notes[]`

## Convenciones de etiquetas

Usar placeholders explícitos cuando haga falta:

- `[Requiere revisión]`
- `[Por confirmar con dev]`
- `[Descripción inferida]`
- `[Fuera de scope Figma]`

## Notas de implementación

- Si no hay fuente de gobernanza real, no generar `owner`, `reviewedAt` o `status` como hechos.

---

## skills/figma-component-extractor.SKILL.md

# SKILL: figma-component-extractor

## Propósito

Leer el output del plugin MCP de Figma y poblar `ComponentDocOutput` con precisión, trazabilidad y honestidad.

Este skill **extrae hechos**. No redacta guidance editorial ni rellena huecos con intuición.

---

## Qué debe producir

Debe poblar, como mínimo:

- `schemaVersion`
- `componentId`
- `title`
- `summary`
- `variants[]`
- `states[]` si el schema ya lo soporta
- `accessibilityFacts[]` si el schema ya lo soporta
- `metadata`

Puede añadir:

- `confidence`
- `unresolvedQuestions[]`
- `structureWarning`

---

## Regla madre

Nada que no sea visible o trazable desde Figma/MCP o desde una convención explícita del sistema puede presentarse como hecho.

---

## Reglas de extracción

### 1. Summary

- Debe ser breve y factual.
- Describe qué es el componente y qué partes o configuraciones principales expone.
- No incluir `purpose`, `when_to_use`, `when_not_to_use` ni recomendaciones de uso.

### 2. Variants

Clasificar cada variant property antes de documentarla.

#### Estados visuales

Valores como:

- `default`
- `hover`
- `pressed`
- `active`
- `focus`
- `disabled`
- `error`
- `loading`
- `selected`
- `expanded`
- `checked`
- `success`

Se deben clasificar como **estados visuales observables**.

#### Variantes estructurales

Valores como:

- tamaño
- densidad
- jerarquía
- emphasis
- style
- appearance

Se deben clasificar como **variantes estructurales**.

#### Props opcionales

Booleanos como:

- `true/false`
- `hasIcon`
- `showLabel`
- `fullWidth`

Se deben clasificar como **props opcionales**.

#### id

El `id` debe ser estable y en kebab-case.

Convención sugerida:

- `variant-size-sm`
- `variant-hierarchy-primary`
- `state-disabled`
- `prop-has-icon`

Si la clasificación no es segura, mantener un id estable pero marcar warning en validación.
No inventar precisión ontológica.

#### properties

`properties` debe conservar los valores exactos de Figma, sin reinterpretarlos ni traducirlos.

### 3. States

Si el schema soporta `states[]`, poblarlo como primera clase.

#### Regla crítica

**Estado visual sí; comportamiento real no.**

Se puede afirmar:

- que existe una variante visual para `hover`
- que existe una variante visual para `disabled`

No se puede afirmar:

- que existe focus management real
- que existe soporte de teclado real
- que existe loading async real
- que existe anuncio correcto para screen readers

### 4. Accessibility facts

Si el schema soporta `accessibilityFacts[]`, limitarlo a hechos observables o inferencias claramente marcadas.

Ejemplos permitidos:

- `isInteractive: inferred`
- `hasTextLabel: observed`
- `possibleRole: recommended`
- `requiresAccessibleName: recommended`

Nunca presentar como verificado:

- rol ARIA definitivo
- labeling final
- comportamiento de teclado
- announcements reales

### 5. StructureWarning

Emitir `StructureWarning` cuando:

- las variantes mezclen categorías sin patrón claro
- el componente no supere un umbral mínimo de estructura legible

En ese caso:

- bajar confianza global
- no compensar con inferencia agresiva

---

## Qué esta llamada NO debe hacer

- No generar `purpose`
- No generar `when_to_use`
- No generar `when_not_to_use`
- No generar `do/dont`
- No inferir comportamiento real desde estados visuales de Figma
- No declarar accesibilidad como verificada sin evidencia

---

## skills/variant-state-classifier.SKILL.md

# SKILL: variant-state-classifier

## Propósito

Evitar el error más frecuente al documentar componentes desde Figma:
mezclar **estados**, **variantes estructurales** y **props opcionales**.

Este skill puede usarse:

- dentro de `figma-component-extractor`
- como paso compartido antes del `editorial-patch-writer`
- como apoyo del validador

---

## Regla central

Clasificar primero. Documentar después.

---

## Categorías oficiales

### 1. Estados visuales

Un componente solo puede estar en uno de estos a la vez dentro de un mismo eje de estado.

Estados admitidos:

- `default`
- `hover`
- `pressed`
- `active`
- `focus`
- `disabled`
- `error`
- `success`
- `loading`
- `selected`
- `expanded`
- `checked`

### 2. Variantes estructurales

Configuración estática del componente.

Grupos típicos:

- `size`: `xs/sm/md/lg/xl`
- `hierarchy` o `emphasis`: `primary/secondary/tertiary/ghost`
- `style` o `appearance`: `filled/outlined/tonal`
- `density`: `compact/default/comfortable`

### 3. Props opcionales

Booleanos o toggles de presencia.

Ejemplos:

- `has-icon`
- `has-badge`
- `is-full-width`
- `show-label`
- `show-description`

---

## Heurísticas de clasificación

### Detectar estados

Si una property o un valor contiene:

- `hover`
- `focus`
- `pressed`
- `active`
- `disabled`
- `error`
- `loading`
- `selected`
- `checked`

Clasificar como estado, salvo evidencia clara en contra.

### Detectar variantes estructurales

Si el valor representa:

- tamaño
- estilo
- jerarquía
- densidad
- layout

Clasificar como variante estructural.

### Detectar props opcionales

Si la propiedad es booleana o su naming implica presencia/ausencia:

- `has`
- `show`
- `with`
- `is`

Clasificar como prop opcional.

---

## Convención de ids

Sugerida:

- `state-*`
- `variant-*`
- `prop-*`

Ejemplos:

- `state-disabled`
- `variant-size-sm`
- `variant-appearance-outlined`
- `prop-has-icon`

### Regla de tolerancia

Si el clasificador no puede determinar con suficiente confianza un prefijo correcto:

- usar un id estable y legible
- disparar warning en validación
- no bloquear por sí solo

---

## Deuda de diseño

Si una property mezcla categorías, por ejemplo:

- `Type: primary-disabled`
- `Size: small-loading`
- `State: secondary-hover`

entonces:

- documentarla tal como viene de Figma
- marcarla como **deuda de diseño**
- anotarla en `qa[]`, `unresolvedQuestions[]` o warnings internos

No intentar “corregir” la fuente en silencio.

---

## Qué NO debe hacer

- No inventar nuevas categorías
- No suponer comportamiento real a partir de estados
- No reescribir los valores exactos de Figma
- No esconder nomenclatura mala bajo ids “bonitos”

---

## skills/editorial-patch-writer.SKILL.md

# SKILL: editorial-patch-writer

## Propósito

Usar `ComponentDocOutput` como base canónica y enriquecerlo con criterio editorial mediante `EditorialPatch`, sin contradecirlo ni reescribirlo.

---

## Regla de oro

El patch complementa, no reescribe.

Si la primera llamada extrajo:

- 4 variantes, el patch no puede ignorarlas ni inventar una quinta

---

## Qué debe producir

Puede poblar:

- `summary`
- `purpose`
- `when_to_use`
- `when_not_to_use`
- `best_practices`
- `do[]`
- `dont[]`
- `content_guidelines`
- `rules[]`
- `accessibility`
- `related_components[]`
- `qa[]`

---

## Reglas editoriales

### 1. Summary

- Puede mejorar claridad o escaneabilidad del resumen
- No debe contradecir hechos del bloque base

### 2. Purpose

- Una frase
- Describe el problema de usuario o de interfaz que resuelve
- No describir su apariencia
- No usar lenguaje vacío

Correcto:

- `Permite iniciar una acción principal con alta visibilidad dentro de una vista.`

Incorrecto:

- `Es un botón azul con icono opcional.`

### 3. when_to_use / when_not_to_use

Basarse en:

- variants
- states
- tipo de componente

Si el componente tiene variante `destructive`, debe reflejarse si es relevante.
Si no tiene estado `loading`, no inventarlo.

### 4. do / dont

Deben ser concretos y verificables.

Incorrecto:

- `Usa el componente de forma consistente.`

Correcto:

- `Usa la variante destructive solo para acciones irreversibles como eliminar o desconectar.`

### 5. content_guidelines

Solo incluir cuando el componente tenga contenido real:

- labels
- helper text
- placeholders
- títulos
- descripciones

Debe ser accionable y específico al componente.

### 6. accessibility

La accesibilidad en el patch debe reflejar límites de Figma.

#### role

No tratar el rol como hecho salvo evidencia muy fuerte.
Usar esta lógica:

- `verified` si existe evidencia externa verificable
- `recommended` si es la opción más probable desde nombre + estructura
- `unknown` si no hay base suficiente

Desde Figma-only, por defecto:

- usar sugerencia conservadora
- marcar con `[Por confirmar con dev]`

#### labeling.rules[]

Deben ser instrucciones accionables:

- `Si el componente se renderiza sin texto visible, proporcionar un nombre accesible mediante aria-label o equivalente.`
- `Si el label visible cambia por variante, verificar que el nombre accesible siga siendo estable.`

No usar recordatorios genéricos tipo “cumple WCAG”.

#### notes[]

Usar para:

- teclado
- screen reader
- focus management
- announcements

siempre que no puedan verificarse desde Figma.

Marcar:

- `[Por confirmar con dev]`
- `[Fuera de scope Figma]`

### 7. related_components[]

Ser muy conservador.
Solo incluir con evidencia suficiente, idealmente:

- nombre compartido
- prefijo común en la librería
- cercanía muy clara en la familia del sistema

Si no hay evidencia, dejar vacío.

### 8. qa[]

`qa[]` no es una checklist genérica.
Cada item debe ser una pregunta específica para ESTE componente.

Incorrecto:

- `¿Cumple accesibilidad?`

Correcto:

- `¿La variante \`destructive\` requiere confirmación antes de ejecutar la acción?`

### 9. coherencia terminológica

El patch debe reusar naming del bloque base.
Si `ComponentDocOutput` usa `leading-icon`, el patch no debe cambiar a `prefix icon` sin justificación.

---

## Qué NO debe hacer

- No inventar variantes no presentes en `ComponentDocOutput`
- No presentar accesibilidad inferida como verificada
- No rellenar vacíos con convenciones no declaradas

---

## skills/doc-consistency-checker.SKILL.md

# SKILL: doc-consistency-checker

## Propósito

Cerrar el sistema.

Comparar:

- `ComponentDocOutput`
- `EditorialPatch`

y generar un informe interno de coherencia y calidad antes de permitir publicación.

Este skill no está pensado para el usuario final.
Su salida ideal es un `ValidationReport`.

---

## Qué valida

### 1. Contradicciones factuales

Detectar si el patch:

- menciona variantes no presentes
- menciona estados no presentes
- cambia el significado factual del componente

### 2. Claims no soportados

Detectar afirmaciones que suenen verificadas pero no estén respaldadas por:

- Figma/MCP
- convención explícita del sistema
- metadata externa confiable

Especial atención a:

- accesibilidad
- comportamiento
- theming
- roles

### 3. Coherencia terminológica

Comparar nombres entre ambos bloques.
Ejemplos:

- `leading-icon` vs `prefix icon`
- `helper-text` vs `supporting copy`

Si hay desajuste:

- emitir `terminologyMismatch`
- no bloquear salvo que cambie significado

### 4. Cobertura mínima

Verificar si falta alguna pieza crítica.

Sugerido comprobar:

- `summary`
- `variants[]` y/o `states[]`
- `accessibility`
- `qa[]`

### 5. Calidad del QA

Marcar como warning si `qa[]` contiene:

- frases genéricas
- preguntas imposibles de verificar
- items no específicos al componente

### 6. Calidad de accesibilidad

Bloquear o advertir si:

- se declara un rol como hecho sin evidencia
- se afirma soporte de teclado como verificado sin soporte
- se presenta labeling como resuelto sin base
- no se marca `[Por confirmar con dev]` cuando corresponde

### 7. StructureWarning

Si el extractor ya emitió `StructureWarning`, este skill debe:

- degradar la confianza global
- subir la exigencia para claims editoriales
- impedir compensar estructura pobre con inferencia agresiva

---

## Severidad recomendada

### blocking

- contradicción factual
- claim presentado como hecho sin trazabilidad
- estructura ilegible grave
- accesibilidad presentada como verificada sin evidencia

### warning

- clasificación ambigua
- nomenclatura inconsistente
- terminología desalineada
- QA demasiado genérico
- theming inferido con cobertura parcial

### info

- oportunidad de enriquecer descripción
- campos opcionales vacíos
- mejora editorial no crítica

---

## ValidationReport sugerido

- `passes: boolean`
- `score: number`
- `severity: "blocking" | "warning" | "info"`
- `structureWarnings[]`
- `missingSections[]`
- `unsupportedClaims[]`
- `editorialConflicts[]`
- `terminologyMismatches[]`
- `a11yWarnings[]`
- `notes[]`

---

## Regla final

La publicación debe bloquearse si la documentación parece más segura de lo que realmente es.

---

## rules/RULES.md

# RULES.md

## Rules transversales para todo el sistema

Estas reglas no pertenecen a un skill aislado. Deben vivir en la configuración base, system prompt o capa de validación común.

---

## 1. Regla madre

Nada que no sea visible o trazable desde Figma/MCP o desde una convención explícita del sistema puede presentarse como hecho.

---

## 2. Honestidad antes que completitud

- Mejor dejar un campo vacío que inventarlo.
- Mejor marcar una inferencia como baja confianza que presentarla como resuelta.
- Mejor devolver `[Por confirmar con dev]` que una certeza falsa.

---

## 3. Separación entre bloques

### ComponentDocOutput

Debe contener:

- hechos observables
- extracción estructurada
- inferencias mínimas y marcadas

### EditorialPatch

Debe contener:

- guidance
- rationale
- recomendaciones
- preguntas de QA
- notas de accesibilidad no verificadas

### Nunca

El patch no puede:

- crear variantes nuevas
- contradecir el bloque base

---

## 4. Estado visual ≠ comportamiento real

Se puede afirmar:

- que existe una variante visual `hover`
- que existe una variante visual `focus`
- que existe una variante visual `disabled`

No se puede afirmar solo desde Figma:

- focus management real
- soporte de teclado real
- loading async real
- screen reader announcements correctos

---

## 5. Accesibilidad con niveles de confianza

Toda afirmación delicada de accesibilidad debería poder clasificarse como:

- `verified`
- `recommended`
- `unknown`

Por defecto, desde Figma:

- los roles son recomendados, no hechos
- labeling requiere confirmación
- teclado y SR suelen estar fuera de scope

---

## 6. Limitación de modo único de Figma

Si el plugin solo expone un modo activo:

- no asumir que el valor observado representa todos los modos
- no inferir dark mode, high contrast o brand modes completos
- marcar `modeCoverage: partial` o equivalente cuando proceda

---

## 8. Coherencia terminológica

La terminología debe ser consistente entre extracción y patch.

Ejemplo:

- si base usa `leading-icon`, el patch no debe usar `prefix icon` sin justificación

El validador debe marcarlo como:

- `terminologyMismatch`

---

## 9. Placeholders obligatorios

Usar estas etiquetas cuando haga falta:

- `[Requiere revisión]`
- `[Por confirmar con dev]`
- `[Descripción inferida]`
- `[Fuera de scope Figma]`

No sustituirlas por lenguaje vago.

---

## 10. QA específico

`qa[]` debe contener preguntas verificables y específicas del componente.

Evitar:

- preguntas genéricas
- frases aspiracionales
- recordatorios abstractos de buenas prácticas

---

## 11. Gobernanza

No generar como hechos:

- `owner`
- `status`
- `reviewedAt`
- `deprecated`
- `replacement`

salvo que exista fuente real:

- metadata del sistema
- JSON de configuración
- spreadsheet
- CMS interno
- convención explícita verificable

---

## 12. Severidad de validación

### blocking

- contradicción factual
- accesibilidad presentada como verificada sin evidencia
- claims no trazables
- estructura ilegible grave

### warning

- terminología inconsistente
- clasificación ambigua
- theming parcial
- QA genérico

### info

- mejora editorial opcional
- enriquecimiento futuro
- campos opcionales vacíos

---

## 13. Regla de publicación

No publicar documentación si:

- hay contradicciones factuales
- hay claims más fuertes que la evidencia
- la estructura del componente no alcanza umbral mínimo
- la accesibilidad parece “resuelta” pero no está trazada

---

## 14. Regla de diseño del sistema

No diseñar campos para el sistema que te gustaría tener, sino para el sistema que hoy puede sostener evidencia real.
