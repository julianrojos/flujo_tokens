# SKILL: figma-component-extractor

## Propósito

Leer el output del plugin MCP de Figma y poblar `ComponentDocModelOutput` con precisión, trazabilidad y honestidad.

Este skill **extrae hechos**. No redacta guidance editorial ni rellena huecos con intuición.

`ComponentDocOutput` queda reservado para el artefacto final del backend, después de renderizar `markdown`.

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
