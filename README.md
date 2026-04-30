# Design System Tooling

This repository has two main workflows:

1. Token compilation from JSON (DTCG) to CSS custom properties.
2. Component documentation from DB-backed data to Markdown.

For the end-to-end component docs workflow entry point, see `MASTER_WORKFLOW.md`.

## 1) Token Compilation (CSS Custom Properties Generator)

TypeScript CLI that converts JSON design tokens (DTCG) into CSS custom properties for `:root` and mode scopes.

### Requirements

- Node.js 18+
- npm

### Monorepo Execution Policy

- Supported mode: full monorepo install and execution from repository root only.
- Run commands from root (detected via `git rev-parse --show-toplevel` or equivalent), not from `apps/*` or `packages/*`.
- Root scripts enforce this policy via `npm run assert:repo-root`.
- Partial workspace-only installs/execution are out of support in this repository.
- Tooling commands that execute TypeScript runners require devDependencies (`tsx`); production-only installs (`--omit=dev`) are unsupported for those commands.
- `@flujo/shared` manifest convention in this repo is intentionally mixed for npm compatibility:
  - root `package.json`: `workspace:*`
  - `apps/figma-plugin/package.json`: `file:../../packages/shared`
  - enforced by `npm run assert:shared-manifest-convention`

### CI Policy (Root-Only)

```bash
npm ci
npm run ci:preflight
```

Then run the needed root test/typecheck scripts (for example `npm run typecheck:plugin`, `npm run test:tooling`, `npm run test:plugin:bridge`).

### PostgreSQL Bootstrap (Design System Context)

Component tooling resolves system context from the PostgreSQL database referenced by `DATABASE_URL`.
When `DATABASE_URL` is missing, the dashboard dev supervisor uses the local default database URL for development and tests. In production, the dashboard expects `DATABASE_URL` to be set explicitly.
If the dashboard frontend is deployed separately from the API, set `VITE_API_URL` to the backend origin for the frontend build; leave it unset in local development so the Vite proxy keeps handling `/api`.
If the frontend and API are on different origins in production, set `DS_DASHBOARD_ALLOWED_ORIGINS` on the backend to the frontend origin(s) so CORS stays explicit.
For the Figma plugin UI, use `VITE_API_URL` and `VITE_DIRECT_WS_URL` at build time; if `VITE_DIRECT_WS_URL` is omitted it is derived from `VITE_API_URL` when possible, and both values fall back to the local dashboard defaults.
The plugin build now also regenerates `apps/figma-plugin/manifest.json` from those values when present, so production deploys only need to set the backend and bridge origins once.
The dashboard backend can be started with `npm --prefix apps/ds-dashboard run start` when you want to run it outside the combined local supervisor.
To preview a split deployment locally, run `npm --prefix apps/ds-dashboard run preview:split`.

Bootstrap checklist:

1. Ensure the DB path exists and is writable for your user/process.
2. Create at least one design system (recommended via Dashboard Systems UI).
3. Set a default system (or pass `--system <id>` explicitly in CLI commands).
4. Verify tooling health:

```bash
npm run test:tooling:core
```

If the command fails, fix the local tooling or test environment before continuing.

### Token Sync and Index Scripts

- **`npm run generate`**: Executes the full pipeline (Ingest -> Indexing -> Analysis -> Emission). By default it generates split outputs: `output/primitives.css` + `output/tokens.css`.
- **`npm run generate:strict`**: Same pipeline with `--mode-strict` enabled. Strict checks are enforced only when a preferred mode is provided via `--mode <name>`.
- **`npm run ds:tokens-from-figma`**: Imports local Figma variables into the active system database. Supports `--source auto|mcp|rest`, `--force`, `--merge`, and `--dry-run`.
- **`npm run ds:token-usage-index`**: Refreshes the database-backed token usage index from the active system database and CSS alias chains (`output/primitives.css`, `output/tokens.css`) so the dashboard can show where each token/custom property is used.

### Team/CI Test Entry Points

- **`npm run test:plugin:bridge`**: Runs bridge/unit tests for `apps/figma-plugin` via package-local `test:bridge`.
- **`npm run test:dashboard:routes`**: Runs server route tests for `apps/ds-dashboard` via package-local `test:server:routes`.
- **`npm run test:changed-surface`**: Runs both commands above (recommended for changes touching plugin bridge + dashboard routes).

