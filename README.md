# CSS Custom Properties Generator

TypeScript CLI that converts JSON design tokens (DTCG) into CSS custom properties for `:root` and mode scopes.

## Requirements

- Node.js 16+
- npm or yarn

## Installation

```bash
npm install
```

## Available Scripts

- **`npm run generate`**: Executes the full pipeline (Ingest -> Indexing -> Analysis -> Emission). By default it generates split outputs: `output/primitives.css` + `output/tokens.css`.
- **`npm run generate:strict`**: Same pipeline with `--mode-strict` enabled (it fails when the preferred mode from `--mode <name>` is missing).

## Usage

1. Place your token JSON files (exported from Figma/Token Forge) in the `input/` folder.
2. Run `npm run generate`.
3. By default, two CSS files are generated:
   - `output/primitives.css`
   - `output/tokens.css`

You can override input/output via CLI args (`--input`, `--output-primitives`, `--output-tokens`).
If you want a single file output, use `--single` with `--output`.

## Architecture and Pipeline

The system operates in 4 sequential phases:

1.  **Ingest (`src/core/ingest.ts`)**: Reads and sanitizes JSON files from `input/`.
2.  **Indexing (`src/core/indexing.ts`)**: Creates lookup maps and resolves cross-references.
3.  **Analysis (`src/core/analyze.ts`)**: Detects cycles and validates data integrity.
4.  **Emission (`src/core/emit.ts`)**: Generates final CSS declarations for base scope (`:root`) and mode scopes (`[data-theme="..."]`) when mode branches exist.

## Project Structure

- `src/cli`: Command-line entry point (`index.ts`).
- `src/core`: Core pipeline logic (Ingest, Index, Analyze, Emit).
- `src/runtime`: State management, configuration, and execution context.
- `src/utils`: String, regex, and validation utilities.
- `src/types`: TypeScript type definitions.

## Configuration

Behavior can be adjusted using environment variables:

- `ALLOW_JSON_REPAIR=true` (default: false): Attempts to repair common syntax errors in input JSONs (e.g., trailing commas) to prevent the process from failing.
- `ALLOW_ALIAS_SCAN=true` (default: false): Enables O(N) tree-scan fallback for unresolved `VARIABLE_ALIAS` IDs. Keep disabled for large token sets/perf safety; enable only for debugging/migrations.
- Mode selection flags (CLI):
  - `--mode <name>` (default: none): preferred mode branch (normalized exact match against `mode...` keys, e.g. `dark` -> `modeDark`/`mode-dark`).
  - `--mode-loose` (default): if the preferred mode is missing on a node, fallback to the available mode and log a warning.
  - `--mode-strict`: fail if the preferred mode is missing anywhere.
  - `--mode-emit-base`: emit the base `$value` alongside a selected mode branch (mainly for legacy outputs).
- Split output flags (CLI):
  - `--split`: generate two files (default behavior).
  - `--single`: generate one file (`--output`) instead of split outputs.
  - `--output-primitives <file>`: primitives output path (default: `output/primitives.css`).
  - `--output-tokens <file>`: semantic/component tokens output path (default: `output/tokens.css`).

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

## Typography unit coercion (runtime)

- To avoid touching exported JSONs, during emission typography dimensions are converted when token paths match font size/line-height conventions (`font.size`, `font.lineHeight`, `fontSize`, `lineHeight`):
  - Font sizes in `px` → `rem` (16px base, rounded to 4 decimals).
  - Line-heights in `px` → unitless values.
- Applied only to typography-like paths; other dimensions are not altered.

## Multi-mode output

- `:root` emits only tokens without mode branches or with an explicit base `$value`/`modeDefault`; mode branches are ignored in the base scope.
- Each mode generates its own `[data-theme="mode-…"]` block with that mode’s overrides. Tokens that exist only inside a mode branch are emitted only there.
- Tokens with base + modes: base goes to `:root`, overrides go to their mode blocks (base is not re-emitted in modes unless you opt in with `--mode-emit-base`).
- Use `--mode <name>` to pick a preferred mode branch; `--mode-strict` fails if it’s missing, `--mode-loose` logs a fallback warning.

## Output order (primitives first)

- Within each emitted CSS block, variables with primitive values (no references) are written before alias variables (that reference other tokens).
- Section comments per file are kept in both groups for readability.
- When using `--split`, load `primitives.css` before `tokens.css`.

## Split classification rule

- Files whose basename starts with `_` are treated as primitive sources (for `primitives.css`).
- All other JSON files are treated as semantic/component token sources (for `tokens.css`).
- In `--single` mode, all sources are emitted into the single target file.

## Naming behavior

- CSS custom property names are derived from the internal token path (the source filename is not prefixed into `--...` names).
- If two token paths normalize to the same CSS variable name, the CLI reports a collision warning and CSS cascade decides the winner.

## Troubleshooting

- `--unresolved-*`: The referenced token does not exist or the name does not match.
- `There are two tokens with the same name: --...`: two different token paths normalized to the same CSS variable name; only one value can win at runtime.
- Parsing errors: Validate the JSONs in `input/`; with `ALLOW_JSON_REPAIR=true`, basic repairs are attempted.

## References

- Figma Plugin: [Token Forge](https://www.figma.com/community/plugin/1560757977662930693/token-forge)
