# Reporte Final: Layout Canónico por Design System

## Estado

La base queda en modo **canónico estricto**:
- Todas las rutas de sistema deben vivir bajo `design-systems/<id>/`.
- No se admite retrocompatibilidad con rutas `input/<id>`, `output/<id>` o `docs/<id>`.

## Decisiones aplicadas

1. Defaults de creación/edición en server y UI apuntan a:
   - `design-systems/<id>/input`
   - `design-systems/<id>/output`
   - `design-systems/<id>/docs`
2. La verificación de entorno falla si detecta rutas no canónicas.
3. CLI de tokens exige sistema activo (`defaultSystem` o `--system`) y deja de resolver outputs globales fuera del sistema activo.
4. La documentación de estructura refleja únicamente el layout canónico.

## Contratos mantenidos

- `design-systems.json` mantiene su shape (`inputDir`, `outputDir`, `docsDir`), pero con política estricta de ruta canónica.
- Endpoints de sistemas mantienen payloads/códigos.

## Verificación recomendada

```bash
cd apps/ds-dashboard && npx tsc --noEmit -p tsconfig.app.json
cd /Users/julian/Documents/flujo_tokens/tooling && npx tsc --noEmit -p tsconfig.json
cd /Users/julian/Documents/flujo_tokens && npm run test:tooling:core
```
