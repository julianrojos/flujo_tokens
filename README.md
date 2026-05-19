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

- Registers Figma consumer files linked to a design-system file.
- Synchronizes cross-file component and variable usage.
- Reports usage by file, by component, and by variable.
- Simulates the impact of changing a variable/token value.
- Tracks sync runs, stale consumer data, warnings, and parent-file usage snapshots.

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

### Database

- `DATABASE_URL`: active PostgreSQL URL.
- `TEST_DATABASE_URL`: test database URL; preferred in test mode.
- `DB_PROVIDER=local|supabase|custom`: database provider mode.
- `SUPABASE_DATABASE_URL`: used when `DB_PROVIDER=supabase`.

### Dashboard and deployment

- `VITE_API_URL`: frontend API origin for split deployments.
- `DS_DASHBOARD_ALLOWED_ORIGINS`: explicit CORS origins for the API.
- `DS_DASHBOARD_API_HOST`: API bind host.
- `DS_DASHBOARD_INTERNAL_TOKEN`: internal API/bridge auth token.

### Figma

- `FIGMA_TOKEN`: REST Figma API token.
- `VITE_DIRECT_WS_URL`: plugin direct WebSocket URL.

### AI providers

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `OLLAMA_BASE_URL`
- `AI_ANTHROPIC_MODEL`
- `AI_OPENAI_MODEL`
- `AI_OPENROUTER_MODEL`
- `AI_GEMINI_MODEL`
- `AI_OLLAMA_MODEL`

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
