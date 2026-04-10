# SKILL: doc-consistency-checker

## Propósito

Cerrar el sistema.

Comparar:

- `ComponentDocModelOutput` como base factual estructurada
- `ComponentDocOutput` como artefacto final renderizado
- `EditorialPatch`

y generar un informe interno de coherencia y calidad antes de permitir publicación.

La salida ideal de esta skill es un `ValidationReport`.

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
