# Generador de Custom Properties CSS

Este proyecto contiene un script TypeScript que genera custom properties de CSS a partir de los tokens definidos en `FigmaJsons`.

## 📋 Requisitos

- Node.js (versión 16 o superior)
- npm o yarn

## 🚀 Instalación

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

## ▶️ Ejecución

Una vez instaladas las dependencias, puedes ejecutar el script de las siguientes maneras:

### Opción 1: Usando el script npm (recomendado)

```bash
npm run generate
```

### Opción 2: Usando tsx directamente

```bash
npx tsx generate-css-variables.ts
```

### Opción 3: Modo watch (regenera automáticamente al cambiar variables.json)

```bash
npm run watch
```

## 📁 Archivos

- `variables.json` - Archivo de entrada con los tokens de diseño
- `variables.css` - Archivo de salida con las custom properties CSS generadas
- `generate-css-variables.ts` - Script TypeScript que procesa el JSON y genera el CSS

## 🔧 Funcionamiento

El script:

1. Lee el archivo `variables.json`
2. Procesa la estructura de tokens (excluyendo la sección "Translations")
3. Convierte los nombres a kebab-case para las variables CSS
4. Genera custom properties en el selector `:root`
5. Guarda el resultado en `variables.css`

## 📝 Ejemplo de uso

Después de ejecutar el script, puedes usar las variables CSS generadas en tu código:

```css
.button-primary {
  background-color: var(--button-primary-default-bg-default);
  color: var(--button-primary-default-foreground-default);
  border-radius: var(--button-radius);
  padding: var(--button-padding-v) var(--button-padding-h);
}
```

## 🐛 Solución de problemas

Si encuentras errores al ejecutar el script:

1. Verifica que `variables.json` tenga un formato JSON válido
2. Asegúrate de tener Node.js instalado: `node --version`
3. Reinstala las dependencias: `rm -rf node_modules package-lock.json && npm install`

## Notas:
- Plugin: TokensBrücke
- https://github.com/julianrojos/flujo_tokens

