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
- **`npm run ds:tokens-from-figma`**: Imports local Figma variables into the system `inputDir` and can compile them to CSS in one step. Supports `--source auto|mcp|rest`, `--force`, `--merge`, `--compile`, and `--dry-run`.
- **`npm run ds:token-diff`**: Compares current token registry with a previous version (file or git ref), groups changes (`Added`, `Modified`, `Removed`), and classifies breaking vs non-breaking diffs.
- **`npm run ds:token-graph`**: Builds a token dependency graph from `docs/_generated/token-registry.json`, detects cycles, highlights high-indirection chains, reports unused primitive terminal tokens, and flags unresolved/colliding references.
- **`npm run ds:token-usage-index`**: Builds `docs/_generated/token-usage-index.json` from component specs (`docs/_spec/components/*.yml`) plus CSS alias chains (`output/primitives.css`, `output/tokens.css`) to expose where each token/custom property is used.
- **`npm run ds:token-health`**: Builds `docs/_generated/token-health.json` by combining the token registry, usage index, and token graph, plus optional WCAG contrast checks configured in `tooling/config/wcag-pairs.json`.
- **`npm run ds:health-snapshot`**: Captures one historical KPI snapshot into `docs/_generated/health-history.json` (breaking changes, WCAG failures, coverage average, unresolved refs, etc.) for dashboard trends.
- **`npm run ds:health:record`**: Convenience command that regenerates token/component health artifacts and immediately captures a new historical snapshot.

### Usage

1. Place your token JSON files (exported from Figma/Token Forge) in the `input/` folder.
2. Run `npm run generate`.
3. By default, two CSS files are generated:
   - `output/primitives.css`
   - `output/tokens.css`

You can override input/output via CLI args (`--input`, `--output-primitives`, `--output-tokens`).
If you want a single file output, use `--single` with `--output`.

### Architecture and Pipeline

The system operates in 4 sequential phases orchestrated by a phase scheduler:

1.  **Ingest (`tooling/src/core/ingest.ts`)**: Reads and sanitizes JSON files from `input/`.
2.  **Indexing (`tooling/src/core/indexing.ts`)**: Creates lookup maps and resolves cross-references.
3.  **Analysis (`tooling/src/core/analyze.ts`)**: Detects cycles and validates data integrity.
4.  **Emission (`tooling/src/core/emit.ts`)**: Generates final CSS declarations for base scope (`:root`) and mode scopes (`[data-theme="..."]`) when mode branches exist.

Core phases are implemented as plugins (`core:*`). Optional external plugins can be attached per phase without modifying the core CLI.

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
- `PIPELINE_PLUGIN_TIMEOUT_MS=<ms>` (default: `60000`): Max execution time per plugin before the run fails with a timeout error.
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
- Pipeline extension flags (CLI):
  - `--plugin <path>`: load an external phase plugin module (`plugin`, `plugins`, or `default` export). Repeatable.

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

Sync variables directly from Figma:

```bash
# Default source mode: auto (tries MCP first, then REST fallback)
npm run ds:tokens-from-figma -- --system my-system --url "https://www.figma.com/design/<fileKey>/<name>"
```

```bash
# Force MCP-only mode (no FIGMA_TOKEN required)
npm run ds:tokens-from-figma -- --system my-system --url "https://www.figma.com/design/<fileKey>/<name>" --source mcp
```

```bash
# Force REST-only mode (requires FIGMA_TOKEN or --figma-token)
npm run ds:tokens-from-figma -- --system my-system --url "https://www.figma.com/design/<fileKey>/<name>" --source rest
```

MCP command resolution for token sync:

- Default: `npx -y figma-console-mcp`
- Override full command: `FIGMA_MCP_COMMAND` (treated as literal command path; pass args in `FIGMA_MCP_COMMAND_ARGS`)
- Override binary + args: `FIGMA_MCP_BIN` + `FIGMA_MCP_ARGS`

