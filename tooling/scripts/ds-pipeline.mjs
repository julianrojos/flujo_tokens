import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { createPlan } from "./lib/pipeline-plan.mjs";
import { generateReport } from "./lib/pipeline-report.mjs";
import { executeComponentTasks } from "./lib/component-orchestrator.mjs";
import { resolveSystemContextSafe, PROJECT_ROOT } from "./lib/system-context.mjs";

const CLI_CONFIG = {
  command: "ds:pipeline [options]",
  description: "Orchestrate the full Design System documentation pipeline.",
  options: [
    { name: "--component", description: "Target specific component slug (e.g. alert)" },
    { name: "--all", description: "Process all components" },
    { name: "--from-step", description: "Start from specific step (spec|markdown|render|proof)" },
    { name: "--only-step", description: "Execute only a specific step (spec|markdown|render|proof)" },
    { name: "--render-figma", description: "Render docs back to Figma" },
    { name: "--dry-run", description: "Plan but do not execute" },
    { name: "--status-only", description: "Only show plan and orphan status" },
    { name: "--strict", description: "Fail on first error" },
    { name: "--system", description: "Target design system (default: iter)" },
    { name: "--json", description: "Output silent JSON" },
    { name: "--help", description: "Show help" }
  ]
};

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    
    if (opts.help) {
        printUsage(CLI_CONFIG);
        return;
    }

    if (!opts.json) console.log('\n\x1b[1m🚀 STARTING DS-PIPELINE ORCHESTRATOR\x1b[0m');

    // Run ds:doctor preflight if registry is missing or not purely status-only.
    // ds:doctor does not support --ignore; we capture its JSON output and filter
    // only the checks that are fatal for the pipeline (paths + registries).
    // Non-fatal checks: RULE_MANIFEST_COVERAGE, AGENTS, VALIDATE_DOCS.
    const ctx = resolveSystemContextSafe(opts);
    const FATAL_PREFLIGHT_CHECKS = new Set(['PATH_DOCS', 'PATH_SPECS', 'TOKEN_REGISTRY', 'COMPONENT_REGISTRY']);
    const registryExists = fs.existsSync(ctx.paths.registry);
    if (!opts['status-only'] || !registryExists) {
        if (!opts.json) console.log('\n\x1b[35m=== RUNNING PREFLIGHT (ds:doctor) ===\x1b[0m');

        const preflightSysArgs = opts.system ? ['--system', opts.system] : [];
        const docRes = spawnSync('npm', ['run', 'ds:doctor', '--', ...preflightSysArgs, '--json'], {
            cwd: PROJECT_ROOT,
            shell: false,
            stdio: 'pipe',
            encoding: 'utf8'
        });

        // Parse JSON from stdout (npm run prefixes with "> ...\n> ...\n" lines — strip them)
        let doctorChecks = [];
        try {
            const jsonMatch = (docRes.stdout || '').match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const doctorReport = JSON.parse(jsonMatch[0]);
                doctorChecks = doctorReport.checks || [];
            }
        } catch (_) { /* unparseable — fall through to raw exit code check */ }

        const fatalFailures = doctorChecks.filter(
            c => FATAL_PREFLIGHT_CHECKS.has(c.id) && c.status === 'fail'
        );

        if (fatalFailures.length > 0) {
            if (!opts.json) {
                console.error('\x1b[31m❌ Preflight failed on core checks:\x1b[0m');
                for (const c of fatalFailures) {
                    console.error(`   • ${c.id}: ${c.message}`);
                }
            }
            process.exit(1);
        } else if (!opts.json) {
            const skipped = doctorChecks.filter(c => !FATAL_PREFLIGHT_CHECKS.has(c.id) && c.status === 'fail').map(c => c.id);
            console.log(`✅ Preflight passed${skipped.length > 0 ? ` (non-fatal skipped: ${skipped.join(', ')})` : ''}`);
        }
    }

    const planOpts = {
        component: opts.component,
        all: opts.all === "true" || !!opts.all,
        'from-step': opts['from-step'],
        'only-step': opts['only-step'],
        'render-figma': opts['render-figma'] === "true" || !!opts['render-figma'],
        'dry-run': opts['dry-run'] === "true" || !!opts['dry-run'],
        'status-only': opts['status-only'] === "true" || !!opts['status-only'],
        strict: opts.strict === "true" || !!opts.strict,
        system: opts.system,
        dsContext: ctx,
        json: opts.json === "true" || !!opts.json
    };

    if (!opts.json) console.log('\n\x1b[35m=== PHASE 1: PLANNING ===\x1b[0m');
    const plan = await createPlan(planOpts);

    if (planOpts['status-only']) {
        generateReport(plan, {}, planOpts);
        process.exit(0);
    }

    if (!opts.json) console.log('\n\x1b[35m=== PHASE 2: EXECUTION ===\x1b[0m');
    const executionState = {
        global: { tokensSync: null, finalGate: null },
        components: {}
    };

    const runGlobalCmd = (msg, cmd, args, silent = false) => {
        if (!silent) console.log(`\x1b[36m[SYS] ${msg}\x1b[0m`);
        if (planOpts['dry-run']) {
            if (!silent) console.log(`   (Dry Run: Skipping ${cmd} ${args.join(' ')})`);
            return true;
        }
        const res = spawnSync(cmd, args, { stdio: silent ? 'pipe' : 'inherit', shell: false, cwd: PROJECT_ROOT });
        return res.status === 0;
    };

    const sysArgs = opts.system ? ['--', '--system', opts.system] : [];
    
    // We update generate:registry and others to accept the system flag
    const tokensOk = runGlobalCmd('Stage A: Syncing Token Registry', 'npm', ['run', 'generate:registry', ...sysArgs], planOpts.json);
    executionState.global.tokensSync = tokensOk ? 'Success' : 'Failed';

    if (!tokensOk && !planOpts['dry-run']) {
        console.error('❌ Failed to sync token registry. Aborting.');
        process.exit(1);
    }

    for (const [slug, compPlan] of Object.entries(plan.components)) {
        if (!opts.json) console.log(`\n\x1b[35m--- Processing Component: ${slug} ---\x1b[0m`);
        
        if (compPlan.orphanStatus === 'doc_only' || compPlan.orphanStatus === 'figma_only') {
            if (!opts.json) console.log(`⚠️ Component '${slug}' is an orchestrator orphan (${compPlan.orphanStatus}). Skipping execution.`);
            continue;
        }

        const metrics = executeComponentTasks(compPlan, planOpts);
        executionState.components[slug] = metrics;
        
        if (!metrics.success && planOpts.strict && !planOpts['dry-run']) {
            if (!opts.json) console.error(`\n\x1b[31m❌ Strict mode: Aborting and stopping pipeline due to failure in '${slug}'.\x1b[0m`);
            break;
        }
    }

    if (!opts.json) console.log(`\n\x1b[35m--- Global Validations ---\x1b[0m`);
    const valOk = runGlobalCmd('Stage F: Validating Final Docs', 'npm', ['run', 'validate:docs', ...sysArgs], planOpts.json);
    executionState.global.finalGate = valOk ? 'Success' : 'Validation Failed';

    // Accumulate component-level failures
    const failedComponents = Object.entries(executionState.components)
        .filter(([, m]) => m.success === false)
        .map(([slug]) => slug);

    const hasFailures = failedComponents.length > 0 || !valOk;

    generateReport(plan, executionState, planOpts, { hasFailures, failedComponents });

    if (hasFailures && !planOpts['dry-run']) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
