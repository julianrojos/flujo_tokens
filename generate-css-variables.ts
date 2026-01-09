import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Tipo para los tokens del JSON según formato W3C Design Tokens
 */
type TokenValueType = string | number | boolean | object | null;

interface TokenValue {
  $value: TokenValueType | TokenValueType[];
  $type?: string;
  $description?: string;
}

type TokenData = {
  [key: string]: TokenData | TokenValue;
};

/**
 * Interfaz para objetos de sombra
 */
interface ShadowObject {
  type?: 'DROP_SHADOW' | 'INNER_SHADOW';
  color?: {
    r: number;
    g: number;
    b: number;
    a?: number;
  };
  offset?: {
    x: number;
    y: number;
  };
  radius?: number;
  spread?: number;
}

/**
 * Interfaz para objetos de alias de variables
 */
interface VariableAliasObject {
  type: 'VARIABLE_ALIAS';
  id?: string;
}

/**
 * Type guard para verificar si un valor es un objeto plano (no array, no null)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard para verificar si un objeto es un VariableAliasObject
 */
function isVariableAlias(value: unknown): value is VariableAliasObject {
  return isPlainObject(value) && 'type' in value && value.type === 'VARIABLE_ALIAS';
}

/**
 * Convierte un nombre a kebab-case
 */
function toKebabCase(name: string): string {
  // Reemplaza guiones existentes con espacios temporales
  let result = name.replace(/-/g, ' ');

  // Inserta guiones antes de mayúsculas (excepto al inicio)
  result = result.replace(/([a-z])([A-Z])/g, '$1-$2');

  // Convierte a minúsculas
  result = result.toLowerCase();

  // Reemplaza espacios y guiones múltiples con un solo guión
  result = result.replace(/[\s-]+/g, '-');

  // Elimina guiones al inicio y final
  result = result.replace(/^-+|-+$/g, '');

  return result;
}

/**
 * Busca un token que tenga un metadato $id que coincida con el targetId
 * Nota: Los IDs de VARIABLE_ALIAS suelen ser referencias a variables de Figma
 * que pueden no estar presentes en el JSON exportado
 */
