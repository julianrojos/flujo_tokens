import path from 'path';

import { formatDiagnostic } from '../utils/logging.js';
import type { PipelinePhase } from '../runtime/pipeline-cache.js';
import { createDesignSystemRepository } from '../../scripts/lib/system-repository.mjs';

export type CliOptions = {
    inputDir: string;
    outputFile: string;
    outputPrimitives: string;
    outputTokens: string;
    split: boolean;
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

type ParseState = {
    inputDir: string;
    outputFile: string;
    outputPrimitives: string;
    outputTokens: string;
    split: boolean;
    help: boolean;
    mode?: string;
    modeStrict: boolean;
    fromPhase?: PipelinePhase;
    forcePhases: PipelinePhase[];
    checkpoints: boolean;
    cacheDir?: string;
    pluginModules: string[];
};

type OptionSpec = {
    names: string[];
    takesValue?: boolean;
    apply: (state: ParseState, args: { value?: string; cwd: string; optionName: string }) => boolean;
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

function resolveSystemOverride(argv: string[]): string | null | undefined {
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg !== '--system') continue;
        const consumed = consumeArgValue(argv, i, '--system');
        if (!consumed) return null;
        return consumed.value;
    }
    return undefined;
}

function getSystemPaths(rootDir: string, systemId?: string) {
    const repository = createDesignSystemRepository({ repoRoot: rootDir });
    const systems = repository.getAll();
    if (!Array.isArray(systems)) {
        const sid = String(systemId || '').trim();
        const resolvedSid = sid || 'sys-01';
        const baseDir = path.join('design-systems', resolvedSid);
        const outputDir = path.join(baseDir, 'output');
        return {
            inputDir: path.resolve(rootDir, baseDir, 'input'),
            outputPrimitives: path.resolve(rootDir, outputDir, 'primitives.css'),
            outputTokens: path.resolve(rootDir, outputDir, 'tokens.css'),
            outputFile: path.resolve(rootDir, outputDir, 'custom-properties.css'),
        };
    }
    const configuredDefault = repository.getDefaultSystemId();
    if (configuredDefault && typeof configuredDefault !== 'string') {
        throw new Error('Default system id is not available in synchronous mode.');
    }
    const sid = String(systemId || configuredDefault || systems[0]?.id || '').trim();
    if (!sid) {
        repository.dispose();
        throw new Error('No active design system. Configure one in PostgreSQL or pass --system <id>.');
    }
    const sys = repository.getById(sid);
    if (!sys) {
        repository.dispose();
        throw new Error(`Unknown system: ${sid}`);
    }
    repository.dispose();
    const baseDir = path.join('design-systems', sid);
    const outputDir = path.join(baseDir, 'output');
    return {
        inputDir: path.resolve(rootDir, baseDir, 'input'),
        outputPrimitives: path.resolve(rootDir, outputDir, 'primitives.css'),
        outputTokens: path.resolve(rootDir, outputDir, 'tokens.css'),
        outputFile: path.resolve(rootDir, outputDir, 'custom-properties.css'),
    };
}

