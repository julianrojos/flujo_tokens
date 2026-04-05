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
