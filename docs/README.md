# Documentación de Design Systems

Este directorio contiene documentación **transversal** del Design System, no específica de un sistema particular.

## ¿Qué va aquí?

### ✅ Contenido permitido en `docs/` raíz

- **`docs/components/`**: Índice global de componentes y documentación compartida
- **`docs/_generated/`**: Artefactos generados globalmente (registros, gráficos, métricas)
- **`docs/_spec/`**: Especificaciones globales de componentes (cuando no hay un sistema registrado)
- **`docs/adr/`**: Decisiones arquitectónicas (Architecture Decision Records)
- **`docs/workflows/`**: Documentación de procesos y workflows
- **`docs/ui/`**: Documentación de componentes UI del dashboard
- **`docs/foundations/`**: Fundamentos de diseño (tipografía, color, espaciado) a nivel global

### ❌ Contenido que NO va aquí

- Documentación específica de un Design System particular (ej: `sys-01`, `marketing`)
- Artefactos generados por un sistema específico
- Specs de componentes que pertenecen a un sistema registrado

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

| Tipo de contenido | Ubicación | Ejemplo |
|------------------|-----------|---------|
| Índice global de componentes | `docs/components/` | `docs/components/overview.md` |
| Documentación de componente específico | `design-systems/<id>/docs/components/` | `design-systems/sys-01/docs/components/boton.md` |
| Registry global | `docs/_generated/` | `docs/_generated/component-registry.json` |
| Registry por sistema | `design-systems/<id>/docs/_generated/` | `design-systems/sys-01/docs/_generated/component-registry.json` |
| Especificación de componente | `design-systems/<id>/docs/_spec/` | `design-systems/sys-01/docs/_spec/components/boton.yml` |
| Decisiones arquitectónicas | `docs/adr/` | `docs/adr/0001-token-format.md` |