export function printUsage(): void {
    console.log(`Usage: npm run generate -- [options]

Options:
  -h, --help           Show this help and exit
  -i, --input <dir>    Directory with token JSON files (default: system inputDir)
  -o, --output <file>  Output CSS file (default: <system>/output/custom-properties.css)
      --split          Emit two files: primitives + tokens (default)
      --single         Emit one file (disables split)
      --output-primitives <file>  Primitives CSS output (default: <system>/output/primitives.css)
      --output-tokens <file>      Tokens CSS output (default: <system>/output/tokens.css)
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

// Keep a dependency-free parser until we need true subcommands.
const OPTION_SPECS: OptionSpec[] = [
    {
        names: ['-h', '--help'],
        apply: (state) => {
            state.help = true;
            return true;
        }
    },
    {
        names: ['-i', '--input'],
        takesValue: true,
        apply: (state, { value, cwd }) => {
            state.inputDir = path.resolve(cwd, String(value || ''));
            return true;
        }
    },
    {
        names: ['-o', '--output'],
        takesValue: true,
        apply: (state, { value, cwd }) => {
            state.outputFile = path.resolve(cwd, String(value || ''));
            return true;
        }
    },
    {
        names: ['--split'],
        apply: (state) => {
            state.split = true;
            return true;
        }
    },
    {
        names: ['--single'],
        apply: (state) => {
            state.split = false;
            return true;
        }
    },
    {
        names: ['--output-primitives'],
        takesValue: true,
        apply: (state, { value, cwd }) => {
            state.outputPrimitives = path.resolve(cwd, String(value || ''));
            return true;
        }
    },
    {
        names: ['--output-tokens'],
        takesValue: true,
        apply: (state, { value, cwd }) => {
            state.outputTokens = path.resolve(cwd, String(value || ''));
            return true;
        }
    },
    {
        names: ['-m', '--mode'],
        takesValue: true,
        apply: (state, { value }) => {
            state.mode = value;
            return true;
        }
    },
    {
        names: ['--mode-strict'],
        apply: (state) => {
            state.modeStrict = true;
            return true;
        }
    },
    {
        names: ['--mode-loose'],
        apply: (state) => {
            state.modeStrict = false;
            return true;
        }
    },
    {
        names: ['--from-phase'],
        takesValue: true,
        apply: (state, { value }) => {
            const parsedPhase = parsePhaseName(String(value || ''));
            if (!parsedPhase) {
                console.error(
                    formatDiagnostic(
                        'error',
                        `Invalid --from-phase: ${value} (use: ingest|index|analyze|emit)`
                    )
                );
                return false;
            }
            state.fromPhase = parsedPhase;
            return true;
        }
    },
    {
        names: ['--force-phase'],
        takesValue: true,
        apply: (state, { value }) => {
            const rawPhases = String(value || '').split(',').map(s => s.trim()).filter(Boolean);
            for (const raw of rawPhases) {
                const parsedPhase = parsePhaseName(raw);
                if (!parsedPhase) {
                    console.error(
                        formatDiagnostic(
                            'error',
                            `Invalid --force-phase value: ${raw} (use: ingest|index|analyze|emit)`
                        )
                    );
                    return false;
                }
                state.forcePhases.push(parsedPhase);
            }
            return true;
        }
    },
    {
        names: ['--no-checkpoints'],
        apply: (state) => {
            state.checkpoints = false;
            return true;
        }
    },
    {
        names: ['--plugin'],
        takesValue: true,
        apply: (state, { value, cwd }) => {
            state.pluginModules.push(path.resolve(cwd, String(value || '')));
            return true;
        }
    },
    {
        names: ['--cache-dir'],
        takesValue: true,
        apply: (state, { value, cwd }) => {
            state.cacheDir = path.resolve(cwd, String(value || ''));
            return true;
        }
    }
];

const OPTION_SPEC_BY_NAME = new Map<string, OptionSpec>(
    OPTION_SPECS.flatMap((spec) => spec.names.map((name) => [name, spec]))
);

export function parseArgs(
    argv: string[],
    args: { rootDir: string; cwd?: string }
): CliOptions | null {
    const cwd = args.cwd || process.cwd();
    const systemOverride = resolveSystemOverride(argv);
    if (systemOverride === null) return null;
    const systemId = systemOverride;

    const sysPaths = getSystemPaths(args.rootDir, systemId);
    const state: ParseState = {
        inputDir: sysPaths.inputDir,
        outputFile: sysPaths.outputFile,
        outputPrimitives: sysPaths.outputPrimitives,
        outputTokens: sysPaths.outputTokens,
        split: true,
        help: false,
        mode: undefined,
        modeStrict: false,
        fromPhase: undefined,
        forcePhases: [],
        checkpoints: true,
        cacheDir: undefined,
        pluginModules: []
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        // `--system` is resolved in first pass to preserve existing default-path behavior.
        if (arg === '--system') {
            i++;
            continue;
        }

        const spec = OPTION_SPEC_BY_NAME.get(arg);
        if (!spec) {
            console.error(formatDiagnostic('error', `Unknown argument: ${arg}`));
            return null;
        }

        let consumedValue: string | undefined;
        if (spec.takesValue) {
            const consumed = consumeArgValue(argv, i, spec.names[spec.names.length - 1] || arg);
            if (!consumed) return null;
            consumedValue = consumed.value;
            i = consumed.nextIndex;
        }

        const ok = spec.apply(state, {
            value: consumedValue,
            cwd,
            optionName: arg
        });
        if (!ok) return null;
    }

    return {
        inputDir: state.inputDir,
        outputFile: state.outputFile,
        outputPrimitives: state.outputPrimitives,
        outputTokens: state.outputTokens,
        split: state.split,
        help: state.help,
        mode: state.mode,
        modeStrict: state.modeStrict,
        system: systemId,
        fromPhase: state.fromPhase,
        forcePhases: state.forcePhases,
        checkpoints: state.checkpoints,
        cacheDir: state.cacheDir,
        pluginModules: state.pluginModules
    };
}
