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
- **`npm run watch`**: Runs the generator in watch mode, regenerating files whenever changes occur in the `src` folder.

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
  - `--mode <name>` (default: `light`): preferred mode branch (matches keys starting with `mode<name>`).
  - `--mode-loose` (default): if the preferred mode is missing on a node, fallback to the available mode and log a warning.
  - `--mode-strict`: fail if the preferred mode is missing anywhere.
  - `--mode-emit-base`: emit the base `$value` even when a mode branch is selected (by default it is skipped to avoid double declarations).
- Mode selection order: `modeDefault` > matching `--mode` > first `mode*` branch found.

Example:

```bash
ALLOW_JSON_REPAIR=true npm run generate
```

## Troubleshooting

- `--unresolved-*`: The referenced token does not exist or the name does not match.
- Parsing errors: Validate the JSONs in `input/`; with `ALLOW_JSON_REPAIR=true`, basic repairs are attempted.

## References

- Figma Plugin: [Token Forge](https://www.figma.com/community/plugin/1560757977662930693/token-forge)
