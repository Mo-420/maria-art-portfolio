#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const rootDir = process.cwd();
const require = createRequire(import.meta.url);
const { simulatedInstagramMedia } = require("../instagram-fixtures.js");
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");

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
const apiUrl = (valueArg("--api-url") || env.LOCAL_WORKER_URL || "http://127.0.0.1:8788").replace(/\/+$/, "");
const adminToken = valueArg("--token") || env.ADMIN_TOKEN || "";

const simulatedMedia = simulatedInstagramMedia.map(item => ({ ...item }));

function assertLocalUrl(url) {
    const parsed = new URL(url);
    if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
        throw new Error(`Refusing to simulate against non-local Worker URL: ${url}`);
    }
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
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { success: false, error: text.slice(0, 240) || `HTTP ${response.status}` };
    }
    return { ok: response.ok, status: response.status, data };
}

function reportLines(result) {
    return [
        "# Maryilu Simulated Instagram Sync",
        "",
        `Generated at: ${result.generatedAt}`,
        `Worker: ${result.apiUrl}`,
        "",
        "## Result",
        `- Simulated posts: ${result.simulatedPosts}`,
        `- Pages fetched: ${result.pagesFetched}`,
        `- Not seen in latest sync: ${result.missingItems}`,
        `- Shop item count: ${result.shopItemCount}`,
        `- Public Instagram-backed items: ${result.publicInstagramItems}`,
        `- Hidden review candidates: ${result.reviewCandidates}`,
        "",
        "## Imported Posts",
        ...result.items.map(item => `- ${item.visibility}: ${item.title} (${item.status}${item.priceCents ? `, ${item.priceCents} ${item.currency}` : ""})`),
        "",
        "## Safety",
        "- This command is local-only and refuses non-local Worker URLs.",
        "- It uses the Worker caption analysis and Instagram-to-shop conversion path.",
        "- Priced available posts stay hidden as review candidates until admin approval.",
        ""
    ];
}

async function main() {
    if (!adminToken) throw new Error("ADMIN_TOKEN missing. Set it in .dev.vars or pass --token=...");
    assertLocalUrl(apiUrl);

    const sync = await fetchJson("/simulate-instagram-sync", {
        method: "POST",
        admin: true,
        body: { media: simulatedMedia }
    });
    if (!sync.ok || sync.data?.success === false) {
        throw new Error(sync.data?.error || `Simulated sync failed: HTTP ${sync.status}`);
    }

    const hidden = await fetchJson("/shop-items?includeHidden=1", { admin: true });
    if (!hidden.ok) throw new Error(hidden.data?.error || "Could not read hidden shop items after simulation.");
    const publicItems = await fetchJson("/shop-items");
    if (!publicItems.ok) throw new Error(publicItems.data?.error || "Could not read public shop items after simulation.");

    const allItems = Array.isArray(hidden.data.items) ? hidden.data.items : [];
    const instagramItems = allItems.filter(item => item.sourcePlatform === "instagram" && item.sourcePostId?.startsWith("sim_"));
    const result = {
        generatedAt: new Date().toISOString(),
        apiUrl,
        simulatedPosts: sync.data.media?.length || simulatedMedia.length,
        pagesFetched: sync.data.meta?.pagesFetched || 1,
        missingItems: sync.data.meta?.missingItemCount || 0,
        shopItemCount: allItems.length,
        publicInstagramItems: (publicItems.data.items || []).filter(item => item.sourcePlatform === "instagram" && item.sourcePostId?.startsWith("sim_")).length,
        reviewCandidates: instagramItems.filter(item => item.hidden && item.status === "available" && item.priceCents).length,
        items: instagramItems.map(item => ({
            id: item.id,
            title: item.title,
            status: item.status,
            priceCents: item.priceCents,
            currency: item.currency,
            visibility: item.hidden ? "hidden review" : "public proof"
        }))
    };

    writeFileSync(join(rootDir, "SIMULATED-INSTAGRAM-SYNC.md"), `${reportLines(result).join("\n")}\n`);

    if (jsonMode) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(`Simulated Instagram sync imported ${result.simulatedPosts} post(s).`);
        console.log(`Review candidates: ${result.reviewCandidates}`);
        console.log(`Public Instagram-backed items: ${result.publicInstagramItems}`);
        console.log("Report written to SIMULATED-INSTAGRAM-SYNC.md");
    }
}

if (!existsSync(join(rootDir, "cloudflare-worker.js"))) {
    throw new Error("Run this from the Maryilu repository root.");
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
