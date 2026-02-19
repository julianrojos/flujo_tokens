# Design System Tooling

This repository has two independent workflows:

1. Token compilation from JSON (DTCG) to CSS custom properties.
2. Component documentation from Figma to Markdown and back to Figma sections.

For the end-to-end docs pipeline entry point, see `MASTER_WORKFLOW.md`.

## 1) Token Compilation (CSS Custom Properties Generator)

TypeScript CLI that converts JSON design tokens (DTCG) into CSS custom properties for `:root` and mode scopes.

### Requirements

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Token Compilation Scripts

- **`npm run generate`**: Executes the full pipeline (Ingest -> Indexing -> Analysis -> Emission). By default it generates split outputs: `output/primitives.css` + `output/tokens.css`.
- **`npm run generate:registry`**: Executes the same token pipeline and also exports `docs/_generated/token-registry.json` for documentation validation.
- **`npm run generate:strict`**: Same pipeline with `--mode-strict` enabled. Strict checks are enforced only when a preferred mode is provided via `--mode <name>`.
- **`npm run ds:tokens-sync`**: Incremental token sync (change detection). Skips regeneration when input JSONs and relevant flags are unchanged. Use `--force true` to rebuild.
- **`npm run ds:token-diff`**: Compares current token registry with a previous version (file or git ref), groups changes (`Added`, `Modified`, `Removed`), and classifies breaking vs non-breaking diffs.

### Usage

1. Place your token JSON files (exported from Figma/Token Forge) in the `input/` folder.
2. Run `npm run generate`.
3. By default, two CSS files are generated:
   - `output/primitives.css`
   - `output/tokens.css`

You can override input/output via CLI args (`--input`, `--output-primitives`, `--output-tokens`).
If you want a single file output, use `--single` with `--output`.

### Architecture and Pipeline

The system operates in 4 sequential phases:

1.  **Ingest (`tooling/src/core/ingest.ts`)**: Reads and sanitizes JSON files from `input/`.
2.  **Indexing (`tooling/src/core/indexing.ts`)**: Creates lookup maps and resolves cross-references.
3.  **Analysis (`tooling/src/core/analyze.ts`)**: Detects cycles and validates data integrity.
4.  **Emission (`tooling/src/core/emit.ts`)**: Generates final CSS declarations for base scope (`:root`) and mode scopes (`[data-theme="..."]`) when mode branches exist.

### Project Structure

- `tooling/src/cli`: Command-line entry point (`index.ts`).
- `tooling/src/core`: Core pipeline logic (Ingest, Index, Analyze, Emit).
- `tooling/src/runtime`: State management, configuration, and execution context.
- `tooling/src/utils`: String, regex, and validation utilities.
- `tooling/src/types`: TypeScript type definitions.

### Configuration

Behavior can be adjusted using environment variables:

- `ALLOW_JSON_REPAIR=true` (default: false): Attempts to repair common syntax errors in input JSONs (e.g., trailing commas) to prevent the process from failing.
- `ALLOW_ALIAS_SCAN=true` (default: false): Enables O(N) tree-scan fallback for unresolved `VARIABLE_ALIAS` IDs. Keep disabled for large token sets/perf safety; enable only for debugging/migrations.
- Mode selection flags (CLI):
  - `--mode <name>` (default: none): preferred mode branch (normalized exact match against `mode...` keys, e.g. `dark` -> `modeDark`/`mode-dark`). When present, only that mode scope is emitted (plus `:root`).
  - `--mode-loose` (default): if the preferred mode is missing on a node, fallback to the available mode and log a warning.
  - `--mode-strict`: fail if the preferred mode is missing anywhere (effective when used together with `--mode <name>`).
- Split output flags (CLI):
  - `--split`: generate two files (default behavior).
  - `--single`: generate one file (`--output`) instead of split outputs.
  - `--output-primitives <file>`: primitives output path (default: `output/primitives.css`).
  - `--output-tokens <file>`: semantic/component tokens output path (default: `output/tokens.css`).