CI/external runners should call these root scripts instead of ad-hoc package commands.

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

- Default: `npx -y MCP Management`
- Override full command: `FIGMA_MCP_COMMAND` (treated as literal command path; pass args in `FIGMA_MCP_COMMAND_ARGS`)
- Override binary + args: `FIGMA_MCP_BIN` + `FIGMA_MCP_ARGS`

### Troubleshooting: MCP token sync

| Síntoma                                        | Causa probable                                                      | Solución                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `MCP server reports no Figma connection`       | Figma Desktop no está abierto o el MCP Management no está corriendo | Abre Figma Desktop → Plugins → Development → MCP Management                                                     |
| Timeout tras 15s sin respuesta                 | El servidor MCP no arrancó correctamente                            | Verifica que `npx MCP Management` funciona en tu terminal. Si usas un binario custom, comprueba `FIGMA_MCP_BIN` |
| `Missing Figma token for REST variables fetch` | Modo `--source rest` sin `FIGMA_TOKEN` configurado                  | Exporta `FIGMA_TOKEN` en tu shell o usa `--source mcp`                                                          |
| `Both sources failed`                          | Ni MCP ni REST funcionan                                            | Comprueba el MCP Management (para MCP) y `FIGMA_TOKEN` (para REST)                                              |

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
  },
};
```

Placement notes:

- `before-core`: runs before the built-in phase plugin.
- `after-core`: runs after the built-in phase plugin (default).
- Core plugins are owned by the generator runtime; external plugins are for phase extensions.

Plugin execution emits structured JSON logs (`pipeline_start`, `plugin_start`, `plugin_finish`, `plugin_error`, `pipeline_complete`).

Token usage index examples:

```bash
# Generate usage index JSON for dashboard + audits
npm run ds:token-usage-index

# Print human-readable summary without writing files
npm run ds:token-usage-index -- --format text --dry-run true

# Fail CI when unresolved references exist
npm run ds:token-usage-index -- --strict-unresolved true
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

## 2) Component Documentation Workflow

### Requirements

- A compatible agent CLI installed: `codex`, `claude`, or `gemini`.
- For Dashboard AI provider flows (`/ai-docs`), Ollama is also supported as a model provider.
- Figma MCP configured for the selected agent.
- For Figma write operations, Figma Desktop + MCP Management running.
- Component/docs runners resolve default paths from the active design system in PostgreSQL.
- Canonical docs/spec roots are `design-systems/<id>/docs/components` and `design-systems/<id>/docs/_spec/components`.
- Use `--system <id>` to target a specific system explicitly.
- If `--system` is omitted, the default configured system is used.
- `--system` without value (for example `--system ""`) is rejected.
- Agent selection options:
  - Pass `--agent codex|claude|gemini`
  - Or set `DS_AGENT=codex|claude|gemini`
  - Default is `auto`
- If non-interactive execution is unavailable, the command stores a fallback prompt in `docs/_generated/agent_prompts/`.
- Component docs are edited in the dashboard and read back through the API.
- Markdown is rendered from DB-backed data and can be downloaded; it is not the source of truth.

### Capture and dashboard scripts

| Command | Purpose |
| --- | --- |
| `npm run ds:capture-visual-proof` | Captures screenshot evidence for one component as a standalone operation. |
| `npm run ds:capture-from-url` | Captures visual proof from a Figma URL and generates capture artifacts. By default it also appends Specs exhibits (`Anatomy`, `Properties`, `Layout and spacing`) when available; disable with `--include-spec-exhibits false`. Variable bootstrap source is configurable via `--tokens-source auto|mcp|rest` (default: `auto`). |
| `npm run dashboard:dev` | Starts the local dashboard UI and its API supervisor; this is the only public dashboard entry point. |
| `npm run dashboard:build` | Builds the local dashboard app. |

### Artifacts and runtime state

- `design-systems/<id>/docs/components/`: downloadable component markdown artifacts (e.g. `alert.md`)
- `DATABASE_URL`: operational storage for dashboard sync/capture state
- dashboard token usage index: computed from PostgreSQL and consumed by the dashboard API

