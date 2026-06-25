#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const outputPath = join(rootDir, "MORNING-PROOF.md");

function runStep(label, command, args) {
    const result = spawnSync(command, args, {
        cwd: rootDir,
        encoding: "utf8",
        env: process.env,
        maxBuffer: 1024 * 1024 * 12
    });

    return {
        label,
        command: [command, ...args].join(" "),
        ok: result.status === 0,
        status: result.status,
        stdout: String(result.stdout || "").trim(),
        stderr: String(result.stderr || "").trim()
    };
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

function readFile(relativePath) {
    const path = join(rootDir, relativePath);
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf8");
}

function sectionLines(markdown, heading) {
    const lines = String(markdown || "").split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
    if (start === -1) return [];
    const out = [];
    for (let index = start + 1; index < lines.length; index += 1) {
        if (lines[index].startsWith("## ")) break;
        if (lines[index].trim()) out.push(lines[index]);
    }
    return out;
}

function bullet(text) {
    return `- ${text}`;
}

function line(text = "") {
    return `${text}\n`;
}

function tail(text, maxLines = 4) {
    return String(text || "")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-maxLines)
        .join("\n");
}

function visualQaSummary(visual) {
    if (!visual) return "not recorded";
    const result = visual.ok === false ? "needs attention" : "passed";
    return `${result}${visual.generatedAt ? `, captured ${visual.generatedAt}` : ""}`;
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
        const action = !step.done && step.action ? ` Next: ${step.action}` : "";
        const verify = step.verify ? ` Proof when ready: ${step.verify}` : "";
        return bullet(`${step.label || step.key}: ${state} (${required}).${action}${verify}`);
    });
}

function main() {
    const startedAt = new Date().toISOString();
    const steps = [
        runStep("Fresh visual QA", "npm", ["run", "capture:visuals"]),
        runStep("Morning handoff", "npm", ["run", "morning:handoff"])
    ];

    const visual = loadJson("VISUAL-QA.json");
    const agent = loadJson("AGENT-RUN.json");
    const statusMarkdown = readFile("MORNING-STATUS.md");
    const handoffMarkdown = readFile("MORNING-HANDOFF.md");
    const blockers = sectionLines(statusMarkdown, "Production Blockers");
    const nextActions = sectionLines(statusMarkdown, "Safe Next Actions");
    const screenshots = visual?.screenshots || agent?.visualQa?.screenshots || {};

    let body = "";
    body += line("# Maryilu Morning Proof");
    body += line();
    body += line(`Generated at: ${new Date().toISOString()}`);
    body += line(`Started at: ${startedAt}`);
    body += line(`Overall proof status: ${steps.every((step) => step.ok) ? "green locally" : "needs attention"}`);
    body += line();

    body += line("## What This Refresh Did");
    for (const step of steps) {
        body += line(bullet(`${step.ok ? "Passed" : "Failed"} · ${step.label} (\`${step.command}\`)`));
        if (!step.ok && (step.stderr || step.stdout)) {
            body += line(`  ${tail(step.stderr || step.stdout).replace(/\n/g, "\n  ")}`);
        }
    }
    body += line();

    body += line("## Current Local Store");
    body += line(bullet("Preview URL: http://127.0.0.1:4173/?preview=store"));
    body += line(bullet(`Visual QA: ${visualQaSummary(visual)}`));
    body += line(bullet(`Agent mode: ${agent?.runMode?.title || "not recorded"}`));
    body += line(bullet(`Buyer mode: ${agent?.buyerMode || "not recorded"}`));
    body += line(bullet(`Agent setup checklist: ${setupRunbookSummary(agent)}`));
    body += line(bullet(`Production ready: ${agent?.productionReady ? "yes" : "no"}`));
    body += line();

    body += line("## Connection Runbook");
    const runbookLines = setupRunbookLines(agent);
    body += line(runbookLines.length ? runbookLines.join("\n") : bullet("No setup runbook was recorded in AGENT-RUN.json."));
    body += line();

    body += line("## Fresh Screenshots");
    body += line(bullet(`Store first viewport desktop: ${screenshots.storeHeroDesktop || "missing"}`));
    body += line(bullet(`Store first viewport mobile: ${screenshots.storeHeroMobile || "missing"}`));
    body += line(bullet(`Store desktop: ${screenshots.storeDesktop || "missing"}`));
    body += line(bullet(`Store mobile: ${screenshots.storeMobile || "missing"}`));
    body += line(bullet(`Portfolio desktop: ${screenshots.portfolioDesktop || "missing"}`));
    body += line(bullet(`Portfolio mobile: ${screenshots.portfolioMobile || "missing"}`));
    body += line(bullet(`Admin operator checklist: ${screenshots.adminChecklist || "missing"}`));
    body += line();

    body += line("## Production Blockers");
    body += line(blockers.length ? blockers.join("\n") : bullet("No blocker section was found in MORNING-STATUS.md."));
    body += line();
    body += line("## Safe Next Actions");
    body += line(nextActions.length ? nextActions.join("\n") : bullet("No next-action section was found in MORNING-STATUS.md."));
    body += line();
    body += line("## Source Files");
    body += line(bullet("MORNING-HANDOFF.md"));
    body += line(bullet("MORNING-STATUS.md"));
    body += line(bullet("AGENT-RUN.md"));
    body += line(bullet("VISUAL-QA.md"));
    body += line();

    if (handoffMarkdown) {
        body += line("## Handoff Pointer");
        body += line("The full command-by-command handoff is in `MORNING-HANDOFF.md`.");
        body += line();
    }

    writeFileSync(outputPath, body);
    console.log(`Morning proof written to ${outputPath}`);

    const failed = steps.filter((step) => !step.ok);
    if (failed.length) {
        console.error(`Morning proof failed: ${failed.map((step) => step.label).join(", ")}`);
        process.exit(1);
    }
}

main();