Migration note:
- Legacy setups that used `FIGMA_MCP_COMMAND="node /path/to/server.js"` must be split into:
  - `FIGMA_MCP_COMMAND=node`
  - `FIGMA_MCP_COMMAND_ARGS="/path/to/server.js"`

### Troubleshooting: MCP token sync

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `MCP server reports no Figma connection` | Figma Desktop no está abierto o el bridge plugin no está corriendo | Abre Figma Desktop → Plugins → Development → Bridge plugin |
| Timeout tras 15s sin respuesta | El servidor MCP no arrancó correctamente | Verifica que `npx figma-console-mcp` funciona en tu terminal. Si usas un binario custom, comprueba `FIGMA_MCP_BIN` |
| `Missing Figma token for REST variables fetch` | Modo `--source rest` sin `FIGMA_TOKEN` configurado | Exporta `FIGMA_TOKEN` en tu shell o usa `--source mcp` |
| `Both sources failed` | Ni MCP ni REST funcionan | Comprueba el bridge plugin (para MCP) y `FIGMA_TOKEN` (para REST) |

Plugin example:

```bash
npm run generate -- --plugin ./tooling/plugins/custom-normalize.mjs
```

Writing a plugin:

```javascript
// tooling/plugins/custom-normalize.mjs
export default {
  name: 'custom-normalize',
  phase: 'analyze', // ingest | index | analyze | emit
  placement: 'after-core', // before-core | after-core
  async transform(ctx) {
    const { state } = ctx;
    console.log(`Analyzed scopes: ${state.analyzedScopes.length}`);
  }
};
```

Placement notes:
- `before-core`: runs before the built-in phase plugin.
- `after-core`: runs after the built-in phase plugin (default).
- Core plugins are owned by the generator runtime; external plugins are for phase extensions.

Plugin execution emits structured JSON logs (`pipeline_start`, `plugin_start`, `plugin_finish`, `plugin_error`, `pipeline_complete`).

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

Token graph examples:

```bash
# Generate JSON + markdown + mermaid graph
npm run ds:token-graph

# Print human summary only (no file writes)
npm run ds:token-graph -- --format text --dry-run true

# Fail CI when cycles exist
npm run ds:token-graph -- --strict-cycles true

# Fail CI when unresolved aliases or identity collisions exist
npm run ds:token-graph -- --strict-unresolved true --strict-collisions true

# Limit graph size in mermaid output for large registries
npm run ds:token-graph -- --mermaid-max-edges 1000
```

Token usage index examples:

```bash
# Generate usage index JSON for dashboard + audits
npm run ds:token-usage-index

# Print human-readable summary without writing files
npm run ds:token-usage-index -- --format text --dry-run true

# Fail CI when unresolved references exist
npm run ds:token-usage-index -- --strict-unresolved true
```

Token health examples:

```bash
# Generate operational health snapshot
npm run ds:token-health

# Print summary without writing files
npm run ds:token-health -- --format text --dry-run true

# Capture one historical KPI snapshot for trends
npm run ds:health-snapshot

# Regenerate health artifacts + capture snapshot in one step
npm run ds:health:record
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

### Master Pipeline (Orchestrator)

The recommended way to run the component documentation workflow is via the **`ds:pipeline`** orchestrator. It automatically plans and executes the entire sequence deterministically (Token sync -> Spec -> Markdown -> Figma Render -> Visual Proof -> Gate) by reading the component registry.

```bash
# Run the pipeline for all components
npm run ds:pipeline -- --all

# Run the pipeline for a specific component
npm run ds:pipeline -- --component Alert

# Plan and preview what needs to be run (identifies orphans)
npm run ds:pipeline -- --status-only

# Run from a specific step (spec | markdown | render | proof)
npm run ds:pipeline -- --component Alert --from-step markdown

