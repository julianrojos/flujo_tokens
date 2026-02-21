import { spawnSync } from "node:child_process";
import { PROJECT_ROOT } from "./paths.mjs";

export function executeComponentTasks(componentPlan, globalOptions = {}) {
    const { slug, steps } = componentPlan;
    const results = {
        success: true,
        logs: []
    };

    const log = (msg) => {
        const out = `[${slug}] ${msg}`;
        results.logs.push(out);
        if (!globalOptions.silent && !globalOptions.json) console.log(out);
    };

    if (globalOptions['dry-run'] || globalOptions['status-only']) {
        log(`Dry run: skipping execution for needed steps`);
        return results;
    }

    const runCmd = (cmd, args) => {
        const fullCmd = `${cmd} ${args.join(' ')}`;
        log(`Running: ${fullCmd}`);
        const res = spawnSync(cmd, args, { stdio: globalOptions.json ? 'pipe' : 'inherit', shell: true, cwd: PROJECT_ROOT });
        if (res.status !== 0) {
            const err = `Command failed with status ${res.status}: ${fullCmd}`;
            log(`❌ Error: ${err}`);
            return { success: false, error: err };
        }
        return { success: true };
    };

    for (const step of steps) {
        if (step.blocked) {
            log(`⚠️ Skipping step '${step.id}' because it's blocked: ${step.reason}`);
            continue;
        }

        if (!step.needed) {
            log(`⏭️ Skipping step '${step.id}': ${step.reason}`);
            continue;
        }

        log(`⚙️ Executing step '${step.id}'...`);
        let res;

        switch (step.id) {
            case 'spec':
                {
                    const specArgs = ['tooling/scripts/ds-spec-from-figma.mjs', '--component-name', slug];
                    if (componentPlan.figma_node_id) {
                        specArgs.push('--component-set-node-id', componentPlan.figma_node_id);
                    }
                    res = runCmd('node', specArgs);
                }
                break;
            case 'markdown':
                res = runCmd('node', [
                    'tooling/scripts/ds-component-doc.mjs',
                    '--component-name', slug,
                    '--registry', 'docs/_generated/token-registry.json',
                    '--force', 'true'
                ]);
                break;
            case 'render':
                res = runCmd('node', ['tooling/scripts/ds-active-md-to-figma.mjs', '--markdown', `docs/components/${slug}.md`]);
                break;
            case 'proof':
                res = runCmd('npm', ['run', 'ds:capture-visual-proof', '--', '--component-name', slug]);
                break;
            default:
                res = { success: true }; 
        }

        if (!res.success) {
            results.success = false;
            log(`🛑 Stopping pipeline for ${slug} due to failure at step ${step.id}`);
            break;
        } else {
            log(`✅ Step '${step.id}' completed successfully`);
        }
    }

    return results;
}
