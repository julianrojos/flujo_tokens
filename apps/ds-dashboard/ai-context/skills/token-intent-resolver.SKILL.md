# SKILL: token-intent-resolver

## Propósito

Enriquecer tokens que llegaron sin descripción suficiente desde la primera llamada, **pero con correa corta**.

Este skill no debe convertir nombres ambiguos en prosa convincente.
Solo debe inferir intención cuando la taxonomía sea reconocible.

---

## Regla central

La descripción del token debe hablar de **intención de uso**, no del valor visual.

---

## Inputs esperados

- `component title`
- `component anatomy`
- `tokens[]` con:
  - `name`
  - `value`
  - `type`
  - `description?`

---

## Fuentes de inferencia permitidas

### 1. Jerarquía del nombre
Inferir intención desde:
- tier
- categoría
- rol
- estado
- dominio semántico

Ejemplos fiables:
- `text/*`
- `surface/*`
- `border/*`
- `focus/*`
- `action/*`
- `feedback/*`

### 2. Contexto del componente
Usar el tipo de componente como contexto secundario.
Ejemplos:
- un token `icon/*` dentro de `button`
- un token `border/*` dentro de `input`

### 3. Valor resuelto
El valor resuelto solo puede **apoyar** una hipótesis.
Nunca debe ser la base principal de la intención.

Ejemplo:
- un color oscuro puede sugerir texto principal
- pero no probarlo por sí mismo

---

## Cuándo sí describir

Describir solo si:
- el nombre del token cae en una taxonomía reconocible
- la intención se puede formular sin ambigüedad grave
- no contradice el contexto del componente

Ejemplo:
- `semantic/color/text/primary`
- `color/border/focus`
- `action/primary/bg`

---

## Cuándo NO describir
No inferir una descripción si:
- el nombre es ambiguo
- parece hardcode puro
- mezcla capas (`primitive` usado como `semantic`)
- contiene naming roto o demasiado local
- el valor es la única pista

En esos casos:
- dejar la descripción vacía
- o marcarla como deuda técnica / gap documental

---

## Formato de descripción

La descripción debe:
- explicar intención de uso
- ser breve
- no repetir el valor
- no fingir precisión imposible

Ejemplo correcto:
- `[Descripción inferida] Color de texto principal en superficies estándar.`

Ejemplo incorrecto:
- `Azul oscuro para texto del botón.`

---

## Deuda técnica

Si el nombre del token viola convenciones:
- valor hardcodeado en el nombre
- tier incorrecto
- naming visual donde debería haber intención
- mezcla rara de categorías

entonces:
- anotarlo como deuda técnica en `rules[]`, warnings o notas del patch
- no silenciarlo
- no “normalizarlo” escondiendo el problema

---

## Etiqueta obligatoria

Si la descripción no proviene de un dato objetivo del plugin o de documentación explícita:
- anteponer `[Descripción inferida]`

---

## Qué NO debe hacer

- No inventar alias chain
- No inventar modos no observados
- No tomar el valor visual como prueba principal de intención
- No transformar un token ambiguo en una recomendación fuerte
