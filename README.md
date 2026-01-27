# CSS Custom Properties Generator

TypeScript CLI that converts JSON design tokens (DTCG) into CSS variables listed in `:root`.

## Requirements

- Node.js 16+
- npm or yarn

## Installation

```bash
npm install
```

## Available Scripts

- **`npm run generate`**: Executes the full pipeline (Ingest -> Indexing -> Analysis -> Emission) to generate `custom-properties.css`.
- **`npm run generate:strict`**: Same pipeline but with strict mode selection (fails if the preferred mode is missing anywhere).

## Usage

1. Place your token JSON files (exported from Figma/Token Forge) in the `input/` folder.
2. Run `npm run generate`.
3. The resulting CSS file will be generated in `output/custom-properties.css`.

Input is fixed to `input/`; output to `output/custom-properties.css`.

## Architecture and Pipeline

The system operates in 4 sequential phases:

1.  **Ingest (`src/core/ingest.ts`)**: Reads and sanitizes JSON files from `input/`.
2.  **Indexing (`src/core/indexing.ts`)**: Creates lookup maps and resolves cross-references.
3.  **Analysis (`src/core/analyze.ts`)**: Detects cycles and validates data integrity.
4.  **Emission (`src/core/emit.ts`)**: Generates the final CSS inside `:root`.

## Project Structure

- `src/cli`: Command-line entry point (`index.ts`).
- `src/core`: Core pipeline logic (Ingest, Index, Analyze, Emit).
- `src/runtime`: State management, configuration, and execution context.
- `src/utils`: String, regex, and validation utilities.
- `src/types`: TypeScript type definitions.

## Configuration

Behavior can be adjusted using environment variables:

- `ALLOW_JSON_REPAIR=true` (default: false): Attempts to repair common syntax errors in input JSONs (e.g., trailing commas) to prevent the process from failing.
- Mode selection flags (CLI):
  - `--mode <name>` (default: none): preferred mode branch (matches keys starting with `mode<name>`).
  - `--mode-loose` (default): if the preferred mode is missing on a node, fallback to the available mode and log a warning.
  - `--mode-strict`: fail if the preferred mode is missing anywhere.
  - `--mode-emit-base`: emit the base `$value` alongside a selected mode branch (mainly for legacy outputs).

Example:

```bash
ALLOW_JSON_REPAIR=true npm run generate
```

## Typography unit coercion (runtime)

- To avoid touching exported JSONs, during emission the tokens under `Typographyprimitives` with `$type: "dimension"` are converted:
  - Font sizes in `px` → `rem` (16px base, rounded to 4 decimals).
  - Line-heights in `px` → unitless values.
- Applied only to `Typographyprimitives`; other dimensions are not altered.

## Multi-mode output

- `:root` emits only tokens without mode branches or with an explicit base `$value`/`modeDefault`; mode branches are ignored in the base scope.
- Each mode generates its own `[data-theme="mode-…"]` block with that mode’s overrides. Tokens that exist only inside a mode branch are emitted only there.
- Tokens with base + modes: base goes to `:root`, overrides go to their mode blocks (base is not re-emitted in modes unless you opt in with `--mode-emit-base`).
- Use `--mode <name>` to pick a preferred mode branch; `--mode-strict` fails if it’s missing, `--mode-loose` logs a fallback warning.

## Output order (primitives first)

- Within each emitted CSS block, variables with primitive values (no references) are written before alias variables (that reference other tokens).
- Section comments per file are kept in both groups for readability.

## Troubleshooting

- `--unresolved-*`: The referenced token does not exist or the name does not match.
- Parsing errors: Validate the JSONs in `input/`; with `ALLOW_JSON_REPAIR=true`, basic repairs are attempted.

## References

- Figma Plugin: [Token Forge](https://www.figma.com/community/plugin/1560757977662930693/token-forge) - best compatibility with DTCG v2 format (october 2025), git integration (not perfect, but the best I found), several export options, handles aliases and modes.