### Dashboard UI (local React app)

The dashboard app under `apps/ds-dashboard` has two left sidebar sections:

- `Tokens & Properties` (custom properties + token inventory from the active system database, plus `Used In` from token usage data)
- `Components` (component pipeline state from the dashboard database)

No external server is required. It runs locally and reads repository artifacts via the API.

Run:

```bash
npm run dashboard:dev
```

`dashboard:dev` uses the local PostgreSQL database by default (`postgres://ds:local@localhost:5432/ds_dashboard`).
If the server is not running yet, start it with:

```bash
npm run db:up
```

Before opening the Tokens view, ensure token usage data is generated at least once:

```bash
npm run ds:token-usage-index
```

The Tokens page also exposes a `Sync Usage Index` action.

Agent configuration for the dashboard dev supervisor:

- Select agent explicitly: `DS_AGENT=codex|claude|gemini`
- Optional explicit binary path (recommended when the dashboard process does not inherit your shell PATH): `CODEX_BIN=/abs/path/to/codex`
- Optional explicit binary path (recommended when the dashboard process does not inherit your shell PATH): `CLAUDE_BIN=/abs/path/to/claude`
- Optional explicit binary path (recommended when the dashboard process does not inherit your shell PATH): `GEMINI_BIN=/abs/path/to/gemini`
- `auto` mode is supported (`DS_AGENT` unset); it uses the fallback order above.
- If `codex` is not in PATH, set `CODEX_BIN` (or `DS_CODEX_PATH`) explicitly.

Examples:

```bash
# Force Claude for dashboard markdown regeneration
DS_AGENT=claude CLAUDE_BIN="/abs/path/to/claude" npm run dashboard:dev

# Force Gemini
DS_AGENT=gemini GEMINI_BIN="/abs/path/to/gemini" npm run dashboard:dev
```

If the editor shows `No compatible agent CLI found (codex/claude/gemini)`, restart `npm run dashboard:dev` with one of the commands above.

Build:

```bash
npm run dashboard:build
```

### Documentation governance

- Keep the order: spec first, rendered markdown second.
- Do not render markdown without a valid spec.
- `component_name` normalization:
  - treat `component_name` as display name input (`Alert`, `StatusBar`, `Status Bar`)
  - infer default file paths with `snake_case` (`status_bar`)
  - explicit path flags (`--output`, `--spec-file`) always take precedence
- `component markdown` artifacts are derived outputs in `design-systems/<id>/docs/components/*.md` and should be linked, not duplicated.
- Detailed governance rules live in `.agents/rules/` and `MASTER_WORKFLOW.md`.

### Import and capture from Figma

```bash
npm run ds:capture-from-url -- --url "https://www.figma.com/design/<fileKey>/<name>" --system <id>
npm run ds:capture-visual-proof -- --component-name <Name>
```

Use `ds:capture-from-url` for import flows; it can add spec exhibits automatically. Use `ds:capture-visual-proof` only for isolated screenshots.

Recommended sequence before rendering:

```bash
npm run ds:capture-from-url -- --url "https://www.figma.com/design/<fileKey>/<name>" --system <id>
```

### Capture screenshot evidence (standalone)

```bash
npm run ds:capture-visual-proof -- \
  --component-name Alert \
  --agent codex
```

Useful flags:

- `--component-name <Name>`
- `--markdown <path/to/component.md>`
- `--spec-file <path/to/component-spec.yml>`
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

### Documentation governance

- Keep the order: spec first, rendered markdown second.
- Do not render markdown without a valid spec.
- `component_name` normalization:
  - treat `component_name` as display name input (`Alert`, `StatusBar`, `Status Bar`)
  - infer default file paths with `snake_case` (`status_bar`)
  - explicit path flags (`--output`, `--spec-file`) always take precedence
- `component markdown` artifacts are derived outputs in `design-systems/<id>/docs/components/*.md` and should be linked, not duplicated.
- Detailed governance rules live in `.agents/rules/` and `MASTER_WORKFLOW.md`.

For markdown rendered to Figma, prefer the supported subset:

- Headings (`#`, `##`, `###`), paragraphs, flat lists, markdown tables, inline emphasis
- Avoid code fences, blockquotes, images, nested lists, and deep headings (`####+`)