# Include Figma rendering in the execution
npm run ds:pipeline -- --component Alert --render-figma
```

### Documentation Scripts

- **`npm run ds:component-doc`**: Generates one component markdown page from a spec YAML with incremental change detection (spec hash -> markdown). Use `--force true` to regenerate.
- **`npm run ds:regenerate-docs`**: Regenerates markdown docs in batch from spec YAML files (operational task to refresh traceability hashes after tooling updates).
- **`npm run ds:figma-component-map`**: Extracts all `COMPONENT` / `COMPONENT_SET` nodes from a full Figma file URL (all pages), emits per-node Figma URLs, and records nesting + instance dependency relations for downstream automation.
- **`npm run ds:spec-from-figma`**: Connects to a Figma component set and generates one spec YAML in `docs/_spec/components/` (prefills token mappings from `docs/_generated/token-registry.json`).
- **`npm run ds:doc-from-figma-url`**: Connects to a Figma URL. With `node-id`, it writes one component markdown page in `docs/components/` through an agent + MCP workflow and then auto-captures visual proof (metadata JSON + local image) by default. Without `node-id` (file URL), it auto-generates `docs/_generated/figma-component-map/<fileKey>.json` with all component node URLs and exits with guided next steps. In component mode, on success it atomically refreshes component indices (`component-registry.json` + `overview.md`) and regenerates `docs/_generated/token-usage-index.json`.
- **`npm run ds:active-md-to-figma`**: Converts a component markdown document into a Figma documentation section (placed to the right of the component section), using the shared theme contract. Uses incremental change detection and skips if unchanged (use `--force true` to re-render).
- **`npm run ds:capture-visual-proof`**: Captures screenshot evidence (`figma_take_screenshot`) for a component node, stores proof metadata under `docs/_generated/visual-proofs/`, stores a local proof image under `docs/_generated/visual-proofs/images/`, and upserts `### Visual Proof` inside `## Overview` (including local image preview, screenshot URL, node id, and artifact link).
- **`npm run ds:capture-from-url`**: Captures visual proof from a Figma URL and updates matching component docs. Optional `--inject-doc-specs true` refreshes `## Anatomy`, `## Component API`, and `## Visual Specifications` in existing markdown files from live Figma node data before proof capture. By default it also appends Specs exhibits (`Anatomy`, `Properties`, `Layout and spacing`) when available; disable with `--include-spec-exhibits false`. Variable bootstrap source is configurable via `--tokens-source auto|mcp|rest` (default: `auto`).
- **`npm run ds:foundations:sync`**: Generates `docs/foundations/*.md` + `docs/foundations/overview.md` deterministically from `docs/_generated/token-registry.json`.
- **`npm run ds:registry:sync`**: Builds or updates `docs/_generated/component-registry.json` as the deterministic single index for component docs/spec/render/proof status.
- **`npm run ds:registry:refresh`**: Atomically refreshes `docs/_generated/component-registry.json` and `docs/components/overview.md` together (rollback on failure).
- **`npm run ds:registry:validate`**: Validates component registry schema and checks drift between registry content and current source artifacts.
- **`npm run ds:registry:overview`**: Regenerates `docs/components/overview.md` component list from the component registry in canonical sorted format.
- **`npm run ds:registry:report`**: Generates read-only registry projections (`docs/COMPONENTS_INDEX.md` and `docs/_generated/components-health.json`) without scanning specs/docs again.
- **`npm run ds:mark-needs-review`**: Auto-marks component docs as `needs-review` when traceability drift is detected (`spec_sha256` / `token_registry_sha256` mismatch or missing traceability block).
- **`npm run ds:doctor`**: Runs pipeline precondition checks (paths, token registry, component registry presence + sync drift, rule manifest readability + manifest coverage vs on-disk `.mdc` files, available agent CLIs, optional component-level file pair, and full `validate:docs` health gate).
- **`npm run ds:audit-consistency`**: Audits consistency for spec ↔ markdown ↔ token-registry checks and prints a per-component JSON report with suggested fix commands.
- **`npm run dashboard:dev`**: Starts a local React dashboard (Vite) to explore component and token artifacts from local generated files.
- **`npm run dashboard:build`**: Builds the local dashboard app.
- **`npm run dashboard:preview`**: Previews the dashboard production build locally.
- **`npm run validate:docs`**: Validates component docs and spec YAMLs against project rules and `docs/_generated/token-registry.json` (frontmatter, section order, token references, required fallback values in token tables/prose, forbidden `VariableID:*`, spec schema, overview links, canonical `snake_case` file naming, strict 1:1 markdown↔spec mapping, `component_set_node_id` format/requirements, spec↔markdown traceability consistency, deterministic `Gaps / TBD` contract, unresolved editorial placeholders, and internal markdown link integrity).
  - Validation findings are annotated with rule IDs using `.agents/rules/_manifest.yml`.
  - Includes drift checks for generated markdown traceability hashes (`spec`, `token registry`, `generator script`).
  - Enforces `ready` lifecycle consistency (`doc_status` ↔ spec status, no `TBD`, no unresolved discrepancy rows, and concrete `### Visual Proof` screenshot reference: URL or local proof image).

