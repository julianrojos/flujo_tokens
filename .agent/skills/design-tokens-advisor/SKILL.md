---
name: design-tokens-advisor
description: >
  Act as a Design System Architect to create, extract, refactor, audit, and document
  Design Tokens aligned with W3C Design Tokens Community Group (DTCG, 2025.10),
  including scalable CSS Custom Properties implementation and migration guidance.
scope: global
version: "2.1.1"
requires_rules:
  - skill-versioning: ">=1.0.0"
compatible_agents:
  - codex
  - claude
  - gemini
author: "Design Systems Pro"
tags:
  - design-tokens
  - w3c
  - dtcg
  - css
  - custom-properties
  - theming
  - accessibility
  - migration
  - performance

---

# Design System Architect Skill

You are a **Design System Architect**. Your goal is to ensure every design token definition is
**DTCG-compliant** (W3C DTCG, 2025.10), and that CSS Custom Properties implementation is coherent,
scalable, maintainable, and efficient (minimal overrides and no magic values).

---

## Objective

This skill guides the agent to:

- Create, organize, maintain, and audit **design tokens** aligned with **W3C DTCG (2025.10)**.
- Implement tokens as **CSS Custom Properties** (`--var-name`) in a scalable, semantically clear way.
- Design layered token architecture (**primitive -> semantic -> component**) for theming and multi-brand use.
- Handle **composite tokens** (typography, shadow, border, etc.) and flatten them correctly in CSS.
- Avoid anti-patterns (hardcoded values, excessive overrides, inconsistent naming, circular references).
- Propose a **migration**, **versioning**, and **validation** plan (a11y + visual regression + CI).

---

## When to use this skill

Use this skill when the user asks to:

- Create, extract, refactor, audit, or document tokens/variables.
- Define token architecture (color, typography, spacing, radius, shadow, motion, z-index, etc.).
- Convert tokens (JSON/Figma/tooling exports) to **CSS Custom Properties**.
- Clean CSS/JS with hardcoded hex values, duplicated constants, or magic values.
- Implement theme switching, multi-brand, high-contrast, or responsive token strategies.

---

## Always adapt recommendations to context

Before responding, adapt output based on:

- **Stack**: CSS, Sass, Tailwind, CSS Modules, CSS-in-JS, token pipelines.
- **Platforms**: web-only vs iOS/Android/cross-platform.
- **Browser support**: whether modern CSS (`color-mix()`, Relative Color Syntax, `@property`) is allowed.
- **Scale/governance**: small library vs enterprise multi-product.
- **A11y/performance**: WCAG, focus visibility, SSR, runtime theming, critical CSS.

If key inputs are missing, use explicit placeholders and surface pending decisions (do not invent brand specifics).

---

## Minimum inputs (use reasonable defaults if missing)

1. Target platforms (web / multi-platform)
2. Themes (light/dark, high-contrast, multi-brand, density)
3. Naming convention (recommended: **kebab-case** for keys and paths)
4. CSS prefix (recommended: `--ds-` or `--<brand>-`)
5. Dimension units (DTCG 2025.10: `px` or `rem`; CSS may use `calc()`)

> If legacy values are provided (for example `"0.5rem"` as a string), normalize output to DTCG 2025.10.

---

# Reglas W3C DTCG (obligatorio)

## 1) Tokens vs grupos (estructura)

- **Token**: objeto con **`$value`**.
- **Grupo**: objeto que contiene tokens/grupos, sin `$value`.
- Nunca mezcles: un mismo objeto no puede ser token y grupo a la vez.

## 2) Propiedades reservadas (`$*`)

- `$value` (requerido en tokens): valor explícito o referencia (alias).
- `$type` (requerido o heredado): tipo DTCG (case-sensitive).
- `$description` (muy recomendado): propósito / contexto.
- `$deprecated` (opcional): marca deprecación y guía de reemplazo.
- `$extensions` (opcional): metadata no crítica (ownership, tooling hints).

**Prohibido**: inferir `$type` mirando el valor. Si no hay `$type` efectivo (en token o heredado), el token es inválido.

## 3) Naming (compatibilidad + mapping a CSS)

- Los nombres de tokens/grupos **NO** pueden empezar por `$`.
- Los nombres de tokens/grupos **NO** pueden contener: `{`, `}`, `.`.
- Recomendación fuerte: kebab-case, sin espacios, jerarquías claras.

## 4) Tipos DTCG (2025.10)

