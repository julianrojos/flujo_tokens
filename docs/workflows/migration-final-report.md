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
2. `ds:doctor` falla si detecta rutas no canónicas.
3. CLI de tokens exige sistema activo (`defaultSystem` o `--system`) y deja de resolver outputs globales fuera del sistema activo.
4. La documentación de estructura refleja únicamente el layout canónico.

## Contratos mantenidos

- `design-systems.json` mantiene su shape (`inputDir`, `outputDir`, `docsDir`), pero con política estricta de ruta canónica.
- Endpoints de sistemas mantienen payloads/códigos.

## Verificación recomendada

```bash
cd apps/ds-dashboard && npx tsc --noEmit -p tsconfig.app.json
cd /Users/julian/Documents/flujo_tokens/tooling && npx tsc --noEmit -p tsconfig.json
cd /Users/julian/Documents/flujo_tokens && node --import tsx --test tooling/src/services/doctor-checks.test.ts
cd /Users/julian/Documents/flujo_tokens && npm run ds:doctor
```
