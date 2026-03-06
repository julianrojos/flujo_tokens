# ADR: Riesgo de mantenimiento - tiptap-markdown

## Contexto

En la implementación del editor enriquecido para summary (componente `SummaryMarkdownEditor`), se utilizó el paquete `tiptap-markdown` para serialización/deserialización de contenido Markdown.

## Decisión

Se adoptó `tiptap-markdown` (v0.9.0) como solución temporal para el round-trip de Markdown en el editor Tiptap.

## Riesgos identificados

1. **Mantenimiento limitado**: El paquete `tiptap-markdown` no tiene mantenimiento activo constante. Esto puede generar:
   - Incompatibilidades con futuras versiones de Tiptap
   - Bugs no resueltos en serialización de Markdown
   - Falta de soporte para nuevas features de Tiptap

2. **Serialización inconsistente**: Pueden existir edge cases donde el Markdown generado no sea idéntico al original después de múltiples ediciones.

## Mitigaciones implementadas

1. **Pin estricto de versión**: La dependencia está fijada a una versión específica en `package.json`.

2. **Configuración endurecida**: 
   - `html: false` - previene inyección de HTML
   - `linkify: false` - previene auto-enlazado
   - `breaks: false` - comportamiento consistente

3. **Validación de URLs**: Los links solo permiten protocolos `http:`, `https:`, `mailto:`.

4. **Tests de round-trip**: Se recomienda añadir tests que verifiquen que el Markdown se mantiene consistente después de múltiples ediciones.

## Estrategia de salida

A medio plazo, evaluar:
1. Migrar a la extensión oficial de Markdown de Tiptap (si se vuelve disponible)
2. Implementar pipeline custom con `remark`/`rehype` para parseo y serialización
3. Contribuir al mantenimiento de `tiptap-markdown` si es necesario

## Referencias

- Repositorio: https://github.com/aguingand/tiptap-markdown
- Tiptap extensions oficiales: https://tiptap.dev/extensions
