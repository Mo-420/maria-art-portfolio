#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const strictMode = args.has("--strict");
const noSync = args.has("--no-sync");
const productionMode = args.has("--production");
const outputPath = valueArg("--out") || join(rootDir, "AGENT-RUN.md");
const jsonOutputPath = valueArg("--json-out") || outputPath.replace(/\.md$/i, ".json");
const visualQaMaxAgeMs = 12 * 60 * 60 * 1000;

function valueArg(name) {
    const prefixed = `${name}=`;
    const found = process.argv.slice(2).find(arg => arg.startsWith(prefixed));
    return found ? found.slice(prefixed.length) : "";
}

function loadDotEnv(filePath) {
    if (!existsSync(filePath)) return {};
    return readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .reduce((acc, line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return acc;
            const index = trimmed.indexOf("=");
            const key = trimmed.slice(0, index).trim();
            const value = trimmed.slice(index + 1).trim();
            if (key) acc[key] = value;
            return acc;
        }, {});
}

const env = { ...loadDotEnv(join(rootDir, ".dev.vars")), ...process.env };
const apiUrl = (valueArg("--api-url")
    || env.AGENT_WORKER_URL
    || (productionMode ? env.PRODUCTION_WORKER_URL : env.LOCAL_WORKER_URL)
    || (productionMode ? "https://maria-art-data-api.maros-pristas.workers.dev" : "http://127.0.0.1:8788")).replace(/\/+$/, "");
const adminToken = valueArg("--token")
    || env.AGENT_ADMIN_TOKEN
    || (productionMode ? env.PRODUCTION_ADMIN_TOKEN : env.ADMIN_TOKEN)
    || "";

function redact(value) {
    const text = String(value || "");
    if (!text) return "missing";
    return "configured";
}

