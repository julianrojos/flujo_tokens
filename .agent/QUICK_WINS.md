# Quick Wins — Mejoras Inmediatas (30 min - 2h)

**Objetivo:** Acciones de alto valor + bajo esfuerzo que puedes hacer ahora mismo.

---

## Win 1: Actualizar `docs-language-tone.mdc` con Violation Examples (30 min)

**Qué:** Agregar sección `## Examples of Violations` al rule más ambiguo.

**Por qué:** La IA va a estar más clara sobre qué es "marketing language" cuando vea ejemplos concretos.

**Cómo:**
```bash
cd /Users/julian/Documents/flujo_tokens
```

Edita `.agent/rules/docs-language-tone.mdc` y agrega esto antes del cierre:

```markdown
## Examples of Violations

### ❌ Bad: Marketing language and subjective claims
```markdown
The Alert component provides an intuitive, seamless way to notify users
with beautiful, elegant design that delights users.
```
**Why it fails:** Uses subjective adjectives ("intuitive", "seamless", "beautiful", "delights")
without evidence. Not prescriptive.

**How to fix:**
```markdown
The Alert component notifies users of events. It supports four severity
levels: info, warning, error, success. Users can dismiss the alert via
the close button.
```

### ❌ Bad: Speculative wording
```markdown
The component probably works best when placed at the top of the page,
though it could potentially be used elsewhere based on your design goals.
```
**Why it fails:** "probably", "could potentially" are hedging words. Not prescriptive.

**How to fix:**
```markdown
Place the Alert at the top of the page for maximum visibility.
Avoid placing below the fold.
```

### ❌ Bad: Missing evidence
```markdown
Using this component will significantly improve user engagement and retention.
```
**Why it fails:** Makes a claim without citing evidence (Figma spec, metrics, user research).

**How to fix:**
```markdown
This component is used in the sign-up flow to display email validation errors.
See [figma link] for all variants.
```

### ✅ Good
```markdown
The Alert component displays time-sensitive notifications.

Use it for:
- Validation errors in forms
- System warnings (downtime, deprecation)
- Success confirmations (account created)

Do not use for:
- Static informational content (use Card instead)
- Multiple simultaneous messages (use Toast instead)

Place the Alert above the main content area for maximum visibility.
```
```

**Impact:** Next time IA genera docs, va a entender mejor qué es "tone".

**Time:** 20 min writing + 10 min testing = 30 min total.

---

## Win 2: Agregar Violation Examples a `prohibited-patterns.mdc` (20 min)

**Qué:** El rule ya es claro pero agregar examples refuerza.

**Cómo:**
Abre `.agent/rules/prohibited-patterns.mdc` y agrega:

