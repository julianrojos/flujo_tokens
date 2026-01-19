# Generador de Custom Properties CSS

CLI en TypeScript que convierte tokens JSON (DTCG) en variables CSS listadas en `:root`.

## Requisitos

- Node.js 16+
- npm o yarn

## Instalación

```bash
npm install
```

## Scripts Disponibles

- **`npm run generate`**: Ejecuta el pipeline completo (Ingesta -> Indexación -> Análisis -> Emisión) para generar `custom-properties.css`.
- **`npm run watch`**: Ejecuta el generador en modo observación, regenerando los archivos ante cambios en la carpeta `src`.

## Uso

1. Coloca tus archivos JSON de tokens (exportados de Figma/Token Forge) en la carpeta `input/`.
2. Ejecuta `npm run generate`.
3. El archivo CSS resultante se generará en `output/custom-properties.css`.

Entradas fijas en `input/`; salida en `output/custom-properties.css`.

## Arquitectura y Pipeline

El sistema opera en 4 fases secuenciales:

1.  **Ingesta (`src/core/ingest.ts`)**: Lee y sanitiza los archivos JSON desde `input/`.
2.  **Indexación (`src/core/indexing.ts`)**: Crea mapas de búsqueda y resuelve referencias cruzadas.
3.  **Análisis (`src/core/analyze.ts`)**: Detecta ciclos y valida la integridad de los datos.
4.  **Emisión (`src/core/emit.ts`)**: Genera el CSS final en `:root`.

## Estructura del Proyecto

- `src/cli`: Punto de entrada de la línea de comandos (`index.ts`).
- `src/core`: Lógica principal del pipeline (Ingest, Index, Analyze, Emit).
- `src/runtime`: Gestión del estado, configuración y contexto de ejecución.
- `src/utils`: Utilidades de strings, regex y validación.
- `src/types`: Definiciones de tipos TypeScript.

## Configuración

El comportamiento se puede ajustar mediante variables de entorno:

- `ALLOW_JSON_REPAIR=true` (default: false): Intenta reparar errores de sintaxis comunes en los JSON de entrada (ej. comas sobrantes) para evitar que falle el proceso.

Ejemplo:

```bash
ALLOW_JSON_REPAIR=true npm run generate
```

## Solución de problemas

- `--unresolved-*`: el token referenciado no existe o el nombre no coincide.
- Errores de parseo: valida los JSON en `input`; con `ALLOW_JSON_REPAIR=true` se intentan reparaciones básicas.

## Referencias

- Plugin Figma: [Token Forge](https://www.figma.com/community/plugin/1560757977662930693/token-forge)
