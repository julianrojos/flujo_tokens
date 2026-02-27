---
name: design-tokens-advisor
description: >
  Act as a Design System Architect to create, extract, refactor, audit, and document
  Design Tokens aligned with W3C Design Tokens Community Group (DTCG, 2025.10),
  including scalable CSS Custom Properties implementation and migration guidance.
scope: global
version: "2.1.1"
context:
  doc_type: skills
  stage: skills
compatible_agents:
  - codex
  - claude
  - gemini
inputs:
  - name: task
    type: enum
    required: true
    description: "Primary task type: 'create', 'audit', 'refactor', 'migrate', or 'document'."
    values:
      - create
      - audit
      - refactor
      - migrate
      - document
  - name: target_platforms
    type: string
    required: false
    default: "web"
    description: "Target platforms for token output (e.g. 'web', 'web,ios', 'web,android')."
  - name: themes
    type: string
    required: false
    description: "Comma-separated theme modes to support (e.g. 'light,dark', 'light,dark,high-contrast')."
  - name: token_source
    type: path
    required: false
    description: "Path to existing token file(s) to audit or refactor (JSON, CSS, or Figma export)."
  - name: stack
    type: string
    required: false
    description: "CSS stack in use (e.g. 'css', 'sass', 'tailwind', 'css-modules', 'css-in-js')."
outputs:
  - name: report
    type: report
    description: "Architecture analysis, recommendations, migration plan, or documentation output depending on the task type."
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

# W3C DTCG Rules (required)

## 1) Tokens vs groups (structure)

- **Token**: an object with **`$value`**.
- **Group**: an object that contains tokens/groups, without `$value`.
- Never mix: the same object cannot be both a token and a group.

## 2) Reserved properties (`$*`)

- `$value` (required in tokens): explicit value or reference (alias).
- `$type` (required or inherited): DTCG type (case-sensitive).
- `$description` (strongly recommended): purpose/context.
- `$deprecated` (optional): deprecation marker and replacement guidance.
- `$extensions` (optional): non-critical metadata (ownership, tooling hints).

**Forbidden**: inferring `$type` from the value. If there is no effective `$type` (explicit or inherited), the token is invalid.

## 3) Naming (compatibility + CSS mapping)

- Token/group names **MUST NOT** start with `$`.
- Token/group names **MUST NOT** contain `{`, `}`, `.`.
- Strong recommendation: kebab-case, no spaces, clear hierarchies.

## 4) DTCG types (2025.10)

### Singular types (normative)

- `color`
- `dimension`
- `fontFamily`
- `fontWeight`
- `duration`
- `cubicBezier`
- `number`

> Extra types (for example, "percentage", "string", "integer") should be treated as **custom** and their tooling impact should be documented.

### Composite types

- `strokeStyle`
- `border`
- `transition`
- `shadow`
- `gradient`
- `typography`

**Rule**: if `$type` is composite, `$value` is an object (or an array, depending on the type) and its subproperties must be valid values or references to tokens of the correct type.

---

## 5) Value formats (essentials)

### `color`

`$value` is an object with:

- `colorSpace` (p.ej. `"srgb"`)
- `components` (numeric array; typically 3)
- `alpha` (opcional)
- `hex` (optional; useful for quick CSS export)

### `dimension`

`$value` is an object: `{ "value": <number>, "unit": "px" | "rem" }`

### `duration`

`$value` is an object: `{ "value": <number>, "unit": "ms" | "s" }`

### `number`

`$value` is a unitless number (for example `line-height`, `z-index`, gradient stop positions).

### `fontFamily`

`$value` is a string or an array of strings (fallbacks).

### `fontWeight`

`$value` is a number (1–1000) or an allowed keyword (per the spec table).

---

## 6) References (aliases) and `$ref` (property-level)

### Standard alias (curly braces)

- Syntax: `{path.to.token}`
- Alternative: `{#/json/pointer/path}`

### `$ref` (JSON Pointer) to reference parts of composite values

- **Required** when you need to point to an internal property (you cannot do this with `{...}`).
- Example: `{ "$ref": "#/base/text/$value/fontFamily" }`

**Rules**

- No cycles.
- Reasonable depth (ideally max 3–4 hops).

---

## 7) Composite tokens and CSS flattening

- In JSON: keep `$value` as an object/array per the type (do not flatten the source of truth).
- In CSS: **flatten** into individual variables or utilities (never emit `[object Object]`).

Example (typography) -> CSS flatten:

- `typography.heading.h1.$value.fontSize` → `--ds-typography-heading-h1-font-size`

---

# Recommended architecture (tiers)

## Tier 1 — Primitives (foundation)

- Raw values and scales (palettes, base spacing, base radius, etc.).
- Should not be consumed directly by final components.

## Tier 2 — Semantics (intent)

- UI intent: `color.text.default`, `color.bg.surface`, `focus.ring`, `border.subtle`, etc.
- Reference primitives. Most theming (light/dark/brand) lives here.

## Tier 3 — Component (contract)

- Per-component contractual variables: `button.bg.default`, `input.border.focus`, etc.
- Reference semantics. Ideal to isolate variants and avoid global overrides.

Key rule: components consume semantics/component tokens, not raw primitives (except for explicitly justified exceptions).

---

## Structural tokens (non-visual)

- **Z-index / elevation**: define a semantic scale (`layer-base`, `layer-overlay`, `layer-modal`, `layer-toast`).
  Avoid raw values like `9999`.