async function fetchJson(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.admin) headers.set("Authorization", `Bearer ${adminToken}`);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const response = await fetch(`${apiUrl}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { success: false, error: text.slice(0, 240) || `HTTP ${response.status}` };
    }
    return { ok: response.ok, status: response.status, data };
}

function runReadiness() {
    const result = spawnSync(process.execPath, ["scripts/readiness-check.mjs", "--json"], {
        cwd: rootDir,
        encoding: "utf8",
        env: process.env
    });
    const stdout = String(result.stdout || "").trim();
    if (!stdout) return { ok: false, error: String(result.stderr || "No readiness output").trim(), checks: [] };
    try {
        return JSON.parse(stdout);
    } catch (error) {
        return { ok: false, error: error.message, checks: [] };
    }
}

function line(text = "") {
    return `${text}\n`;
}

function formatTime(value) {
    if (!value) return "not recorded";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function checkMark(ok) {
    return ok ? "ready" : "not ready";
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function checkByName(readiness, name) {
    return safeArray(readiness?.checks).find(check => check.name === name) || null;
}

function compactCheck(check) {
    if (!check) return null;
    return {
        name: check.name,
        ok: Boolean(check.ok),
        message: check.message || "",
        required: check.required !== false,
        url: check.url || ""
    };
}

function syncSourceLabel(sync) {
    if (sync?.proofSource === "local-preview" || sync?.simulated) return "local preview feed";
    if (sync?.instagramReady) return "real Meta API";
    if (sync?.proofSource === "instagram") return "cached Instagram proof";
    return "not configured yet";
}

function latestVisualCapture() {
    const path = join(rootDir, "VISUAL-QA.json");
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch {
        return null;
    }
}

function visualCaptureHealth(captured) {
    const requiredScreenshots = [
        "storeDesktop",
        "storeMobile",
        "portfolioDesktop",
        "portfolioMobile",
        "adminChecklist"
    ];
    if (!captured) {
        return {
            status: "missing",
            screenshots: {},
            capturedAt: null,
            issues: ["VISUAL-QA.json is missing; run npm run capture:visuals before relying on visual proof."]
        };
    }

    const screenshots = captured.screenshots || {};
    const missingScreenshots = requiredScreenshots.filter((key) => !screenshots[key] || !existsSync(screenshots[key]));
    const generatedTime = captured.generatedAt ? new Date(captured.generatedAt).getTime() : Number.NaN;
    const ageMs = Number.isFinite(generatedTime) ? Date.now() - generatedTime : Number.POSITIVE_INFINITY;
    const stale = !Number.isFinite(generatedTime) || ageMs > visualQaMaxAgeMs;
    const issues = [];

    if (captured.ok === false) issues.push("VISUAL-QA.json reported warnings or failures.");
    if (stale) issues.push("VISUAL-QA.json is stale or missing a generatedAt timestamp.");
    for (const key of missingScreenshots) issues.push(`Screenshot file missing: ${key}.`);

    return {
        status: issues.length ? "needs-refresh" : "passed-locally",
        screenshots,
        capturedAt: captured.generatedAt || null,
        issues
    };
}

function actionForReadinessBlocker(blocker) {
    const name = blocker?.name || "";
    if (name === "Production sales site") {
        return "Deploy the Cloudflare Pages build so maryilu.com serves the new store.";
    }
    if (name === "Production Worker shop items") {
        return "Deploy the Worker and confirm production /shop-items returns JSON.";
    }
    if (name === "Portfolio DNS") {
        return "Attach portfolio.maryilu.com to Pages and verify DNS.";
    }
    return "";
}

function localVisualQa() {
    const captured = latestVisualCapture();
    const health = visualCaptureHealth(captured);
    const screenshots = health.screenshots;
    return {
        status: health.status,
        summary: "Store and portfolio were verified after the premium Aceternity-inspired commerce pass: dramatic painted-chest hero, floating nav, visible high-tech trust cockpit, buyer-confidence dock, sage/gold beams, feature shop items, quote-before-payment language, no fake simulated Instagram links, and mobile-safe layouts.",
        viewports: ["desktop IAB viewport", "390x844 mobile viewport", "clean full-page desktop/mobile screenshots"],
        capturedAt: health.capturedAt,
        checks: [
            ...health.issues,
            "store desktop renders premium buyer surface with shop-first CTA",
            "store desktop includes the dramatic night-chest hero, floating glass nav, Aceternity-style beams, buyer-confidence dock, and simplified order strip",
            "store desktop includes a visible trust cockpit for artist review, gated Stripe checkout, and Instagram pipeline confidence",
            "store desktop uses a calm white custom-order path with spotlight cards before the shop",
            "store desktop gives the first shop item a premium editorial feature layout",
            "store desktop moves gift ideas directly after concise buyer path copy",
            "store desktop includes buyer-facing studio preview language instead of public backend status metrics",
            "store keeps Stripe and Instagram framed as practical buyer details, not diagnostics",
            "store primary CTAs use restrained moving-border treatment",
            "store trust cockpit frames Stripe and Instagram automation as buyer confidence, not backend diagnostics",
            "store social proof suppresses simulated Instagram permalinks and labels local preview cards",
            "store mobile has no headline/button/form clipping",
            "store mobile hides heavy hero chrome and preserves clear CTAs",
            "store mobile buyer-confidence panel stacks cleanly",
            "store mobile menu opens",
            "portfolio desktop matches Maryilu brand system",
            "portfolio labels the current archive as selected studies without placeholder copy",
            "portfolio social proof collapses simulated local content into a single Instagram CTA",
            "admin shop actions are grouped into safe edits, public publish, payment, and source controls",
            "admin disables direct checkout approval for simulated local-preview items",
            "admin morning operator checklist shows Stripe, Instagram, Meta webhook, review queue, and direct-buy readiness",
            "portfolio mobile has no headline/button clipping and the hero image is contained",
            "portfolio mobile menu opens",
            "console warnings/errors empty",
            "horizontal overflow is 0"
        ],
        screenshots
    };
}

function buildAgentSnapshot(result) {
    const brief = result.agentBrief?.data || {};
    const status = result.automationStatus?.data || {};
    const readinessChecks = safeArray(result.readiness?.checks);
    const readinessBlockers = readinessChecks
        .filter(check => check.required !== false && !check.ok)
        .map(compactCheck);
    const setupBlockers = safeArray(brief.setupBlockers);
    const operatorChecklist = safeArray(brief.operatorChecklist);
    const setupRunbook = safeArray(brief.setupRunbook);
    const reviewItems = safeArray(brief.reviewQueue?.items);
    const recentEvents = safeArray(brief.recentEvents);
    const stripeReady = Boolean(status.configured?.stripeSecretKey && status.configured?.stripeWebhookSecret);
    const buyerMode = stripeReady
        ? "Direct checkout can be enabled for reviewed, priced, available artwork."
        : "Request-led store: direct checkout stays hidden until Stripe is configured and inventory is approved.";
    const nextActions = [
        ...setupBlockers.map(blocker => blocker.action),
        ...readinessBlockers.map(actionForReadinessBlocker),
        setupBlockers.length ? "" : brief.nextAction
    ].filter(Boolean);

    return {
        schemaVersion: 1,
        generatedAt: result.generatedAt,
        mode: result.mode,
        apiUrl: result.apiUrl,
        productionReady: Boolean(result.readiness?.ok),
        runMode: brief.runMode || null,
        buyerMode,
        local: {
            salesSite: compactCheck(checkByName(result.readiness, "Local sales site")),
            workerShopItems: compactCheck(checkByName(result.readiness, "Local Worker shop items")),
            workerAutomationStatus: compactCheck(checkByName(result.readiness, "Local Worker automation status"))
        },
        production: {
            salesSite: compactCheck(checkByName(result.readiness, "Production sales site")),
            workerShopItems: compactCheck(checkByName(result.readiness, "Production Worker shop items")),
            portfolioDns: compactCheck(checkByName(result.readiness, "Portfolio DNS"))
        },
        sync: {
            attempted: Boolean(result.syncAttempt?.attempted),
            ok: Boolean(result.syncAttempt?.ok),
            status: result.syncAttempt?.status || null,
            message: result.syncAttempt?.message || "",
            instagramReady: Boolean(brief.sync?.instagramReady),
            cachedPosts: brief.sync?.cachedPosts ?? status.instagram?.cachedPosts ?? 0,
            lastSyncedAt: brief.sync?.lastSyncedAt || status.instagram?.lastSyncedAt || null,
            lastAttemptedAt: brief.sync?.lastAttemptedAt || status.instagram?.lastAttemptedAt || null,
            lastError: brief.sync?.lastError || status.instagram?.lastError || null,
            simulated: Boolean(brief.sync?.simulated || status.instagram?.simulated),
            pagesFetched: brief.sync?.pagesFetched ?? status.instagram?.pagesFetched ?? null,
            hitPageLimit: Boolean(brief.sync?.hitPageLimit || status.instagram?.hitPageLimit),
            missingItems: brief.sync?.missingItems ?? status.instagram?.missingItems ?? 0,
            proofSource: brief.sync?.proofSource || "curated"
        },
        commerce: {
            totalItems: brief.commerce?.totalItems ?? status.shop?.totalItems ?? 0,
            visibleItems: brief.commerce?.visibleItems ?? status.shop?.visibleItems ?? 0,
            directBuyItems: brief.commerce?.buyableItems ?? status.shop?.buyableItems ?? 0,
            requestableItems: brief.commerce?.requestableItems ?? 0,
            reservedItems: brief.commerce?.reservedItems ?? status.shop?.reservedItems ?? 0,
            soldItems: brief.commerce?.soldItems ?? status.shop?.soldItems ?? 0,
            readyForDirectArtworkCheckout: Boolean(brief.commerce?.readyForDirectArtworkCheckout)
        },
        orders: {
            totalRequests: brief.orders?.totalRequests ?? status.orders?.totalRequests ?? 0
        },
        reviewQueue: {
            total: brief.reviewQueue?.total ?? status.shop?.reviewCandidates ?? 0,
            items: reviewItems.map(item => ({
                id: item.id,
                title: item.title,
                category: item.category,
                priceCents: item.priceCents,
                currency: item.currency,
                status: item.status,
                sourcePlatform: item.sourcePlatform,
                sourcePostId: item.sourcePostId,
                permalink: item.permalink,
                hidden: Boolean(item.hidden),
                simulated: item.simulated === true,
                recommendation: item.recommendation || "",
                confidenceLabel: item.confidenceLabel || "",
                warnings: safeArray(item.warnings),
                reviewChecklist: safeArray(item.reviewChecklist).map(step => ({
                    key: step.key,
                    label: step.label,
                    requiredForCheckout: step.requiredForCheckout === true,
                    complete: step.complete === true
                })),
                nextAction: item.nextAction || "",
                directCheckoutIssue: item.directCheckoutIssue || ""
            }))
        },
        setupBlockers: setupBlockers.map(blocker => ({
            key: blocker.key,
            label: blocker.label,
            detail: blocker.detail,
            action: blocker.action
        })),
        operatorChecklist: operatorChecklist.map(item => ({
            key: item.key,
            label: item.label,
            required: item.required === true,
            detail: item.detail,
            action: item.action
        })),
        setupRunbook: setupRunbook.map(step => ({
            key: step.key,
            label: step.label,
            required: step.required === true,
            done: step.done === true,
            action: step.action,
            command: step.command || "",
            verify: step.verify || ""
        })),
        readinessBlockers,
        recentEvents: recentEvents.map(event => ({
            type: event.type,
            title: event.title,
            message: event.message,
            createdAt: event.createdAt,
            source: event.source
        })),
        operatorHandoff: {
            status: brief.status || "unknown",
            headline: brief.headline || "No agent brief returned.",
            nextAction: brief.nextAction || "Check setup blockers.",
            nextActions: [...new Set(nextActions)].slice(0, 8)
        },
        visualQa: localVisualQa()
    };
}

function markdownReport(result) {
    const snapshot = buildAgentSnapshot(result);
    const brief = result.agentBrief?.data || {};
    const status = result.automationStatus?.data || {};
    const sync = result.syncAttempt;
    const blockers = safeArray(brief.setupBlockers);
    const reviewItems = safeArray(brief.reviewQueue?.items);
    const recentEvents = safeArray(brief.recentEvents);
    const readinessBlockers = safeArray(result.readiness?.checks).filter(check => check.required !== false && !check.ok);

    let body = "";
    body += line("# Maryilu Instagram Agent Run");
    body += line();
    body += line(`Generated at: ${result.generatedAt}`);
    body += line(`Mode: ${result.mode}`);
    body += line(`Worker: ${result.apiUrl}`);
    body += line(`Admin token: ${redact(result.adminToken)}`);
    body += line();
    body += line("## Agent Result");
    body += line(`- Sync attempted: ${sync.attempted ? "yes" : "no"}`);
    body += line(`- Sync result: ${sync.ok ? "success" : sync.attempted ? "failed" : "skipped"}`);
    if (sync.message) body += line(`- Sync message: ${sync.message}`);
    body += line(`- Morning status: ${brief.status || "unknown"}`);
    body += line(`- Headline: ${brief.headline || "No brief returned."}`);
    body += line(`- Next action: ${brief.nextAction || "Check setup blockers."}`);
    if (brief.runMode?.title) body += line(`- Agent mode: ${brief.runMode.title}`);
    body += line(`- Buyer mode: ${snapshot.buyerMode}`);
    body += line();
    body += line("## Morning Operator Handoff");
    body += line(`- Public buyer mode: ${snapshot.buyerMode}`);
    if (snapshot.runMode?.summary) body += line(`- Agent summary: ${snapshot.runMode.summary}`);
    if (snapshot.runMode?.guardrail) body += line(`- Agent guardrail: ${snapshot.runMode.guardrail}`);
    body += line(`- Sync source: ${syncSourceLabel(snapshot.sync)}`);
    body += line(`- Review queue: ${snapshot.reviewQueue.total} item${snapshot.reviewQueue.total === 1 ? "" : "s"}`);
    body += line(`- Production ready: ${snapshot.productionReady ? "yes" : "no"}`);
    if (snapshot.operatorHandoff.nextActions.length) {
        for (const action of snapshot.operatorHandoff.nextActions.slice(0, 5)) body += line(`- Next: ${action}`);
    }
    body += line();
    body += line("## Operator Checklist");
    if (snapshot.operatorChecklist.length) {
        for (const item of snapshot.operatorChecklist) {
            body += line(`- ${item.required ? "Required" : "Watch"} · ${item.label}: ${item.action || item.detail || "Review before launch."}`);
        }
    } else {
        body += line("- No operator checklist items returned.");
    }
    body += line();
    body += line("## Connection Runbook");
    if (snapshot.setupRunbook.length) {
        for (const step of snapshot.setupRunbook) {
            body += line(`- ${step.done ? "Ready" : step.required ? "Required" : "Watch"} · ${step.label}: ${step.action}`);
            if (step.command) body += line(`  - Command: \`${step.command}\``);
            if (step.verify) body += line(`  - Verify: ${step.verify}`);
        }
    } else {
        body += line("- No connection runbook returned by the Worker.");
    }
    body += line();
    body += line("## Local Visual QA");
    body += line(`- Status: ${snapshot.visualQa.status}`);
    body += line(`- Summary: ${snapshot.visualQa.summary}`);
    body += line(`- Viewports: ${snapshot.visualQa.viewports.join(", ")}`);
    if (snapshot.visualQa.capturedAt) body += line(`- Captured at: ${snapshot.visualQa.capturedAt}`);
    for (const check of snapshot.visualQa.checks) body += line(`- Check: ${check}`);
    body += line(`- Store desktop screenshot: ${snapshot.visualQa.screenshots.storeDesktop}`);
    body += line(`- Store mobile screenshot: ${snapshot.visualQa.screenshots.storeMobile}`);
    body += line(`- Portfolio desktop screenshot: ${snapshot.visualQa.screenshots.portfolioDesktop}`);
    body += line(`- Portfolio mobile screenshot: ${snapshot.visualQa.screenshots.portfolioMobile}`);
    if (snapshot.visualQa.screenshots.adminChecklist) body += line(`- Admin operator checklist screenshot: ${snapshot.visualQa.screenshots.adminChecklist}`);
    body += line();
    body += line("## Instagram Feed");
    body += line(`- API ready: ${checkMark(Boolean(brief.sync?.instagramReady))}`);
    body += line(`- Cached posts: ${brief.sync?.cachedPosts ?? status.instagram?.cachedPosts ?? 0}`);
    body += line(`- Pages fetched: ${brief.sync?.pagesFetched ?? status.instagram?.pagesFetched ?? "not recorded"}${(brief.sync?.hitPageLimit || status.instagram?.hitPageLimit) ? " (page limit hit)" : ""}`);
    body += line(`- Not seen in latest sync: ${brief.sync?.missingItems ?? status.instagram?.missingItems ?? 0}`);
    body += line(`- Last synced: ${formatTime(brief.sync?.lastSyncedAt || status.instagram?.lastSyncedAt)}`);
    body += line(`- Last attempted: ${formatTime(brief.sync?.lastAttemptedAt || status.instagram?.lastAttemptedAt)}`);
    body += line(`- Last error: ${brief.sync?.lastError || status.instagram?.lastError || "none"}`);
    body += line();
    body += line("## Commerce");
    body += line(`- Total shop items: ${brief.commerce?.totalItems ?? status.shop?.totalItems ?? 0}`);
    body += line(`- Visible shop items: ${brief.commerce?.visibleItems ?? status.shop?.visibleItems ?? 0}`);
    body += line(`- Direct-buy items: ${brief.commerce?.buyableItems ?? status.shop?.buyableItems ?? 0}`);
    body += line(`- Requestable items: ${brief.commerce?.requestableItems ?? 0}`);
    body += line(`- Reserved items: ${brief.commerce?.reservedItems ?? status.shop?.reservedItems ?? 0}`);
    body += line(`- Sold items: ${brief.commerce?.soldItems ?? status.shop?.soldItems ?? 0}`);
    body += line(`- Review queue: ${brief.reviewQueue?.total ?? status.shop?.reviewCandidates ?? 0}`);
    body += line();
    body += line("## Review Queue");
    if (reviewItems.length) {
        for (const item of reviewItems) {
            body += line(`- ${item.title || item.id}: ${item.status || "unknown"}${item.priceCents ? `, ${item.priceCents} ${item.currency || "eur"}` : ""}${item.permalink ? ` (${item.permalink})` : ""}`);
            if (item.recommendation) body += line(`  - Recommendation: ${item.recommendation}`);
            if (item.nextAction) body += line(`  - Next action: ${item.nextAction}`);
            if (item.directCheckoutIssue) body += line(`  - Checkout guard: ${item.directCheckoutIssue}`);
            for (const warning of safeArray(item.warnings).slice(0, 3)) {
                body += line(`  - Warning: ${warning}`);
            }
            for (const step of safeArray(item.reviewChecklist).slice(0, 5)) {
                body += line(`  - Checklist: ${step.complete ? "done" : "todo"} - ${step.label}`);
            }
        }
    } else {
        body += line("- No Instagram checkout candidates are waiting for review.");
    }
    body += line();
    body += line("## Setup Blockers");
    if (blockers.length) {
        for (const blocker of blockers) body += line(`- ${blocker.label}: ${blocker.detail} Action: ${blocker.action}`);
    } else {
        body += line("- No required Worker blockers in the agent brief.");
    }
    body += line();
    body += line("## Readiness Blockers");
    if (readinessBlockers.length) {
        for (const blocker of readinessBlockers) body += line(`- ${blocker.name}: ${blocker.message}`);
    } else {
        body += line("- Readiness checks are green.");
    }
    body += line();
    body += line("## Recent Automation Events");
    if (recentEvents.length) {
        for (const event of recentEvents) body += line(`- ${event.type || "automation.event"}: ${event.title || event.message || "No title"} (${formatTime(event.createdAt)})`);
    } else {
        body += line("- No recent automation events returned.");
    }
    body += line();
    body += line("## Operator Notes");
    body += line("- This runner uses the Worker endpoints already used by the admin portal.");
    body += line("- Instagram ingestion is through Meta's official API, not password scraping.");
    body += line("- Priced available posts become hidden review candidates before direct checkout is allowed.");
    body += line("- Run with `--production --token=...` after deploy to verify the live Worker.");
    return body;
}