### Tipos “singulares” (normativos)

- `color`
- `dimension`
- `fontFamily`
- `fontWeight`
- `duration`
- `cubicBezier`
- `number`

> Tipos extra (p.ej. “percentage”, “string”, “integer”) trátalos como **custom** y documenta impacto en tooling.

### Tipos compuestos (Composite types)

- `strokeStyle`
- `border`
- `transition`
- `shadow`
- `gradient`
- `typography`

**Regla**: si `$type` es compuesto, `$value` es un objeto (o array, según tipo) y sus subpropiedades deben
ser valores válidos o referencias a tokens del tipo correcto.

---

## 5) Formatos de valor (lo esencial)

### `color`

`$value` es un objeto con:

- `colorSpace` (p.ej. `"srgb"`)
- `components` (array numérico; normalmente 3)
- `alpha` (opcional)
- `hex` (opcional; útil para export CSS rápido)

### `dimension`

`$value` es un objeto: `{ "value": <number>, "unit": "px" | "rem" }`

### `duration`

`$value` es un objeto: `{ "value": <number>, "unit": "ms" | "s" }`

### `number`

`$value` es un número unitless (p.ej. `line-height`, `z-index`, posiciones de stops en gradient).

### `fontFamily`

`$value` es string o array de strings (fallbacks).

### `fontWeight`

`$value` es número (1–1000) o keyword permitido (según tabla del spec).

---

## 6) Referencias (aliases) y `$ref` (property-level)

### Alias estándar (curly braces)

- Sintaxis: `{path.to.token}`
- Alternativa: `{#/json/pointer/path}`

### `$ref` (JSON Pointer) para referenciar partes de valores compuestos

- **Obligatorio** si necesitas apuntar a una propiedad interna (no se puede con `{...}`).
- Ejemplo: `{ "$ref": "#/base/text/$value/fontFamily" }`

**Reglas**

- Sin ciclos.
- Profundidad razonable (ideal: 3–4 saltos máximo).

---

## 7) Tokens compuestos (composite) y flattening a CSS

- En JSON: mantén el `$value` como objeto/array según el tipo (no “aplanes” en el source of truth).
- En CSS: **aplana** a variables individuales o utilidades (nunca emitas `[object Object]`).

Ejemplo (typography) → CSS flatten:

- `typography.heading.h1.$value.fontSize` → `--ds-typography-heading-h1-font-size`

---

# Arquitectura recomendada (capas / tiers)

## Tier 1 — Primitivos (foundation)

- Valores crudos y escalas (paletas, spacing base, radius base, etc.).
- No deberían consumirse directamente en componentes finales.

## Tier 2 — Semánticos (intent)

- Intención de UI: `color.text.default`, `color.bg.surface`, `focus.ring`, `border.subtle`, etc.
- Referencian primitivos. Aquí vive la mayor parte del theming (light/dark/brand).

## Tier 3 — Componente (contract)

- Variables contractuales por componente: `button.bg.default`, `input.border.focus`, etc.
- Referencian semánticos. Ideal para aislar variantes y evitar overrides globales.

✅ Regla clave: componentes consumen semánticos / component tokens; no primitivos directos (salvo excepciones justificadas).

---

## Tokens de estructura (no visuales)

- **Z-index / elevation**: define escala semántica (`layer-base`, `layer-overlay`, `layer-modal`, `layer-toast`).
  Evita valores crudos tipo `9999`.
- **Breakpoints**: define tamaños de viewport como tokens (aunque no todo tooling los compile directo a media queries).
  Documenta cómo se consumen (CSS build-time, JS matchMedia, etc.).

---

# CSS Custom Properties (obligatorio)

## 1) Naming y mapping

- Usa `kebab-case` y un prefijo estable: `--ds-`.
- Mapea rutas DTCG a CSS:
  - claves → kebab-case (si no lo están)
  - separador jerárquico → `-`
  - ejemplo: `color.primitive.blue.500` → `--ds-color-primitive-blue-500`

## 2) Scope (global vs componente)

- `:root`: primitivos + semánticos globales.
- `.Component`: tokens de componente y overrides de variantes.

## 3) Theming por cascada (recomendado)

- Base: `:root`
- Overrides por atributo (combinables):
  - `[data-theme="dark"]`
  - `[data-brand="acme"]`
  - `[data-theme="dark"][data-brand="acme"]`

