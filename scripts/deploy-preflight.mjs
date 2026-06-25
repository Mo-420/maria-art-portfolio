#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const args = process.argv.slice(2);
const allowedTargets = new Set(["all", "worker", "pages"]);
const packageOnly = args.includes("--package-only");

function parseTarget() {
    const inlineTarget = args.find((arg) => arg.startsWith("--target="));
    if (inlineTarget) return inlineTarget.split("=")[1] || "";

    const targetFlagIndex = args.indexOf("--target");
    if (targetFlagIndex !== -1) return args[targetFlagIndex + 1] || "";

    return "all";
}

function fail(message) {
    console.error(`Deploy preflight failed: ${message}`);
    console.error("Run `npm run launch:report` for the full setup checklist and current production blockers.");
    process.exit(1);
}

function pass(message) {
    console.log(`OK ${message}`);
}

function requireFile(path, contains = []) {
    const fullPath = join(rootDir, path);
    if (!existsSync(fullPath)) fail(`${path} is missing.`);
    const text = readFileSync(fullPath, "utf8");
    for (const needle of contains) {
        if (!text.includes(needle)) fail(`${path} does not contain expected marker: ${needle}`);
    }
    pass(`${path} exists`);
    return text;
}

function hasToken(value) {
    return Boolean(value && !/replace|placeholder|example|your-/i.test(value));
}

function cloudflareTokenMessage(scope) {
    return [
        `CLOUDFLARE_API_TOKEN is required for ${scope}.`,
        "Use a Cloudflare token with Pages edit plus Workers edit permissions for this account.",
        "Expected Pages project: export CLOUDFLARE_PAGES_PROJECT=maria-art-portfolio",
        "Then rerun npm run deploy:preflight before deploying."
    ].join(" ");
}

const target = parseTarget();

if (!allowedTargets.has(target)) {
    fail(`Unknown target "${target}". Use all, worker, or pages.`);
}

requireFile("package.json", ["verify:launch-local", "verify:local"]);

if (target === "all" || target === "pages") {
    requireFile("dist/index.html", [
        "Maryilu",
        "store-warm.css?v=20260624-rose-studio",
        "Custom Art Gifts Worth Keeping",
        "Gift Ideas & Custom Art",
        "Photo placeholder: Hero product",
        "Gift categories",
        "How ordering works",
        "shop-section",
        "prices-section",
        "order-section",
        "order-brief-strip",
        "social-section",
        "about-section",
        "policies-section",
        "final-cta"
    ]);
    requireFile("dist/site-data.js", [
        "Gift Ideas & Custom Art",
        "Reviewed with Maryilu first",
        "Ribbon bouquet gift",
        "Baby shower keepsake gift"
    ]);
    requireFile("dist/portfolio.html", ["Maria Luisa", "Maryilu Art Portfolio", "maryilu-pro-max.css", "portfolio-cred-strip"]);
    requireFile("dist/_worker.js", [
        "portfolio.maryilu.com",
        "PORTFOLIO_REDIRECT_READY",
        "ADMIN_PAGE_PASSWORD",
        "ADMIN_PAGE_ACCESS_MANAGED",
        "Admin page protection is not configured"
    ]);
    requireFile("dist/_headers", ["/admin.html", "X-Robots-Tag: noindex"]);
    if (packageOnly) {
        pass("package-only mode: Cloudflare Pages credentials not required");
    } else if (!hasToken(process.env.CLOUDFLARE_API_TOKEN)) {
        fail(cloudflareTokenMessage("Cloudflare Pages deploy"));
    }
    if (!packageOnly && !hasToken(process.env.CLOUDFLARE_PAGES_PROJECT)) {
        fail("CLOUDFLARE_PAGES_PROJECT is required. Use the existing Cloudflare Pages project name: export CLOUDFLARE_PAGES_PROJECT=maria-art-portfolio");
    }
    if (!packageOnly) {
        pass(`Cloudflare Pages project is ${process.env.CLOUDFLARE_PAGES_PROJECT}`);
    }
}

if (target === "all" || target === "worker") {
    const wrangler = requireFile("wrangler.toml", ["name = \"maria-art-data-api\"", "ART_DATA"]);
    requireFile("cloudflare-worker.js", ["/shop-items", "/stripe-webhook", "/instagram-webhook", "/automation-events"]);
    if (packageOnly) {
        pass("package-only mode: Cloudflare Worker credentials not required");
    } else if (!hasToken(process.env.CLOUDFLARE_API_TOKEN)) {
        fail(cloudflareTokenMessage("Worker deploy"));
    }
    if (!wrangler.includes("triggers =")) {
        fail("wrangler.toml is missing the Instagram sync cron trigger.");
    }
}

console.log(`Deploy preflight passed for ${target}.`);
console.log("After deploy, run `npm run check:readiness` and `npm run launch:report` before treating Stripe, Instagram, or portfolio DNS as production-ready.");
