#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import dns from "node:dns/promises";
import { join } from "node:path";

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");

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

function joinUrl(base, path) {
    try {
        return new URL(path, base).href;
    } catch {
        return `${String(base || "").replace(/\/+$/, "")}${path}`;
    }
}

const localVars = loadDotEnv(join(rootDir, ".dev.vars"));
const env = { ...localVars, ...process.env };

const config = {
    localSiteUrl: env.LOCAL_SITE_URL || "http://127.0.0.1:4173",
    localWorkerUrl: env.LOCAL_WORKER_URL || "http://127.0.0.1:8788",
    productionSiteUrl: env.PRODUCTION_SITE_URL || "https://maryilu.com/",
    productionAdminUrl: env.PRODUCTION_ADMIN_URL || joinUrl(env.PRODUCTION_SITE_URL || "https://maryilu.com/", "/admin.html"),
    productionWorkerUrl: env.PRODUCTION_WORKER_URL || "https://maria-art-data-api.maros-pristas.workers.dev",
    portfolioHost: env.PORTFOLIO_HOST || "portfolio.maryilu.com",
    adminToken: env.ADMIN_TOKEN || "",
    productionAdminToken: env.PRODUCTION_ADMIN_TOKEN || ""
};

const requiredSecrets = [
    "ADMIN_TOKEN",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "INSTAGRAM_ACCESS_TOKEN",
    "INSTAGRAM_USER_ID"
];

const storeMarkers = [
    "Maryilu",
    "store-final.css",
    "maryilu-pro-max.css",
    "Custom Art Gifts Worth Keeping",
    "Gift Ideas & Custom Art",
    "transform-story-section",
    "kinetic-gallery-section",
    "store-assurance-strip",
    "trust-cockpit-section",
    "shop-section",
    "shop-heading",
    "custom-order-card",
    "prices-section",
    "social-section",
    "about-section",
    "order-section"
];

const productionStoreMarkers = [
    "Maryilu | Custom Handmade Gifts & Art",
    ...storeMarkers.filter((marker) => marker !== "Maryilu")
];

const placeholderPatterns = [
    /^$/,
    /replace/i,
    /example/i,
    /placeholder/i,
    /your-/i,
    /sk_test_replace_me/i,
    /whsec_replace_me/i
];

function secretLooksConfigured(value) {
    return !placeholderPatterns.some((pattern) => pattern.test(String(value || "")));
}

async function fetchText(url, options = {}) {
    const response = await fetch(url, { redirect: "follow", ...options });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text, response };
}

async function checkUrl(name, url, predicate) {
    try {
        const result = await fetchText(url);
        const detail = predicate ? predicate(result) : { ok: result.ok, message: `HTTP ${result.status}` };
        return { name, ok: Boolean(detail.ok), message: detail.message || `HTTP ${result.status}`, url };
    } catch (error) {
        return { name, ok: false, message: error.message, url };
    }
}

async function checkJsonEndpoint(name, url, options = {}) {
    try {
        const result = await fetchText(url, options);
        let data = null;
        try {
            data = JSON.parse(result.text);
        } catch {
            return { name, ok: false, message: `Expected JSON, got HTTP ${result.status}: ${result.text.slice(0, 80)}`, url };
        }
        return {
            name,
            ok: result.ok && data.success !== false,
            message: `HTTP ${result.status}${data.success === false ? `: ${data.error || "success false"}` : ""}`,
            url,
            data
        };
    } catch (error) {
        return { name, ok: false, message: error.message, url };
    }
}

async function checkAdminAccessGate(name, url) {
    try {
        const redirects = [];
        let currentUrl = url;
        let response = null;

        for (let index = 0; index < 4; index += 1) {
            response = await fetch(currentUrl, { redirect: "manual" });
            const status = response.status;
            const location = response.headers.get("location") || "";
            const accessGateRedirect = status >= 300
                && status < 400
                && /cdn-cgi\/access|cloudflareaccess|login|auth|identity/i.test(location);
            if (accessGateRedirect) {
                return {
                    name,
                    ok: true,
                    message: `HTTP ${status}, access gate redirect detected`,
                    url,
                    redirects
                };
            }
            if (!(status >= 300 && status < 400) || !location) break;
            redirects.push({ status, from: currentUrl, to: location });
            currentUrl = new URL(location, currentUrl).href;
        }

        if (!response) {
            return { name, ok: false, message: "No admin response received", url };
        }

        const status = response.status;
        const location = response.headers.get("location") || "";
        const accessGateDetected = status === 401 || status === 403;

        if (accessGateDetected) {
            return {
                name,
                ok: true,
                message: `HTTP ${status}, access gate detected`,
                url,
                redirects
            };
        }

        if (status === 200) {
            const redirectText = redirects.length
                ? ` after ${redirects.map((step) => `${step.status} -> ${step.to}`).join(", ")}`
                : "";
            return {
                name,
                ok: false,
                message: `HTTP 200${redirectText}, admin page is publicly reachable; protect it with Cloudflare Access or equivalent`,
                url,
                redirects
            };
        }

        if (status >= 300 && status < 400) {
            return {
                name,
                ok: false,
                message: `HTTP ${status} redirects to ${location || "another path"}, but no access gate was detected`,
                url,
                redirects
            };
        }

        return {
            name,
            ok: false,
            message: `HTTP ${status}, admin access gate not verified`,
            url,
            redirects
        };
    } catch (error) {
        return { name, ok: false, message: error.message, url };
    }
}