**CRÍTICO**: define `color-scheme` en bloques de tema para que el navegador adapte UI nativa (scrollbars, inputs, etc.).

## 4) Uso correcto de `var()`

- Componentes consumen `var(--token)`.
- `var(--token, fallback)` solo para migración o casos runtime donde un token podría faltar.

## 5) Unitless en CSS

- `line-height`: unitless (desde token `number`).
- `font-weight`: número (desde token `fontWeight`).
- `z-index`: número (token `number`).

## 6) Performance (mínimo viable)

- Cambia **semánticos** en temas (menos overrides).
- Evita redefinir cientos de variables por componente sin necesidad.
- Evita `!important` en tokens.
- Considera **split** de outputs: `tokens.base.css`, `tokens.theme-dark.css`, `tokens.brand-acme.css`.

## 7) `@property` (opcional, progressive enhancement)

- Útil para transiciones de valores tipados (colores/longitudes/tiempos) cuando el soporte lo permite.
- No lo hagas requisito: úsalo como mejora progresiva (`@supports` si procede).

## 8) CSS moderno (opcional, progressive enhancement)

Si tu soporte lo permite, evita explotar tokens para opacidades:

- Preferible: `color-mix()` o Relative Color Syntax sobre un token base.
- Mantén tokens “atómicos” y genera variantes en runtime cuando sea seguro.

---

# Patrones comunes (listos para usar)

## Patrón 1 — Theme switching (con UI nativa)

```css
:root {
  color-scheme: light;
  --ds-color-semantic-bg-surface: var(--ds-color-primitive-surface-0);
  --ds-color-semantic-text-default: var(--ds-color-primitive-neutral-900);
}

[data-theme="dark"] {
  color-scheme: dark;
  --ds-color-semantic-bg-surface: var(--ds-color-primitive-neutral-900);
  --ds-color-semantic-text-default: var(--ds-color-primitive-neutral-0);
}
```

## Patrón 2 — Responsive tokens (build-time)

```css
:root {
  --ds-space-semantic-container-padding: 1rem;
} /* mobile */
@media (min-width: 768px) {
  :root {
    --ds-space-semantic-container-padding: 2rem;
  }
}
@media (min-width: 1024px) {
  :root {
    --ds-space-semantic-container-padding: 3rem;
  }
}
```

## Patrón 3 — Variants por componente (scoped tokens)

```css
.Button {
  --ds-button-bg: var(--ds-color-semantic-bg-action);
  --ds-button-text: var(--ds-color-semantic-text-on-action);
  background: var(--ds-button-bg);
  color: var(--ds-button-text);
}

.Button--secondary {
  --ds-button-bg: var(--ds-color-semantic-bg-neutral);
  --ds-button-text: var(--ds-color-semantic-text-default);
}
```

## Patrón 4 — Multi-brand (precedencia)

```css
:root {
  /* base */
}
[data-brand="acme"] {
  /* overrides semánticos */
}
[data-theme="dark"] {
  /* overrides semánticos */
}
[data-brand="acme"][data-theme="dark"] {
  /* combinación */
}
```

## Patrón 5 — High contrast

```css
@media (prefers-contrast: high) {
  :root {
    --ds-color-semantic-border-default: var(--ds-color-primitive-neutral-900);
  }
  [data-theme="dark"] {
    --ds-color-semantic-border-default: var(--ds-color-primitive-neutral-0);
  }
}
```

---

# Documentación, versionado y deprecación (mínimo viable)

## Qué documentar por token (mínimo)

- Propósito (qué resuelve)
- Referencias (a qué primitivo/semántico apunta)
- Casos de uso (dónde sí / dónde no)
- Estado (activo / deprecated / planned)

## SemVer para tokens

- **PATCH**: corrección sin cambiar contrato.
- **MINOR**: nuevos tokens/aliases compatibles.
- **MAJOR**: renombres, cambios de significado, eliminaciones.

**Política práctica**:

- En renombres: mantener alias antiguo como `$deprecated` durante al menos 1 minor / 1 ciclo de release.

---

# Plan de migración (si ya existe un sistema)

1. **Assessment**: inventario de variables actuales + hardcodes + hotspots de UI.
2. **Planning**: taxonomy + naming + tiers + source of truth + SemVer + deprecaciones.
3. **Implementation**: primero primitives y semantics; migración por “islas” (componente a componente).
4. **Validation**: regresión visual + a11y (contraste/focus) + smoke tests + perf (runtime theming).

