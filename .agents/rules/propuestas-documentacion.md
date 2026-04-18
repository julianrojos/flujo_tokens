# Propuestas de Mejora: Reglas de Documentación de Sistema de Diseño

Tras analizar los documentos de benchmarking (Claude, GPT, Gemini, Perplexity, Qwen) presentes en `md_buenas prácticas` y cruzar los datos de frecuencia de temas con las **35 Cursor Rules (.mdc)** actuales de tu directorio `.agents/rules/`, he identificado áreas clave donde las reglas actuales se quedan cortas o no cubren las mejores prácticas de la industria.

Aquí tienes **10 propuestas priorizadas** con su justificación para incorporar como nuevas `.mdc` o actualizar las existentes, evitando duplicar lo que ya tienes (como nomenclatura de tokens, accesibilidad básica o estructura de YAML).

---

## 1. Regla: Estandarización de Anatomía Visual (Visual Anatomy)

**Falta actual:** Aunque las reglas de `component-spec` incluyen un campo `anatomy`, no hay directrices sobre cómo documentar la anatomía de forma visual (imágenes con markers numéricos y tabla de leyenda) que es el estándar en Material Design o Carbon.
**Justificación:** Los documentos muestran 164 menciones a "Anatomía". Sin una regla explícita de presentación, cada componente describe sus partes de forma ad-hoc a nivel de texto, lo que dificulta la comprensión visual rápida para desarrolladores y diseñadores.

## 2. Regla: Patrones de Uso Correcto e Incorrecto (Do's and Don'ts)

**Falta actual:** Tienes reglas como `prohibited-patterns.mdc` pero está enfocada en la gobernanza arquitectónica (no falsear accesibilidad, etc.), no en el uso UI del componente por parte del consumidor.
**Justificación:** Todos los benchmarks señalan que los bloques visuales de "Hacer / No hacer" (Do & Don't) con pares de ejemplos verde/rojo reducen las consultas al equipo core en un 40%. Es la sección más leída por los diseñadores de producto.

## 3. Regla: Ejemplos de Código Interactivos y Contextuales

**Falta actual:** Tienes estructura de YAML, pero no se regula cómo deben ser los `code snippets`. Faltan directrices sobre incluir el estado mínimo indispensable, mostrar variantes clave y (vital) evitar incluir boilerplate (ej. imports completos) que ensucia el doc.
**Justificación:** Aparece 149 veces en tus guías de referencia. Un componente bien especificado no sirve si el desarrollador tiene que adivinar cómo instanciarlo. La regla debe forzar que cada variante principal en Figma tenga su equivalente en snippet de código probado.

## 4. Regla: Guías de Contribución y Reporte de Bugs (Contribution & Triage)

**Falta actual:** Aunque tienes `docs-governance-ops.mdc` y estados de ciclo de vida, no hay una regla que defina cómo un usuario normal debe pedir un cambio, reportar un bug visual o proponer un nuevo pattern, ni cómo documentarlo.
**Justificación:** Con más de 1900 menciones, la contribución es el tema dominante en los documentos. Un sistema cerrado muere; la regla debe definir la plantilla de issues (Figma link + Expected behavior + Code sandbox) para reducir la fricción.

## 5. Regla: Especificación de Comportamiento e Interacción (State & Motion)

**Falta actual:** No hay reglas claras sobre cómo documentar los estados transitivos (hover, active, focus, disabled) ni curvas de animación/duración (Motion). `inclusive-docs.mdc` lo toca sutilmente para a11y, pero no para la especificación base.
**Justificación:** Los componentes web no son estáticos. Documentar las variables de CSS a aplicar en hover o focus, y los tokens de duración de animación, garantiza consistencia en interacciones que a menudo quedan a criterio del desarrollador o del navegador por defecto.

## 6. Regla: Composición y Patrones (Composition & Patterns)

**Falta actual:** `pattern-doc-workflow.mdc` establece la estructura para _páginas_ de flujos, pero falta documentar cómo componer componentes (ej. Dropdown + Input = Select) y manejar el z-index y stacking context.
**Justificación:** La complejidad en los Sistemas de Diseño rara vez está en el botón aislado, sino en cómo los componentes interactúan entre sí. Definir reglas de espaciado inter-componente e inyección de props es una best practice de nivel avanzado (ej. slot patterns).

## 7. Regla: Versionado y Registro de Cambios a nivel Componente

**Falta actual:** Tienes `skill-versioning.mdc` (para las skills) y trackeas metadata, pero no está normativizado tener un changelog local por componente o un histórico de obsolescencia.
**Justificación:** Mencionando 73 veces, el control de versiones permite a los consumidores saber qué cambió en la v2 del Button sin leer la nota de release global.

## 8. Regla: Principios de Localización Extensivos (Internacionalización Activa)

**Falta actual:** Tienes `inclusive-docs.mdc` pero se enfoca en no hacer claims falsos y el comportamiento RTL. Falta dictar cómo manejar componentes donde el ancho del texto es crítico (botones o badges) bajo idiomas verbosos (ej. Alemán).
**Justificación:** Evita roturas de layout tempranas. La regla debe forzar que componentes críticos incluyan un `stress-test` de longitud de texto y comportamiento wrap/truncate.

## 9. Regla: Guiones de Onboarding por Perfil (Role-based Onboarding)

**Falta actual:** No existen directrices sobre la documentación de entrada. Aparece muy poco en el texto analizado en comparación con desarrollo puro, pero es una omisión crítica en la madurez del DS.
**Justificación:** Necesitas una `.mdc` que asegure rutas claras para "Soy Diseñador" vs "Soy Desarrollador", garantizando que los nuevos miembros no tengan que leer arquitectura de tokens en su primer día.

## 10. Regla: Performance y Core Web Vitals en la Documentación

**Falta actual:** No existe validación de impacto en rendimiento por componente (impacto en LCP/CLS).
**Justificación:** Con 36 menciones, el performance es un criterio de calidad. La regla aseguraría documentar, por ejemplo, si un componente carga iconos o tipografías de red (bloqueantes) y cómo impacta en el Layout Shift para que el consumidor lo tenga en cuenta en su App.
