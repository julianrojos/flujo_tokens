# Documentación de Design Systems

Este directorio contiene documentación **transversal** del Design System, no específica de un sistema particular.

## ¿Qué va aquí?

### ✅ Contenido permitido en `docs/` raíz

- **`docs/_generated/`**: Artefactos generados globales/transversales (si aplica)
- **`docs/adr/`**: Decisiones arquitectónicas (Architecture Decision Records)
- **`docs/workflows/`**: Documentación de procesos y workflows
- **`docs/ui/`**: Documentación de componentes UI del dashboard
- **`docs/foundations/`**: Fundamentos de diseño transversales (si aplica)

### ❌ Contenido que NO va aquí

- Documentación específica de un Design System particular (ej: `sys-01`, `marketing`)
- Artefactos generados por un sistema específico
- Specs de componentes que pertenecen a un sistema registrado
- Flujo operativo diario de componentes (`components`, `_spec/components`) cuando existe contexto de sistema

## Estructura por sistema (canónica)

Cada Design System registrado tiene su propia cápsula autocontenida bajo `design-systems/<id>/`:

```
design-systems/
└── <system-id>/
    ├── input/           # Tokens JSON de entrada (DTCG)
    ├── output/          # Artefactos generados (CSS, manifests)
    │   └── .ops/        # Historial operativo (logs de operaciones)
    └── docs/            # Documentación específica del sistema
        ├── components/  # Docs de componentes del sistema
        ├── _generated/  # Artefactos generados (registry, graphs)
        └── _spec/       # Specs YAML de componentes
```

### Ventajas de esta estructura

1. **Autocontenido**: Todo lo relacionado a un sistema está en un solo lugar
2. **Borrado seguro**: Eliminar un sistema es tan simple como borrar su carpeta
3. **Sin ambigüedad**: No se mezcla documentación global con específica
4. **Multi-sistema**: Soporta múltiples sistemas coexistiendo sin conflicto

## ¿Cuándo usar docs/ raíz vs docs/ por sistema?

| Tipo de contenido                      | Ubicación                              | Ejemplo                                                 |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| Documentación transversal/global       | `docs/`                                | `docs/adr/0001-token-format.md`                         |
| Documentación de componente específico | `design-systems/<id>/docs/components/` | `design-systems/sys-01/docs/components/boton.md`        |
| Especificación de componente           | `design-systems/<id>/docs/_spec/`      | `design-systems/sys-01/docs/_spec/components/boton.yml` |
| Decisiones arquitectónicas             | `docs/adr/`                            | `docs/adr/0001-token-format.md`                         |

## Política operativa actual

- Sin fallback legacy: la ruta operativa canónica de componentes y specs es por sistema.
- Los comandos de tooling que resuelven contexto requieren sistema disponible en SQLite.
- Recomendación: pasar `--system <id>` explícitamente en automatizaciones y CI.
- Si no hay sistemas configurados, inicializa uno desde la Dashboard Systems UI y valida con `npm run ds:doctor -- --system <id>`.
