# Design System Tooling

This repository has two independent workflows:

1. Token compilation from JSON (DTCG) to CSS custom properties.
2. Component documentation from Figma to Markdown and back to Figma sections.

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

- **`npm run ds:doc-from-figma-url`**: Connects to a Figma component URL and writes a component markdown page in `docs/components/` through an agent + MCP workflow.
- **`npm run ds:active-md-to-figma`**: Converts a component markdown document into a Figma documentation section (placed to the right of the component section), using the shared theme contract.

### Documentation folders

- `docs/components/`: component documentation pages (e.g. `alert.md`)
- `docs/_spec/`: documentation specs and visual theme contract
- `docs/_generated/figma_doc_models/`: generated intermediate artifacts for markdown -> Figma rendering

### Documentation governance (rules)

Component pages are governed by rules in `.agent/rules/` and must include:

- YAML frontmatter metadata:
  - `doc_type: component`
  - `doc_status: draft | ready | needs-review`
  - `figma.file_url`, `figma.page`, `figma.component`, `figma.last_verified`
- Stable section order from `component-doc-structure.mdc`
- Optional `## Discrepancias detectadas` when design/token mismatches are real
- No Figma internal variable IDs (`VariableID:*`) in user-facing prose/tables
- Figma node IDs are allowed for source traceability (for example in `node-id` URLs)

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
- `--output <path/to/component.md>`
- `--agent <codex|claude|gemini>`

### 2) Active markdown -> Figma section

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

Internally, this command runs a two-step generation flow:

- Markdown -> doc model JSON
- Doc model + theme (`docs/_spec/figma_doc_theme.yml`) -> Figma execute script

Generated files are written to:

- `docs/_generated/figma_doc_models/`

Useful flags:

- `--markdown <path>`
- `--component-name <Name>`
- `--component-set-id <figma-node-id>`
- `--generated-dir <path>` (default: `docs/_generated/figma_doc_models`)
- `--theme <path>` (default: `docs/_spec/figma_doc_theme.yml`)
- `--offset-x <number>` (default: `200`)
- `--agent <codex|claude|gemini>`
