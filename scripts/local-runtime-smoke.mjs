#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
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

function secretLooksConfigured(value) {
    return Boolean(value && !/replace|placeholder|example|your-/i.test(String(value)));
}

const localVars = loadDotEnv(join(rootDir, ".dev.vars"));
const env = { ...localVars, ...process.env };
const config = {
    localSiteUrl: env.LOCAL_SITE_URL || "http://127.0.0.1:4173",
    localWorkerUrl: env.LOCAL_WORKER_URL || "http://127.0.0.1:8788",
    adminToken: env.ADMIN_TOKEN || ""
};

const storeMarkers = [
    "store-warm.css?v=20260624-rose-studio",
    "Custom Art Gifts Worth Keeping",
    "Choose the kind of gift",
    "Gift Ideas & Custom Art",
    "Photo placeholder: Hero product",
    "Photo placeholder: Maria in the studio",
    "categoryCards",
    "order-brief-strip",
    "shop-section",
    "social-section",
    "about-section",
    "order-section"
];

const forbiddenStoreMarkers = [
    "store-final.css",
    "maryilu-pro-max.css",
    "vendor/gsap",
    "ScrollTrigger",
    "transform-story-section",
    "kinetic-gallery-section",
    "store-assurance-strip",
    "trust-cockpit-section",
    "commerce-os-section",
    "trust-system-section",
    "store-signal-band",
    "trust-bento"
];

const expectedRequestLedShopTitles = [
    "Baby shower keepsake gift",
    "Ribbon bouquet gift",
    "Personal memory canvas",
    "Painted keepsake chest"
];

async function fetchText(url, options = {}) {
    const response = await fetch(url, { redirect: "follow", ...options });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
}

async function checkStore() {
    try {
        const result = await fetchText(config.localSiteUrl);
        const missing = storeMarkers.filter((marker) => !result.text.includes(marker));
        const forbidden = forbiddenStoreMarkers.filter((marker) => result.text.includes(marker));
        return {
            name: "Local store preview",
            ok: result.ok && missing.length === 0 && forbidden.length === 0,
            message: result.ok && missing.length === 0 && forbidden.length === 0
                ? "Warm handmade store rendered without old scroll-theater markers"
                : `HTTP ${result.status}; missing markers: ${missing.join(", ") || "none"}; forbidden markers: ${forbidden.join(", ") || "none"}`,
            url: config.localSiteUrl
        };
    } catch (error) {
        return {
            name: "Local store preview",
            ok: false,
            message: `${error.message}; start npm run dev:site or npm run dev`,
            url: config.localSiteUrl
        };
    }
}

async function checkJson(name, path, options = {}) {
    const url = `${config.localWorkerUrl}${path}`;
    const { validate, ...fetchOptions } = options;
    try {
        const result = await fetchText(url, fetchOptions);
        let data = null;
        try {
            data = JSON.parse(result.text);
        } catch {
            return {
                name,
                ok: false,
                message: `HTTP ${result.status}; expected JSON`,
                url
            };
        }
        const validationIssues = typeof validate === "function" ? validate(data).filter(Boolean) : [];
        return {
            name,
            ok: result.ok && data.success !== false && validationIssues.length === 0,
            message: result.ok && data.success !== false && validationIssues.length === 0
                ? `HTTP ${result.status}`
                : `HTTP ${result.status}; ${data.error || "success false"}`,
            detail: validationIssues.join("; "),
            url
        };
    } catch (error) {
        return {
            name,
            ok: false,
            message: `${error.message}; start npm run dev:worker or npm run dev`,
            url
        };
    }
}

