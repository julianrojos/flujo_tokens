# Generador de Custom Properties CSS

CLI en TypeScript que convierte tokens JSON (DTCG) en variables CSS listadas en `:root`.

## Requisitos
- Node.js 16+
- npm o yarn

## Instalación
```bash
npm install
```

## Uso rápido
- Generar: `npm run generate`
- Watch: `npm run watch`

Entradas fijas en `input/`; salida en `output/custom-properties.css`.

## Qué hace
- Lee y combina `input/*.json` (acepta exports con raíz `Tokens`), limpia `$schema` y `Translations`.
- Convierte nombres a kebab-case y usa el nombre del archivo como namespace (`spacing.json` → `--spacing-*`).
- Resuelve referencias `{path.to.token}` y `VARIABLE_ALIAS`; si fallan, emite `--unresolved-<id>`.
- Aplana valores complejos (p.ej., arrays de sombras) y genera el bloque `:root`.
- Compara contra la ejecución anterior e imprime diff de variables nuevas, eliminadas y modificadas.
- Muestra resumen: total de tokens, referencias no resueltas, colisiones de nombres, límite de profundidad alcanzado.

## Configuración rápida
- Reparación de JSON: desactivada por defecto. Actívala con `ALLOW_JSON_REPAIR=true npm run generate` para intentar arreglar exports mal formados.

## Solución de problemas
- `--unresolved-*`: el token referenciado no existe o el nombre no coincide.
- Errores de parseo: valida los JSON en `input`; con `ALLOW_JSON_REPAIR=true` se intentan reparaciones básicas.

## Referencias
- Plugin Figma: [Token Forge](https://www.figma.com/community/plugin/1560757977662930693/token-forge)
