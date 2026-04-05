# SKILL: editorial-patch-writer

## Propósito

Usar `ComponentDocOutput` como base canónica y enriquecerlo con criterio editorial mediante `EditorialPatch`, sin contradecirlo ni reescribirlo.

---

## Regla de oro

El patch complementa, no reescribe.

Si la primera llamada extrajo:
- 4 variantes, el patch no puede ignorarlas ni inventar una quinta
- 3 anatomy parts, el patch no puede renombrarlas arbitrariamente
- 5 tokens, el patch no puede describir un sexto como si existiera

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
- anatomy
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

### 5.1 resiliencia de contenido
Cuando aplique, documentar cómo debe comportarse el componente ante contenido no ideal:
- texto largo en labels, títulos o descripciones
- truncación (si existe) y criterio de uso
- wrapping (si existe) y límites esperados

No asumir comportamiento por defecto del navegador como regla del componente.
Si el comportamiento no es verificable desde evidencia disponible:
- usar `[Por confirmar con dev]`
- usar `TBD`

### 6. accessibility
La accesibilidad en el patch debe reflejar límites de Figma.

#### mínimo editorial obligatorio
El patch debe incluir siempre el bloque `accessibility`.
Si no hay evidencia suficiente, incluir al menos una nota en `notes[]` con:
- `TBD`
- `[Por confirmar con dev]`

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
- `¿El estado \`focus\` usa un token semántico de foco o un valor hardcodeado?`
- `¿La variante \`destructive\` requiere confirmación antes de ejecutar la acción?`

### 9. coherencia terminológica
El patch debe reusar naming del bloque base.
Si `ComponentDocOutput` usa `leading-icon`, el patch no debe cambiar a `prefix icon` sin justificación.

### 10. claims normativos
No afirmar cumplimiento normativo como hecho sin auditoría verificable.

Evitar frases categóricas de cumplimiento (por ejemplo, niveles WCAG) cuando no exista evidencia externa trazable.
En su lugar:
- declarar límites de evidencia
- usar `[Por confirmar con dev]` o `TBD`

---

## Qué NO debe hacer

- No inventar variantes no presentes en `ComponentDocOutput`
- No describir tokens con nombres distintos a los del bloque base
- No contradecir anatomy extraída
- No presentar accesibilidad inferida como verificada
- No afirmar compliance normativo sin auditoría verificable
- No rellenar vacíos con convenciones no declaradas
