import fs from "node:fs";
import path from "node:path";
import { DOCS_ROOT } from "./paths.mjs";

export function generateReport(plan, executionState = {}, options = {}) {
    const isDryRun = options['dry-run'] || options['status-only'];
    
    if (options.json) {
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            options,
            orphans: plan.orphans,
            executionSummary: {
                ...executionState,
                plan: plan.components
            }
        }, null, 2));
        return;
    }

    const reset = "\x1b[0m";
    const bright = "\x1b[1m";
    const fgGreen = "\x1b[32m";
    const fgYellow = "\x1b[33m";
    const fgCyan = "\x1b[36m";
    const fgRed = "\x1b[31m";

    console.log(`\n${bright}=== DS PIPELINE SUMMARY ===${reset}\n`);

    if (isDryRun) {
        console.log(`${fgYellow}* DRY/STATUS RUN ONLY - NO CHANGES MADE *${reset}\n`);
    }

    // Orphans report
    const totalOrphans = plan.orphans.figma_only.length + plan.orphans.doc_only.length + plan.orphans.spec_only.length;
    if (totalOrphans > 0) {
        console.log(`${bright}⚠️ ORPHAN DETECTIONS (${totalOrphans})${reset}`);
        if (plan.orphans.figma_only.length > 0) {
            console.log(`   ${fgCyan}Figma Only (Needs Spec+Doc):${reset} ${plan.orphans.figma_only.join(', ')}`);
            console.log(`     ↳ Fix with: npm run ds:spec-from-figma -- --component-name <component>`);
        }
        if (plan.orphans.spec_only.length > 0) {
            console.log(`   ${fgYellow}Spec Only (Needs Doc):${reset} ${plan.orphans.spec_only.join(', ')}`);
            console.log(`     ↳ Fix with: npm run ds:component-doc -- --component-name <Component>`);
        }
        if (plan.orphans.doc_only.length > 0) {
            console.log(`   ${fgRed}Doc Only (Not in Figma/Unmapped):${reset} ${plan.orphans.doc_only.join(', ')}`);
            console.log(`     ↳ Fix by: Verifying Figma URL mapping or deleting the component markup.`);
        }
        console.log('\n');
    }

    // Component Execution Plan Summary
    console.log(`${bright}📦 COMPONENT EXECUTION PLAN${reset}`);
    for (const [slug, data] of Object.entries(plan.components)) {
        if (data.orphanStatus) {
            console.log(`   • ${slug.padEnd(20)} ${fgYellow}[ORPHAN: ${data.orphanStatus}]${reset}`);
        } else {
            const neededSteps = data.steps.filter(s => s.needed).map(s => s.id);
            const blockedSteps = data.steps.filter(s => s.blocked).map(s => s.id);
            const statusLabel = neededSteps.length === 0 ? `${fgGreen}[SYNCED]${reset}` : `${fgYellow}[PENDING STEPS]${reset}`;
            const blockedStr = blockedSteps.length > 0 ? ` ${fgRed}(Blocked: ${blockedSteps.join(', ')})${reset}` : '';
            console.log(`   • ${slug.padEnd(20)} ${statusLabel} -> ${neededSteps.length > 0 ? neededSteps.join(' -> ') : 'All good'}${blockedStr}`);
        }
    }

    console.log('\n');

    // Dump to file
    if (!isDryRun) {
        try {
            const reportDir = path.join(DOCS_ROOT, '_generated');
            if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
            
            const reportPath = path.join(reportDir, 'pipeline-report.json');
            fs.writeFileSync(reportPath, JSON.stringify({
                timestamp: new Date().toISOString(),
                options,
                orphans: plan.orphans,
                executionSummary: executionState
            }, null, 2), 'utf8');
            console.log(`${fgGreen}✅ Report saved to ${reportPath}${reset}`);
        } catch (err) {
            console.error(`${fgRed}Failed to write JSON report: ${err.message}${reset}`);
        }
    }
}
