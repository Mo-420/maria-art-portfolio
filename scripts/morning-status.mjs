#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const outputPath = join(rootDir, "MORNING-STATUS.md");

function runJson(scriptPath) {
    const result = spawnSync(process.execPath, [scriptPath, "--json"], {
        cwd: rootDir,
        encoding: "utf8",
        env: process.env
    });

    const stdout = String(result.stdout || "").trim();
    if (!stdout) {
        throw new Error(String(result.stderr || `${scriptPath} produced no JSON output`).trim());
    }

    try {
        return JSON.parse(stdout);
    } catch (error) {
        throw new Error(`Could not parse ${scriptPath} JSON: ${error.message}`);
    }
}

function runText(command, args) {
    const result = spawnSync(command, args, {
        cwd: rootDir,
        encoding: "utf8",
        env: process.env
    });
    return String(result.stdout || "").trim();
}

function checkByName(readiness, name) {
    return (readiness.checks || []).find((check) => check.name === name) || null;
}

function statusWord(check) {
    if (!check) return "unknown";
    return check.ok ? "ready" : "not ready";
}

function bullet(text) {
    return `- ${text}`;
}

function formatBlockers(blockers) {
    if (!blockers.length) return [bullet("No production blockers are currently reported.")];
    return blockers.map((blocker) => bullet(`${blocker.name}: ${blocker.message}`));
}

function formatNextActions(report) {
    return (report.launchOrder || []).map((item, index) => `${index + 1}. ${item}`);
}

function stripTrailingPeriod(value) {
    return String(value || "").replace(/\.+$/, "");
}

function optionalMarkdownSummary(relativePath) {
    const path = join(rootDir, relativePath);
    if (!existsSync(path)) return null;
    try {
        return readFileSync(path, "utf8")
            .split(/\r?\n/)
            .reduce((acc, line) => {
                const match = line.match(/^- ([^:]+):\s*(.*)$/);
                if (match) acc[match[1].trim()] = match[2].trim();
                return acc;
            }, {});
    } catch {
        return null;
    }
}

function optionalAgentSnapshot() {
    const jsonPath = join(rootDir, "AGENT-RUN.json");
    if (existsSync(jsonPath)) {
        try {
            return JSON.parse(readFileSync(jsonPath, "utf8"));
        } catch {
            return null;
        }
    }
    const markdown = optionalMarkdownSummary("AGENT-RUN.md");
    if (!markdown) return null;
    return {
        sync: {
            message: markdown["Sync message"] || "",
            ok: markdown["Sync result"] === "success",
            attempted: markdown["Sync attempted"] === "yes",
            pagesFetched: markdown["Pages fetched"] || "",
            missingItems: markdown["Not seen in latest sync"] || ""
        },
        commerce: {
            totalItems: markdown["Total shop items"] || "0",
            visibleItems: markdown["Visible shop items"] || "0",
            directBuyItems: markdown["Direct-buy items"] || "0"
        },
        reviewQueue: {
            total: markdown["Review queue"] || "0"
        }
    };
}

