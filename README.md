# DS Graph

DS Graph is a local design-system operations app for importing, synchronizing, auditing, and documenting Figma-based design systems.

It combines a React dashboard, a Hono API, a Figma plugin bridge, PostgreSQL storage, and TypeScript tooling for token CSS generation and visual proof capture.

## What This App Does

### Design systems

- Creates and manages multiple design systems.
- Stores system metadata, Figma file keys, Figma token references, import snapshots, and database-provider settings.
- Supports default-system selection and deletion with a confirmation preview of linked consumer data.
- Imports a new system from a Figma file URL after scanning available components.

### Tokens

- Imports/synchronizes Figma variables into the active system database.
- Shows a token explorer with path, slash path, CSS variable, collection, type, resolved value, aliases, and usage.
- Generates CSS custom properties from token JSON/database state.
- Builds token relation data, token usage indexes, and token collection trees.
- Shows token detail pages with identity, alias chain, token-to-token usage, and component/consumer usage.

### Components

- Shows a component explorer with import/scanned counts, documentation coverage, variant counts, token coverage, and component usage.
- Shows component detail pages with visual proof, spec data, properties, Figma descriptions, layer-token mappings, dependency graph, and adoption data.
- Captures visual proof assets from Figma.
- Stores structured component data and editorial documentation in PostgreSQL.
- Lets authors edit editorial documentation from the dashboard: summary, editorial behaviour, variants, content guidelines, and accessibility.

### Consumer files and impact

Consumer files are external Figma files that use the components and variables of a given design system. They are tracked per design system file key, and the dashboard keeps each consumer file linked to a human-readable consumer name plus the original Figma file key.

What the feature does:

- Registers consumer files for a design system and keeps them visible in the dashboard.
- Syncs each consumer file against the parent design system file to capture cross-file component and variable usage.
- Stores per-sync metrics such as component count, variable count, warning count, sync status, and the counts of DS vs non-DS usage.
- Captures sample node references for each reported usage. Each sample includes the Figma node ID and the page name where that node was found, capped to a small fixed sample set per row.
- Resolves consumer file names from the consumer file itself, so the dashboard can present detail pages with a readable URL and title.
- Exposes reports by file, by component, and by variable.
- Shows a consumer detail page with:
  - KPI cards for DS vs non-DS component and variable usage
  - separate tables for component usage and variable usage
  - filters for component status and variable type
  - clickable example counts that open a modal with the captured Figma node samples
- Simulates the impact of changing a token value so you can see which consumer files would be affected before applying a change.

Operational notes:

- The consumer files page lists all tracked consumer files for the active design system.
- A consumer file can be added from its Figma file URL or file key.
- A sync run can be forced or limited to selected consumer files.
- The latest sync run determines the file-level status shown in the dashboard, including partial runs and warnings.
- The parent design system itself is also scanned for variable usage so token detail pages can show deterministic "Used In" data backed by the database.
- Sample links are intended as representative evidence, not a complete export of every node in the file.

Key fields surfaced by the backend:

- `componentCount` and `variableCount`: DS usage captured in the latest sync.
- `localComponentUsedCount` and `localVariableUsedCount`: non-DS usage detected in the consumer file.
- `parentDerivedComponentCount`: local components that derive directly from parent design system components.
- `warningCount`: non-fatal issues recorded during the latest sync.
- `sampleNodes`: captured node samples with node IDs and page names.

### AI documentation

- Generates component documentation suggestions with AI.
- Supports Anthropic, OpenAI, OpenRouter, Ollama, and Gemini providers.
- Streams job state through SSE.
- Persists AI jobs and job events in PostgreSQL.
- Provides diff/review/apply flows before writing generated documentation.

### Figma integration

- Includes a Figma plugin under `apps/figma-plugin`.
- Uses a WebSocket bridge between the plugin and dashboard API.
- Sends plugin heartbeat, file info, selection changes, page changes, document changes, and console logs to the dashboard.
- Exposes bridge operations for variables, styles, components, nodes, screenshots, token export, token sync, and token binding.

### Health and analytics

- Shows a system dashboard with token and component health widgets.
- Tracks token hotspots, shared-value clusters, component token debt, and editorial coverage.
- Stores health snapshots/history for trend-oriented reporting.

