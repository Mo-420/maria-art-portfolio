#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const outputPath = join(rootDir, "MORNING-HANDOFF.md");

function runStep(label, command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: rootDir,
        encoding: "utf8",
        env: process.env,
        maxBuffer: 1024 * 1024 * 8
    });
    return {
        label,
        command: [command, ...args].join(" "),
        ok: result.status === 0,
        expectedToFail: Boolean(options.expectedToFail),
        status: result.status,
        stdout: String(result.stdout || "").trim(),
        stderr: String(result.stderr || "").trim()
    };
}

function runJson(label, command, args, options = {}) {
    const step = runStep(label, command, args, options);
    try {
        step.data = JSON.parse(step.stdout);
    } catch (error) {
        step.parseError = error.message;
        step.data = null;
    }
    return step;
}

function line(text = "") {
    return `${text}\n`;
}

function bullet(text) {
    return `- ${text}`;
}

function statusText(step) {
    if (step.ok) return "passed";
    return step.expectedToFail ? "expected red" : "failed";
}

function checkByName(readiness, name) {
    return (readiness?.checks || []).find((check) => check.name === name) || null;
}

function readinessStatus(check) {
    if (!check) return "unknown";
    return `${check.ok ? "ready" : "not ready"} (${check.message || "no detail"})`;
}

function syncSourceLabel(sync) {
    if (sync?.proofSource === "local-preview" || sync?.simulated) return "local preview feed";
    if (sync?.instagramReady) return "real Meta API";
    if (sync?.proofSource === "instagram") return "cached Instagram proof";
    return "not configured yet";
}

function loadJson(relativePath) {
    const path = join(rootDir, relativePath);
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch {
        return null;
    }
}

function tail(text, maxLines = 8) {
    const lines = String(text || "").split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines).join("\n");
}

function setupRunbookSummary(agent) {
    const steps = Array.isArray(agent?.setupRunbook) ? agent.setupRunbook : [];
    if (!steps.length) return "not recorded";
    const required = steps.filter((step) => step.required !== false);
    const requiredDone = required.filter((step) => step.done);
    const optional = steps.filter((step) => step.required === false);
    const optionalDone = optional.filter((step) => step.done);
    return `${requiredDone.length}/${required.length} required ready, ${optionalDone.length}/${optional.length} optional ready`;
}

function setupRunbookLines(agent) {
    const steps = Array.isArray(agent?.setupRunbook) ? agent.setupRunbook : [];
    return steps.map((step) => {
        const state = step.done ? "ready" : "needs setup";
        const required = step.required === false ? "optional" : "required";
        const command = step.command ? ` Command: \`${step.command}\`.` : "";
        return bullet(`${step.label || step.key}: ${state} (${required}). ${step.action || "No action recorded."}${command}`);
    });
}

