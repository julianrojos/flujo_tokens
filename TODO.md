# ERRORES

## Chat GPT

- Los nombres de variables CSS se construyen sin prefijo ni taxonomía (-- + nombre de archivo + ruta), contrario al prefijo/tier recomendado (--ds-...). Ver strings.ts (lines 33-52) (no añade --ds-) y el uso en la emisión index.ts (lines 228-246).

### Ocurren porque vienen "mal" en el json mismo

- Tipografía con $type: "string" en lugar de tipos DTCG (fontFamily, fontWeight o tokens compuestos typography), lo que reduce interoperabilidad y validación. Ej.: Typographyprimitives.json:7,34,142 y typography.json:7,22. ( -> .)
- Naming fuera de kebab-case y con mayúsculas: claves como widthS, radiusXxxl, semanticPrimary500, Colorprimitives y los propios modeMode1/modeDefault violan la convención kebab-case y prefijos claros. Ejemplos: border.json (lines 1-8), radius.json (line 4), colors.json (line 827), referencias {Numberprimitives.1} en border.json (line 5).

### Done

- Theming/modes no siguen el patrón [data-theme="..."]: los tokens usan ramas modeMode1/modeDefault en todos los JSON (ej. Colorprimitives.json (line 4), spacing.json (line 4)) y luego se emiten todos en un único :root (index.ts (lines 244-246)), lo que impide overrides por tema/brand como sugiere el skill.
- Escalas en px en lugar de rem para web (responsiveness): todos los primitives numéricos están en px (Numberprimitives.json (lines 4-120)), igual tamaños de texto/line-height (Typographyprimitives.json (lines 142-220)), lo que contradice la guía de usar rem salvo justificación.

---

## Gemini

- Nomenclatura CSS: Las variables actuales incluyen el nombre del archivo fuente (e.g., --colorprimitives-...) y son bastante largas. Podríamos simplificarlas usando el prefijo --ds-.
- Arquitectura: Aunque hay una separación básica, podríamos fortalecer la capa Semántica para facilitar temas (Light/Dark).
- Line-height: Actualmente se están generando con px en el CSS, cuando el skill recomienda valores unitless.

# SUGERENCIAS

- Prefijo configurable para las CSS vars: permite definir un prefijo (p.ej. --ds-) en la CLI o config, y prepéndelo en la emisión sin renombrar los JSON. Así evitas colisiones y sigues las recomendaciones de naming.
- Add logic to use Figma scopes to improve $type when it is generically set to "string" (e.g., set to fontFamily if scope is FONT_FAMILY).