function findTokenById(tokensData: TokenData, targetId: string, currentPath: string[] = []): string[] | null {
  if (!isPlainObject(tokensData)) {
    return null;
  }

  const keys = Object.keys(tokensData);
  for (const key of keys) {
    if (key.startsWith('$')) {
      // Verificar si es un metadato $id que coincida
      const keyValue = tokensData[key];
      if (key === '$id' && typeof keyValue === 'string' && keyValue === targetId) {
        return currentPath;
      }
      continue;
    }

    const newPath = [...currentPath, key];
    const value = tokensData[key];

    if (isPlainObject(value)) {
      // Verificar si este token tiene un $id que coincida
      if ('$id' in value && typeof value.$id === 'string' && value.$id === targetId) {
        return newPath;
      }

      // Buscar recursivamente
      const found = findTokenById(value as TokenData, targetId, newPath);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Convierte un objeto de referencia VARIABLE_ALIAS a formato W3C Design Tokens
 * Nota: Las referencias VARIABLE_ALIAS con ID necesitan resolverse a rutas de tokens.
 * En el formato W3C Design Tokens estándar, las referencias se hacen con {token.path}
 */
function processVariableAlias(
  aliasObj: unknown,
  currentPath: string[],
  tokensData?: TokenData
): string {
  // Si es un objeto con type: "VARIABLE_ALIAS", intentamos manejarlo
  if (isVariableAlias(aliasObj)) {
    // Si tiene un id, intentamos resolverlo
    if (aliasObj.id && tokensData) {
      const tokenPath = findTokenById(tokensData, aliasObj.id);
      if (tokenPath) {
        // Convertir la ruta a formato CSS variable
        const cssPath = tokenPath.map(toKebabCase).join('-');
        return `var(--${cssPath})`;
      } else {
        // No se encontró el token referenciado
        // Esto es común cuando los IDs son referencias a variables de Figma que no están en el JSON
        // Mostrar un warning informativo (no es un error, solo información)
        // El código seguirá funcionando, pero la referencia no será correcta
        console.warn(`ℹ️  Referencia VARIABLE_ALIAS en ${currentPath.join('.')} con ID: ${aliasObj.id}`);
        console.warn(`   No se pudo resolver automáticamente. Esto es normal si el ID referencia una variable de Figma no exportada en el JSON.`);
        console.warn(`   Se generará un placeholder. Para resolverlo, convierte la referencia a formato W3C: {token.path}`);
        // Generar un placeholder que no sea una referencia circular
        // Usar un nombre genérico basado en el ID para evitar auto-referencias
        let placeholderName = aliasObj.id.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        // Limpiar guiones múltiples y al inicio/final
        placeholderName = placeholderName.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        // Si después de limpiar está vacío o solo tiene guiones, usar un fallback
        if (!placeholderName || placeholderName === '-') {
          placeholderName = 'unknown';
        }
        return `var(--unresolved-${placeholderName})`;
      }
    }
    // Si no tiene ID o no hay tokensData, generar referencia genérica
    return `var(--${currentPath.map(toKebabCase).join('-')})`;
  }
  return JSON.stringify(aliasObj);
}

/**
 * Convierte un shadow object a formato CSS
 */
function processShadow(shadowObj: unknown): string {
  if (!isPlainObject(shadowObj)) {
    return JSON.stringify(shadowObj);
  }

  const shadow = shadowObj as ShadowObject;
  const type = shadow.type || 'DROP_SHADOW';
  const color = shadow.color || { r: 0, g: 0, b: 0, a: 1 };
  const offset = shadow.offset || { x: 0, y: 0 };
  const radius = shadow.radius || 0;
  const spread = shadow.spread || 0;

  // Convertir color RGBA
  // Detectar si los valores están normalizados (0-1) o en formato 0-255
  const isNormalized = (color.r || 0) <= 1 && (color.g || 0) <= 1 && (color.b || 0) <= 1;
  const r = isNormalized ? Math.round((color.r || 0) * 255) : Math.round(color.r || 0);
  const g = isNormalized ? Math.round((color.g || 0) * 255) : Math.round(color.g || 0);
  const b = isNormalized ? Math.round((color.b || 0) * 255) : Math.round(color.b || 0);
  const a = color.a !== undefined ? color.a : 1;

  const rgba = `rgba(${r}, ${g}, ${b}, ${a})`;
  const offsetX = offset.x || 0;
  const offsetY = offset.y || 0;

  if (type === 'INNER_SHADOW') {
    return `inset ${offsetX}px ${offsetY}px ${radius}px ${spread}px ${rgba}`;
  } else {
    return `${offsetX}px ${offsetY}px ${radius}px ${spread}px ${rgba}`;
  }
}

/**
 * Procesa el valor según su tipo según formato W3C Design Tokens
 * @param visitedRefs - Set de referencias visitadas para detectar ciclos
 */
function processValue(
  value: TokenValueType | TokenValueType[],
  varType?: string,
  currentPath: string[] = [],
  tokensData?: TokenData,
  visitedRefs: Set<string> = new Set()
): string {
  // Si es null o undefined
  if (value === null || value === undefined) {
    return 'null';
  }

  // Si es un array (para shadows, gradients, etc.)
  if (Array.isArray(value)) {
    if (varType === 'shadow') {
      // Procesar cada shadow y unirlos con comas
      const shadows = value.map(processShadow);
      return shadows.join(', ');
    }
    // Para otros tipos de arrays, convertirlos a JSON
    return JSON.stringify(value);
  }

  // Si es un objeto
  if (typeof value === 'object') {
    // Verificar si es una referencia VARIABLE_ALIAS
    // Nota: value ya se verificó que es un objeto (no null) en la línea anterior
    if (isVariableAlias(value)) {
      return processVariableAlias(value, currentPath, tokensData);
    }

    // Si es un objeto de referencia W3C (formato {token.path})
    // Esto se maneja como string en el JSON
    return JSON.stringify(value);
  }

  // Si es un string
  if (typeof value === 'string') {
    // Si es una referencia a otro token (formato W3C: {token.path})
    if (value.startsWith('{') && value.endsWith('}')) {
      // Convertir {token.path} a var(--token-path)
      const tokenPath = value.slice(1, -1);

      // Validar que el path no esté vacío
      if (tokenPath.trim().length === 0) {
        console.warn(`⚠️  Referencia W3C vacía encontrada en ${currentPath.join('.')}`);
        return value; // Devolver el valor original si está mal formado
      }

      // Detectar referencias circulares
      const refKey = tokenPath;
      if (visitedRefs.has(refKey)) {
        console.warn(`⚠️  Referencia circular detectada: ${refKey} en ${currentPath.join('.')}`);
        return `/* circular-ref: ${refKey} */`;
      }

      // Convertir puntos a guiones y validar el resultado
      const cssPath = tokenPath.replace(/\./g, '-');
      // Validar que el nombre resultante sea válido
      const varName = `--${cssPath}`;
      if (!isValidCssVariableName(varName)) {
        console.warn(`⚠️  Referencia W3C genera nombre inválido: ${varName} en ${currentPath.join('.')}`);
        return value; // Devolver el valor original si genera un nombre inválido
      }
      return `var(${varName})`;
    }

    // Si es un color rgba o rgb, lo mantenemos
    if (value.startsWith('rgba') || value.startsWith('rgb(')) {
      return value;
    }

    // Si es un color hexadecimal, lo mantenemos
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value)) {
      return value;
    }

    // Si el tipo es string, lo envolvemos en comillas (escapando comillas internas)
    if (varType === 'string') {
      const escapedValue = value.replace(/"/g, '\\"');
      return `"${escapedValue}"`;
    }

    return value;
  }

  // Si es un número o booleano, lo convertimos a string
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return String(value);
}

/**
 * Valida que un nombre de variable CSS sea válido
 * Según la especificación CSS, los nombres de variables personalizadas pueden contener:
 * - Letras (a-z, A-Z)
 * - Números (0-9)
 * - Guiones (-)
 * - Guiones bajos (_)
 * - Caracteres Unicode escapados
 * Pero NO pueden empezar con un número o dos guiones seguidos de un número
 */
function isValidCssVariableName(name: string): boolean {
  // Los nombres de variables CSS deben empezar con -- y seguir con letras, números, guiones o guiones bajos
  // No pueden empezar con un número después de --
  if (!name.startsWith('--')) {
    return false;
  }
  // Validar que después de -- no empiece con un número
  const afterDashes = name.slice(2);
  if (afterDashes.length === 0) {
    return false;
  }
  // No puede empezar con un número
  if (/^\d/.test(afterDashes)) {
    return false;
  }
  // Solo puede contener letras, números, guiones y guiones bajos
  return /^[a-zA-Z0-9_-]+$/.test(afterDashes);
}

/**
 * Genera variables CSS recursivamente desde el objeto JSON en formato W3C Design Tokens
 */
function generateCssVars(
  obj: TokenData,
  prefix: string = '',
  result: string[] = [],
  currentPath: string[] = [],
  tokensData?: TokenData
): string[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return result;
  }

  // Ordenar las claves para garantizar orden consistente
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    // Ignorar propiedades que empiezan con $ (metadatos del formato W3C)
    if (key.startsWith('$')) {
      continue;
    }

    const newPrefix = prefix
      ? `${prefix}-${toKebabCase(key)}`
      : toKebabCase(key);

    const newPath = [...currentPath, key];

    const value = obj[key];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Si tiene $value, es un token final según formato W3C Design Tokens
      if ('$value' in value) {
        const tokenValue = value as TokenValue;

        try {
          // Procesar el valor según su tipo (puede ser string, number, boolean, object, array)
          // IMPORTANTE: Siempre pasar tokensData (objeto raíz completo) para que findTokenById pueda buscar en todo el árbol
          const varValue = processValue(
            tokenValue.$value,
            tokenValue.$type,
            newPath,
            tokensData
          );
          const varName = `--${newPrefix}`;

          // Validar nombre de variable
          if (!isValidCssVariableName(varName)) {
            console.warn(`⚠️  Advertencia: ${varName} no es un nombre de variable CSS válido, se omite`);
            continue;
          }

          result.push(`  ${varName}: ${varValue};`);
        } catch (error) {
          console.warn(`⚠️  Advertencia: Error procesando ${newPrefix}: ${error instanceof Error ? error.message : error}`);
          continue;
        }
      } else {
        // Es un objeto anidado (grupo de tokens), continuar recursivamente
        // IMPORTANTE: Siempre pasar tokensData (objeto raíz completo) para mantener consistencia
        generateCssVars(value as TokenData, newPrefix, result, newPath, tokensData);
      }
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      // Valor primitivo directo (no es formato W3C estándar, pero lo soportamos)
      const varName = `--${newPrefix}`;

      // Validar nombre de variable
      if (!isValidCssVariableName(varName)) {
        console.warn(`⚠️  Advertencia: ${varName} no es un nombre de variable CSS válido, se omite`);
        continue;
      }

      result.push(`  ${varName}: ${value};`);
    }
  }

  return result;
}

