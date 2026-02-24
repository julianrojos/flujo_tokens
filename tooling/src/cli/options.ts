import fs from 'fs';
import path from 'path';

import { formatDiagnostic } from '../utils/logging.js';
import type { PipelinePhase } from '../runtime/pipeline-cache.js';

export type CliOptions = {
    inputDir: string;
    outputFile: string;
    outputPrimitives: string;
    outputTokens: string;
    registryOutput: string;
    split: boolean;
    registry: boolean;
    help: boolean;
    mode?: string;
    modeStrict: boolean;
    system?: string;
    fromPhase?: PipelinePhase;
    forcePhases: PipelinePhase[];
    checkpoints: boolean;
    cacheDir?: string;
    pluginModules: string[];
};

function parsePhaseName(value: string): PipelinePhase | null {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'ingest' || normalized === 'index' || normalized === 'analyze' || normalized === 'emit') {
        return normalized;
    }
    return null;
}

function consumeArgValue(
    argv: string[],
    index: number,
    optionName: string
): { value: string; nextIndex: number } | null {
    const value = argv[index + 1];
    if (!value) {
        console.error(formatDiagnostic('error', `Missing value for ${optionName}`));
        return null;
    }
    return { value, nextIndex: index + 1 };
}

function getSystemPaths(rootDir: string, systemId?: string) {
    const configRaw = fs.readFileSync(path.join(rootDir, 'tooling/config/design-systems.json'), 'utf8');
    const config = JSON.parse(configRaw);
    const sid = systemId || config.defaultSystem;
    const sys = config.systems.find((s: any) => s.id === sid);
    if (!sys) throw new Error(`Unknown system: ${sid}`);
    return {
        inputDir: path.resolve(rootDir, sys.inputDir),
        outputPrimitives: path.resolve(rootDir, sys.outputDir, 'primitives.css'),
        outputTokens: path.resolve(rootDir, sys.outputDir, 'tokens.css'),
        outputFile: path.resolve(rootDir, sys.outputDir, 'custom-properties.css'),
        registryOutput: path.resolve(rootDir, sys.docsDir, '_generated/token-registry.json'),
    };
}

export function printUsage(): void {
    console.log(`Usage: npm run generate -- [options]

Options:
  -h, --help           Show this help and exit
  -i, --input <dir>    Directory with token JSON files (default: ./input)
  -o, --output <file>  Output CSS file (default: ./output/custom-properties.css)
      --split          Emit two files: primitives + tokens (default)
      --single         Emit one file (disables split)
      --output-primitives <file>  Primitives CSS output (default: ./output/primitives.css)
      --output-tokens <file>      Tokens CSS output (default: ./output/tokens.css)
      --registry       Also export docs token registry JSON (default: off)
      --registry-output <file>    Token registry output (default: system dependent)
      --system <id>        Set active design system (default: from config)
  -m, --mode <name>    Preferred mode branch (default: none; uses modeDefault or first mode)
      --mode-strict    Fail if preferred mode is missing in any node (default: off)
      --mode-loose     Allow fallback to available mode if preferred is missing (default: on)
      --from-phase <phase>   Re-run from phase: ingest|index|analyze|emit
      --force-phase <phase>  Force a phase (and downstream). Repeatable or comma-separated
      --plugin <path>        Load external phase plugin module (.mjs/.js/.ts). Repeatable
      --no-checkpoints       Disable phase checkpoints
      --cache-dir <dir>      Checkpoint directory (default: ./.cache/tokens-<system>)
`);
}