async function checkDns(host) {
    try {
        const records = await dns.resolve(host);
        return { name: "Portfolio DNS", ok: records.length > 0, message: records.join(", "), url: `https://${host}/` };
    } catch (error) {
        return { name: "Portfolio DNS", ok: false, message: error.message, url: `https://${host}/` };
    }
}

function checkFile(name, relativePath, contains) {
    const path = join(rootDir, relativePath);
    if (!existsSync(path)) return { name, ok: false, message: `${relativePath} missing` };
    if (!contains) return { name, ok: true, message: `${relativePath} exists` };
    const text = readFileSync(path, "utf8");
    const ok = contains.every((needle) => text.includes(needle));
    return { name, ok, message: ok ? `${relativePath} contains expected store assets` : `${relativePath} missing expected content` };
}

async function main() {
    const checks = [];

    checks.push(checkFile("Built sales package", "dist/index.html", [
        ...storeMarkers
    ]));
    checks.push(checkFile("Built store data", "dist/site-data.js", [
        "Gift Ideas & Custom Art",
        "Reviewed with Maryilu first",
        "Ribbon bouquet gift",
        "Baby shower keepsake gift",
        "shopTitleCustom",
        "orderTitle"
    ]));
    checks.push(checkFile("Built portfolio package", "dist/portfolio.html", [
        "Maryilu Art Portfolio",
        "Shop Custom Gifts",
        "portfolio.css"
    ]));

    for (const key of requiredSecrets) {
        checks.push({
            name: `Secret ${key}`,
            ok: secretLooksConfigured(env[key]),
            message: secretLooksConfigured(env[key]) ? "configured" : "missing or placeholder"
        });
    }

    checks.push({
        name: "Notification webhook",
        ok: true,
        required: false,
        message: secretLooksConfigured(env.NOTIFICATION_WEBHOOK_URL) ? "configured" : "not configured"
    });

    checks.push(await checkUrl("Local sales site", config.localSiteUrl, ({ ok, status, text }) => ({
        ok: ok && storeMarkers.every((marker) => text.includes(marker)),
        message: `HTTP ${status}${storeMarkers.every((marker) => text.includes(marker)) ? ", premium black/burgundy handmade store loaded" : ", premium black/burgundy handmade store not detected"}`
    })));

    checks.push(await checkJsonEndpoint("Local Worker shop items", `${config.localWorkerUrl}/shop-items`));

    if (secretLooksConfigured(config.adminToken)) {
        checks.push(await checkJsonEndpoint("Local Worker automation status", `${config.localWorkerUrl}/automation-status`, {
            headers: { Authorization: `Bearer ${config.adminToken}` }
        }));
    } else {
        checks.push({ name: "Local Worker automation status", ok: false, message: "ADMIN_TOKEN missing or placeholder" });
    }

    checks.push(await checkUrl("Production sales site", config.productionSiteUrl, ({ ok, status, text }) => ({
        ok: ok && productionStoreMarkers.every((marker) => text.includes(marker)),
        message: `HTTP ${status}${productionStoreMarkers.every((marker) => text.includes(marker)) ? ", current premium black/burgundy handmade store detected" : ", current premium black/burgundy handmade store not detected"}`
    })));

    checks.push(await checkAdminAccessGate("Production admin access gate", config.productionAdminUrl));
    checks.push(await checkJsonEndpoint("Production Worker shop items", `${config.productionWorkerUrl}/shop-items`));
    if (secretLooksConfigured(config.productionAdminToken)) {
        const productionAutomation = await checkJsonEndpoint("Production Worker automation status", `${config.productionWorkerUrl}/automation-status`, {
            headers: { Authorization: `Bearer ${config.productionAdminToken}` }
        });
        if (productionAutomation.ok) {
            const configured = productionAutomation.data.configured || {};
            const launch = productionAutomation.data.launch || {};
            productionAutomation.ok = Boolean(
                configured.adminToken &&
                configured.stripeSecretKey &&
                configured.stripeWebhookSecret &&
                configured.instagramAccessToken &&
                configured.instagramUserId &&
                launch.requiredReady
            );
            productionAutomation.message = productionAutomation.ok
                ? "deployed Worker secrets and required launch checks are ready"
                : "deployed Worker secrets or required launch checks are not ready";
        }
        checks.push(productionAutomation);
    } else {
        checks.push({
            name: "Production Worker automation status",
            ok: false,
            required: false,
            message: "set PRODUCTION_ADMIN_TOKEN to verify deployed Stripe/Instagram/admin secrets",
            url: `${config.productionWorkerUrl}/automation-status`
        });
    }
    checks.push(await checkDns(config.portfolioHost));

    const requiredFailures = checks.filter((check) => check.required !== false && !check.ok);
    const output = {
        ok: requiredFailures.length === 0,
        checkedAt: new Date().toISOString(),
        checks
    };

    if (jsonMode) {
        console.log(JSON.stringify(output, null, 2));
    } else {
        console.log(`Maryilu readiness check (${output.checkedAt})`);
        for (const check of checks) {
            const icon = check.ok ? "OK " : "NO ";
            const optional = check.required === false ? " optional" : "";
            const suffix = check.url ? ` (${check.url})` : "";
            console.log(`${icon} ${check.name}${optional}: ${check.message}${suffix}`);
        }
        console.log(output.ok ? "\nReady for production handoff." : `\nNot production-ready: ${requiredFailures.length} check(s) need attention.`);
    }

    process.exit(output.ok ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