- Registry export flags (CLI):
  - `--registry`: also generate docs token registry JSON.
  - `--registry-output <file>`: registry output path (default: `docs/_generated/token-registry.json`).

Example:

```bash
ALLOW_JSON_REPAIR=true ALLOW_ALIAS_SCAN=true npm run generate
```

Split example:

```bash
npm run generate -- --split
```

Single-file example:

```bash
npm run generate -- --single --output output/custom-properties.css
```

Strict mode example (preferred mode required):

```bash
npm run generate:strict -- --mode dark
```

Registry example:

```bash
npm run generate:registry
```

Incremental sync example:

```bash
npm run ds:tokens-sync
```

Token diff examples:

```bash
# Compare against HEAD registry snapshot
npm run ds:token-diff

# Compare against an explicit previous file and write artifacts
npm run ds:token-diff -- \
  --before docs/_generated/token-registry.prev.json \
  --out-json docs/_generated/token-diffs/latest.json \
  --out-md docs/_generated/token-diffs/latest.md

# Fail CI when breaking changes exist
npm run ds:token-diff -- --strict true
```

### Typography unit coercion (runtime)

- To avoid touching exported JSONs, during emission typography dimensions are converted when token paths match font size/line-height conventions (`font.size`, `font.lineHeight`, `fontSize`, `lineHeight`):
  - Font sizes in `px` → `rem` (16px base, rounded to 4 decimals).
  - Line-heights in `px` → unitless values.
- Applied only to typography-like paths; other dimensions are not altered.

### Multi-mode output

- `:root` emits only tokens without mode branches or with an explicit base `$value`/`modeDefault`; mode branches are ignored in the base scope.
- Without `--mode`, each detected mode generates its own `[data-theme="mode-…"]` block with that mode’s overrides.
- With `--mode <name>`, only the selected mode block is emitted (tokens that exist only inside other mode branches are omitted).
- `modeDefault` is folded into `:root` and is not emitted as a separate `[data-theme="mode-default"]` block.
- Tokens with base + modes: base goes to `:root`, overrides go to their mode blocks.
- Use `--mode <name>` to pick a preferred mode branch; `--mode-strict` fails if it’s missing (when `--mode` is provided), `--mode-loose` logs a fallback warning.

### Output order (primitives first)

- Within each emitted CSS block, variables with primitive values (no references) are written before alias variables (that reference other tokens).
- Section comments per file are kept in both groups for readability.
- When using `--split`, load `primitives.css` before `tokens.css`.

### Split classification rule

- Files whose basename starts with `_` are treated as primitive sources (for `primitives.css`).
- All other JSON files are treated as semantic/component token sources (for `tokens.css`).
- In `--single` mode, all sources are emitted into the single target file.

### Naming behavior

- CSS custom property names are derived from the internal token path (the source filename is not prefixed into `--...` names).
- If two token paths normalize to the same CSS variable name, the CLI reports a collision warning and CSS cascade decides the winner.

### Troubleshooting

- `--unresolved-*`: The referenced token does not exist or the name does not match.
- `There are two tokens with the same name: --...`: two different token paths normalized to the same CSS variable name; only one value can win at runtime.
- Parsing errors: Validate the JSONs in `input/`; with `ALLOW_JSON_REPAIR=true`, basic repairs are attempted.

### References