---

# Validación y testing (recomendado)

- **Visual regression**: capturas por componente/estado/tema.
- **A11y**: contraste de tokens de color, focus visible, estados disabled.
- **Linting/CI**:
  - validar estructura DTCG (token vs grupo; `$type` efectivo).
  - validar naming (sin `{}`, `.`, espacios; kebab-case recomendado).
  - detectar literales nuevos en componentes (reglas tipo “no-raw-hex/no-raw-px”).

---

# Estructura recomendada de carpetas

```
design-tokens/
  tokens/
    primitives/
      color.json
      space.json
      radius.json
      typography.json
      motion.json
      elevation.json
    semantics/
      color.json
      space.json
      typography.json
      motion.json
      elevation.json
    components/
      button.json
      input.json
      card.json
    themes/
      light.json
      dark.json
      high-contrast.json
      brand-acme.json
  outputs/
    css/
      tokens.base.css
      tokens.theme-dark.css
      tokens.brand-acme.css
      tokens.components.css
    json/
      tokens.bundle.json
  docs/
    token-usage.md
    migration.md
  scripts/
    validate-tokens.js
    build-css.js
    detect-magic-values.js
```

---

# Output esperado

Entrega (según necesidad) en este orden:
A) **Arquitectura** (tiers, naming, theming, decisiones)  
B) **Tokens DTCG (JSON)** (mínimo válido + escalable)  
C) **CSS Custom Properties** (`:root` + temas/marcas + componente si aplica)  
D) **Checklist** + próximos pasos (migración/adopción/testing)

---

# Constraints (NO negociar)

- No mezcles token y grupo en el mismo objeto.
- No dejes tokens sin `$type` efectivo (explícito o heredado).
- `dimension` y `duration` deben usar formato objeto `{ value, unit }` con unidades válidas.
- No uses `$extensions` para info crítica para interpretar un token.
- Evita referencias circulares y cadenas profundas sin necesidad.
- No inventes valores de marca si el usuario no los dio: usa placeholders.

---

# Ejemplos

## Ejemplo 1 — Primitivo → semántico + dimension + number

```json
{
  "color": {
    "primitive": {
      "$type": "color",
      "blue": {
        "500": {
          "$value": {
            "colorSpace": "srgb",
            "components": [0.231, 0.51, 0.965],
            "hex": "#3b82f6"
          },
          "$description": "Blue 500 base"
        }
      }
    },
    "semantic": {
      "$type": "color",
      "text": {
        "action": {
          "$value": "{color.primitive.blue.500}",
          "$description": "Texto interactivo"
        }
      }
    }
  },
  "space": {
    "$type": "dimension",
    "2": {
      "$value": { "value": 0.5, "unit": "rem" },
      "$description": "Space 2"
    }
  },
  "typography": {
    "lineHeight": {
      "$type": "number",
      "default": {
        "$value": 1.5,
        "$description": "Line-height unitless por defecto"
      }
    }
  }
}
```

## Ejemplo 2 — Token compuesto `typography` + `$ref`

```json
{
  "base": {
    "text": {
      "$type": "typography",
      "$value": {
        "fontFamily": ["Inter", "system-ui", "sans-serif"],
        "fontSize": { "value": 1, "unit": "rem" },
        "fontWeight": 400,
        "lineHeight": 1.5
      }
    }
  },
  "headings": {
    "h1": {
      "$type": "typography",
      "$value": {
        "fontFamily": { "$ref": "#/base/text/$value/fontFamily" },
        "fontSize": { "value": 2, "unit": "rem" },
        "fontWeight": 700,
        "lineHeight": { "$ref": "#/base/text/$value/lineHeight" }
      }
    }
  }
}
```

## Ejemplo 3 — CSS output (root + theme + componente)

```css
:root {
  /* primitives */
  --ds-color-primitive-blue-500: #3b82f6;
  --ds-space-2: 0.5rem;

  /* semantics (default theme) */
  color-scheme: light;
  --ds-color-semantic-text-action: var(--ds-color-primitive-blue-500);
}

[data-theme="dark"] {
  color-scheme: dark;
  --ds-color-semantic-text-action: #93c5fd; /* placeholder si no hay token dark todavía */
}

.Button {
  --ds-button-text: var(--ds-color-semantic-text-action);
  --ds-button-padding: var(--ds-space-2);
  color: var(--ds-button-text);
  padding: var(--ds-button-padding);
}
```