/**
 * Extrae los nombres y valores de las variables CSS de un archivo CSS
 * Mejorado para manejar valores que pueden contener punto y coma, funciones CSS, etc.
 */
function extractCssVariables(cssContent: string): Map<string, string> {
  const variables = new Map<string, string>();

  // Buscar el bloque :root { ... }
  // Usar un enfoque más robusto que maneje llaves anidadas
  const rootStart = cssContent.indexOf(':root');
  if (rootStart === -1) {
    return variables;
  }

  // Encontrar la llave de apertura después de :root
  let braceStart = cssContent.indexOf('{', rootStart);
  if (braceStart === -1) {
    return variables;
  }

  // Encontrar la llave de cierre correspondiente (manejar llaves anidadas)
  let braceCount = 0;
  let braceEnd = braceStart;
  for (let i = braceStart; i < cssContent.length; i++) {
    if (cssContent[i] === '{') {
      braceCount++;
    } else if (cssContent[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        braceEnd = i;
        break;
      }
    }
  }

  let rootContent: string;
  if (braceCount !== 0) {
    // Llaves no balanceadas, usar método simple
    const rootMatch = cssContent.match(/:root\s*\{([\s\S]+?)\}/);
    if (!rootMatch) {
      return variables;
    }
    rootContent = rootMatch[1];
  } else {
    rootContent = cssContent.substring(braceStart + 1, braceEnd);
  }

  // Parsear variables manualmente para manejar valores complejos
  // que pueden contener punto y coma dentro de strings o funciones
  let i = 0;
  while (i < rootContent.length) {
    // Saltar espacios en blanco
    while (i < rootContent.length && /\s/.test(rootContent[i])) {
      i++;
    }

    // Buscar inicio de variable (--)
    if (i >= rootContent.length || rootContent.substring(i, i + 2) !== '--') {
      i++;
      continue;
    }

    // Extraer nombre de variable
    const nameStart = i + 2;
    let nameEnd = nameStart;
    while (nameEnd < rootContent.length && /[a-zA-Z0-9_-]/.test(rootContent[nameEnd])) {
      nameEnd++;
    }
    const name = rootContent.substring(nameStart, nameEnd);

    // Buscar dos puntos
    i = nameEnd;
    while (i < rootContent.length && /\s/.test(rootContent[i])) {
      i++;
    }
    if (i >= rootContent.length || rootContent[i] !== ':') {
      continue;
    }
    i++; // Saltar ':'

    // Extraer valor (hasta encontrar ';' que no esté dentro de strings o funciones)
    while (i < rootContent.length && /\s/.test(rootContent[i])) {
      i++;
    }

    const valueStart = i;
    let depth = 0;
    let inString = false;
    let stringChar = '';

    while (i < rootContent.length) {
      const char = rootContent[i];

      // Manejar strings
      if ((char === '"' || char === "'") && (i === 0 || rootContent[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      // Manejar paréntesis (funciones CSS)
      if (!inString) {
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
        } else if (char === ';' && depth === 0) {
          // Encontramos el final del valor
          break;
        }
      }

      i++;
    }

    const value = rootContent.substring(valueStart, i).trim();

    // Validar y agregar variable
    if (name && value && isValidCssVariableName(`--${name}`)) {
      variables.set(name, value);
    }

    i++; // Saltar ';'
  }

  return variables;
}

/**
 * Función principal
 */
function main(): void {
  try {
    const jsonPath = join(process.cwd(), 'variables.json');
    const cssPath = join(process.cwd(), 'variables.css');

    // Validar que el archivo JSON existe
    if (!existsSync(jsonPath)) {
      console.error(`❌ Error: No se encontró el archivo ${jsonPath}`);
      process.exit(1);
    }

    console.log('📖 Leyendo variables.json...');
    let fileContent: string;
    try {
      fileContent = readFileSync(jsonPath, 'utf-8');
    } catch (error) {
      console.error(`❌ Error al leer el archivo ${jsonPath}:`);
      if (error instanceof Error) {
        console.error(`   ${error.message}`);
      }
      process.exit(1);
    }

    // Leer el archivo CSS anterior si existe para comparar
    let previousVariables: Map<string, string> = new Map();
    if (existsSync(cssPath)) {
      try {
        const previousCss = readFileSync(cssPath, 'utf-8');
        previousVariables = extractCssVariables(previousCss);
        console.log(`📄 Archivo CSS anterior encontrado con ${previousVariables.size} variables`);
      } catch (error) {
        console.log('⚠️  No se pudo leer el archivo CSS anterior (se creará uno nuevo)');
      }
    }

    // Parsear JSON en formato W3C Design Tokens
    let data: { $schema?: string; Tokens?: TokenData;[key: string]: unknown };
    try {
      data = JSON.parse(fileContent);
    } catch (error) {
      // Si falla, intentar extraer solo la parte de Tokens
      const translationStart = fileContent.indexOf('"Translations"');
      if (translationStart > 0) {
        // Buscar el inicio del objeto (primera llave {)
        const firstBrace = fileContent.indexOf('{');
        const jsonContent = fileContent
          .substring(firstBrace, translationStart)
          .trim()
          .replace(/,\s*$/, '');

        // Asegurarse de que termine con }
        const cleanedContent = jsonContent.endsWith('}')
          ? jsonContent
          : `${jsonContent}\n}`;

        try {
          data = JSON.parse(cleanedContent);
        } catch (parseError) {
          console.error('❌ No se pudo parsear el JSON incluso después de limpiarlo');
          throw parseError;
        }
      } else {
        // Si no hay Translations, intentar parsear directamente
        // Puede que el JSON esté mal formado, intentar arreglarlo
        let cleaned = fileContent.trim();
        if (!cleaned.startsWith('{')) {
          cleaned = `{${cleaned}`;
        }
        if (!cleaned.endsWith('}')) {
          cleaned = `${cleaned}}`;
        }
        try {
          data = JSON.parse(cleaned);
        } catch (parseError) {
          // Si el parse del contenido limpiado también falla, lanzar el error original
          throw error;
        }
      }
    }

    // Extraer tokens según formato W3C Design Tokens
    // El formato W3C puede tener $schema y los tokens pueden estar en una propiedad específica
    // o directamente en el objeto raíz
    let tokensData: TokenData;
    if ('Tokens' in data && typeof data.Tokens === 'object' && data.Tokens !== null && !Array.isArray(data.Tokens)) {
      tokensData = data.Tokens as TokenData;
    } else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      // Los tokens están directamente en el objeto raíz
      tokensData = data as TokenData;
    } else {
      console.error('❌ Error: El JSON no contiene una estructura de tokens válida en formato W3C Design Tokens');
      process.exit(1);
    }

    // Eliminar propiedades de metadatos del formato W3C ($schema, Translations, etc.)
    if ('$schema' in tokensData) {
      delete tokensData.$schema;
    }
    if ('Translations' in tokensData) {
      delete tokensData.Translations;
    }

    console.log('🔄 Generando variables CSS desde variables.json (formato W3C Design Tokens)...');
    const cssVars = generateCssVars(tokensData, '', [], [], tokensData);

    // Extraer nombres y valores de variables nuevas
    const newVariables = new Map<string, string>();
    cssVars.forEach(line => {
      // Regex mejorado para extraer nombre y valor
      const match = line.match(/--([a-zA-Z0-9_-]+):\s*([^;]+?);/);
      if (match && match[1] && match[2]) {
        const name = match[1];
        const value = match[2].trim();
        newVariables.set(name, value);
      }
    });

    // Crear el contenido CSS completamente nuevo (sobrescribe el anterior)
    const cssContent = `:root {\n${cssVars.join('\n')}\n}\n`;

    // Escribir el archivo (sobrescribe completamente)
    writeFileSync(cssPath, cssContent, 'utf-8');

    // Mostrar resumen de cambios
    console.log(`\n✅ Archivo variables.css regenerado completamente`);
    console.log(`   📊 Total de variables: ${cssVars.length}`);

    if (previousVariables.size > 0) {
      // Encontrar variables eliminadas
      const removedVariables: string[] = [];
      previousVariables.forEach((value, name) => {
        if (!newVariables.has(name)) {
          removedVariables.push(name);
        }
      });

      // Encontrar variables nuevas
      const addedVariables: string[] = [];
      newVariables.forEach((value, name) => {
        if (!previousVariables.has(name)) {
          addedVariables.push(name);
        }
      });

      // Encontrar variables modificadas (mismo nombre, diferente valor)
      const modifiedVariables: Array<{ name: string; oldValue: string; newValue: string }> = [];
      newVariables.forEach((newValue, name) => {
        if (previousVariables.has(name)) {
          const oldValue = previousVariables.get(name)!;
          if (oldValue !== newValue) {
            modifiedVariables.push({ name, oldValue, newValue });
          }
        }
      });

      if (removedVariables.length > 0) {
        console.log(`   🗑️  Variables eliminadas: ${removedVariables.length}`);
        if (removedVariables.length <= 10) {
          removedVariables.forEach(name => {
            console.log(`      - --${name}`);
          });
        } else {
          removedVariables.slice(0, 10).forEach(name => {
            console.log(`      - --${name}`);
          });
          console.log(`      ... y ${removedVariables.length - 10} más`);
        }
      }

      if (addedVariables.length > 0) {
        console.log(`   ➕ Variables añadidas: ${addedVariables.length}`);
        if (addedVariables.length <= 10) {
          addedVariables.forEach(name => {
            console.log(`      + --${name}`);
          });
        } else {
          addedVariables.slice(0, 10).forEach(name => {
            console.log(`      + --${name}`);
          });
          console.log(`      ... y ${addedVariables.length - 10} más`);
        }
      }

      if (modifiedVariables.length > 0) {
        console.log(`   🔄 Variables modificadas: ${modifiedVariables.length}`);
        if (modifiedVariables.length <= 10) {
          modifiedVariables.forEach(({ name, oldValue, newValue }) => {
            console.log(`      ~ --${name}`);
            console.log(`        Antes: ${oldValue}`);
            console.log(`        Ahora: ${newValue}`);
          });
        } else {
          modifiedVariables.slice(0, 10).forEach(({ name, oldValue, newValue }) => {
            console.log(`      ~ --${name}`);
            console.log(`        Antes: ${oldValue}`);
            console.log(`        Ahora: ${newValue}`);
          });
          console.log(`      ... y ${modifiedVariables.length - 10} más`);
        }
      }

      if (removedVariables.length === 0 && addedVariables.length === 0 && modifiedVariables.length === 0) {
        console.log(`   ✓ Sin cambios (todas las variables se mantienen igual)`);
      }
    }

    console.log(`\n📝 Archivo guardado en: ${cssPath}`);
  } catch (error) {
    console.error('❌ Error al generar variables CSS:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error(`   ${error.stack}`);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Ejecutar el script
main();