- Figma Plugin: [Token Forge](https://www.figma.com/community/plugin/1560757977662930693/token-forge)

## 2) Figma Component Documentation

This workflow documents Design System components from Figma and can also render those markdown docs back into Figma sections.

### Documentation Scripts

- **`npm run ds:component-doc`**: Generates one component markdown page from a spec YAML with incremental change detection (spec hash -> markdown). Use `--force true` to regenerate.
- **`npm run ds:regenerate-docs`**: Regenerates markdown docs in batch from spec YAML files (operational task to refresh traceability hashes after tooling updates).
- **`npm run ds:spec-from-figma`**: Connects to a Figma component set and generates one spec YAML in `docs/_spec/components/` (prefills token mappings from `docs/_generated/token-registry.json`).
- **`npm run ds:doc-from-figma-url`**: Connects to a Figma component URL and writes a component markdown page in `docs/components/` through an agent + MCP workflow.
- **`npm run ds:active-md-to-figma`**: Converts a component markdown document into a Figma documentation section (placed to the right of the component section), using the shared theme contract. Uses incremental change detection and skips if unchanged (use `--force true` to re-render).
- **`npm run ds:capture-visual-proof`**: Captures screenshot evidence (`figma_take_screenshot`) for a component node, stores proof metadata under `docs/_generated/visual-proofs/`, and upserts `### Visual Proof` inside `## Overview`.
- **`npm run ds:foundations:sync`**: Generates `docs/foundations/*.md` + `docs/foundations/overview.md` deterministically from `docs/_generated/token-registry.json`.
- **`npm run ds:registry:sync`**: Builds or updates `docs/_generated/component-registry.json` as the deterministic single index for component docs/spec/render/proof status.
- **`npm run ds:registry:validate`**: Validates component registry schema and checks drift between registry content and current source artifacts.
- **`npm run ds:registry:overview`**: Regenerates `docs/components/overview.md` component list from the component registry in canonical sorted format.
- **`npm run ds:mark-needs-review`**: Auto-marks component docs as `needs-review` when traceability drift is detected (`spec_sha256` / `token_registry_sha256` mismatch or missing traceability block).
- **`npm run ds:doctor`**: Runs pipeline precondition checks (paths, token registry, component registry presence + sync drift, rule manifest readability + manifest coverage vs on-disk `.mdc` files, available agent CLIs, optional component-level file pair, and full `validate:docs` health gate).
- **`npm run ds:audit-consistency`**: Audits consistency for spec ↔ markdown ↔ token-registry checks and prints a per-component JSON report with suggested fix commands.
- **`npm run validate:docs`**: Validates component docs and spec YAMLs against project rules and `docs/_generated/token-registry.json` (frontmatter, section order, token references, required fallback values in token tables/prose, forbidden `VariableID:*`, spec schema, overview links, canonical `snake_case` file naming, strict 1:1 markdown↔spec mapping, `component_set_node_id` format/requirements, spec↔markdown traceability consistency, deterministic `Gaps / TBD` contract, unresolved editorial placeholders, and internal markdown link integrity).
  - Validation findings are annotated with rule IDs using `.agent/rules/_manifest.yml`.
  - Includes drift checks for generated markdown traceability hashes (`spec`, `token registry`, `generator script`).
  - Enforces `ready` lifecycle consistency (`doc_status` ↔ spec status, no `TBD`, no unresolved discrepancy rows, and concrete `### Visual Proof` screenshot URL).

### Documentation folders

- `docs/components/`: component documentation pages (e.g. `alert.md`)
- `docs/_spec/`: documentation specs and visual theme contract
- `docs/_generated/figma_doc_models/`: generated intermediate artifacts for markdown -> Figma rendering
- `docs/_generated/component-registry.json`: generated component registry (single source index for status and traceability pointers)

### Documentation governance (rules)

Component pages are governed by rules in `.agent/rules/` and must include:

- YAML frontmatter metadata:
  - `doc_type: component`
  - `doc_status: draft | ready | needs-review`
  - `figma.file_url`, `figma.page`, `figma.component`, `figma.last_verified`
  - optional `figma.component_set_node_id` (must match spec if declared)
- Stable section order from `component-doc-structure.mdc`
  - H2 headings are strict: only canonical allowed section titles, in canonical order
- `### Visual Proof` must live inside `## Overview` (never as an extra H2)
- `## Usage Guidelines` should include `### Behavior` and `### Examples` subsections (use `TBD` if evidence is missing)
- Optional `## Design–Token Discrepancies` when design/token mismatches are real
- No Figma internal variable IDs (`VariableID:*`) in user-facing prose/tables
- Figma node IDs are allowed for source traceability (for example in `node-id` URLs)
- `component_name` normalization contract:
  - treat `component_name` as display name input (`Alert`, `StatusBar`, `Status Bar`)
  - infer default file paths with `snake_case` (`status_bar`)
  - explicit path flags (`--output`, `--spec-file`) always take precedence
- Canonical pipeline order is enforced:
  - `(1) spec` -> `(2) markdown` -> `(3) Figma render (optional)` -> `(4) visual proof capture`
  - do not run markdown generation without a valid spec
  - do not render to Figma without an existing component markdown
  - spec and markdown must keep a strict 1:1 mapping by slug (`<snake_case>.yml` <-> `<snake_case>.md`)
  - validation is a gate after spec and markdown generation
  - see `.agent/rules/docs-pipeline-contract.mdc` for the full stage contract
- `## Gaps / TBD` contract is enforced:
  - include only when linked spec has unresolved gaps
  - omit when linked spec has no unresolved gaps
  - checklist format required: `- [ ] [GAP_TYPE] ...` in canonical order
- Editorial quality gates:
  - no `TODO` / `XXX` / `{placeholder}` / `<placeholder>`
  - internal markdown links must resolve to existing local targets
- Deterministic placement contract:
  - prefer `figma.component_set_node_id` from the spec
  - in `ready` specs, `figma.component_set_node_id` is mandatory
  - runtime resolution order: `--component-set-id` -> `spec.figma.component_set_node_id` -> name lookup (`draft` only)

For markdown rendered to Figma, prefer the supported subset:

- Headings (`#`, `##`, `###`), paragraphs, flat lists, markdown tables, inline emphasis
- Avoid code fences, blockquotes, images, nested lists, and deep headings (`####+`)

### Requirements

- A compatible agent CLI installed: `codex`, `claude`, or `gemini`
- Figma MCP configured for the selected agent
- For Figma write operations, Figma Desktop + Desktop Bridge plugin running

Agent selection options:

- Pass `--agent codex|claude|gemini`
- Or set `DS_AGENT=codex|claude|gemini`
- Default is `auto` (tries `codex`, then `claude`, then `gemini`)

If non-interactive execution is unavailable, the command stores a fallback prompt in:

- `docs/_generated/agent_prompts/`

### 1) Figma URL -> component markdown

Generate/update one component markdown page from a Figma URL:

```bash
npm run ds:doc-from-figma-url -- \
  --url "https://www.figma.com/design/<file>?node-id=<node>" \
  --component-name Alert \
  --output docs/components/alert.md \
  --agent codex
```

Useful flags:

- `--docs-root docs/components` (default)
- `--component-name <Name>`
- `--output <path/to/component.md>` (default inferred as `docs/components/<snake_case>.md`)
- `--agent <codex|claude|gemini>`

### 2) Spec YAML -> component markdown

Generate/update one component markdown page from a local spec YAML:

```bash
npm run ds:component-doc -- \
  --component-name Alert \
  --spec-file docs/_spec/components/alert.yml \
  --output docs/components/alert.md \
  --agent codex
```

Useful flags:

- `--component-name <Name>`
- `--spec-file <path/to/spec.yml>` (default: `docs/_spec/components/<snake_case>.yml`)
- `--output <path/to/component.md>` (default: `docs/components/<snake_case>.md`)
- `--docs-root <path>` (default: `docs`)
- `--registry <path>` (default: `docs/_generated/token-registry.json`)
- `--skip-validation true`
- `--force true` (ignore incremental cache)
- `--agent <codex|claude|gemini>`

Preflight behavior:

- Fails fast if the spec file does not exist.
- Validates the target spec before generating markdown; generation is blocked on spec errors.
- Synchronizes `## Gaps / TBD` from spec + token registry using canonical checkbox format.
- Validation bypass requires `--force true` when `--skip-validation true` is used.

### 2b) Batch markdown regeneration (operational)

Regenerate all component markdown docs from current specs:

```bash
npm run ds:regenerate-docs -- --agent codex
```

Useful flags:

- `--component <Name|snake_case>` (regenerate one component only)
- `--registry <path>` (default: `docs/_generated/token-registry.json`)
- `--spec-root <path>` (default: `docs/_spec/components`)
- `--docs-root <path>` (default: `docs/components`)
- `--skip-validation true` (passes through to `ds:component-doc`)
- `--continue-on-error true` (process remaining components)
- `--dry-run true` (print commands without executing)

### 3) Figma component -> spec YAML

Generate/update one component spec YAML from Figma:

```bash
npm run ds:spec-from-figma -- \
  --url "https://www.figma.com/design/<file>?node-id=<node>" \
  --component-name Alert \
  --output docs/_spec/components/alert.yml \
  --agent codex
```

Useful flags:

- `--url <figma-url>`
- `--component-set-node-id <figma-node-id>` (deterministic fallback when URL is not used)
- `--component-name <Name>`
- `--output <path/to/spec.yml>` (default: `docs/_spec/components/<snake_case>.yml`)
- `--spec-root <path>` (default: `docs/_spec/components`)
- `--template <path>` (default: `docs/_spec/components/_template.yml`)
- `--registry <path>` (default: `docs/_generated/token-registry.json`)
- `--skip-validation true`
- `--force true` (required when using `--skip-validation true`)
- `--agent <codex|claude|gemini>`

Note: when `--url` or `--component-set-node-id` provides a node id, `ds:spec-from-figma` persists it into `figma.component_set_node_id` in the generated spec.

### 4) Active markdown -> Figma section

Render markdown to a Figma documentation section:

```bash
npm run ds:active-md-to-figma -- \
  --markdown docs/components/alert.md \
  --component-name Alert \
  --component-set-id 2304:1892 \
  --url "https://www.figma.com/design/<file>?node-id=<node>" \
  --agent codex
```

If your editor exposes the active file via environment variable, you can omit `--markdown`:

```bash
ANTIGRAVITY_ACTIVE_FILE=docs/components/alert.md npm run ds:active-md-to-figma -- --agent codex
```

This command runs a validation preflight first. If the markdown references tokens missing from `docs/_generated/token-registry.json`, rendering is blocked.
For exceptional cases only, you can bypass preflight with `--skip-validation true`.
It also enforces pipeline freshness: if the source spec is newer than the markdown (or changed since last markdown generation), rendering is blocked until markdown is regenerated. Use `--force true` only for explicit bypass.
For node resolution, it uses: `--component-set-id` first, then `spec.figma.component_set_node_id`, then name lookup for `draft` specs only.
If a `ready` spec has no valid `figma.component_set_node_id`, rendering is blocked.
Validation bypass requires `--force true` when `--skip-validation true` is used.
By default, this command also attempts visual proof capture after rendering.
Use `--capture-proof false` to skip it, or `--capture-proof-strict true` to fail when capture cannot be completed.

### 4b) Capture visual proof (standalone)

```bash
npm run ds:capture-visual-proof -- \
  --component-name Alert \
  --agent codex
```

Useful flags:

- `--component-name <Name>`
- `--markdown <path/to/component.md>`
- `--spec-file <path/to/spec.yml>`
- `--component-set-id <figma-node-id>` (override spec node id)
- `--proof-dir <path>` (default: `docs/_generated/visual-proofs`)
- `--format <png|jpg|svg|pdf>`
- `--scale <number>`
- `--dry-run true`

### 4c) Auto-mark stale docs as needs-review

```bash
npm run ds:mark-needs-review
```

Useful flags:

- `--file <path/to/component.md>` (single file mode)
- `--spec-file <path/to/spec.yml>` (single file mode)
- `--dry-run true`

### 4d) Component registry and overview sync

```bash
npm run ds:registry:sync
npm run ds:registry:validate
npm run ds:registry:overview
```

Useful flags:

- `--registry <path>` (default: `docs/_generated/component-registry.json`)
- `--spec-root <path>` (default: `docs/_spec/components`)
- `--docs-root <path>` (default: `docs/components`)
- `--render-dir <path>` (default: `docs/_generated/figma_doc_models`)
- `--proof-dir <path>` (default: `docs/_generated/visual-proofs`)
- `--dry-run true` (supported by `ds:registry:sync` and `ds:registry:overview`)

### 4e) Foundations docs sync from token registry

```bash
npm run ds:foundations:sync -- --create-root true
```

Useful flags:

- `--docs-root <path>` (default: `docs`)
- `--foundations-root <path>` (default: `docs/foundations`)
- `--registry <path>` (default: `docs/_generated/token-registry.json`)
- `--status <draft|ready|needs-review>` (default: `draft`)
- `--max-samples <number>` (default: `2`)
- `--create-root <true|false>` (default: `false`)
- `--dry-run true`

Recommended sequence before rendering:

```bash
npm run generate:registry
npm run ds:registry:validate
npm run validate:docs
```

Validation command options:

- `npm run validate:docs` -> full docs + specs + overview checks
- `npm run validate:docs -- --check token-registry` -> token-registry-focused report (codes: `TOKEN_MISSING` / `TOKEN_AMBIGUOUS` / `TOKEN_DEPRECATED`, mapped from validator findings)
- `npm run validate:docs -- --file docs/components/alert.md --no-overview true --no-specs true` -> validate one markdown file only
- `npm run validate:docs -- --spec-file docs/_spec/components/alert.yml --no-overview true` -> validate one spec file only
- `npm run validate:docs -- --allow-extra-h2 true` -> temporary transition mode (downgrades unauthorized H2 from error to warning)
- validation output includes `rule_ids` per finding when mapped in `.agent/rules/_manifest.yml`

Doctor command examples:

- `npm run ds:doctor` -> full docs-pipeline health checks + `validate:docs`
- `npm run ds:doctor -- --component-name Button` -> include pair check for one component slug
- `npm run ds:doctor -- --skip-validate true` -> quick preflight without full validation gate

Consistency audit examples:

- `npm run ds:audit-consistency` -> audit all detected component pairs
- `npm run ds:audit-consistency -- --component-name Button` -> audit one component pair

Internally, this command runs a two-step generation flow:

- Markdown -> doc model JSON
- Doc model + theme (`docs/_spec/figma_doc_theme.yml`) -> Figma execute script

Generated files are written to:

- `docs/_generated/figma_doc_models/`

Useful flags:

- `--markdown <path>`
- `--component-name <Name>`
- `--spec-file <path/to/spec.yml>` (default: `docs/_spec/components/<snake_case>.yml`)
- `--component-set-id <figma-node-id>`
- `--generated-dir <path>` (default: `docs/_generated/figma_doc_models`)
- `--theme <path>` (default: `docs/_spec/figma_doc_theme.yml`)
- `--token-registry <path>` (default: `docs/_generated/token-registry.json`)
- `--offset-x <number>` (default: `200`)
- `--capture-proof <true|false>` (default: `true`)
- `--capture-proof-strict <true|false>` (default: `false`)
- `--force true` (ignore incremental cache and always rebuild + re-render)
- `--agent <codex|claude|gemini>`

If `--component-set-id` conflicts with `spec.figma.component_set_node_id`, the command fails unless `--force true` is provided.

Theme color values can be:

- direct hex values (for example `#FFFFFF`)
- local color aliases under `theme.colors`
- token paths resolved through the token registry (for example `Color/BW/White`, `_primitives/BW/White`)

Theme radius values can also use token paths from the registry (for example `Dimension/Border/Radius/200`).