### Documentation folders

- `docs/components/`: component documentation pages (e.g. `alert.md`)
- `docs/_spec/`: documentation specs and visual theme contract
- `docs/_generated/figma_doc_models/`: generated intermediate artifacts for markdown -> Figma rendering
- `docs/_generated/figma-component-map/`: generated file-level component maps from Figma URLs (all component node URLs + hierarchy/dependency graph)
- `docs/_generated/visual-proofs/`: proof metadata (`<slug>.json`)
- `docs/_generated/visual-proofs/images/`: local screenshot assets (`<slug>.png`, etc.)
- `docs/_generated/component-registry.json`: generated component registry (single source index for status and traceability pointers)
- `docs/_generated/token-usage-index.json`: generated token usage registry (where each token/custom property is referenced)
- `docs/COMPONENTS_INDEX.md`: generated component index projection for human scanning
- `docs/_generated/components-health.json`: generated machine-readable projection for dashboards and CI

### Local dashboard (React, local-only)

The repository includes a local dashboard app under `apps/ds-dashboard` with two left sidebar sections:

- `Tokens & Properties` (custom properties + token inventory from `docs/_generated/token-registry.json`, plus `Used In` from `docs/_generated/token-usage-index.json`)
- `Componentes` (component pipeline state from `docs/_generated/component-registry.json`)

No external server is required. The dashboard runs locally and reads local repository artifacts via a Vite local API.

Tokens accessibility checker:

- In `Tokens & Properties`, when `Type` filter is set to `color`, an accessibility icon button appears next to the type selector.
- The button opens a contrast modal with two semantic color selects (background and foreground for text/icon).
- The modal computes WCAG 2.2 contrast results dynamically (ratio + Level A informational note + Level AA/AAA pass-fail indicators).

Setup:

```bash
npm --prefix apps/ds-dashboard install
```

Run:

```bash
npm run dashboard:dev
```

API-only mode:

```bash
npm --prefix apps/ds-dashboard run dev:api
```

Before opening the Tokens view, ensure token usage data is generated at least once:

```bash
npm run ds:token-usage-index
```

The dashboard also exposes a `Sync Usage Index` action in the Tokens page that runs this command locally.

Markdown regeneration from the dashboard (`Edit summary (markdown)` -> save) runs `ds:component-doc` under the API process.
That specific action requires an AI CLI available to the API runtime (`codex`, `claude`, or `gemini`).

Agent configuration for dashboard API:

- Select agent explicitly: `DS_AGENT=codex|claude|gemini`
- Optional explicit binary path (recommended when the API process does not inherit your shell PATH): `CODEX_BIN=/abs/path/to/codex`
- Optional explicit binary path (recommended when the API process does not inherit your shell PATH): `CLAUDE_BIN=/abs/path/to/claude`
- Optional explicit binary path (recommended when the API process does not inherit your shell PATH): `GEMINI_BIN=/abs/path/to/gemini`
- Optional Codex extension fallback (disabled by default): `DS_ENABLE_CODEX_EXTENSION_FALLBACK=1`
  - When enabled, tooling can try to discover Codex from local editor extension folders (`~/.antigravity/extensions`, `~/.vscode/extensions`, `~/.cursor/extensions`) using your current OS/arch.
  - This fallback is best-effort for local development only; for CI or stable setups, use `CODEX_BIN`.