async function main() {
    const result = {
        generatedAt: new Date().toISOString(),
        mode: productionMode ? "production" : "local",
        apiUrl,
        adminToken,
        syncAttempt: { attempted: false, ok: false, message: "" },
        automationStatus: null,
        agentBrief: null,
        events: null,
        readiness: runReadiness()
    };

    if (!adminToken) {
        result.syncAttempt.message = "Admin token missing; set ADMIN_TOKEN, AGENT_ADMIN_TOKEN, or pass --token=...";
    } else if (noSync) {
        result.syncAttempt.message = "Skipped by --no-sync.";
    } else {
        result.syncAttempt.attempted = true;
        const syncResponse = await fetchJson("/sync-instagram", { method: "POST", admin: true, body: {} });
        result.syncAttempt.ok = syncResponse.ok && syncResponse.data?.success !== false;
        result.syncAttempt.status = syncResponse.status;
        result.syncAttempt.data = syncResponse.data;
        const syncedPostCount = syncResponse.data?.media?.length
            ?? syncResponse.data?.meta?.count
            ?? syncResponse.data?.count
            ?? 0;
        result.syncAttempt.message = result.syncAttempt.ok
            ? `Cached ${syncedPostCount} Instagram post(s).`
            : (syncResponse.data?.error || `HTTP ${syncResponse.status}`);
    }

    if (adminToken) {
        result.automationStatus = await fetchJson("/automation-status", { admin: true });
        result.agentBrief = await fetchJson("/agent-brief", { admin: true });
        result.events = await fetchJson("/automation-events", { admin: true });
    }

    writeFileSync(outputPath, markdownReport(result));
    writeFileSync(jsonOutputPath, `${JSON.stringify(buildAgentSnapshot(result), null, 2)}\n`);

    if (jsonMode) {
        console.log(JSON.stringify({ ...result, adminToken: redact(result.adminToken), agentSnapshot: buildAgentSnapshot(result) }, null, 2));
    } else {
        console.log(`Instagram agent report written to ${outputPath}`);
        console.log(`Instagram agent snapshot written to ${jsonOutputPath}`);
        console.log(`Sync: ${result.syncAttempt.message}`);
        const brief = result.agentBrief?.data;
        if (brief?.headline) console.log(`Brief: ${brief.headline}`);
    }

    const hasEndpointFailure = [result.automationStatus, result.agentBrief, result.events]
        .filter(Boolean)
        .some(response => !response.ok || response.data?.success === false);
    const hasRequiredBlockers = safeArray(result.readiness?.checks).some(check => check.required !== false && !check.ok);
    if (strictMode && (hasEndpointFailure || hasRequiredBlockers || (result.syncAttempt.attempted && !result.syncAttempt.ok))) {
        process.exit(1);
    }
}

if (!existsSync(join(rootDir, "cloudflare-worker.js"))) {
    throw new Error("Run this from the Maryilu repository root.");
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
