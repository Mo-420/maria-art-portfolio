#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const strictMode = args.includes("--strict");
const writeFlag = args.find((arg) => arg.startsWith("--write"));

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
            if (key) acc[key] = value.replace(/^["']|["']$/g, "");
            return acc;
        }, {});
}

const localVars = loadDotEnv(join(rootDir, ".dev.vars"));
const env = { ...localVars, ...process.env };

const config = {
    accountId: env.CLOUDFLARE_ACCOUNT_ID || "",
    token: env.CLOUDFLARE_API_TOKEN || "",
    zoneName: env.CLOUDFLARE_ZONE_NAME || env.PORTFOLIO_ROOT_DOMAIN || "maryilu.com",
    pagesProject: env.CLOUDFLARE_PAGES_PROJECT || "maria-art-portfolio",
    workerName: env.CLOUDFLARE_WORKER_NAME || "maria-art-data-api",
    productionSiteUrl: env.PRODUCTION_SITE_URL || "https://maryilu.com/",
    portfolioHost: env.PORTFOLIO_HOST || "portfolio.maryilu.com",
    expectedPagesHost: env.CLOUDFLARE_PAGES_HOST || "maria-art-portfolio.pages.dev"
};

const requiredSecrets = [
    "ADMIN_TOKEN",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "INSTAGRAM_ACCESS_TOKEN",
    "INSTAGRAM_USER_ID"
];

const storeMarkers = [
    "Maryilu | Custom Handmade Gifts & Art",
    "store-final.css",
    "maryilu-pro-max.css",
    "Custom Art Gifts Worth Keeping",
    "transform-story-section",
    "kinetic-gallery-section",
    "Gift Ideas & Custom Art",
    "store-assurance-strip",
    "trust-cockpit-section",
    "order-brief-strip",
    "social-section",
    "about-section"
];

function writePathFromFlag() {
    if (!writeFlag) return "";
    if (writeFlag === "--write") return "CLOUDFLARE-STATUS.md";
    return writeFlag.split("=")[1] || "CLOUDFLARE-STATUS.md";
}

function ageDays(value) {
    if (!value) return null;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return null;
    return Math.max(0, Math.round((Date.now() - time) / 86400000));
}

function okMessage(ok, message) {
    return { ok: Boolean(ok), message };
}

