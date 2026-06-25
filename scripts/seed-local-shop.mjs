#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
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

function assertLocalUrl(url) {
    const parsed = new URL(url);
    if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
        throw new Error(`Refusing to seed non-local Worker URL: ${url}`);
    }
}

const previewItems = [
    {
        id: "maryilu-preview-chest",
        sourcePlatform: "curated-preview",
        sourcePostId: "preview-chest",
        title: "Painted keepsake chest",
        category: "custom-gifts",
        mediaUrl: "assets/maryilu-luxury-chest-hero.png",
        permalink: "https://www.instagram.com/marialuisas_arttt/",
        caption: "A hand-painted box built around one person, one occasion, and the details they will recognize.",
        priceCents: null,
        currency: "eur",
        status: "inquiry",
        hidden: false,
        publishTargets: ["store", "portfolio", "social"],
        automationNotes: {
            recommendation: "publish-as-proof-and-inquiry",
            generatedBy: "local-preview-seed",
            requiresAdminReview: false
        }
    },
    {
        id: "maryilu-preview-bouquet",
        sourcePlatform: "curated-preview",
        sourcePostId: "preview-bouquet",
        title: "Ribbon bouquet gift",
        category: "flowers",
        mediaUrl: "assets/maryilu-editorial-store-hero.png",
        permalink: "https://www.instagram.com/marialuisas_arttt/",
        caption: "Permanent flowers with custom colors, names, cards, or small details matched to the recipient.",
        priceCents: null,
        currency: "eur",
        status: "inquiry",
        hidden: false,
        publishTargets: ["store", "portfolio", "social"],
        automationNotes: {
            recommendation: "publish-as-proof-and-inquiry",
            generatedBy: "local-preview-seed",
            requiresAdminReview: false
        }
    },
    {
        id: "maryilu-preview-canvas",
        sourcePlatform: "curated-preview",
        sourcePostId: "preview-canvas",
        title: "Personal memory canvas",
        category: "original-art",
        mediaUrl: "assets/maria-luisa-portfolio-studio.png",
        permalink: "https://www.instagram.com/marialuisas_arttt/",
        caption: "A painted wall piece for lyrics, portraits, inside jokes, places, and personal symbols.",
        priceCents: null,
        currency: "eur",
        status: "inquiry",
        hidden: false,
        publishTargets: ["store", "portfolio", "social"],
        automationNotes: {
            recommendation: "publish-as-proof-and-inquiry",
            generatedBy: "local-preview-seed",
            requiresAdminReview: false
        }
    },
    {
        id: "maryilu-preview-baby-gift",
        sourcePlatform: "curated-preview",
        sourcePostId: "preview-baby-gift",
        title: "Baby shower keepsake gift",
        category: "baby-shower",
        mediaUrl: "assets/maryilu-luxury-chest-hero.png",
        permalink: "https://www.instagram.com/marialuisas_arttt/",
        caption: "A decorative handmade baby shower gift with soft colors, keepsake details, and a clear quote before payment.",
        priceCents: null,
        currency: "eur",
        status: "inquiry",
        hidden: false,
        publishTargets: ["store", "portfolio", "social"],
        automationNotes: {
            recommendation: "publish-as-proof-and-inquiry",
            generatedBy: "local-preview-seed",
            requiresAdminReview: false
        }
    }
];

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

function writeSeedReport(result) {
    const lines = [
        "# Maryilu Local Shop Seed",
        "",
        `Generated at: ${result.generatedAt}`,
        `Worker: ${result.apiUrl}`,
        "",
        "## Result",
        `- Created: ${result.created}`,
        `- Updated: ${result.updated}`,
        `- Visible preview items: ${result.visiblePreviewItems}`,
        "",
        "## Items",
        ...result.items.map(item => `- ${item.action}: ${item.title} (${item.id})`),
        "",
        "## Safety",
        "- This command is local-only and refuses non-local Worker URLs.",
        "- Seeded items are request-led inquiry items; they do not enable direct checkout.",
        "- Production still requires Stripe secrets, Instagram credentials, Worker deploy, Pages deploy, and portfolio DNS.",
        ""
    ];
    writeFileSync(join(rootDir, "LOCAL-SHOP-SEED.md"), `${lines.join("\n")}\n`);
}

async function main() {
    if (!adminToken) {
        throw new Error("ADMIN_TOKEN missing. Set it in .dev.vars or pass --token=...");
    }
    assertLocalUrl(apiUrl);

    const current = await fetchJson("/shop-items?includeHidden=1", { admin: true });
    if (!current.ok) {
        throw new Error(current.data?.error || `Unable to read local shop items: HTTP ${current.status}`);
    }
    const existing = Array.isArray(current.data.items) ? current.data.items : [];
    const existingIds = new Set(existing.map(item => item.id));
    const result = {
        generatedAt: new Date().toISOString(),
        apiUrl,
        created: 0,
        updated: 0,
        visiblePreviewItems: 0,
        items: []
    };

    for (const item of previewItems) {
        const exists = existingIds.has(item.id);
        const response = await fetchJson(exists ? `/shop-items/${encodeURIComponent(item.id)}` : "/shop-items", {
            method: exists ? "PATCH" : "POST",
            admin: true,
            body: item
        });
        if (!response.ok || response.data?.success === false) {
            throw new Error(response.data?.error || `Unable to seed ${item.id}: HTTP ${response.status}`);
        }
        result[exists ? "updated" : "created"] += 1;
        result.items.push({
            id: response.data.item?.id || item.id,
            title: response.data.item?.title || item.title,
            action: exists ? "updated" : "created"
        });
    }

    const publicItems = await fetchJson("/shop-items");
    const publicList = Array.isArray(publicItems.data?.items) ? publicItems.data.items : [];
    result.visiblePreviewItems = publicList.filter(item => item.sourcePlatform === "curated-preview" && item.status !== "hidden").length;
    writeSeedReport(result);

    if (jsonMode) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(`Seeded local shop preview: ${result.created} created, ${result.updated} updated.`);
        console.log(`Visible preview items: ${result.visiblePreviewItems}`);
        console.log("Report written to LOCAL-SHOP-SEED.md");
    }
}

if (!existsSync(join(rootDir, "cloudflare-worker.js"))) {
    throw new Error("Run this from the Maryilu repository root.");
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