```markdown
## Examples of Violations

### ❌ Bad: Using VariableID in user-facing prose
```markdown
Set the fill using `VariableID:12345:6789` for primary color.
```
**Why it fails:** Internal Figma identifiers should never appear in user documentation.

**How to fix:**
```markdown
Set the fill using the `Semantic.Color.Primary` token.
```

### ❌ Bad: Using node IDs as token identifiers
```markdown
The icon uses token `1234:5678` for color.
```
**Why it fails:** Node IDs are ephemeral and non-semantic.

**How to fix:**
```markdown
The icon uses token `Semantic.Color.Icon.Primary` (#3B82F6) for color.
```

### ❌ Bad: CSS custom property names in design docs
```markdown
To style the alert background, use the CSS variable `--semantic-color-alert-bg`.
```
**Why it fails:** Design documentation should reference design tokens, not implementation details.

**How to fix:**
```markdown
To style the alert background, use the `Semantic.Color.Alert.Background` token (#FEE2E2).
```

### ✅ Good: Figma references by semantic names
```markdown
The Alert component set includes these variants:
- Type: Error, Warning, Info, Success
- Size: Small, Medium, Large

See [Figma component set](link?node-id=1234:5678) for all properties.
```
```

**Impact:** Prevents IA from accidentally leaking internal IDs.

**Time:** 15 min writing + 5 min review.

---

## Win 3: Update `_manifest.yml` with Schema Info (15 min)

**Qué:** Documentar en el manifest cuáles rules tienen schema validable.

**Cómo:**
Abre `.agent/rules/_manifest.yml` y actualiza la sección `rules`:

```yaml
rules:
  - id: inclusive-docs
    file: inclusive-docs.mdc
    owner: docs-governance
    applies_to: [markdown, spec]
    blocking: true
    has_schema: false          # ← agregar esto
    has_violations_examples: false

  - id: component-doc
    file: component-doc.mdc
    owner: docs-governance
    applies_to: [markdown]
    blocking: true
    has_schema: false
    has_violations_examples: false

  - id: component-spec-yaml
    file: component-spec-yaml.mdc
    owner: docs-governance
    applies_to: [spec]
    blocking: true
    has_schema: false          # ← será TRUE cuando hagas Win 5
    has_violations_examples: false

  # ... etc
```

Luego agrega una sección de stats al final:

```yaml
stats:
  total_rules: 30
  rules_with_schema: 0
  rules_with_violation_examples: 0

  priority_schemas_needed:
    - component-spec-yaml
    - frontmatter-contract
    - component-doc
    - token-references
    - component-name-normalization
```

**Impact:** Gives you a checklist para saber qué reglas todavía necesitan work.

**Time:** 15 min.

---

## Win 4: Create `.agent/rules/_schemas/` Directory Structure (10 min)

**Qué:** Prepara la estructura donde van a vivir los JSON schemas.

**Cómo:**
```bash
mkdir -p /Users/julian/Documents/flujo_tokens/.agent/rules/_schemas/test-cases
touch /Users/julian/Documents/flujo_tokens/.agent/rules/_schemas/README.md
```

Contenido de `README.md`:
```markdown
# Rule JSON Schemas

This directory contains machine-readable JSON Schema files for design system rules.

## Purpose
- **Validation:** `validate-rules.mjs` CLI uses these to check compliance
- **Clarity:** Schemas are source of truth for rule structure
- **Testing:** Test cases validate schema correctness

## Structure

```
_schemas/
├── component-spec-yaml.schema.json        # Validates docs/_spec/components/*.yml
├── frontmatter-contract.schema.json       # Validates markdown frontmatter
├── component-doc.schema.json              # Validates markdown structure
├── token-references.schema.json           # Validates token reference format
├── test-cases/
│   ├── component-spec-yaml.valid.yml
│   ├── component-spec-yaml.invalid-status.yml
│   ├── component-spec-yaml.invalid-missing-required.yml
│   └── ...
└── README.md (this file)
```

## Adding a New Schema

1. Create `rule-name.schema.json` following JSON Schema Draft 7
2. Add test cases:
   - `test-cases/rule-name.valid.yml` (or .md, .json)
   - `test-cases/rule-name.invalid-reason1.yml`
   - `test-cases/rule-name.invalid-reason2.yml`
3. Update `../_manifest.yml`: set `has_schema: true`
4. Run: `npm run validate:rules` to test

## Schemas in Progress

- [ ] component-spec-yaml
- [ ] frontmatter-contract
- [ ] component-doc
- [ ] token-references
- [ ] component-name-normalization

See `../../IMPLEMENTATION_ROADMAP.md` for priority order.
```

**Impact:** Clarifica dónde va la infrastructure de validación.

**Time:** 10 min.

---

## Win 5: Write One Complete JSON Schema (1h - 1.5h)

**Qué:** Crea el primer JSON Schema real para `component-spec-yaml.mdc`.

**Por qué:** Va a ser el prototipo que los demás siguen. Aprenderás qué funciona y qué no.

**Cómo:**
Crea `.agent/rules/_schemas/component-spec-yaml.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Component Specification YAML",
  "description": "Structure and validation rules for component spec YAML files - the source of truth before Markdown generation.",
  "type": "object",
  "required": [
    "name",
    "status",
    "figma",
    "summary",
    "anatomy",
    "properties",
    "content_guidelines",
    "best_practices",
    "accessibility",
    "token_mapping",
    "qa"
  ],
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[A-Z][a-zA-Z0-9]*$",
      "description": "PascalCase component name, matching Figma component set name exactly"
    },
    "status": {
      "type": "string",
      "enum": ["draft", "ready"],
      "description": "Component spec lifecycle. 'draft': incomplete/unverified. 'ready': reviewed and matches Figma."
    },
    "figma": {
      "type": "object",
      "required": ["file", "page", "component_set"],
      "additionalProperties": false,
      "properties": {
        "file": {
          "type": "string",
          "description": "Figma file key (not full URL)"
        },
        "page": {
          "type": "string",
          "description": "Page name in Figma"
        },
        "component_set": {
          "type": "string",
          "description": "Component set name (not node ID)"
        },
        "component_set_node_id": {
          "type": "string",
          "pattern": "^\\d+:\\d+$",
          "description": "Figma node id in 123:456 format. Recommended in draft, required in ready."
        }
      }
    },
    "summary": {
      "type": "object",
      "required": ["purpose", "when_to_use", "when_not_to_use"],
      "additionalProperties": false,
      "properties": {
        "purpose": {
          "type": "string",
          "description": "One-line purpose of the component"
        },
        "when_to_use": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Array of use cases"
        },
        "when_not_to_use": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Array of anti-patterns"
        }
      }
    },
    "anatomy": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "description"],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z_]+$",
            "description": "snake_case anatomy part identifier (e.g., leading_icon)"
          },
          "description": {
            "type": "string",
            "description": "Role of this part (container, label, icon, etc.)"
          }
        }
      },
      "description": "Array of component anatomy parts. Order: top-to-bottom, left-to-right."
    },
    "properties": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["name", "type", "default", "required"],
        "additionalProperties": false,
        "properties": {
          "name": {
            "type": "string",
            "description": "Property name (should match Figma property exactly)"
          },
          "type": {
            "type": "string",
            "enum": ["enum", "text", "boolean", "instance_swap"],
            "description": "Property type per type-mapping decision table"
          },
          "values": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Required for enum type only. Array of allowed values."
          },
          "default": {
            "oneOf": [
              { "type": "string" },
              { "type": "boolean" },
              { "type": "null" }
            ],
            "description": "Default value, or 'TBD' if unknown. Not null, use 'TBD' string."
          },
          "required": {
            "type": "boolean",
            "description": "Whether property is required"
          },
          "description": {
            "type": "string",
            "description": "Human-readable property description"
          }
        }
      },
      "description": "Array of component properties. Must match Figma properties 1:1. Ordering per component-spec-properties-order.mdc."
    },
    "content_guidelines": {
      "type": "object",
      "required": ["rules"],
      "additionalProperties": false,
      "properties": {
        "rules": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Array of content writing rules"
        }
      }
    },
    "best_practices": {
      "type": "object",
      "required": ["do", "dont"],
      "additionalProperties": false,
      "properties": {
        "do": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Best practice do's"
        },
        "dont": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Best practice don'ts"
        }
      }
    },
    "accessibility": {
      "type": "object",
      "required": ["role", "focus", "hit_area", "labeling"],
      "additionalProperties": false,
      "properties": {
        "role": {
          "type": "string",
          "description": "ARIA role (e.g., 'alert', 'dialog')"
        },
        "focus": {
          "type": "string",
          "description": "Focus management strategy"
        },
        "hit_area": {
          "type": "string",
          "description": "Minimum hit area size requirements"
        },
        "labeling": {
          "type": "string",
          "description": "Labeling requirements for screen readers"
        }
      }
    },
    "token_mapping": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          { "type": "string" },
          { "type": "null" }
        ]
      },
      "description": "Object keyed by '{anatomy_id}.{css_property}', values are token paths or 'TBD'"
    },
    "qa": {
      "type": "array",
      "items": { "type": "string" },
      "description": "QA verification statements"
    },
    "version": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "spec": {
          "type": "string",
          "description": "SemVer of this spec"
        },
        "component": {
          "type": "string",
          "description": "SemVer of the Figma component"
        }
      }
    },
    "related_components": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z_]+$"
      },
      "description": "Array of related component names in snake_case"
    }
  }
}
```

Luego crea test cases en `.agent/rules/_schemas/test-cases/`:

**`component-spec-yaml.valid.yml`:**
```yaml
name: Alert
status: draft
figma:
  file: abc123
  page: "Components"
  component_set: "Alert"
  component_set_node_id: "1234:5678"
summary:
  purpose: "Display time-sensitive notifications"
  when_to_use:
    - "Form validation errors"
    - "System warnings"
  when_not_to_use:
    - "Static informational content"
anatomy:
  - id: container
    description: "Root container"
  - id: icon
    description: "Severity icon"
  - id: message
    description: "Alert text"
properties:
  - name: Type
    type: enum
    values: ["Error", "Warning", "Info", "Success"]
    default: "Info"
    required: true
    description: "Severity level"
  - name: Dismissible
    type: boolean
    default: true
    required: false
    description: "Allow user to dismiss"
content_guidelines:
  rules:
    - "Use clear, concise language"
best_practices:
  do:
    - "Be specific about the error"
  dont:
    - "Use vague language"
accessibility:
  role: "alert"
  focus: "Trap focus in modal variant"
  hit_area: "40px minimum"
  labeling: "aria-label required for icon"
token_mapping:
  container.background: "Semantic.Color.Alert.Background"
  icon.color: "Semantic.Color.Alert.Icon"
qa:
  - "Verify all variants display in Figma"
```

**`component-spec-yaml.invalid-status.yml`:**
```yaml
name: Alert
status: "in-progress"  # ❌ Invalid: only "draft" or "ready" allowed
figma:
  file: abc123
  page: "Components"
  component_set: "Alert"
summary:
  purpose: "Display alerts"
  when_to_use: ["Errors"]
  when_not_to_use: []
anatomy:
  - id: container
    description: "Root"
properties:
  - name: Type
    type: enum
    values: ["Error"]
    default: "Error"
    required: true
    description: "Type"
content_guidelines:
  rules: []
best_practices:
  do: []
  dont: []
accessibility:
  role: "alert"
  focus: "TBD"
  hit_area: "TBD"
  labeling: "TBD"
token_mapping: {}
qa: []
```

**`component-spec-yaml.invalid-missing-required.yml`:**
```yaml
name: Alert
status: draft
figma:
  file: abc123
  page: "Components"
  component_set: "Alert"
# ❌ Missing: summary, anatomy, properties, accessibility, etc.
```

**Impact:**
- Validates that first schema is correct
- Provides template for next 4 schemas
- Tests actual validation

**Time:** 50 min schema + 20 min test cases = 1.1h.

---

## Summary of Quick Wins

| Win | File | Time | Effort |
| --- | ---- | ---- | ------ |
| 1. Violation examples in language-tone | `docs-language-tone.mdc` | 30 min | 🟢 Easy |
| 2. Violation examples in prohibited-patterns | `prohibited-patterns.mdc` | 20 min | 🟢 Easy |
| 3. Update manifest with schema info | `_manifest.yml` | 15 min | 🟢 Easy |
| 4. Create schemas directory structure | `.agent/rules/_schemas/` | 10 min | 🟢 Easy |
| 5. Write component-spec-yaml schema | `.schema.json` + test cases | 1.1h | 🟡 Medium |
| | | **~2.5h total** | |

---

## Next Steps After Quick Wins

Once you finish these, you're ready for:
1. **Week 1:** Write 4 more JSON schemas (frontmatter, component-doc, token-references, component-name-normalization)
2. **Week 2:** Write `validate-rules.mjs` CLI tool
3. **Week 3:** Wire CI gates

Or if prefieres, puedes paralelizar: mientras escribes los otros violation examples (~60h), alguien escribe los otros 4 schemas + CLI.

---

## Get Started Now

```bash
# Open your editor
cd /Users/julian/Documents/flujo_tokens

# Start with Win 1 (easiest)
# Edit: .agent/rules/docs-language-tone.mdc
# Add the violation examples section above

# Then Win 2
# Edit: .agent/rules/prohibited-patterns.mdc

# Then Wins 3 + 4 (structural)
# Confirm .agent/rules/_manifest.yml exists
# Create: .agent/rules/_schemas/ directory

# Finally Win 5 (technical)
# Write: .agent/rules/_schemas/component-spec-yaml.schema.json
# Write: .agent/rules/_schemas/test-cases/*.yml files
```

All of this can be done **today** in about 2.5 hours. 🚀