async function cf(path, query = {}) {
    const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${config.token}`,
            "Content-Type": "application/json"
        }
    });
    const data = await response.json().catch(() => ({}));
    return {
        status: response.status,
        success: Boolean(data.success && response.ok),
        result: data.result,
        errors: data.errors || [],
        result_info: data.result_info || null
    };
}

async function fetchText(url) {
    const response = await fetch(url, { redirect: "follow" });
    const text = await response.text();
    return { status: response.status, ok: response.ok, text };
}

async function cloudflareSnapshot() {
    const pagesResponse = await cf(`/accounts/${config.accountId}/pages/projects`);
    const projects = Array.isArray(pagesResponse.result) ? pagesResponse.result : [];
    const pagesProject = projects.find((project) => project.name === config.pagesProject) || null;

    const workerSettings = await cf(`/accounts/${config.accountId}/workers/scripts/${config.workerName}/settings`);
    const workerSecrets = await cf(`/accounts/${config.accountId}/workers/scripts/${config.workerName}/secrets`);
    const secretNames = Array.isArray(workerSecrets.result) ? workerSecrets.result.map((secret) => secret.name).sort() : [];

    const zonesResponse = await cf("/zones", { name: config.zoneName });
    const zones = Array.isArray(zonesResponse.result) ? zonesResponse.result : [];
    const zone = zones[0] || null;
    let dnsRecords = [];
    if (zone?.id) {
        const dnsResponse = await cf(`/zones/${zone.id}/dns_records`);
        dnsRecords = Array.isArray(dnsResponse.result) ? dnsResponse.result : [];
    }

    const liveSite = await fetchText(config.productionSiteUrl).catch((error) => ({
        ok: false,
        status: 0,
        text: String(error?.message || error)
    }));

    const missingSecrets = requiredSecrets.filter((name) => !secretNames.includes(name));
    const rootRecord = dnsRecords.find((record) => record.name === config.zoneName);
    const wwwRecord = dnsRecords.find((record) => record.name === `www.${config.zoneName}`);
    const portfolioRecord = dnsRecords.find((record) => record.name === config.portfolioHost);
    const pagesDomains = pagesProject?.domains || [];
    const latestDeployment = pagesProject?.latest_deployment || null;
    const liveStoreCurrent = liveSite.ok && storeMarkers.every((marker) => liveSite.text.includes(marker));

    return {
        checkedAt: new Date().toISOString(),
        config: {
            accountId: config.accountId ? `${config.accountId.slice(0, 6)}...${config.accountId.slice(-4)}` : "",
            zoneName: config.zoneName,
            pagesProject: config.pagesProject,
            workerName: config.workerName,
            productionSiteUrl: config.productionSiteUrl,
            portfolioHost: config.portfolioHost
        },
        pages: {
            ok: Boolean(pagesProject),
            projectFound: Boolean(pagesProject),
            domains: pagesDomains,
            hasRootDomain: pagesDomains.includes(config.zoneName),
            hasWwwDomain: pagesDomains.includes(`www.${config.zoneName}`),
            hasPortfolioDomain: pagesDomains.includes(config.portfolioHost),
            productionBranch: pagesProject?.production_branch || "",
            latestDeployment: latestDeployment ? {
                id: latestDeployment.id,
                createdOn: latestDeployment.created_on,
                modifiedOn: latestDeployment.modified_on,
                environment: latestDeployment.environment,
                url: latestDeployment.url,
                aliases: latestDeployment.aliases || [],
                ageDays: ageDays(latestDeployment.created_on)
            } : null,
            check: okMessage(
                Boolean(
                    pagesProject
                    && pagesDomains.includes(config.zoneName)
                    && pagesDomains.includes(`www.${config.zoneName}`)
                    && pagesDomains.includes(config.portfolioHost)
                ),
                pagesProject && !pagesDomains.includes(config.portfolioHost)
                    ? `Pages project found, but ${config.portfolioHost} is not attached`
                    : "Pages project and root/www/portfolio custom domains"
            )
        },
        liveSite: {
            ok: liveStoreCurrent,
            status: liveSite.status,
            currentStoreDetected: liveStoreCurrent,
            check: okMessage(liveStoreCurrent, liveStoreCurrent ? "Current premium black/burgundy handmade store detected on production" : "Production does not serve the current premium black/burgundy handmade store markers")
        },
        worker: {
            ok: Boolean(workerSettings.success),
            settingsStatus: workerSettings.status,
            compatibilityDate: workerSettings.result?.compatibility_date || "",
            bindings: workerSettings.result?.bindings || [],
            secretNames,
            missingSecrets,
            check: okMessage(Boolean(workerSettings.success && !missingSecrets.length), missingSecrets.length ? `Missing Worker secrets: ${missingSecrets.join(", ")}` : "Worker script and required secret names present")
        },
        dns: {
            ok: Boolean(zone && rootRecord && wwwRecord && portfolioRecord),
            zone: zone ? {
                id: zone.id,
                name: zone.name,
                status: zone.status,
                paused: zone.paused,
                type: zone.type,
                nameServers: zone.name_servers || []
            } : null,
            records: [rootRecord, wwwRecord, portfolioRecord].filter(Boolean).map((record) => ({
                type: record.type,
                name: record.name,
                content: record.content,
                proxied: record.proxied,
                ttl: record.ttl
            })),
            rootRecord: rootRecord ? `${rootRecord.type} ${rootRecord.content}` : "",
            wwwRecord: wwwRecord ? `${wwwRecord.type} ${wwwRecord.content}` : "",
            portfolioRecord: portfolioRecord ? `${portfolioRecord.type} ${portfolioRecord.content}` : "",
            check: okMessage(Boolean(zone && rootRecord && wwwRecord && portfolioRecord), portfolioRecord ? "Root, www, and portfolio DNS records found" : `${config.portfolioHost} DNS record missing`)
        }
    };
}

function missingConfigReport() {
    const missing = [];
    if (!config.accountId) missing.push("CLOUDFLARE_ACCOUNT_ID");
    if (!config.token) missing.push("CLOUDFLARE_API_TOKEN");
    return {
        checkedAt: new Date().toISOString(),
        ok: false,
        missingConfig: missing,
        checks: missing.map((name) => ({ name, ok: false, message: "missing" }))
    };
}

function markdown(report) {
    const lines = [
        "# Maryilu Cloudflare Status",
        "",
        `Checked: ${report.checkedAt}`,
        "",
        "## Summary",
        `- Pages project: ${report.pages?.projectFound ? "found" : "missing"} (${config.pagesProject})`,
        `- Production store: ${report.liveSite?.currentStoreDetected ? "current premium black/burgundy handmade store detected" : "current store not detected"}`,
        `- Worker: ${report.worker?.ok ? "found" : "missing or inaccessible"} (${config.workerName})`,
        `- Worker secrets: ${report.worker?.missingSecrets?.length ? `missing ${report.worker.missingSecrets.join(", ")}` : "required secret names present"}`,
        `- Portfolio DNS: ${report.dns?.portfolioRecord ? report.dns.portfolioRecord : "missing"}`,
        "",
        "## Pages",
        `- Domains: ${(report.pages?.domains || []).join(", ") || "none"}`,
        `- Latest deployment: ${report.pages?.latestDeployment?.id || "none"}`,
        `- Latest deployment created: ${report.pages?.latestDeployment?.createdOn || "unknown"}`,
        `- Latest deployment age: ${report.pages?.latestDeployment?.ageDays ?? "unknown"} day(s)`,
        "",
        "## Worker",
        `- Compatibility date: ${report.worker?.compatibilityDate || "unknown"}`,
        `- Bindings: ${(report.worker?.bindings || []).map((binding) => `${binding.type}:${binding.name}`).join(", ") || "none"}`,
        `- Secret names visible: ${(report.worker?.secretNames || []).join(", ") || "none"}`,
        "",
        "## DNS",
        `- Root: ${report.dns?.rootRecord || "missing"}`,
        `- WWW: ${report.dns?.wwwRecord || "missing"}`,
        `- Portfolio: ${report.dns?.portfolioRecord || "missing"}`,
        "",
        "## Next Actions",
        "- Deploy the current Worker if production routes are stale.",
        "- Add missing Worker secrets before enabling Stripe or Instagram automation.",
        "- Deploy the current Pages package to `maria-art-portfolio`.",
        "- Add `portfolio.maryilu.com` to Pages/DNS before enabling canonical portfolio redirects."
    ];
    return `${lines.join("\n")}\n`;
}

function printText(report) {
    if (report.missingConfig) {
        console.log("Maryilu Cloudflare status could not run.");
        console.log(`Missing: ${report.missingConfig.join(", ")}`);
        return;
    }
    console.log(`Maryilu Cloudflare status (${report.checkedAt})`);
    console.log(`Pages: ${report.pages.check.ok ? "OK" : "NO"} - ${report.pages.check.message}`);
    console.log(`Live site: ${report.liveSite.check.ok ? "OK" : "NO"} - ${report.liveSite.check.message}`);
    console.log(`Worker: ${report.worker.check.ok ? "OK" : "NO"} - ${report.worker.check.message}`);
    console.log(`DNS: ${report.dns.check.ok ? "OK" : "NO"} - ${report.dns.check.message}`);
}

async function main() {
    let report;
    if (!config.accountId || !config.token) {
        report = missingConfigReport();
    } else {
        report = await cloudflareSnapshot();
        report.ok = Boolean(report.pages?.check?.ok && report.liveSite?.check?.ok && report.worker?.check?.ok && report.dns?.check?.ok);
    }

    const outputPath = writePathFromFlag();
    if (outputPath) {
        writeFileSync(join(rootDir, outputPath), markdown(report));
    }

    if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printText(report);
        if (outputPath) console.log(`Wrote ${outputPath}`);
    }

    if (strictMode && !report.ok) process.exit(1);
}

main().catch((error) => {
    console.error(`Cloudflare status failed: ${error.message}`);
    process.exit(1);
});