## Repository Layout

```text
apps/ds-dashboard/     React dashboard + Hono API server
apps/figma-plugin/     Figma plugin UI and WebSocket bridge runtime
tooling/src/           Token, Figma capture, sync, and pipeline CLIs
packages/shared/       Shared connection/state utilities
packages/ds-types/     Shared design-system types
design-systems/<id>/   Per-system input/output/docs artifacts
```

## Stack

- Frontend: React 18, React Router, TanStack Query, Tailwind, Tiptap, D3.
- Backend: Hono, `@hono/node-server`, `ws`, PostgreSQL via `postgres`.
- Database: PostgreSQL with pgvector support.
- Figma: local Figma plugin plus direct WebSocket bridge.
- AI: Anthropic SDK, OpenAI SDK, OpenRouter-compatible API, Ollama HTTP adapter, Gemini adapter.
- Build/tooling: Vite, TypeScript, npm workspaces, `tsx`.

## Requirements

- Node.js 18+
- npm
- Docker, for the local PostgreSQL service
- Figma Desktop, when using plugin/bridge workflows
- A Figma access token for REST-based Figma operations

## Environment Setup

The repo keeps per-app examples in:

- `apps/ds-dashboard/.env.example`
- `apps/figma-plugin/.env.example`

Use them as the source of truth for local configuration. Copy the example you need
and keep the resulting `.env` files out of git. Edit values only when you need to
change the local defaults or enable Figma, AI, split deployments, or non-default
infrastructure.

For day-to-day dashboard work, `apps/ds-dashboard/.env.example` is the file that
matters. `apps/figma-plugin/.env.example` only matters when you build or run the
Figma plugin.

Minimum local setup for the happy path:

```bash
npm ci
cp apps/ds-dashboard/.env.example apps/ds-dashboard/.env
npm run db:up
npm run dashboard:dev
```

The dashboard example already covers the local defaults for PostgreSQL and the core
app. You only need to add extra values if you use Figma sync, AI jobs, split
deployments, or non-default infrastructure.

## Local Setup

Install dependencies from the repository root:

```bash
npm ci
```

Start PostgreSQL:

```bash
npm run db:up
```

Start the dashboard:

```bash
npm run dashboard:dev
```

The local database defaults to:

```text
postgres://ds:local@localhost:5432/ds_dashboard
```

The dashboard dev script starts the local app/API supervisor. The API can also be started directly:

```bash
npm --prefix apps/ds-dashboard run start
```

## Common Commands

### Dashboard

```bash
npm run dashboard:dev
npm run dashboard:build
npm --prefix apps/ds-dashboard run preview:split
```

### Database

```bash
npm run db:up
npm run db:down
```

### Token compilation

```bash
npm run generate
npm run generate:strict -- --mode dark
npm run generate -- --single --output design-systems/<id>/output/custom-properties.css
```

There are two code paths that can write token CSS:

- The dashboard tokens step generates CSS from the token registry in PostgreSQL. That registry is populated from Figma variables through the plugin/MCP sync flow.
- `npm run generate` is the standalone file-based CLI. It reads token JSON files from `design-systems/<id>/input` unless `--input` is provided.

Both paths write the same default split files for the resolved design system:

```text
design-systems/<id>/output/primitives.css
design-systems/<id>/output/tokens.css
```

`<id>` comes from `--system <id>`, the configured default system, or the first configured system.

Useful token CLI flags:

- `--system <id>`: target a specific design system.
- `--input <dir>`: override token JSON input.
- `--split`: emit `primitives.css` and `tokens.css`.
- `--single`: emit one CSS file.
- `--mode <name>`: emit a preferred mode branch.
- `--mode-strict`: fail when the preferred mode is missing.
- `--from-phase <ingest|index|analyze|emit>`: rerun from a pipeline phase.
- `--plugin <path>`: load an external phase plugin.

### Figma and capture tooling

```bash
npm run ds:figma-mcp-status
npm run ds:tokens-from-figma -- --system <id> --url "https://www.figma.com/design/<fileKey>/<name>"
npm run ds:token-usage-index -- --system <id>
npm run ds:capture-from-url -- --system <id> --url "https://www.figma.com/design/<fileKey>/<name>"
npm run ds:capture-visual-proof -- --system <id> --component-name Button
```

