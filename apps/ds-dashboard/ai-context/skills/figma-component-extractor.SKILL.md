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
- `anatomy[]`
- `variants[]`
- `states[]` si el schema ya lo soporta
- `tokens[]`
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

### 2. Anatomy
Leer el layer tree e incluir solo capas con nombre semántico o función reconocible.

#### Incluir
- `label`
- `icon`
- `leading-icon`
- `trailing-icon`
- `helper-text`
- `supporting-text`
- `container`
- `field`
- `image`
- `badge`
- `indicator`
- `avatar`
- `title`
- `description`
- `slot`

#### Excluir
- Nombres internos o irrelevantes como:
  - `Rectangle 4`
  - `Group 2`
  - `Frame 17`
  - `Vector`
  - capas puramente técnicas sin nombre funcional

#### Inferencias permitidas
Inferir `type` desde:
- nombre de la capa
- tipo de nodo
- contenido visible

Tipos permitidos:
- `text`
- `icon`
- `container`
- `image`
- `slot`
- `indicator`

#### optional
Marcar `optional: true` cuando:
- la capa esté controlada por una boolean property de Figma
- su visibilidad esté toggleada por variante o prop
- el nombre contenga `?` o `optional`

#### children[]
Usar `children[]` solo cuando exista subestructura pública real.
Ejemplos:
- un `input` con `label`, `field`, `helper-text`
- un `card` con `image`, `title`, `description`, `actions`

No usar `children[]` para reflejar mera agrupación técnica del archivo.

#### confidence y source
Para anatomy inferida:
- `confidence: high | medium | low`
- `source: explicit-name | inferred-from-content | inferred-from-position`

Si la anatomía pública no es distinguible con seguridad, emitir `StructureWarning`.

### 3. Variants
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

### 4. States
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

### 5. Tokens
Solo incluir variables de Figma **efectivamente vinculadas** al componente.

#### Campos
- `name`
- `value`
- `type`
- `description?`

#### value
`value` es el valor resuelto en el modo activo que el plugin está leyendo.

#### type
Usar tipos compatibles con DTCG cuando sea posible:
- `color`
- `dimension`
- `fontFamily`
- `fontWeight`
- `lineHeight`
- `number`
- `duration`
- `cubicBezier`

Si el plugin no ofrece suficiente precisión, elegir el tipo más cercano y dejar constancia en metadata o warnings internos.

#### description
En esta llamada, `description` es opcional y solo factual.
No redactar intención de uso si no está disponible.

#### mode coverage
Si el token parece semántico y solo se ha observado en un modo:
- marcar `modeCoverage: partial` si el schema lo soporta
- o añadir nota interna equivalente

#### Lo que no se debe hacer con tokens
- No inventar alias chain
- No deducir todos los modos del sistema
- No asumir `sourceLayer`
- No escribir descripciones editoriales de intención si no hay base

### 6. Accessibility facts
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

### 7. StructureWarning
Emitir `StructureWarning` cuando:
- los nombres de capas sean caóticos
- la anatomía pública no se pueda distinguir de la construcción interna
- las variantes mezclen categorías sin patrón claro
- haya tokens esperables pero no vinculados
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
- No inventar descripciones de tokens si no hay información disponible
- No inferir comportamiento real desde estados visuales de Figma
- No declarar accesibilidad como verificada sin evidencia