export function parseArgs(
    argv: string[],
    args: { rootDir: string; cwd?: string }
): CliOptions | null {
    let split = true;
    let registry = false;
    let help = false;
    let mode: string | undefined;
    let modeStrict = false;
    let systemId: string | undefined;
    let fromPhase: PipelinePhase | undefined;
    const forcePhases: PipelinePhase[] = [];
    let checkpoints = true;
    let cacheDir: string | undefined;
    const pluginModules: string[] = [];
    const cwd = args.cwd || process.cwd();

    // First pass loop just to find systemId.
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--system') {
            const consumed = consumeArgValue(argv, i, '--system');
            if (!consumed) return null;
            systemId = consumed.value;
            break;
        }
    }

    const sysPaths = getSystemPaths(args.rootDir, systemId);
    let inputDir = sysPaths.inputDir;
    let outputFile = sysPaths.outputFile;
    let outputPrimitives = sysPaths.outputPrimitives;
    let outputTokens = sysPaths.outputTokens;
    let registryOutput = sysPaths.registryOutput;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '-h' || arg === '--help') {
            help = true;
            continue;
        }

        if (arg === '-i' || arg === '--input') {
            const consumed = consumeArgValue(argv, i, '--input');
            if (!consumed) return null;
            inputDir = path.resolve(cwd, consumed.value);
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '-o' || arg === '--output') {
            const consumed = consumeArgValue(argv, i, '--output');
            if (!consumed) return null;
            outputFile = path.resolve(cwd, consumed.value);
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '--split') {
            split = true;
            continue;
        }

        if (arg === '--single') {
            split = false;
            continue;
        }

        if (arg === '--output-primitives') {
            const consumed = consumeArgValue(argv, i, '--output-primitives');
            if (!consumed) return null;
            outputPrimitives = path.resolve(cwd, consumed.value);
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '--output-tokens') {
            const consumed = consumeArgValue(argv, i, '--output-tokens');
            if (!consumed) return null;
            outputTokens = path.resolve(cwd, consumed.value);
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '--registry') {
            registry = true;
            continue;
        }

        if (arg === '--registry-output') {
            const consumed = consumeArgValue(argv, i, '--registry-output');
            if (!consumed) return null;
            registryOutput = path.resolve(cwd, consumed.value);
            registry = true;
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '-m' || arg === '--mode') {
            const consumed = consumeArgValue(argv, i, '--mode');
            if (!consumed) return null;
            mode = consumed.value;
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '--mode-strict') {
            modeStrict = true;
            continue;
        }

        if (arg === '--mode-loose') {
            modeStrict = false;
            continue;
        }

        if (arg === '--from-phase') {
            const consumed = consumeArgValue(argv, i, '--from-phase');
            if (!consumed) return null;
            const parsedPhase = parsePhaseName(consumed.value);
            if (!parsedPhase) {
                console.error(
                    formatDiagnostic(
                        'error',
                        `Invalid --from-phase: ${consumed.value} (use: ingest|index|analyze|emit)`
                    )
                );
                return null;
            }
            fromPhase = parsedPhase;
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '--force-phase') {
            const consumed = consumeArgValue(argv, i, '--force-phase');
            if (!consumed) return null;
            const rawPhases = consumed.value.split(',').map(s => s.trim()).filter(Boolean);
            for (const raw of rawPhases) {
                const parsedPhase = parsePhaseName(raw);
                if (!parsedPhase) {
                    console.error(
                        formatDiagnostic(
                            'error',
                            `Invalid --force-phase value: ${raw} (use: ingest|index|analyze|emit)`
                        )
                    );
                    return null;
                }
                forcePhases.push(parsedPhase);
            }
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '--no-checkpoints') {
            checkpoints = false;
            continue;
        }

        if (arg === '--plugin') {
            const consumed = consumeArgValue(argv, i, '--plugin');
            if (!consumed) return null;
            pluginModules.push(path.resolve(cwd, consumed.value));
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '--cache-dir') {
            const consumed = consumeArgValue(argv, i, '--cache-dir');
            if (!consumed) return null;
            cacheDir = path.resolve(cwd, consumed.value);
            i = consumed.nextIndex;
            continue;
        }

        if (arg === '--system') {
            i++;
            continue;
        }

        console.error(formatDiagnostic('error', `Unknown argument: ${arg}`));
        return null;
    }

    return {
        inputDir,
        outputFile,
        outputPrimitives,
        outputTokens,
        registryOutput,
        split,
        registry,
        help,
        mode,
        modeStrict,
        system: systemId,
        fromPhase,
        forcePhases,
        checkpoints,
        cacheDir,
        pluginModules
    };
}