`ds:capture-from-url` is the import-oriented capture flow. `ds:capture-visual-proof` is the narrower standalone screenshot flow.

### Tests and validation

```bash
npm run ci:preflight
npm run test:tooling
npm run test:server
npm run test:plugin:bridge
npm run typecheck:plugin
npm run test:dashboard:routes
npm run test:changed-surface
```

## Environment Variables

### Dashboard core

These are the values that matter for a normal local dashboard run:

- `DATABASE_URL`: PostgreSQL connection string for the dashboard.
- `DB_PROVIDER=local|supabase|custom`: selects the database backend mode.
- `TEST_DATABASE_URL`: test database URL; used by the test helpers when present.
- `DS_DASHBOARD_INTERNAL_TOKEN`: optional internal auth token for API and bridge routes.
- `DS_DASHBOARD_API_HOST`: API bind host.

If you use the bundled local database, the default `apps/ds-dashboard/.env.example`
already shows a working `DATABASE_URL` and `DB_PROVIDER=local` combination.

### Database provider specifics

- `SUPABASE_DATABASE_URL`: required when `DB_PROVIDER=supabase`.

### Dashboard and deployment

- `VITE_API_URL`: frontend API origin for split deployments and the plugin UI.
- `DS_DASHBOARD_ALLOWED_ORIGINS`: explicit CORS origins for the API.

### Figma

- `FIGMA_TOKEN`: REST Figma API token for import/sync and capture workflows.
- `VITE_DIRECT_WS_URL`: plugin direct WebSocket URL when you want to override the default derivation from `VITE_API_URL`.
- `FIGMA_PLUGIN_ALLOWED_DOMAINS`: extra allowlist entries for plugin builds.

### AI providers

- Set the key for the provider you plan to use:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `OPENROUTER_API_KEY`
  - `GEMINI_API_KEY` or `GOOGLE_API_KEY`
  - `OLLAMA_BASE_URL`
- Optional model overrides:
  - `AI_ANTHROPIC_MODEL`
  - `AI_OPENAI_MODEL`
  - `AI_OPENROUTER_MODEL`
  - `AI_GEMINI_MODEL`
  - `AI_OLLAMA_MODEL`
- Optional timeouts and provider tuning:
  - `AI_JOB_TIMEOUT_MS`
  - `AI_VALIDATION_SHADOW`
  - `AI_VALIDATION_TIMEOUT_MS`
  - `AI_OLLAMA_TIMEOUT_MS`
  - `AI_OPENROUTER_TIMEOUT_MS`
  - `OPENROUTER_BASE_URL`

### Token pipeline

- `ALLOW_JSON_REPAIR=true`: attempt basic JSON repair during ingest.
- `ALLOW_ALIAS_SCAN=true`: enable fallback alias scanning.
- `PIPELINE_PLUGIN_TIMEOUT_MS=<ms>`: max plugin execution time.

## Figma Plugin

The plugin lives in `apps/figma-plugin`.

Build it with:

```bash
npm --prefix apps/figma-plugin run build
```

The build renders `manifest.json`, builds plugin code/UI, and inlines the UI HTML. The plugin connects to the dashboard API and WebSocket bridge using `VITE_API_URL` and `VITE_DIRECT_WS_URL` when provided; otherwise it uses local defaults.

When the plugin is open in Figma, the dashboard can inspect connection status, selection, file info, variables, components, token bindings, screenshots, and console logs through the bridge.

## Documentation Model

Component documentation is database-backed. The editorial editor is separate from the strict component spec validator.

- Structured editorial fields are stored through the dashboard/API.
- Editable editorial fields include summary, behaviour, variants, content guidelines, and accessibility.
- Strict component spec validation still expects the core spec fields: name, status, figma, summary, properties, content guidelines, accessibility, and QA.
- Markdown is a downloadable/rendered artifact.
- Canonical per-system docs/spec paths are:
  - `design-systems/<id>/docs/components`
  - `design-systems/<id>/docs/_spec/components`
- Generated artifacts live under `design-systems/<id>/docs/_generated/**`.

For component docs, edit through the dashboard when possible so spec/editorial data, generated markdown, AI suggestions, and visual proof metadata stay aligned.