- `auto` mode is still supported (`DS_AGENT` unset): tries `codex`, then `claude`, then `gemini`.

Examples:

```bash
# Force Claude for dashboard markdown regeneration
DS_AGENT=claude CLAUDE_BIN="/abs/path/to/claude" npm --prefix apps/ds-dashboard run dev:api

# Force Gemini
DS_AGENT=gemini GEMINI_BIN="/abs/path/to/gemini" npm --prefix apps/ds-dashboard run dev:api
```

If the editor shows `No compatible agent CLI found (codex/claude/gemini)`, restart the API with one of the commands above.

Build/preview:

```bash
npm run dashboard:build
npm run dashboard:preview
```

### Documentation governance (rules)

Component pages are governed by rules in `.agents/rules/` and must include:

- YAML frontmatter metadata:
  - `doc_type: component`
  - `doc_status: draft | ready | needs-review`
  - `figma.file_url`, `figma.page`, `figma.component`, `figma.last_verified`
  - optional `figma.component_set_node_id` (must match spec if declared)
- Stable section order from `component-doc.mdc`
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
  - optional spec `related_components` is validated:
    - values must be `snake_case` slugs, unique, and must not self-reference
    - in `ready` specs, every entry must resolve to an existing component spec YAML
  - component index artifacts must be refreshed atomically (`docs/_generated/component-registry.json` + `docs/components/overview.md`)
  - validation is a gate after spec and markdown generation
  - see `.agents/rules/docs-pipeline-contract.mdc` for the full stage contract
- `## Gaps / TBD` contract is enforced:
  - include only when linked spec has unresolved gaps
  - omit when linked spec has no unresolved gaps
  - checklist format required: `- [ ] [GAP_TYPE] ...` in canonical order
- Evidence-gated mutations are enforced for component docs/specs:
  - default mode is deny-by-default for key/value mutations
  - known values can only change when verifiable evidence proves they are wrong, incomplete, outdated, or missing
  - known values cannot be downgraded to unknown markers (`TBD`, empty, etc.) without explicit forced override
  - component-targeted generation is scope-limited to target file + index artifacts; out-of-scope writes are blocked and rolled back
- Editorial quality gates:
  - no `TODO` / `XXX` / `{placeholder}` / `<placeholder>`
  - internal markdown links must resolve to existing local targets
- Deterministic placement contract:
  - prefer `figma.component_set_node_id` from the spec
  - in `ready` specs, `figma.component_set_node_id` is mandatory
  - runtime resolution order: `--component-set-id` -> `spec.figma.component_set_node_id` -> name lookup (`draft` only)
- Workflow pattern docs are supported as a workflow subtype:
  - recommended path: `docs/workflows/patterns/*.md`
  - expected focus: problem, decision guide, composition, behavior, accessibility, i18n, governance, and metrics
  - component APIs remain canonical in `docs/components/*.md` and should be linked, not duplicated
- Governance workflow docs should explicitly define:
  - ownership model, review cadence, and contribution/review path
  - deprecation policy with replacement and migration window
  - feedback intake channel plus KPI definitions (source, formula, cadence)
- Internationalization expectations:
  - component `Usage Guidelines -> Behavior` should cover RTL/LTR, text expansion, and locale-dependent formats
  - interactive docs should state reduced-motion and zoom behavior (or `TBD` with a tracked gap)

For markdown rendered to Figma, prefer the supported subset:

- Headings (`#`, `##`, `###`), paragraphs, flat lists, markdown tables, inline emphasis
- Avoid code fences, blockquotes, images, nested lists, and deep headings (`####+`)

### Requirements