function main() {
    const readiness = runJson("scripts/readiness-check.mjs");
    const report = runJson("scripts/launch-report.mjs");
    const gitStatus = runText("git", ["status", "--short"]);
    const checkedAt = report.checkedAt || readiness.checkedAt || new Date().toISOString();

    const localSite = checkByName(readiness, "Local sales site");
    const localWorker = checkByName(readiness, "Local Worker shop items");
    const localAutomation = checkByName(readiness, "Local Worker automation status");
    const productionSite = checkByName(readiness, "Production sales site");
    const productionAdminGate = checkByName(readiness, "Production admin access gate");
    const productionWorker = checkByName(readiness, "Production Worker shop items");
    const portfolioDns = checkByName(readiness, "Portfolio DNS");
    const stripeSecret = checkByName(readiness, "Secret STRIPE_SECRET_KEY");
    const stripeWebhook = checkByName(readiness, "Secret STRIPE_WEBHOOK_SECRET");
    const instagramToken = checkByName(readiness, "Secret INSTAGRAM_ACCESS_TOKEN");
    const instagramUser = checkByName(readiness, "Secret INSTAGRAM_USER_ID");
    const latestAgent = optionalAgentSnapshot();
    const visualQa = latestAgent?.visualQa || null;
    const visualScreenshots = visualQa?.screenshots || {};
    const debugApkPath = "android/app/build/outputs/apk/debug/app-debug.apk";
    const debugApkExists = existsSync(join(rootDir, debugApkPath));
    const buyerMode = stripeSecret?.ok && stripeWebhook?.ok
        ? "Direct checkout can be enabled for reviewed, priced, available artwork."
        : "Buyer-facing store is request-led right now; direct checkout stays hidden until Stripe is configured and inventory is approved.";

    const lines = [
        "# Maryilu Morning Status",
        "",
        `Checked at: ${checkedAt}`,
        `Overall launch status: ${report.ready ? "READY" : "NOT READY"}`,
        `Buyer mode: ${buyerMode}`,
        "",
        "## What Is Working Locally",
        bullet(`Sales site preview: ${statusWord(localSite)}${localSite?.message ? ` (${localSite.message})` : ""}`),
        bullet(`Worker shop items endpoint: ${statusWord(localWorker)}${localWorker?.message ? ` (${localWorker.message})` : ""}`),
        bullet(`Worker automation/admin status endpoint: ${statusWord(localAutomation)}${localAutomation?.message ? ` (${localAutomation.message})` : ""}`),
        bullet("Storefront build, Worker behavior tests, deploy-package markers, and local preview runtime are covered by npm run verify:launch-local without touching Cloudflare or Android sync."),
        bullet("Worker dry-run and Android project verification are still covered by npm run verify:local before handoff or deploy prep."),
        "",
        "## Buyer Experience Right Now",
        bullet("Local buyers see the premium black/burgundy Maryilu store with a dramatic painted-chest hero, floating glass nav, ivory/gold accents, polished CTAs, a calm custom-order path, gift idea cards, starter pricing, studio proof, and a dark custom order request form."),
        bullet(buyerMode),
        bullet("Run `npm run seed:local-shop` when local Worker inventory needs polished request-led preview items before Instagram credentials are ready."),
        bullet("The custom order form is present locally and posts to the Worker when the Worker is running."),
        bullet("The portfolio remains available as `/portfolio.html` locally and now matches the store brand as the quieter credibility surface."),
        "",
        "## Storefront",
        bullet("Main store is the local `/` surface with custom art gifts, quote-led order flow, trust signals, social proof, and Stripe-ready checkout paths."),
        bullet("Portfolio is a separate `/portfolio.html` surface intended for `portfolio.maryilu.com`."),
        bullet("The current visual direction is premium editorial commerce with restrained liquid-glass polish: shared floating glass nav, dramatic night-chest hero, black/burgundy surfaces, ivory/gold accents, polished primary actions, shop-first gift cards, a short custom-order brief, studio proof, and a dark order section."),
        bullet("The latest visual QA covered desktop plus 390px mobile for the store and portfolio, plus the admin operator checklist when a local admin token is available."),
        bullet("Readiness checks stable storefront markers including the premium palette stylesheet, transformed story section, gallery section, gift ideas, pricing, social, about, and order sections, so a green local store check means the current commerce version is present."),
        "",
        "## Visual QA Evidence",
        visualQa?.status ? bullet(`Status: ${visualQa.status}`) : bullet("Status: not recorded yet"),
        visualQa?.summary ? bullet(visualQa.summary) : bullet("Run `npm run agent:instagram` after visual QA to refresh screenshot references without triggering a live sync."),
        visualQa?.capturedAt ? bullet(`Captured at: ${visualQa.capturedAt}`) : bullet("Capture timestamp: not recorded"),
        visualScreenshots.storeDesktop ? bullet(`Store desktop screenshot: ${visualScreenshots.storeDesktop}`) : bullet("Store desktop screenshot: missing"),
        visualScreenshots.storeMobile ? bullet(`Store mobile screenshot: ${visualScreenshots.storeMobile}`) : bullet("Store mobile screenshot: missing"),
        visualScreenshots.portfolioDesktop ? bullet(`Portfolio desktop screenshot: ${visualScreenshots.portfolioDesktop}`) : bullet("Portfolio desktop screenshot: missing"),
        visualScreenshots.portfolioMobile ? bullet(`Portfolio mobile screenshot: ${visualScreenshots.portfolioMobile}`) : bullet("Portfolio mobile screenshot: missing"),
        visualScreenshots.adminChecklist ? bullet(`Admin operator checklist screenshot: ${visualScreenshots.adminChecklist}`) : bullet("Admin operator checklist screenshot: missing or skipped"),
        "",
        "## Stripe",
        bullet(`Secret key: ${statusWord(stripeSecret)}`),
        bullet(`Webhook secret: ${statusWord(stripeWebhook)}`),
        bullet("Direct artwork checkout and custom-order deposit/final payment links are implemented server-side, but production Stripe cannot run until both secrets and the Stripe webhook endpoint are configured."),
        "",
        "## Instagram Agent",
        bullet(`Access token: ${statusWord(instagramToken)}`),
        bullet(`Instagram user ID: ${statusWord(instagramUser)}`),
        bullet("Worker cron is configured to sync every 30 minutes through Meta's official Instagram API."),
        bullet("Run `npm run agent:instagram` for a no-sync local agent status pass, `npm run agent:instagram:sync` after Meta credentials are configured, or `npm run agent:instagram -- --production --token=...` after deploy."),
        bullet("Run `npm run simulate:instagram` to prove the Instagram-to-store conversion locally without Meta credentials."),
        bullet("The agent runner writes `AGENT-RUN.md` for humans and `AGENT-RUN.json` for admin/mobile/backend handoff."),
        latestAgent?.sync ? bullet(`Last local agent run: ${latestAgent.sync.ok ? "success" : latestAgent.sync.attempted ? "failed" : "skipped"}${latestAgent.sync.message ? ` (${stripTrailingPeriod(latestAgent.sync.message)})` : ""}.`) : bullet("Last local agent run: not recorded in AGENT-RUN.json yet."),
        latestAgent?.runMode?.title ? bullet(`Agent mode: ${latestAgent.runMode.title}`) : bullet("Agent mode: unavailable until AGENT-RUN.json is refreshed."),
        latestAgent?.runMode?.guardrail ? bullet(`Agent guardrail: ${latestAgent.runMode.guardrail}`) : bullet("Agent guardrail: review sale-like posts before publishing direct checkout."),
        latestAgent?.sync ? bullet(`Latest sync coverage: ${latestAgent.sync.pagesFetched || "pages not recorded"} page(s) fetched; ${latestAgent.sync.missingItems || 0} Instagram item(s) not seen in the latest sync.`) : bullet("Latest sync coverage: unavailable until AGENT-RUN.json is generated."),
        latestAgent?.commerce ? bullet(`Current agent inventory snapshot: ${latestAgent.commerce.totalItems || "0"} total item(s), ${latestAgent.commerce.visibleItems || "0"} visible, ${latestAgent.commerce.directBuyItems || "0"} direct-buy, ${latestAgent.reviewQueue?.total || "0"} waiting for review.`) : bullet("Current agent inventory snapshot: unavailable until AGENT-RUN.json is generated."),
        bullet("Priced available posts become hidden direct-checkout candidates for admin review; non-priced posts can publish as proof/inspiration."),
        bullet("Worker tests now cover the scheduled sync failure path so missing credentials are visible in the admin event log."),
        "",
        "## Mobile Admin App",
        bullet("Maryilu Studio Android wrapper is configured through Capacitor as `com.maria.art.admin`."),
        bullet("The app opens `https://maryilu.com/admin.html`, so it should only be handed to Maria after the production admin portal is access-protected and the Worker is deployed."),
        bullet("Admin shop actions are grouped by risk: safe edits, public publish, payment approval, and source links. Direct checkout approval is disabled for simulated local-preview items."),
        bullet("Run `npm run mobile:android:verify` to confirm the Android project still loads, and `npm run mobile:android:debug` only when a local debug APK is needed."),
        debugApkExists ? bullet(`Local debug APK artifact exists at \`${debugApkPath}\`; treat it as a test build, not a production handoff.`) : bullet("No local debug APK artifact is present yet."),
        "",
        "## Production",
        bullet(`maryilu.com store deploy: ${statusWord(productionSite)}${productionSite?.message ? ` (${productionSite.message})` : ""}`),
        bullet(`Production admin access gate: ${statusWord(productionAdminGate)}${productionAdminGate?.message ? ` (${productionAdminGate.message})` : ""}`),
        bullet(`Production Worker /shop-items: ${statusWord(productionWorker)}${productionWorker?.message ? ` (${productionWorker.message})` : ""}`),
        bullet(`portfolio.maryilu.com DNS: ${statusWord(portfolioDns)}${portfolioDns?.message ? ` (${portfolioDns.message})` : ""}`),
        "",
        "## Production Blockers",
        ...formatBlockers(report.blockers || []),
        "",
        "## Safe Next Actions",
        ...formatNextActions(report),
        "",
        "## Worktree Note",
        gitStatus
            ? "There are local modified/untracked files. Review `git status --short` before committing or deploying."
            : "Working tree is clean.",
        ""
    ];

    writeFileSync(outputPath, `${lines.join("\n")}\n`);
    console.log(`Morning status written to ${outputPath}`);
}

if (!existsSync(join(rootDir, "scripts/readiness-check.mjs"))) {
    throw new Error("Run this from the Maryilu repository root.");
}

main();