- **Breakpoints**: define viewport sizes as tokens (not all tooling compiles them directly into media queries).
  Document how they are consumed (CSS build-time, JS `matchMedia`, etc.).

---

# CSS Custom Properties (required)

## 1) Naming and mapping

- Use `kebab-case` and a stable prefix: `--ds-`.
- Map DTCG paths to CSS:
  - keys -> kebab-case (if they are not already)
  - hierarchy separator -> `-`
  - example: `color.primitive.blue.500` -> `--ds-color-primitive-blue-500`

## 2) Scope (global vs component)

- `:root`: global primitives and semantics.
- `.Component`: component-scoped tokens and variant overrides.

## 3) Cascade theming (recommended)

- Base: `:root`
- Attribute overrides (composable):
  - `[data-theme="dark"]`
  - `[data-brand="acme"]`
  - `[data-theme="dark"][data-brand="acme"]`

**Critical**: define `color-scheme` in theme blocks so the browser adapts native UI (scrollbars, inputs, etc.).

## 4) Correct `var()` usage

- Components consume `var(--token)`.
- Use `var(--token, fallback)` only for migration or runtime cases where a token could be missing.

## 5) Unitless values in CSS

- `line-height`: unitless (from token type `number`).
- `font-weight`: number (from token type `fontWeight`).
- `z-index`: number (token type `number`).

## 6) Performance (minimum viable)

- Change **semantics** in themes (fewer overrides).
- Avoid redefining hundreds of variables per component without need.
- Avoid `!important` on tokens.
- Consider splitting outputs: `tokens.base.css`, `tokens.theme-dark.css`, `tokens.brand-acme.css`.

## 7) `@property` (optional, progressive enhancement)

- Useful for transitions on typed values (colors/lengths/times) when support allows.
- Do not require it: treat it as progressive enhancement (`@supports` where appropriate).

## 8) Modern CSS (optional, progressive enhancement)

If your support matrix allows it, avoid exploding tokens just to encode opacity variants:

- Prefer `color-mix()` or Relative Color Syntax on a base token.
- Keep tokens atomic and generate variants at runtime when safe.

---

# Common patterns (ready to use)

## Pattern 1 — Theme switching (with native UI adaptation)

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

## Pattern 2 — Responsive tokens (build-time)

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

## Pattern 3 — Component variants (scoped tokens)

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

## Pattern 4 — Multi-brand (precedence)

```css
:root {
  /* base */
}
[data-brand="acme"] {
  /* semantic overrides */
}
[data-theme="dark"] {
  /* semantic overrides */
}
[data-brand="acme"][data-theme="dark"] {
  /* combined overrides */
}
```

## Pattern 5 — High contrast

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

# Documentation, versioning, and deprecation (minimum viable)

## What to document per token (minimum)

- Purpose (what it solves)
- References (which primitive/semantic it points to)
- Usage (where yes / where no)
- Status (active / deprecated / planned)

## SemVer for tokens

- **PATCH**: fix without changing the contract.
- **MINOR**: new tokens/compatible aliases.
- **MAJOR**: renames, meaning changes, removals.

Practical policy:

- For renames: keep the old alias as `$deprecated` for at least 1 minor / 1 release cycle.

---

# Migration plan (when a system already exists)

1. **Assessment**: inventory current variables + hardcodes + UI hotspots.
2. **Planning**: taxonomy + naming + tiers + source of truth + SemVer + deprecations.
3. **Implementation**: primitives and semantics first; migrate in islands (component by component).
4. **Validation**: visual regression + a11y (contrast/focus) + smoke tests + perf (runtime theming).

---

# Validation and testing (recommended)

- **Visual regression**: captures per component/state/theme.
- **A11y**: contrast on color tokens, focus visible, disabled states.
- **Linting/CI**:
  - validate DTCG structure (token vs group; effective `$type`).
  - validate naming (no `{}`, `.`, spaces; kebab-case recommended).
  - detect new literals in components (rules like "no-raw-hex/no-raw-px").

---

# Recommended folder structure

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

# Expected output

Deliver (as needed) in this order:
A) **Architecture** (tiers, naming, theming, decisions)  
B) **DTCG tokens (JSON)** (minimum valid + scalable)  
C) **CSS Custom Properties** (`:root` + themes/brands + component scope when applicable)  
D) **Checklist** + next steps (migration/adoption/testing)

---

# Constraints (non-negotiable)

- Do not mix token and group in the same object.
- Do not leave tokens without an effective `$type` (explicit or inherited).
- `dimension` and `duration` must use object format `{ value, unit }` with valid units.
- Do not use `$extensions` for critical interpretation data.
- Avoid circular references and unnecessarily deep chains.
- Do not invent brand values if the user did not provide them: use placeholders.

---

# Examples

## Example 1 — Primitive -> semantic + dimension + number

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
          "$description": "Interactive text"
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
        "$description": "Default unitless line-height"
      }
    }
  }
}
```

## Example 2 — Composite `typography` token + `$ref`

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

## Example 3 — CSS output (root + theme + component)

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
  --ds-color-semantic-text-action: #93c5fd; /* placeholder if dark token is not available yet */
}

.Button {
  --ds-button-text: var(--ds-color-semantic-text-action);
  --ds-button-padding: var(--ds-space-2);
  color: var(--ds-button-text);
  padding: var(--ds-button-padding);
}
```