- A compatible agent CLI installed: `codex`, `claude`, or `gemini`
- Figma MCP configured for the selected agent
- For Figma write operations, Figma Desktop + bridge plugin running

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
- `--figma-token <token>` (or `FIGMA_TOKEN` env var; required for file URL discovery mode)
- `--auto-component-map <true|false>` (default: `true`)
- `--component-map-out <path/to/map.json>` (only for file URL discovery mode)
- `--capture-proof <true|false>` (default: `true`)
- `--capture-proof-strict <true|false>` (default: `false`)
- `--capture-proof-variants <true|false>` (default: `true`)
- `--capture-proof-variant-limit <number>` (default: `6`)
- `--allow-doc-status-change true` (exceptional override; requires `--force true`)
- `--force true` (required when `--allow-doc-status-change true`)
- `--agent <codex|claude|gemini>`

If the provided URL has no `node-id`, the command switches to discovery mode and writes:

- `docs/_generated/figma-component-map/<fileKey>.json`

Then it prints a sample list of component URLs so you can rerun documentation for a specific node.

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
- `--allow-doc-status-change true` (exceptional override; requires `--force true`)
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
- `--allow-non-evidence-updates true` (exceptional override; requires `--force true`)
- `--agent <codex|claude|gemini>`

Note: when `--url` or `--component-set-node-id` provides a node id, `ds:spec-from-figma` persists it into `figma.component_set_node_id` in the generated spec.

### 3b) Figma file URL -> component map (all pages)

Extract all component nodes for one Figma file and persist a deterministic map:

```bash
npm run ds:figma-component-map -- \
  --url "https://www.figma.com/design/<fileKey>/<slug>" \
  --token "$FIGMA_TOKEN"
```

Default output:

- `docs/_generated/figma-component-map/<fileKey>.json`

Useful flags:

- `--out <path/to/map.json>`
- `--depth <number>` (optional Figma API depth override)
- `--include-instances <true|false>` (default: `true`)
- `--strict-unresolved-instances <true|false>` (default: `false`)
- `--format <json|text>` (default: `json`)
- `--timeout-ms <number>` (default: `30000`)
- `--dry-run true`

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
The render step now validates agent output strictly: it must include `target_section_id`, `target_section_name`, `offset_x_applied`, and `theme_name`.
If `theme_name` does not match the loaded theme file (`docs/_spec/figma_doc_theme.yml` by default), the command fails (unless `--force true` is explicitly provided).

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
- `--proof-image-dir <path>` (default: `docs/_generated/visual-proofs/images`)
- `--format <png|jpg|svg|pdf>`
- `--scale <number>`
- `--store-local-image <true|false>` (default: `true`)
- `--require-local-image <true|false>` (default: `true`)
- `--download-timeout-ms <number>` (default: `30000`)
- `--figma-token <token>` (or `FIGMA_TOKEN`; required to capture variant screenshots via REST API)
- `--include-variants <true|false>` (default: `true`)
- `--variant-limit <number>` (default: `6`)
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
npm run ds:registry:report
```

Useful flags:

- `--registry <path>` (default: `docs/_generated/component-registry.json`)
- `--spec-root <path>` (default: `docs/_spec/components`)
- `--docs-root <path>` (default: `docs/components`)
- `--render-dir <path>` (default: `docs/_generated/figma_doc_models`)
- `--proof-dir <path>` (default: `docs/_generated/visual-proofs`)
- `--dry-run true` (supported by `ds:registry:sync` and `ds:registry:overview`)

Registry report specific flags:

- `--out-md <path>` (default: `docs/COMPONENTS_INDEX.md`)
- `--out-json <path>` (default: `docs/_generated/components-health.json`)
- `--format <json|text>` (default: `json`)
- `--max-filter-items <number>` (default: `20`)
- `--no-md true` / `--no-json true`
- `--dry-run true`

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
- validation output includes `rule_ids` per finding when mapped in `.agents/rules/_manifest.yml`

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
