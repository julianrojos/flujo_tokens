# Generador de Custom Properties CSS

Este proyecto contiene un script TypeScript que genera custom properties de CSS a partir de los tokens definidos en `FigmaJsons` desde Figma en un json compatible con el estándar W3C (DTCG).

## Requisitos

- Node.js (versión 16 o superior)
- npm o yarn

## Instalación

Primero, instala las dependencias del proyecto:

```bash
npm install
```

Si encuentras problemas de permisos con npm, puedes intentar:

```bash
npm install --legacy-peer-deps
```

O usar yarn:

```bash
yarn install
```

## Ejecución

Una vez instaladas las dependencias, puedes ejecutar el script de las siguientes maneras:

### Opción 1: Usando el script npm (recomendado)

```bash
npm run generate
```

### Opción 2: Usando tsx directamente

```bash
npx tsx generate-css-variables.ts
```

### Opción 3: Modo watch (regenera automáticamente al cambiar archivos en FigmaJsons)

```bash
npm run watch
```

## Archivos

- `FigmaJsons/*.json` - Archivos de entrada con los tokens de diseño
- `src/variables.css` - Archivo de salida con las custom properties CSS generadas
- `generate-css-variables.ts` - Script TypeScript que procesa el JSON y genera el CSS

## Funcionamiento

El script:

1. Lee y combina todos los JSON dentro de `FigmaJsons`
2. Procesa la estructura de tokens (excluyendo metadatos como `Translations`)
3. Convierte los nombres a kebab-case para las variables CSS
4. Resuelve referencias W3C y `VARIABLE_ALIAS` cuando es posible
5. Genera custom properties en el selector `:root`
6. Guarda el resultado en `src/variables.css` y reporta cambios respecto al archivo anterior

## Características avanzadas

- ** Auto-reparación de JSON**: Intenta corregir automáticamente JSONs malformados exportados por plugins de Figma (comas extra, cierres faltantes).
- ** Reporte de Cambios (Changelog)**: Al ejecutar, muestra un diff detallado en consola de las variables nuevas, eliminadas o modificadas respecto a la ejecución anterior.
- ** Soporte de Referencias W3C**: Resuelve referencias cruzadas como `{colors.primary.500}` y alias de variables Figma.
- ** Tokens Complejos**: Aplana automáticamente arrays de sombras (`box-shadow`) y otros valores complejos a sintaxis CSS válida.

## Estructura de Tokens y Naming

El script utiliza el **nombre del archivo JSON** como espacio de nombres (namespace) para evitar colisiones.

**Convención:** `--<nombre-archivo>-<ruta-token>`

**Ejemplo:**
Si tienes un archivo `spacing.json` con:

```json
{
  "small": {
    "$value": "8px",
    "$type": "dimension"
  },
  "card-padding": {
    "$value": "{spacing.small}",
    "$type": "dimension"
  }
}
```

**Generará:**

```css
:root {
  /* Prefijo 'spacing' viene del nombre del archivo 'spacing.json' */
  --spacing-small: 8px;
  --spacing-card-padding: 8px; /* Referencia resuelta */
}
```

## Funcionamiento Interno

1. **Lectura**: Escanea `FigmaJsons/` y combina todos los archivos.
2. **Sanitización**: Limpia metadatos innecesarios (`Translations`, `$schema`).
3. **Resolución**:
   - Resuelve alias W3C `{token.path}`.
   - Resuelve `VARIABLE_ALIAS` de Figma.
   - Si un alias falla, genera una variable `--unresolved-<id>` para facilitar la depuración.
4. **Generación**: Escribe `src/variables.css`.
5. **Auditoría**: Compara con el CSS anterior y reporta el delta (cambios).

## Solución de problemas

### Si encuentras errores al ejecutar el script:

1. Verifica que los JSON en `FigmaJsons` tengan un formato JSON válido
2. Asegúrate de tener Node.js instalado: `node --version`
3. Reinstala las dependencias: `rm -rf node_modules package-lock.json && npm install`

### Si fallan alias o referencias:

- **`--unresolved-...`**: Significa que el script no encontró el token referenciado. Verifica que el archivo JSON que contiene la definición exista en `FigmaJsons/` y que el nombre coincida.
- **Errores JSON**: El script intenta repararlos, pero si el formato es muy inválido, usa un linter de JSON para corregir el archivo fuente.

## Herramientas internas

- Skill de asesoría de design tokens: `.agent/skills/design-tokens-advisor/SKILL.md` (name: `design-system-architect`)

## Notas:

- Plugin empleado para convertir variables de Figma a JSON: [TokensBrücke](https://www.figma.com/community/plugin/1254538877056388290/tokensbrucke)
- Repositorio: https://github.com/julianrojos/flujo_tokens