async function main() {
    const checks = [
        await checkStore(),
        await checkJson("Local Worker request-led shop items", "/shop-items", {
            validate: (data) => {
                const items = Array.isArray(data.items) ? data.items : [];
                const visibleStoreItems = items.filter((item) => (
                    item
                    && item.hidden !== true
                    && item.status !== "hidden"
                    && Array.isArray(item.publishTargets)
                    && item.publishTargets.includes("store")
                ));
                const titleSet = new Set(visibleStoreItems.map((item) => String(item.title || "").trim()));
                const publicDirectCheckoutItems = visibleStoreItems.filter((item) => (
                    item.status === "available"
                    && Number(item.priceCents) > 0
                ));
                const requestLedItems = visibleStoreItems.filter((item) => (
                    item.status === "inquiry"
                    && !Number(item.priceCents)
                ));
                return [
                    Array.isArray(data.items) ? "" : "shop items response missing items array",
                    expectedRequestLedShopTitles.every((title) => titleSet.has(title)) ? "" : "expected four request-led gift styles missing",
                    requestLedItems.length >= expectedRequestLedShopTitles.length ? "" : "request-led shop item count too low",
                    publicDirectCheckoutItems.length === 0 ? "" : "direct checkout item exposed before local Stripe readiness",
                    visibleStoreItems.some((item) => item.simulated && item.status === "available") ? "simulated item exposed as available" : ""
                ];
            }
        }),
        await checkJson("Local Worker public automation status", "/automation-public-status", {
            validate: (data) => [
                data.automation?.checkoutGuard === "available-reserved-sold" ? "" : "checkout guard missing",
                data.automation?.directCheckoutActive === false || data.shop?.buyableItems > 0 ? "" : "direct checkout state is unclear",
                Number.isFinite(Number(data.shop?.requestableItems)) ? "" : "requestable item count missing",
                data.instagram?.ready || data.instagram?.hasLiveProof || data.instagram?.hasPreviewProof || data.automation?.proofSource === "curated" ? "" : "proof source missing"
            ]
        })
    ];

    if (secretLooksConfigured(config.adminToken)) {
        const adminHeaders = { Authorization: `Bearer ${config.adminToken}` };
        checks.push(
            await checkJson("Local Worker automation status", "/automation-status", {
                headers: adminHeaders
            }),
            await checkJson("Local Worker agent brief", "/agent-brief", {
                headers: adminHeaders,
                validate: (data) => {
                    const runbook = Array.isArray(data.setupRunbook) ? data.setupRunbook : [];
                    const requiredRunbook = ["stripe-secret", "stripe-webhook", "instagram-meta"];
                    const runModeSignals = Array.isArray(data.runMode?.signals) ? data.runMode.signals : [];
                    return [
                        data.runMode?.guardrail && /Buy buttons stay hidden|direct checkout/i.test(data.runMode.guardrail) ? "" : "buyer guardrail missing",
                        runbook.length >= 5 ? "" : "connection runbook too short",
                        requiredRunbook.every(key => runbook.some(step => step.key === key && step.required === true)) ? "" : "required Stripe/Instagram runbook steps missing",
                        runModeSignals.some(signal => signal.label === "Input") ? "" : "input signal missing",
                        Array.isArray(data.operatorChecklist) && data.operatorChecklist.length ? "" : "operator checklist missing"
                    ];
                }
            }),
            await checkJson("Local Worker automation events", "/automation-events", {
                headers: adminHeaders
            }),
            await checkJson("Local Worker caption analysis", "/analyze-caption", {
                method: "POST",
                headers: {
                    ...adminHeaders,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    caption: "Available custom ribbon bouquet, €70, Mallorca pickup, custom colors possible."
                }),
                validate: (data) => [
                    data.analysis?.automationNotes?.recommendation === "direct-checkout-candidate" ? "" : "caption recommendation should identify direct-checkout candidate",
                    Array.isArray(data.analysis?.warnings) && data.analysis.warnings.some(warning => /Direct checkout candidate/i.test(warning)) ? "" : "caption direct-checkout warning missing",
                    Array.isArray(data.analysis?.reviewChecklist) && data.analysis.reviewChecklist.some(step => step.key === "image" && step.requiredForCheckout) ? "" : "review checklist image gate missing"
                ]
            })
        );
    } else {
        for (const [name, path] of [
            ["Local Worker automation status", "/automation-status"],
            ["Local Worker agent brief", "/agent-brief"],
            ["Local Worker automation events", "/automation-events"],
            ["Local Worker caption analysis", "/analyze-caption"]
        ]) {
            checks.push({
                name,
                ok: false,
                message: "ADMIN_TOKEN missing or placeholder in .dev.vars",
                url: `${config.localWorkerUrl}${path}`
            });
        }
    }

    const failed = checks.filter((check) => !check.ok);
    const output = {
        ok: failed.length === 0,
        checkedAt: new Date().toISOString(),
        checks
    };

    if (jsonMode) {
        console.log(JSON.stringify(output, null, 2));
    } else {
        console.log(`Maryilu local runtime smoke (${output.checkedAt})`);
        checks.forEach((check) => {
            const detail = check.detail ? `; ${check.detail}` : "";
            console.log(`${check.ok ? "OK " : "NO "} ${check.name}: ${check.message}${detail} (${check.url})`);
        });
        console.log(output.ok ? "\nLocal runtime is ready." : `\nLocal runtime not ready: ${failed.length} check(s) failed.`);
    }

    process.exit(output.ok ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