function main() {
    const startedAt = new Date().toISOString();
    const steps = [
        runStep("Syntax check", "npm", ["run", "check:syntax"]),
        runStep("Worker behavior tests", "npm", ["run", "test:worker"]),
        runStep("Public build", "npm", ["run", "build"]),
        runStep("Deploy package preflight", "npm", ["run", "deploy:preflight", "--", "--target", "all", "--package-only"]),
        runStep("Local runtime smoke", "npm", ["run", "verify:runtime-local"]),
        runStep("Android wrapper verify", "npm", ["run", "mobile:android:verify"]),
        runStep("Instagram agent report", "npm", ["run", "agent:instagram"]),
        runStep("Morning status", "npm", ["run", "status:morning"]),
        runJson("Cloudflare status JSON", "node", ["scripts/cloudflare-status-check.mjs", "--json"]),
        runJson("Launch report JSON", "node", ["scripts/launch-report.mjs", "--json"]),
        runJson("Readiness JSON", "node", ["scripts/readiness-check.mjs", "--json"], { expectedToFail: true })
    ];

    const readiness = steps.find((step) => step.label === "Readiness JSON")?.data;
    const launchReport = steps.find((step) => step.label === "Launch report JSON")?.data;
    const cloudflareStatus = steps.find((step) => step.label === "Cloudflare status JSON")?.data;
    const agent = loadJson("AGENT-RUN.json");
    const screenshots = agent?.visualQa?.screenshots || {};
    const debugApkPath = "android/app/build/outputs/apk/debug/app-debug.apk";
    const debugApkExists = existsSync(join(rootDir, debugApkPath));
    const requiredFailures = (readiness?.checks || []).filter((check) => check.required !== false && !check.ok);
    const unexpectedFailures = steps.filter((step) => !step.ok && !step.expectedToFail);

    let body = "";
    body += line("# Maryilu Morning Handoff");
    body += line();
    body += line(`Generated at: ${new Date().toISOString()}`);
    body += line(`Started at: ${startedAt}`);
    body += line(`Overall local package status: ${unexpectedFailures.length ? "needs attention" : "green"}`);
    body += line(`Production launch status: ${readiness?.ok ? "ready" : "not ready"}`);
    body += line();

    body += line("## Current Buyer Surface");
    body += line(bullet(`Local store: ${readinessStatus(checkByName(readiness, "Local sales site"))}`));
    body += line(bullet(`Local Worker shop items: ${readinessStatus(checkByName(readiness, "Local Worker shop items"))}`));
    body += line(bullet(`Local admin/automation status: ${readinessStatus(checkByName(readiness, "Local Worker automation status"))}`));
    body += line(bullet("Visual direction: premium editorial store with a shared floating glass nav, dramatic painted-chest hero, sage/gold Aceternity-style beams, moving-border CTAs, spotlight cards, a calm white custom-order path, concise quote-led language, and a short-brief custom order form."));
    body += line();

    body += line("## Agent, Backend, Mobile");
    body += line(bullet(`Instagram agent mode: ${agent?.mode || "not recorded"}`));
    body += line(bullet(`Instagram sync source: ${syncSourceLabel(agent?.sync)}`));
    body += line(bullet(`Review queue: ${agent?.reviewQueue?.total ?? "unknown"} item(s)`));
    body += line(bullet(`Direct-buy items: ${agent?.commerce?.directBuyItems ?? "unknown"}`));
    body += line(bullet(`Setup checklist: ${setupRunbookSummary(agent)}`));
    body += line(bullet(`Android debug APK: ${debugApkExists ? debugApkPath : "not built"}`));
    body += line();

    body += line("## Connection Runbook");
    const runbookLines = setupRunbookLines(agent);
    body += line(runbookLines.length ? runbookLines.join("\n") : bullet("No setup runbook was recorded in AGENT-RUN.json."));
    body += line();

    body += line("## Cloudflare Production State");
    if (cloudflareStatus?.missingConfig?.length) {
        body += line(bullet(`Cloudflare status script needs ${cloudflareStatus.missingConfig.join(", ")} to verify the live account directly.`));
    } else if (cloudflareStatus) {
        const deployment = cloudflareStatus.pages?.latestDeployment;
        body += line(bullet(`Pages project: ${cloudflareStatus.pages?.projectFound ? "found" : "missing"} (${cloudflareStatus.config?.pagesProject || "unknown"})`));
        body += line(bullet(`Latest Pages deployment: ${deployment?.id || "unknown"}${deployment?.createdOn ? ` from ${deployment.createdOn}` : ""}`));
        body += line(bullet(`Live store marker: ${cloudflareStatus.liveSite?.currentStoreDetected ? "current premium buyer store detected" : "not detected"}`));
        body += line(bullet(`Worker: ${cloudflareStatus.worker?.ok ? "found" : "missing"} (${cloudflareStatus.config?.workerName || "unknown"})`));
        body += line(bullet(`Worker missing secrets: ${cloudflareStatus.worker?.missingSecrets?.length ? cloudflareStatus.worker.missingSecrets.join(", ") : "none reported"}`));
        body += line(bullet(`Portfolio DNS: ${cloudflareStatus.dns?.portfolioRecord || "missing"}`));
    } else {
        body += line(bullet("Cloudflare status was not recorded."));
    }
    body += line();

    body += line("## Visual Evidence");
    body += line(bullet(`Store first viewport desktop: ${screenshots.storeHeroDesktop || "missing"}`));
    body += line(bullet(`Store first viewport mobile: ${screenshots.storeHeroMobile || "missing"}`));
    body += line(bullet(`Store desktop: ${screenshots.storeDesktop || "missing"}`));
    body += line(bullet(`Store mobile: ${screenshots.storeMobile || "missing"}`));
    body += line(bullet(`Portfolio desktop: ${screenshots.portfolioDesktop || "missing"}`));
    body += line(bullet(`Portfolio mobile: ${screenshots.portfolioMobile || "missing"}`));
    body += line(bullet(`Admin operator checklist: ${screenshots.adminChecklist || "missing or skipped"}`));
    body += line();

    body += line("## Command Evidence");
    for (const step of steps) {
        body += line(bullet(`${step.label}: ${statusText(step)} (\`${step.command}\`)`));
        if (!step.ok && step.stderr) {
            body += line(`  ${tail(step.stderr, 3).replace(/\n/g, "\n  ")}`);
        }
    }
    body += line();

    body += line("## Production Blockers");
    if (!requiredFailures.length) {
        body += line(bullet("None. Readiness checks are green."));
    } else {
        for (const blocker of requiredFailures) {
            body += line(bullet(`${blocker.name}: ${blocker.message}`));
        }
    }
    body += line();

    body += line("## Safe Next Actions");
    for (const [index, action] of (launchReport?.launchOrder || []).entries()) {
        body += line(`${index + 1}. ${action}`);
    }
    body += line();

    body += line("## Linked Artifacts");
    body += line(bullet("MORNING-STATUS.md"));
    body += line(bullet("AGENT-RUN.md"));
    body += line(bullet("AGENT-RUN.json"));
    body += line(bullet("VISUAL-QA.md"));
    body += line(bullet("VISUAL-QA.json"));
    body += line(bullet("SIMULATED-INSTAGRAM-SYNC.md"));
    body += line(bullet("LOCAL-SHOP-SEED.md"));
    body += line(bullet("MOBILE-APP.md"));
    body += line(bullet("CLOUDFLARE-STATUS.md"));

    writeFileSync(outputPath, body);
    console.log(`Morning handoff written to ${outputPath}`);
    if (unexpectedFailures.length) {
        console.error(`Unexpected handoff failure(s): ${unexpectedFailures.map((step) => step.label).join(", ")}`);
        process.exit(1);
    }
}

if (!existsSync(join(rootDir, "package.json"))) {
    throw new Error("Run this from the Maryilu repository root.");
}

main();
