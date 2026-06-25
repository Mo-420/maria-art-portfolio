#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";

class MemoryKV {
    constructor(seed = {}) {
        this.store = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
    }

    async get(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }

    async put(key, value) {
        this.store.set(key, String(value));
    }
}

class MemoryR2 {
    constructor() {
        this.objects = new Map();
    }

    async put(key, value, options = {}) {
        let bytes;
        if (value instanceof ArrayBuffer) {
            bytes = new Uint8Array(value);
        } else if (ArrayBuffer.isView(value)) {
            bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        } else if (value && typeof value.arrayBuffer === "function") {
            bytes = new Uint8Array(await value.arrayBuffer());
        } else if (value && typeof value.getReader === "function") {
            const reader = value.getReader();
            const chunks = [];
            let total = 0;
            while (true) {
                const { done, value: chunk } = await reader.read();
                if (done) break;
                const view = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
                chunks.push(view);
                total += view.byteLength;
            }
            bytes = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
            }
        } else {
            bytes = Buffer.from(String(value || ""));
        }

        this.objects.set(key, {
            bytes,
            httpMetadata: options.httpMetadata || {},
            customMetadata: options.customMetadata || {}
        });
    }

    async get(key) {
        const object = this.objects.get(key);
        if (!object) return null;
        return {
            body: object.bytes,
            size: object.bytes.byteLength,
            httpMetadata: object.httpMetadata,
            customMetadata: object.customMetadata,
            writeHttpMetadata(headers) {
                if (object.httpMetadata.contentType) headers.set("Content-Type", object.httpMetadata.contentType);
                if (object.httpMetadata.cacheControl) headers.set("Cache-Control", object.httpMetadata.cacheControl);
            }
        };
    }
}

function loadWorkerModule() {
    const source = readFileSync("cloudflare-worker.js", "utf8");
    const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    return import(dataUrl);
}

function loadPagesWorkerModule() {
    const source = readFileSync("_worker.js", "utf8");
    const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    return import(dataUrl);
}

function makeEnv(seed = {}, options = {}) {
    const env = {
        ADMIN_TOKEN: "test-admin-token",
        PUBLIC_SITE_URL: "http://127.0.0.1:4173",
        ART_DATA: new MemoryKV(seed)
    };
    if (options.images) env.ART_IMAGES = new MemoryR2();
    return env;
}

function makeCtx() {
    return {
        promises: [],
        waitUntil(promise) {
            this.promises.push(Promise.resolve(promise));
        }
    };
}

function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.admin) headers.set("Authorization", "Bearer test-admin-token");
    if (options.body && !options.formData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (options.rawBody && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    return new Request(`https://worker.test${path}`, {
        method: options.method || "GET",
        headers,
        body: options.rawBody || options.formData || (options.body ? JSON.stringify(options.body) : undefined)
    });
}

async function json(response) {
    const data = await response.json();
    return { status: response.status, data };
}

function stripeSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
    const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    return `t=${timestamp},v1=${digest}`;
}

function metaSignature(payload, secret) {
    const digest = createHmac("sha256", secret).update(payload).digest("hex");
    return `sha256=${digest}`;
}

async function sendStripeEvent(worker, env, event) {
    const payload = JSON.stringify(event);
    return json(await worker.fetch(request("/stripe-webhook", {
        method: "POST",
        rawBody: payload,
        headers: {
            "Stripe-Signature": stripeSignature(payload, env.STRIPE_WEBHOOK_SECRET)
        }
    }), env, makeCtx()));
}

async function shopItem(worker, env, id) {
    const result = await json(await worker.fetch(request("/shop-items?includeHidden=1", { admin: true }), env, makeCtx()));
    assert.equal(result.status, 200);
    return result.data.items.find(item => item.id === id);
}

async function run() {
    const pagesWorkerModule = await loadPagesWorkerModule();
    const pagesWorker = pagesWorkerModule.default;
    assert.equal(typeof pagesWorker.fetch, "function", "Pages Worker fetch export is missing");

    const seenAssetPaths = [];
    const pagesEnv = {
        ASSETS: {
            async fetch(assetRequest) {
                const assetUrl = new URL(assetRequest.url);
                seenAssetPaths.push(assetUrl.pathname);
                return new Response(`asset:${assetUrl.pathname}`, {
                    status: 200,
                    headers: { "Content-Type": "text/plain" }
                });
            }
        },
        PORTFOLIO_REDIRECT_READY: "false"
    };

    const portfolioRoot = await pagesWorker.fetch(new Request("https://portfolio.maryilu.com/"), pagesEnv);
    assert.equal(portfolioRoot.status, 200);
    assert.equal(await portfolioRoot.text(), "asset:/portfolio", "portfolio subdomain root should serve the clean portfolio route");
    assert.equal(seenAssetPaths.at(-1), "/portfolio");

    const portfolioCleanRoute = await pagesWorker.fetch(new Request("https://portfolio.maryilu.com/portfolio"), pagesEnv);
    assert.equal(portfolioCleanRoute.status, 200);
    assert.equal(await portfolioCleanRoute.text(), "asset:/portfolio");

    const mainPortfolioCompat = await pagesWorker.fetch(new Request("https://maryilu.com/portfolio.html"), pagesEnv);
    assert.equal(mainPortfolioCompat.status, 200, "main /portfolio.html should remain compatible until DNS is ready");
    assert.equal(await mainPortfolioCompat.text(), "asset:/portfolio.html");

    const portfolioShopRedirect = await pagesWorker.fetch(new Request("https://portfolio.maryilu.com/shop"), pagesEnv);
    assert.equal(portfolioShopRedirect.status, 302, "non-portfolio paths on the portfolio host should redirect to the main store");
    assert.equal(portfolioShopRedirect.headers.get("Location"), "https://maryilu.com/shop");

    const sourceBlock = await pagesWorker.fetch(new Request("https://maryilu.com/cloudflare-worker.js"), pagesEnv);
    assert.equal(sourceBlock.status, 404, "Pages Worker should not expose source Worker code");

    const adminFailsClosedByDefault = await pagesWorker.fetch(new Request("https://maryilu.com/admin.html"), pagesEnv);
    assert.equal(adminFailsClosedByDefault.status, 403, "production admin page should fail closed when protection is not configured");
    assert.match(await adminFailsClosedByDefault.text(), /protection is not configured/i);

    const localAdminPreview = await pagesWorker.fetch(new Request("http://127.0.0.1/admin.html"), pagesEnv);
    assert.equal(localAdminPreview.status, 200, "local admin preview should remain available without Pages password");
    assert.equal(await localAdminPreview.text(), "asset:/admin");

    const externalAccessManagedEnv = {
        ...pagesEnv,
        ADMIN_PAGE_ACCESS_MANAGED: "true"
    };
    const accessManagedAdmin = await pagesWorker.fetch(new Request("https://maryilu.com/admin.html"), externalAccessManagedEnv);
    assert.equal(accessManagedAdmin.status, 200, "admin page may be served when an external access gate is deliberately declared");
    assert.equal(await accessManagedAdmin.text(), "asset:/admin");

    const gatedAdminEnv = {
        ...pagesEnv,
        ADMIN_PAGE_USER: "maria",
        ADMIN_PAGE_PASSWORD: "studio-secret"
    };
    const unauthenticatedAdmin = await pagesWorker.fetch(new Request("https://maryilu.com/admin.html"), gatedAdminEnv);
    assert.equal(unauthenticatedAdmin.status, 401, "admin page should challenge when ADMIN_PAGE_PASSWORD is configured");
    assert.match(unauthenticatedAdmin.headers.get("WWW-Authenticate") || "", /Basic realm="Maryilu Admin"/);
    assert.equal(unauthenticatedAdmin.headers.get("X-Robots-Tag"), "noindex, nofollow, noarchive");

    const wrongAdminAuth = await pagesWorker.fetch(new Request("https://maryilu.com/admin.html", {
        headers: { "Authorization": `Basic ${Buffer.from("maria:wrong").toString("base64")}` }
    }), gatedAdminEnv);
    assert.equal(wrongAdminAuth.status, 401, "wrong Pages admin password should be rejected");

    const authorizedAdmin = await pagesWorker.fetch(new Request("https://maryilu.com/admin", {
        headers: { "Authorization": `Basic ${Buffer.from("maria:studio-secret").toString("base64")}` }
    }), gatedAdminEnv);
    assert.equal(authorizedAdmin.status, 200, "correct Pages admin password should serve admin.html");
    assert.equal(await authorizedAdmin.text(), "asset:/admin");

    const redirectReadyEnv = { ...pagesEnv, PORTFOLIO_REDIRECT_READY: "true" };
    const mainPortfolioCanonical = await pagesWorker.fetch(new Request("https://maryilu.com/portfolio.html"), redirectReadyEnv);
    assert.equal(mainPortfolioCanonical.status, 301, "main /portfolio.html should redirect after portfolio DNS is ready");
    assert.equal(mainPortfolioCanonical.headers.get("Location"), "https://portfolio.maryilu.com/");

    const workerModule = await loadWorkerModule();
    const worker = workerModule.default;
    assert.equal(typeof worker.fetch, "function", "Worker fetch export is missing");
    assert.equal(typeof worker.scheduled, "function", "Worker scheduled export is missing");

    const siteSettingsEnv = makeEnv();
    const storeImageSettings = {
        assets: {
            storeHero: {
                mediaUrl: "/media/shop-items/store-hero.webp",
                alt: "Maryilu hero gift photo",
                placeholderLabel: "Photo placeholder: Hero product"
            },
            categories: {
                "gift-boxes": {
                    mediaUrl: "/media/shop-items/painted-chest.webp",
                    alt: "Painted Maryilu chest",
                    placeholderLabel: "Photo placeholder: Painted chest"
                }
            },
            about: {
                mediaUrl: "/media/shop-items/about-maria.webp",
                alt: "Maria in the Maryilu studio",
                placeholderLabel: "Photo placeholder: Maria in the studio"
            },
            heroImage: "legacy-string-kept-for-compatibility.jpg"
        }
    };
    const unauthorizedSettingsSave = await json(await worker.fetch(request("/site-settings", {
        method: "PUT",
        body: storeImageSettings
    }), siteSettingsEnv, makeCtx()));
    assert.equal(unauthorizedSettingsSave.status, 401, "site settings saves must require admin auth");

    const savedStoreImages = await json(await worker.fetch(request("/site-settings", {
        method: "PUT",
        admin: true,
        body: storeImageSettings
    }), siteSettingsEnv, makeCtx()));
    assert.equal(savedStoreImages.status, 200, "site settings with store image slots should save");
    assert.equal(savedStoreImages.data.success, true);
    assert.equal(savedStoreImages.data.settings.assets.storeHero.mediaUrl, "/media/shop-items/store-hero.webp");
    assert.equal(savedStoreImages.data.settings.assets.categories["gift-boxes"].alt, "Painted Maryilu chest");
    assert.equal(savedStoreImages.data.settings.assets.about.placeholderLabel, "Photo placeholder: Maria in the studio");
    assert.equal(savedStoreImages.data.settings.assets.categories.flowers.placeholderLabel, "Photo placeholder: Ribbon bouquet", "missing category slots should keep defaults");
    assert.equal(savedStoreImages.data.settings.assets.heroImage, "legacy-string-kept-for-compatibility.jpg", "legacy string assets should remain backward compatible");

    const loadedStoreImages = await json(await worker.fetch(request("/site-settings"), siteSettingsEnv, makeCtx()));
    assert.equal(loadedStoreImages.status, 200);
    assert.equal(loadedStoreImages.data.assets.storeHero.mediaUrl, "/media/shop-items/store-hero.webp");
    assert.equal(loadedStoreImages.data.assets.about.alt, "Maria in the Maryilu studio");

    const scheduledEnv = makeEnv();
    const scheduledCtx = makeCtx();
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        await worker.scheduled({ cron: "*/30 * * * *", scheduledTime: Date.now() }, scheduledEnv, scheduledCtx);
        await Promise.all(scheduledCtx.promises);
    } finally {
        console.error = originalConsoleError;
    }
    const scheduledMeta = JSON.parse(await scheduledEnv.ART_DATA.get("instagram-media:sync-meta"));
    const scheduledEvents = JSON.parse(await scheduledEnv.ART_DATA.get("automation-events"));
    assert.equal(scheduledMeta.lastError, "Instagram API credentials are not configured.", "scheduled sync should record missing Instagram credentials");
    assert.ok(scheduledEvents.some(event => event.type === "instagram.sync_failed"), "scheduled sync failures should be visible in automation events");

    const webhookEnv = makeEnv();
    webhookEnv.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "maryilu-webhook-verify";
    webhookEnv.INSTAGRAM_APP_SECRET = "maryilu-meta-app-secret";
    const webhookVerify = await worker.fetch(request("/instagram-webhook?hub.mode=subscribe&hub.verify_token=maryilu-webhook-verify&hub.challenge=challenge-123"), webhookEnv, makeCtx());
    assert.equal(webhookVerify.status, 200, "Meta webhook verification should accept the configured verify token");
    assert.equal(await webhookVerify.text(), "challenge-123");
    const webhookVerifyDenied = await worker.fetch(request("/instagram-webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123"), webhookEnv, makeCtx());
    assert.equal(webhookVerifyDenied.status, 403, "Meta webhook verification should reject the wrong verify token");
    const webhookPayload = JSON.stringify({
        object: "instagram",
        entry: [{ id: "17841400000000000", changes: [{ field: "media", value: { media_id: "ig_new_post" } }] }]
    });
    const unsignedWebhook = await json(await worker.fetch(request("/instagram-webhook", {
        method: "POST",
        rawBody: webhookPayload
    }), webhookEnv, makeCtx()));
    assert.equal(unsignedWebhook.status, 400, "Meta webhook POST should require X-Hub-Signature-256");
    const signedWebhookCtx = makeCtx();
    const signedWebhook = await json(await worker.fetch(request("/instagram-webhook", {
        method: "POST",
        rawBody: webhookPayload,
        headers: {
            "X-Hub-Signature-256": metaSignature(webhookPayload, webhookEnv.INSTAGRAM_APP_SECRET)
        }
    }), webhookEnv, signedWebhookCtx));
    assert.equal(signedWebhook.status, 202, "signed Meta webhook should queue an Instagram sync");
    await Promise.all(signedWebhookCtx.promises);
    const webhookEvents = JSON.parse(await webhookEnv.ART_DATA.get("automation-events"));
    assert.ok(webhookEvents.some(event => event.type === "instagram.webhook_received"), "signed Meta webhook should be visible in automation events");
    assert.ok(webhookEvents.some(event => event.type === "instagram.sync_failed"), "queued sync failure should still be recorded when API credentials are absent");

    const env = makeEnv({
        "instagram-media": JSON.stringify([
            {
                id: "ig-priced-1",
                caption: "Available hand-painted keepsake chest, €250. Custom birthday memory gift #maryilu",
                mediaUrl: "https://example.com/chest.jpg",
                permalink: "https://instagram.com/p/priced",
                timestamp: "2026-06-22T01:00:00Z",
                username: "marialuisas_arttt"
            },
            {
                id: "ig-proof-1",
                caption: "Studio process for a new ribbon bouquet. DM for custom orders #maryilu",
                mediaUrl: "https://example.com/bouquet.jpg",
                permalink: "https://instagram.com/p/proof",
                timestamp: "2026-06-22T01:05:00Z",
                username: "marialuisas_arttt"
            }
        ])
    });
    const ctx = makeCtx();

    const unauthorizedEvents = await json(await worker.fetch(request("/automation-events"), env, ctx));
    assert.equal(unauthorizedEvents.status, 401, "automation events must require admin auth");

    const unauthorizedBrief = await json(await worker.fetch(request("/agent-brief"), env, ctx));
    assert.equal(unauthorizedBrief.status, 401, "agent brief must require admin auth");

    const unauthorizedSimulatedSync = await json(await worker.fetch(request("/simulate-instagram-sync", {
        method: "POST",
        body: { media: [] }
    }), env, ctx));
    assert.equal(unauthorizedSimulatedSync.status, 401, "simulated Instagram sync must require admin auth");

    const uploadForm = new FormData();
    uploadForm.append("image", new Blob(["fake-png"], { type: "image/png" }), "maryilu-test.png");
    const unauthorizedUpload = await json(await worker.fetch(request("/uploads/images", {
        method: "POST",
        formData: uploadForm
    }), env, makeCtx()));
    assert.equal(unauthorizedUpload.status, 401, "image upload must require admin auth");

    const missingBucketForm = new FormData();
    missingBucketForm.append("image", new Blob(["fake-png"], { type: "image/png" }), "maryilu-test.png");
    const missingBucketUpload = await json(await worker.fetch(request("/uploads/images", {
        method: "POST",
        admin: true,
        formData: missingBucketForm
    }), env, makeCtx()));
    assert.equal(missingBucketUpload.status, 503, "image upload should report missing R2 binding");
    assert.equal(missingBucketUpload.data.fallback, "compressed-data-url");

    const externalStorageEnv = makeEnv();
    externalStorageEnv.MARYILU_IMAGE_STORAGE_URL = "https://storage.test";
    externalStorageEnv.MARYILU_IMAGE_STORAGE_TOKEN = "external-token";
    const externalStorageOriginalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
        const href = String(url);
        if (href === "https://storage.test/uploads/images") {
            assert.equal(options.headers.Authorization, "Bearer external-token");
            const image = options.body.get("image");
            assert.equal(image.type, "image/png");
            assert.equal(await image.text(), "external-png");
            return new Response(JSON.stringify({
                success: true,
                key: "shop-items/external-test.png",
                mediaUrl: "https://storage.test/media/shop-items/external-test.png",
                contentType: "image/png",
                size: image.size,
                uploadedAt: "2026-06-25T12:00:00.000Z"
            }), {
                status: 201,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (href === "https://storage.test/media/shop-items/external-test.png") {
            return new Response("external-png", {
                status: 200,
                headers: {
                    "Content-Type": "image/png",
                    "Content-Length": "12"
                }
            });
        }
        return externalStorageOriginalFetch(url, options);
    };
    try {
        const externalUploadForm = new FormData();
        externalUploadForm.append("image", new Blob(["external-png"], { type: "image/png" }), "external-test.png");
        const externalUpload = await json(await worker.fetch(request("/uploads/images", {
            method: "POST",
            admin: true,
            formData: externalUploadForm
        }), externalStorageEnv, makeCtx()));
        assert.equal(externalUpload.status, 201, "external image storage should accept uploads when R2 is absent");
        assert.equal(externalUpload.data.storage, "external");
        assert.equal(externalUpload.data.mediaUrl, "https://worker.test/media/shop-items/external-test.png");

        const externalMedia = await worker.fetch(new Request(externalUpload.data.mediaUrl), externalStorageEnv, makeCtx());
        assert.equal(externalMedia.status, 200, "external media should be proxied through the Worker");
        assert.equal(externalMedia.headers.get("Content-Type"), "image/png");
        assert.equal(await externalMedia.text(), "external-png");
    } finally {
        globalThis.fetch = externalStorageOriginalFetch;
    }

    const imageEnv = makeEnv({}, { images: true });
    const invalidUploadForm = new FormData();
    invalidUploadForm.append("image", new Blob(["not-image"], { type: "text/plain" }), "notes.txt");
    const invalidUpload = await json(await worker.fetch(request("/uploads/images", {
        method: "POST",
        admin: true,
        formData: invalidUploadForm
    }), imageEnv, makeCtx()));
    assert.equal(invalidUpload.status, 415, "image upload should reject non-image files");

    const validUploadForm = new FormData();
    validUploadForm.append("image", new Blob(["fake-png"], { type: "image/png" }), "maryilu-test.png");
    const validUpload = await json(await worker.fetch(request("/uploads/images", {
        method: "POST",
        admin: true,
        formData: validUploadForm
    }), imageEnv, makeCtx()));
    assert.equal(validUpload.status, 201, "valid image upload should be stored");
    assert.equal(validUpload.data.success, true);
    assert.match(validUpload.data.key, /^shop-items\/.+\.png$/);
    assert.match(validUpload.data.mediaUrl, /\/media\/shop-items\//);

    const servedMedia = await worker.fetch(new Request(validUpload.data.mediaUrl), imageEnv, makeCtx());
    assert.equal(servedMedia.status, 200, "uploaded media should be publicly readable");
    assert.equal(servedMedia.headers.get("Content-Type"), "image/png");
    assert.equal(servedMedia.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(await servedMedia.text(), "fake-png");

    const uploadedShopItem = await json(await worker.fetch(request("/shop-items", {
        method: "POST",
        admin: true,
        body: {
            title: "Uploaded Maryilu test item",
            sourcePlatform: "admin-upload",
            mediaUrl: validUpload.data.mediaUrl,
            thumbnailUrl: validUpload.data.mediaUrl,
            status: "inquiry",
            hidden: true,
            publishTargets: ["store", "portfolio", "social"],
            automationNotes: {
                imageStorage: "r2",
                uploadedAt: validUpload.data.uploadedAt
            }
        }
    }), imageEnv, makeCtx()));
    assert.equal(uploadedShopItem.status, 201, "admin upload media URL should be accepted on a shop item");
    assert.equal(uploadedShopItem.data.item.mediaUrl, validUpload.data.mediaUrl);

    const simulateEnv = { ...makeEnv(), ALLOW_SIMULATED_INSTAGRAM_SYNC: "true" };
    const simulateCtx = makeCtx();
    const simulatedSync = await json(await worker.fetch(request("/simulate-instagram-sync", {
        method: "POST",
        admin: true,
        body: {
            media: [
                {
                    id: "sim-priced-1",
                    caption: "Available hand-painted keepsake chest, €250. Custom colors possible. #maryilu #gift",
                    mediaUrl: "https://example.com/sim-chest.jpg",
                    permalink: "https://instagram.com/p/sim-priced",
                    timestamp: "2026-06-22T01:10:00Z",
                    username: "marialuisas_arttt"
                },
                {
                    id: "sim-proof-1",
                    caption: "Studio process for a romantic ribbon bouquet. DM for custom requests #maryilu",
                    mediaUrl: "https://example.com/sim-bouquet.jpg",
                    permalink: "https://instagram.com/p/sim-proof",
                    timestamp: "2026-06-22T01:15:00Z",
                    username: "marialuisas_arttt"
                }
            ]
        }
    }), simulateEnv, simulateCtx));
    assert.equal(simulatedSync.status, 200);
    assert.equal(simulatedSync.data.success, true);
    assert.equal(simulatedSync.data.meta.simulated, true);
    assert.equal(simulatedSync.data.meta.reviewCandidateCount, 1);
    assert.equal(simulatedSync.data.meta.newReviewCandidateCount, 1);
    await Promise.all(simulateCtx.promises);

    const simulatedHiddenItems = await json(await worker.fetch(request("/shop-items?includeHidden=1", { admin: true }), simulateEnv, makeCtx()));
    const simulatedPriced = simulatedHiddenItems.data.items.find(item => item.sourcePostId === "sim-priced-1");
    const simulatedProof = simulatedHiddenItems.data.items.find(item => item.sourcePostId === "sim-proof-1");
    assert.ok(simulatedPriced, "simulated priced Instagram post should create a shop item");
    assert.equal(simulatedPriced.hidden, true, "simulated priced checkout candidate should stay hidden");
    assert.equal(simulatedPriced.status, "available");
    assert.equal(simulatedPriced.priceCents, 25000);
    assert.equal(simulatedPriced.simulated, true, "simulated priced item should be marked as local preview");
    assert.equal(simulatedPriced.permalink, "", "simulated priced item should not keep a fake Instagram permalink");
    assert.ok(simulatedProof, "simulated non-priced Instagram post should create proof item");
    assert.equal(simulatedProof.hidden, false);
    assert.equal(simulatedProof.status, "inquiry");
    assert.equal(simulatedProof.simulated, true, "simulated proof item should be marked as local preview");
    assert.equal(simulatedProof.permalink, "", "simulated proof item should not keep a fake Instagram permalink");

    const simulatedPublicItems = await json(await worker.fetch(request("/shop-items"), simulateEnv, makeCtx()));
    assert.equal(simulatedPublicItems.data.items.some(item => item.sourcePostId === "sim-priced-1"), false, "simulated priced candidate must not be public before review");
    assert.equal(simulatedPublicItems.data.items.some(item => item.sourcePostId === "sim-proof-1"), true, "simulated proof item should be public");

    const simulatedPublicAutomationStatus = await json(await worker.fetch(request("/automation-public-status"), simulateEnv, makeCtx()));
    assert.equal(simulatedPublicAutomationStatus.status, 200);
    assert.equal(simulatedPublicAutomationStatus.data.instagram.ready, false, "public status should not claim Instagram is configured for simulated local proof");
    assert.equal(simulatedPublicAutomationStatus.data.instagram.simulated, true, "public status should mark simulated local Instagram proof");
    assert.equal(simulatedPublicAutomationStatus.data.instagram.hasLiveProof, false, "simulated local proof must not be labeled as live proof");
    assert.equal(simulatedPublicAutomationStatus.data.instagram.hasPreviewProof, true, "simulated local proof should be labeled as preview proof");
    assert.equal(simulatedPublicAutomationStatus.data.automation.proofSource, "local-preview");

    const simulatedBrief = await json(await worker.fetch(request("/agent-brief", { admin: true }), simulateEnv, makeCtx()));
    assert.equal(simulatedBrief.status, 200);
    assert.equal(simulatedBrief.data.sync.proofSource, "local-preview", "agent brief should distinguish local preview from live Instagram proof");

    const simulatedEvents = await json(await worker.fetch(request("/automation-events", { admin: true }), simulateEnv, makeCtx()));
    assert.ok(simulatedEvents.data.events.some(event => event.type === "instagram.simulated_sync"), "simulated sync should be visible in automation events");
    const simulatedSyncEvent = simulatedEvents.data.events.find(event => event.type === "instagram.simulated_sync");
    assert.match(simulatedSyncEvent.message, /1 new checkout candidate/);
    assert.equal(simulatedSyncEvent.metadata.reviewCandidateCount, 1);
    assert.equal(simulatedSyncEvent.metadata.newReviewCandidateCount, 1);

    const paginatedEnv = {
        ...makeEnv(),
        INSTAGRAM_ACCESS_TOKEN: "ig_test_access_token_1234567890",
        INSTAGRAM_USER_ID: "123456789",
        INSTAGRAM_SYNC_LIMIT: "1",
        INSTAGRAM_SYNC_MAX_PAGES: "3"
    };
    const originalGraphFetch = globalThis.fetch;
    let graphCalls = 0;
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (!url.includes("graph.facebook.com")) return originalGraphFetch(input, init);
        graphCalls += 1;
        const body = graphCalls === 1
            ? {
                data: [{
                    id: "ig-page-1",
                    caption: "Studio process for a ribbon bouquet. DM for custom requests.",
                    media_type: "IMAGE",
                    media_url: "https://example.com/page-1.jpg",
                    permalink: "https://instagram.com/p/page-1",
                    timestamp: "2026-06-22T02:00:00Z",
                    username: "marialuisas_arttt"
                }],
                paging: { next: "https://graph.facebook.com/next-page" }
            }
            : {
                data: [{
                    id: "ig-page-2",
                    caption: "Available hand-painted keepsake chest, €280. Shipping by quote.",
                    media_type: "IMAGE",
                    media_url: "https://example.com/page-2.jpg",
                    permalink: "https://instagram.com/p/page-2",
                    timestamp: "2026-06-22T02:05:00Z",
                    username: "marialuisas_arttt"
                }]
            };
        return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    };
    try {
        const paginatedSync = await json(await worker.fetch(request("/sync-instagram", {
            method: "POST",
            admin: true,
            body: {}
        }), paginatedEnv, makeCtx()));
        assert.equal(paginatedSync.status, 200);
        assert.equal(paginatedSync.data.media.length, 2, "real Instagram sync should follow Meta paging.next");
        assert.equal(paginatedSync.data.meta.pagesFetched, 2);
        assert.equal(paginatedSync.data.meta.hitPageLimit, false);
        assert.equal(graphCalls, 2);
        const paginatedItems = await json(await worker.fetch(request("/shop-items?includeHidden=1", { admin: true }), paginatedEnv, makeCtx()));
        assert.ok(paginatedItems.data.items.every(item => item.lastSeenAt), "synced Instagram items should store lastSeenAt");
        assert.equal(paginatedItems.data.items.some(item => item.missingFromLatestSync), false);
    } finally {
        globalThis.fetch = originalGraphFetch;
    }

    const staleSyncEnv = {
        ...makeEnv({
            "shop-items": JSON.stringify([
                {
                    id: "instagram_old_missing",
                    sourcePlatform: "instagram",
                    sourcePostId: "old-missing",
                    mediaUrl: "https://example.com/old.jpg",
                    permalink: "https://instagram.com/p/old",
                    caption: "Older imported Instagram proof.",
                    title: "Older imported proof",
                    category: "flowers",
                    priceCents: null,
                    currency: "eur",
                    status: "inquiry",
                    hidden: false,
                    publishTargets: ["store", "portfolio", "social"],
                    lastSeenAt: "2026-06-21T10:00:00.000Z",
                    createdAt: "2026-06-21T10:00:00.000Z",
                    updatedAt: "2026-06-21T10:00:00.000Z"
                }
            ])
        }),
        ALLOW_SIMULATED_INSTAGRAM_SYNC: "true"
    };
    const staleSync = await json(await worker.fetch(request("/simulate-instagram-sync", {
        method: "POST",
        admin: true,
        body: {
            media: [{
                id: "new-present",
                caption: "Studio process for a new bouquet. DM for custom requests.",
                mediaUrl: "https://example.com/new-present.jpg",
                timestamp: "2026-06-22T02:15:00Z"
            }]
        }
    }), staleSyncEnv, makeCtx()));
    assert.equal(staleSync.status, 200);
    assert.equal(staleSync.data.meta.missingItemCount, 1);
    const staleItems = await json(await worker.fetch(request("/shop-items?includeHidden=1", { admin: true }), staleSyncEnv, makeCtx()));
    const missingOld = staleItems.data.items.find(item => item.sourcePostId === "old-missing");
    const presentNew = staleItems.data.items.find(item => item.sourcePostId === "new-present");
    assert.equal(missingOld.missingFromLatestSync, true, "old Instagram items should be marked when absent from the newest sync");
    assert.equal(missingOld.automationNotes.missingFromLatestSync, true);
    assert.ok(missingOld.automationNotes.lastMissingFromSyncAt, "missing items should record when they first went missing");
    assert.equal(presentNew.missingFromLatestSync, false, "newly seen Instagram items should not be marked missing");
    assert.ok(presentNew.lastSeenAt, "newly seen Instagram items should record lastSeenAt");

    const refreshEnv = {
        ...makeEnv({
            "shop-items": JSON.stringify([
                {
                    id: "instagram_sim_spanish_refresh",
                    sourcePlatform: "instagram",
                    sourcePostId: "sim-spanish-refresh",
                    mediaUrl: "https://example.com/old.jpg",
                    caption: "old caption",
                    title: "Disponible cofre personalizado precio",
                    category: "studio-post",
                    priceCents: null,
                    currency: "eur",
                    status: "inquiry",
                    hidden: false,
                    publishTargets: ["store", "portfolio", "social"],
                    automationNotes: { source: "instagram-caption-agent", requiresAdminReview: false },
                    createdAt: "2026-06-22T00:00:00.000Z",
                    updatedAt: "2026-06-22T00:00:00.000Z"
                }
            ])
        }),
        ALLOW_SIMULATED_INSTAGRAM_SYNC: "true"
    };
    await json(await worker.fetch(request("/simulate-instagram-sync", {
        method: "POST",
        admin: true,
        body: {
            media: [{
                id: "sim-spanish-refresh",
                caption: "Disponible cofre personalizado precio 250 euros. Envio aparte y recogida en Mallorca. #maryilu #cofre",
                mediaUrl: "https://example.com/new.jpg"
            }]
        }
    }), refreshEnv, makeCtx()));
    const refreshedItems = await json(await worker.fetch(request("/shop-items?includeHidden=1", { admin: true }), refreshEnv, makeCtx()));
    const refreshedSpanish = refreshedItems.data.items.find(item => item.sourcePostId === "sim-spanish-refresh");
    assert.equal(refreshedSpanish.title, "Cofre personalizado", "unreviewed generated Instagram titles should refresh when parsing improves");
    assert.equal(refreshedSpanish.priceCents, 25000);
    assert.equal(refreshedSpanish.status, "available");
    assert.equal(refreshedSpanish.hidden, true, "newly priced generated Instagram items should move into hidden review");

    const manualEnv = {
        ...makeEnv({
            "shop-items": JSON.stringify([
                {
                    id: "instagram_sim_manual_keep",
                    sourcePlatform: "instagram",
                    sourcePostId: "sim-manual-keep",
                    mediaUrl: "https://example.com/manual.jpg",
                    caption: "old caption",
                    title: "Maria approved custom title",
                    category: "flowers",
                    priceCents: 12300,
                    currency: "eur",
                    status: "inquiry",
                    hidden: false,
                    publishTargets: ["store", "portfolio", "social"],
                    automationNotes: {
                        source: "instagram-caption-agent",
                        manualOverrideAt: "2026-06-22T00:00:00.000Z",
                        manualOverrideFields: ["title", "priceCents", "category", "status"]
                    },
                    createdAt: "2026-06-22T00:00:00.000Z",
                    updatedAt: "2026-06-22T00:00:00.000Z"
                }
            ])
        }),
        ALLOW_SIMULATED_INSTAGRAM_SYNC: "true"
    };
    await json(await worker.fetch(request("/simulate-instagram-sync", {
        method: "POST",
        admin: true,
        body: {
            media: [{
                id: "sim-manual-keep",
                caption: "Disponible cofre personalizado precio 250 euros. Envio aparte y recogida en Mallorca. #maryilu #cofre",
                mediaUrl: "https://example.com/new-manual.jpg"
            }]
        }
    }), manualEnv, makeCtx()));
    const manualItems = await json(await worker.fetch(request("/shop-items?includeHidden=1", { admin: true }), manualEnv, makeCtx()));
    const manualSpanish = manualItems.data.items.find(item => item.sourcePostId === "sim-manual-keep");
    assert.equal(manualSpanish.title, "Maria approved custom title", "manual title overrides should survive later Instagram syncs");
    assert.equal(manualSpanish.priceCents, 12300, "manual price overrides should survive later Instagram syncs");
    assert.equal(manualSpanish.category, "flowers");
    assert.equal(manualSpanish.status, "inquiry");

    const caption = await json(await worker.fetch(request("/analyze-caption", {
        method: "POST",
        admin: true,
        body: {
            caption: "Available hand-painted keepsake chest, €250. Custom birthday memory gift #maryilu"
        }
    }), env, ctx));
    assert.equal(caption.status, 200);
    assert.equal(caption.data.success, true);
    assert.equal(caption.data.analysis.priceCents, 25000);
    assert.equal(caption.data.analysis.status, "available");
    assert.equal(caption.data.analysis.category, "custom-gifts");
    assert.equal(caption.data.analysis.confidenceLabel, "high");
    assert.equal(caption.data.analysis.directCheckoutEligible, true);
    assert.ok(caption.data.analysis.signals.some(signal => signal.key === "price" && signal.strength === "strong"));
    assert.ok(caption.data.analysis.warnings.some(warning => warning.includes("Direct checkout candidate")));
    assert.ok(caption.data.analysis.reviewChecklist.some(step => step.key === "publish" && step.complete === false));
    assert.equal(caption.data.draft.hidden, true, "caption drafts must stay hidden until reviewed");
    assert.equal(caption.data.draft.automationNotes.requiresAdminReview, true);

    const spanishCaption = await json(await worker.fetch(request("/analyze-caption", {
        method: "POST",
        admin: true,
        body: {
            caption: "Disponible cofre personalizado precio 250 euros. Envio aparte y recogida en Mallorca. #maryilu #cofre"
        }
    }), env, ctx));
    assert.equal(spanishCaption.status, 200);
    assert.equal(spanishCaption.data.analysis.priceCents, 25000, "Spanish price phrasing should be parsed");
    assert.equal(spanishCaption.data.draft.title, "Cofre personalizado", "Spanish price boilerplate should not leak into generated titles");
    assert.equal(spanishCaption.data.analysis.status, "available");
    assert.equal(spanishCaption.data.analysis.category, "custom-gifts");
    assert.equal(spanishCaption.data.analysis.directCheckoutEligible, true);
    assert.ok(spanishCaption.data.analysis.fulfillmentHints.some(hint => hint.key === "shipping-quoted"));
    assert.ok(spanishCaption.data.analysis.fulfillmentHints.some(hint => hint.key === "pickup"));
    assert.ok(spanishCaption.data.analysis.signals.some(signal => signal.key === "fulfillment" && signal.strength === "soft"));
    assert.ok(spanishCaption.data.analysis.reviewChecklist.some(step => step.key === "fulfillment" && step.complete === true));

    const soldCaption = await json(await worker.fetch(request("/analyze-caption", {
        method: "POST",
        admin: true,
        body: {
            caption: "Vendido ramo personalizado 80€. Gracias por confiar en Maryilu. #ramo"
        }
    }), env, ctx));
    assert.equal(soldCaption.status, 200);
    assert.equal(soldCaption.data.analysis.priceCents, 8000);
    assert.equal(soldCaption.data.analysis.status, "sold");
    assert.equal(soldCaption.data.analysis.directCheckoutEligible, false, "sold captions must never become direct checkout candidates");
    assert.equal(soldCaption.data.analysis.publishTargets.includes("store"), false, "sold captions should not publish to store by default");

    const includeHidden = await json(await worker.fetch(request("/shop-items?includeHidden=1", { admin: true }), env, ctx));
    assert.equal(includeHidden.status, 200);
    assert.equal(includeHidden.data.success, true);
    const pricedCandidate = includeHidden.data.items.find(item => item.sourcePostId === "ig-priced-1");
    const inquiryProof = includeHidden.data.items.find(item => item.sourcePostId === "ig-proof-1");
    assert.ok(pricedCandidate, "priced Instagram post should create a shop item");
    assert.equal(pricedCandidate.hidden, true, "priced Instagram checkout candidate should be hidden for review");
    assert.equal(pricedCandidate.status, "available");
    assert.equal(pricedCandidate.priceCents, 25000);
    assert.ok(pricedCandidate.automationNotes.requiresAdminReview, "priced candidate should note admin review");
    assert.ok(Array.isArray(pricedCandidate.automationNotes.reviewChecklist), "priced candidate should carry the admin review checklist");
    assert.ok(Array.isArray(pricedCandidate.automationNotes.warnings), "priced candidate should carry agent guardrail warnings");
    assert.ok(inquiryProof, "non-priced Instagram post should create social/store proof");
    assert.equal(inquiryProof.hidden, false);
    assert.equal(inquiryProof.status, "inquiry");

    const publicShop = await json(await worker.fetch(request("/shop-items"), env, ctx));
    assert.equal(publicShop.status, 200);
    assert.equal(publicShop.data.items.some(item => item.sourcePostId === "ig-priced-1"), false, "hidden priced item must not be public");
    assert.equal(publicShop.data.items.some(item => item.sourcePostId === "ig-proof-1"), true, "inquiry proof should be public");

    const publicPortfolioItems = await json(await worker.fetch(request("/shop-items?target=portfolio"), env, ctx));
    assert.equal(publicPortfolioItems.status, 200);
    assert.equal(publicPortfolioItems.data.items.some(item => item.sourcePostId === "ig-priced-1"), false, "hidden priced item must not publish to portfolio");
    assert.equal(publicPortfolioItems.data.items.some(item => item.sourcePostId === "ig-proof-1"), true, "portfolio-targeted proof should publish to portfolio");

    const publicAutomationStatus = await json(await worker.fetch(request("/automation-public-status"), env, ctx));
    assert.equal(publicAutomationStatus.status, 200);
    assert.equal(publicAutomationStatus.data.success, true);
    assert.equal(publicAutomationStatus.data.instagram.hasLiveProof, true);
    assert.equal(publicAutomationStatus.data.instagram.hasPreviewProof, false);
    assert.equal(publicAutomationStatus.data.instagram.ready, false, "public status should expose only a safe Instagram readiness boolean");
    assert.equal(publicAutomationStatus.data.instagram.simulated, false, "seeded non-simulated Instagram proof should not be marked simulated");
    assert.equal(publicAutomationStatus.data.shop.buyableItems, 0);
    assert.equal(publicAutomationStatus.data.shop.requestableItems, 1);
    assert.equal(publicAutomationStatus.data.automation.proofSource, "instagram");
    assert.equal(publicAutomationStatus.data.automation.directCheckoutActive, false);

    const archiveEnv = makeEnv({
        "shop-items": JSON.stringify([
            {
                id: "stale-instagram-item",
                sourcePlatform: "instagram",
                sourcePostId: "ig-stale-1",
                mediaUrl: "https://example.com/stale.jpg",
                permalink: "https://instagram.com/p/stale",
                caption: "Older Instagram proof that should no longer appear publicly.",
                title: "Stale studio proof",
                category: "flowers",
                priceCents: null,
                currency: "eur",
                status: "inquiry",
                hidden: false,
                publishTargets: ["store", "portfolio", "social"],
                createdAt: "2026-06-22T00:00:00.000Z",
                updatedAt: "2026-06-22T00:00:00.000Z"
            }
        ])
    });
    const unauthorizedArchive = await json(await worker.fetch(request("/shop-items/stale-instagram-item/archive", {
        method: "POST",
        body: { reason: "stale post" }
    }), archiveEnv, makeCtx()));
    assert.equal(unauthorizedArchive.status, 401, "shop item archive must require admin auth");
    const archivedItem = await json(await worker.fetch(request("/shop-items/stale-instagram-item/archive", {
        admin: true,
        method: "POST",
        body: { reason: "stale Instagram post" }
    }), archiveEnv, makeCtx()));
    assert.equal(archivedItem.status, 200);
    assert.equal(archivedItem.data.item.hidden, true);
    assert.equal(archivedItem.data.item.status, "hidden");
    assert.equal(archivedItem.data.item.automationNotes.archivedReason, "stale Instagram post");
    const archivedPublicShop = await json(await worker.fetch(request("/shop-items"), archiveEnv, makeCtx()));
    assert.equal(archivedPublicShop.status, 200);
    assert.equal(archivedPublicShop.data.items.some(item => item.id === "stale-instagram-item"), false, "archived items must not appear publicly");
    const archivedAdminShop = await json(await worker.fetch(request("/shop-items?includeHidden=1", { admin: true }), archiveEnv, makeCtx()));
    assert.equal(archivedAdminShop.data.items.some(item => item.id === "stale-instagram-item" && item.status === "hidden"), true, "archived items should remain visible to admin");

    const briefBeforeReview = await json(await worker.fetch(request("/agent-brief", { admin: true }), env, makeCtx()));
    assert.equal(briefBeforeReview.status, 200);
    assert.equal(briefBeforeReview.data.success, true);
    assert.equal(briefBeforeReview.data.status, "needs-setup");
    assert.equal(briefBeforeReview.data.reviewQueue.total, 1);
    assert.equal(briefBeforeReview.data.reviewQueue.items[0].sourcePostId, "ig-priced-1");
    assert.equal(briefBeforeReview.data.reviewQueue.items[0].recommendation, "direct-checkout-candidate");
    assert.ok(Array.isArray(briefBeforeReview.data.reviewQueue.items[0].warnings));
    assert.ok(briefBeforeReview.data.reviewQueue.items[0].warnings.some(warning => warning.includes("Direct checkout candidate")));
    assert.ok(Array.isArray(briefBeforeReview.data.reviewQueue.items[0].reviewChecklist));
    assert.ok(briefBeforeReview.data.reviewQueue.items[0].reviewChecklist.some(step => step.key === "price" && step.requiredForCheckout === true));
    assert.match(briefBeforeReview.data.reviewQueue.items[0].nextAction, /Review title, image, price, status/);
    assert.equal(briefBeforeReview.data.reviewQueue.items[0].directCheckoutIssue, "");
    assert.equal(briefBeforeReview.data.sync.cachedPosts, 2);
    assert.equal(briefBeforeReview.data.sync.instagramReady, false);
    assert.equal(briefBeforeReview.data.sync.proofSource, "instagram");
    assert.equal(briefBeforeReview.data.runMode.tone, "setup");
    assert.equal(briefBeforeReview.data.runMode.inputMode, "Cached Instagram proof");
    assert.equal(briefBeforeReview.data.runMode.publishingMode, "Auto proof, hidden sale drafts");
    assert.equal(briefBeforeReview.data.runMode.checkoutMode, "Quote-led until Stripe is connected");
    assert.equal(briefBeforeReview.data.runMode.buyerMode, "Request-led store");
    assert.match(briefBeforeReview.data.runMode.guardrail, /Buy buttons stay hidden/);
    assert.ok(Array.isArray(briefBeforeReview.data.runMode.signals));
    assert.ok(briefBeforeReview.data.runMode.signals.some(signal => signal.label === "Publishing"));
    assert.equal(briefBeforeReview.data.commerce.visibleItems, 1);
    assert.equal(briefBeforeReview.data.commerce.totalItems, 2);
    assert.equal(briefBeforeReview.data.commerce.buyableItems, 0);
    assert.equal(briefBeforeReview.data.commerce.requestableItems, 1);
    assert.equal(briefBeforeReview.data.commerce.readyForDirectArtworkCheckout, false);
    assert.equal(briefBeforeReview.data.orders.totalRequests, 0);
    assert.match(briefBeforeReview.data.nextAction, /Stripe checkout, Instagram automation/);
    assert.match(briefBeforeReview.data.nextAction, /INSTAGRAM_ACCESS_TOKEN/);
    assert.ok(briefBeforeReview.data.setupBlockers.some(blocker => blocker.key === "stripe"));
    assert.ok(briefBeforeReview.data.setupBlockers.some(blocker => blocker.key === "instagram"));
    assert.ok(briefBeforeReview.data.operatorChecklist.some(item => item.key === "review"));
    assert.ok(Array.isArray(briefBeforeReview.data.setupRunbook), "agent brief should include the connection runbook");
    assert.ok(briefBeforeReview.data.setupRunbook.some(step => step.key === "stripe-secret" && step.required === true && step.done === false), "runbook should include required Stripe secret step");
    assert.ok(briefBeforeReview.data.setupRunbook.some(step => step.key === "stripe-webhook" && step.required === true && step.done === false), "runbook should include required Stripe webhook step");
    assert.ok(briefBeforeReview.data.setupRunbook.some(step => step.key === "instagram-meta" && step.required === true && step.done === false), "runbook should include required Meta Instagram step");
    assert.ok(briefBeforeReview.data.setupRunbook.some(step => step.key === "review-drafts" && step.done === false && /Review title, image, price|Review 1 hidden/i.test(step.action)), "runbook should call out hidden draft review");

    const reviewedCandidate = await json(await worker.fetch(request(`/shop-items/${encodeURIComponent(pricedCandidate.id)}`, {
        admin: true,
        method: "PATCH",
        body: {
            hidden: false,
            status: "inquiry",
            publishTargets: ["store", "portfolio", "social"]
        }
    }), env, makeCtx()));
    assert.equal(reviewedCandidate.status, 200);
    assert.equal(reviewedCandidate.data.item.hidden, false);
    assert.equal(reviewedCandidate.data.item.automationNotes.requiresAdminReview, false);
    assert.ok(reviewedCandidate.data.item.automationNotes.reviewedAt, "publishing a reviewed automation draft should stamp reviewedAt");

    const order = await json(await worker.fetch(request("/order-requests", {
        method: "POST",
        body: {
            language: "en",
            source: "worker behavior test",
            name: "Test Buyer",
            email: "buyer@example.com",
            phone: "+34 000 000 000",
            preferredLanguage: "English",
            countryCity: "Mallorca",
            productCategory: "Custom Gift Box / Chest",
            productTier: "Test tier",
            occasion: "Birthday",
            deadline: "No deadline",
            budget: "€150-€250",
            pickupShipping: "Mallorca pickup",
            recipient: "Friend",
            interests: "Flowers and memory boxes",
            consent: true
        }
    }), env, ctx));
    assert.equal(order.status, 200);
    assert.equal(order.data.success, true);
    assert.match(order.data.id, /^order_/);
    await Promise.all(ctx.promises);

    const events = await json(await worker.fetch(request("/automation-events", { admin: true }), env, makeCtx()));
    assert.equal(events.status, 200);
    assert.equal(events.data.events.length, 1);
    assert.equal(events.data.events[0].type, "order_request.created");
    assert.equal(events.data.events[0].referenceId, order.data.id);

    const status = await json(await worker.fetch(request("/automation-status", { admin: true }), env, makeCtx()));
    assert.equal(status.status, 200);
    assert.equal(status.data.orders.totalRequests, 1);
    assert.equal(status.data.automation.recentEvents, 1);
    assert.equal(status.data.shop.totalItems, 2);
    assert.equal(status.data.shop.visibleItems, 2);
    assert.equal(status.data.shop.buyableItems, 0);
    assert.equal(status.data.shop.reviewCandidates, 0);
    assert.equal(status.data.launch.readyForCustomOrders, true);
    assert.equal(status.data.launch.readyForInstagramAutomation, false);
    assert.equal(status.data.launch.readyForDirectArtworkCheckout, false);
    assert.equal(status.data.launch.requiredReady, false);
    assert.match(status.data.launch.nextAction, /Stripe checkout, Instagram automation/);
    assert.ok(status.data.launch.checks.some(check => check.key === "stripe" && check.ok === false && check.required === true));
    assert.ok(status.data.launch.checks.some(check => check.key === "instagram" && check.ok === false && check.required === true));

    const stripeEnv = makeEnv({
        "shop-items": JSON.stringify([
            {
                id: "art-direct-1",
                sourcePlatform: "admin",
                title: "One-of-one Maryilu chest",
                category: "custom-gifts",
                mediaUrl: "https://example.com/direct-chest.jpg",
                caption: "Ready to buy original hand-painted chest.",
                priceCents: 32000,
                currency: "eur",
                status: "available",
                publishTargets: ["store", "portfolio", "social"],
                hidden: false,
                automationNotes: {
                    approvedMode: "direct-checkout",
                    requiresAdminReview: false,
                    reviewedAt: new Date().toISOString()
                }
            }
        ]),
        "order-request:order-custom-1": JSON.stringify({
            id: "order-custom-1",
            name: "Custom Buyer",
            email: "custom@example.com",
            productCategory: "Custom Gift Box / Chest",
            status: "Concept approved",
            payments: []
        }),
        "order-requests:index": JSON.stringify(["order-custom-1"])
    });
    stripeEnv.STRIPE_SECRET_KEY = "sk_test_worker_behavior";
    stripeEnv.STRIPE_WEBHOOK_SECRET = "whsec_worker_behavior";
    stripeEnv.INSTAGRAM_ACCESS_TOKEN = "ig_worker_behavior_token_1234567890";
    stripeEnv.INSTAGRAM_USER_ID = "17841400000000000";
    const stripeReadyBrief = await json(await worker.fetch(request("/agent-brief", { admin: true }), stripeEnv, makeCtx()));
    assert.equal(stripeReadyBrief.status, 200);
    assert.equal(stripeReadyBrief.data.runMode.tone, "ready");
    assert.equal(stripeReadyBrief.data.runMode.checkoutMode, "Direct checkout ready");
    assert.equal(stripeReadyBrief.data.runMode.buyerMode, "Direct-buy plus custom requests");
    assert.ok(stripeReadyBrief.data.runMode.signals.some(signal => signal.label === "Checkout" && /Direct checkout ready/.test(signal.value)));
    assert.ok(stripeReadyBrief.data.setupRunbook.some(step => step.key === "stripe-secret" && step.done === true), "runbook should mark Stripe secret ready");
    assert.ok(stripeReadyBrief.data.setupRunbook.some(step => step.key === "stripe-webhook" && step.done === true), "runbook should mark Stripe webhook ready");
    assert.ok(stripeReadyBrief.data.setupRunbook.some(step => step.key === "instagram-meta" && step.done === true), "runbook should mark Meta credentials ready");
    assert.ok(stripeReadyBrief.data.setupRunbook.some(step => step.key === "direct-buy" && step.done === true), "runbook should mark direct-buy inventory ready");

    const unsafeDirectEnv = makeEnv({
        "shop-items": JSON.stringify([
            {
                id: "art-unreviewed-1",
                sourcePlatform: "admin",
                title: "Unreviewed priced item",
                category: "custom-gifts",
                mediaUrl: "https://example.com/unreviewed.jpg",
                caption: "Priced but not approved.",
                priceCents: 12000,
                currency: "eur",
                status: "available",
                publishTargets: ["store"],
                hidden: false
            }
        ])
    });
    unsafeDirectEnv.STRIPE_SECRET_KEY = "sk_test_worker_behavior";
    unsafeDirectEnv.STRIPE_WEBHOOK_SECRET = "whsec_worker_behavior";

    const unsafePublicItems = await json(await worker.fetch(request("/shop-items"), unsafeDirectEnv, makeCtx()));
    assert.equal(unsafePublicItems.status, 200);
    assert.equal(unsafePublicItems.data.items[0].status, "inquiry", "unapproved direct checkout should publish as inquiry to the public store");
    assert.match(unsafePublicItems.data.items[0].checkoutDisabledReason, /approval/i);

    const unapprovedCreate = await json(await worker.fetch(request("/shop-items", {
        method: "POST",
        admin: true,
        body: {
            title: "API-created direct item",
            mediaUrl: "https://example.com/api-created.jpg",
            priceCents: 9900,
            currency: "eur",
            status: "available",
            publishTargets: ["store"],
            hidden: false
        }
    }), unsafeDirectEnv, makeCtx()));
    assert.equal(unapprovedCreate.status, 422, "server should reject direct checkout without explicit admin approval");

    const forgedDirectPatch = await json(await worker.fetch(request("/shop-items/art-unreviewed-1", {
        method: "PATCH",
        admin: true,
        body: {
            status: "available",
            hidden: false,
            priceCents: 12000,
            publishTargets: ["store"],
            automationNotes: {
                approvedMode: "direct-checkout",
                requiresAdminReview: false,
                reviewedAt: new Date().toISOString()
            }
        }
    }), unsafeDirectEnv, makeCtx()));
    assert.equal(forgedDirectPatch.status, 422, "generic shop item edits should not approve direct checkout");

    const unauthorizedDirectApproval = await json(await worker.fetch(request("/shop-items/art-unreviewed-1/approve-direct-checkout", {
        method: "POST",
        body: { priceCents: 12000 }
    }), unsafeDirectEnv, makeCtx()));
    assert.equal(unauthorizedDirectApproval.status, 401, "direct checkout approval should require admin auth");

    const noPriceDirectEnv = makeEnv({
        "shop-items": JSON.stringify([
            {
                id: "art-no-price-1",
                sourcePlatform: "admin",
                title: "No price item",
                category: "custom-gifts",
                mediaUrl: "https://example.com/no-price.jpg",
                caption: "Ready by request.",
                priceCents: null,
                currency: "eur",
                status: "inquiry",
                publishTargets: ["store"],
                hidden: false
            }
        ])
    });
    noPriceDirectEnv.STRIPE_SECRET_KEY = "sk_test_worker_behavior";
    noPriceDirectEnv.STRIPE_WEBHOOK_SECRET = "whsec_worker_behavior";
    const noPriceDirectApproval = await json(await worker.fetch(request("/shop-items/art-no-price-1/approve-direct-checkout", {
        method: "POST",
        admin: true,
        body: {
            mediaUrl: "https://example.com/no-price.jpg",
            publishTargets: ["store"]
        }
    }), noPriceDirectEnv, makeCtx()));
    assert.equal(noPriceDirectApproval.status, 422, "direct checkout approval should require a confirmed price");
    assert.match(noPriceDirectApproval.data.error, /price/i);

    const simulatedDirectEnv = makeEnv({
        "shop-items": JSON.stringify([
            {
                id: "sim-direct-1",
                sourcePlatform: "instagram",
                sourcePostId: "sim-direct-1",
                title: "Simulated priced item",
                category: "custom-gifts",
                mediaUrl: "https://example.com/sim-direct.jpg",
                caption: "Local preview priced item.",
                priceCents: 12000,
                currency: "eur",
                status: "available",
                publishTargets: ["store"],
                hidden: true,
                simulated: true
            }
        ])
    });
    simulatedDirectEnv.STRIPE_SECRET_KEY = "sk_test_worker_behavior";
    simulatedDirectEnv.STRIPE_WEBHOOK_SECRET = "whsec_worker_behavior";
    const simulatedDirectApproval = await json(await worker.fetch(request("/shop-items/sim-direct-1/approve-direct-checkout", {
        method: "POST",
        admin: true,
        body: {
            priceCents: 12000,
            mediaUrl: "https://example.com/sim-direct.jpg",
            publishTargets: ["store"]
        }
    }), simulatedDirectEnv, makeCtx()));
    assert.equal(simulatedDirectApproval.status, 422, "simulated local preview items must not be approved for direct checkout");
    assert.match(simulatedDirectApproval.data.error, /local preview/i);

    const directApprovalCtx = makeCtx();
    const directApproval = await json(await worker.fetch(request("/shop-items/art-unreviewed-1/approve-direct-checkout", {
        method: "POST",
        admin: true,
        body: {
            priceCents: 12000,
            mediaUrl: "https://example.com/unreviewed.jpg",
            publishTargets: ["store"]
        }
    }), unsafeDirectEnv, directApprovalCtx));
    await Promise.all(directApprovalCtx.promises);
    assert.equal(directApproval.status, 200);
    assert.equal(directApproval.data.item.status, "available");
    assert.equal(directApproval.data.item.hidden, false);
    assert.equal(directApproval.data.item.automationNotes.approvedMode, "direct-checkout");
    assert.equal(directApproval.data.item.automationNotes.requiresAdminReview, false);
    assert.equal(directApproval.data.item.automationNotes.approvedBy, "admin");
    const approvedPublicItems = await json(await worker.fetch(request("/shop-items"), unsafeDirectEnv, makeCtx()));
    assert.equal(approvedPublicItems.status, 200);
    assert.equal(approvedPublicItems.data.items[0].status, "available", "server-approved direct checkout should publish as available");

    const placeholderEnv = makeEnv({
        "shop-items": JSON.stringify([
            {
                id: "placeholder-direct-1",
                sourcePlatform: "admin",
                title: "Placeholder configured item",
                category: "custom-gifts",
                mediaUrl: "https://example.com/placeholder.jpg",
                caption: "Approved item with placeholder Stripe values.",
                priceCents: 12000,
                currency: "eur",
                status: "available",
                publishTargets: ["store"],
                hidden: false,
                automationNotes: {
                    approvedMode: "direct-checkout",
                    requiresAdminReview: false,
                    reviewedAt: new Date().toISOString()
                }
            }
        ])
    });
    placeholderEnv.STRIPE_SECRET_KEY = "sk_test_replace_me";
    placeholderEnv.STRIPE_WEBHOOK_SECRET = "whsec_replace_me";
    placeholderEnv.INSTAGRAM_ACCESS_TOKEN = "replace-with-meta-api-token";
    placeholderEnv.INSTAGRAM_USER_ID = "replace-with-instagram-user-id";

    const placeholderStatus = await json(await worker.fetch(request("/automation-status", { admin: true }), placeholderEnv, makeCtx()));
    assert.equal(placeholderStatus.status, 200);
    assert.equal(placeholderStatus.data.configured.stripeSecretKey, false, "placeholder Stripe secret should not count as configured");
    assert.equal(placeholderStatus.data.configured.stripeWebhookSecret, false, "placeholder Stripe webhook should not count as configured");
    assert.equal(placeholderStatus.data.configured.instagramAccessToken, false, "placeholder Instagram token should not count as configured");
    assert.equal(placeholderStatus.data.configured.instagramUserId, false, "placeholder Instagram user id should not count as configured");
    const placeholderPublicItems = await json(await worker.fetch(request("/shop-items"), placeholderEnv, makeCtx()));
    assert.equal(placeholderPublicItems.status, 200);
    assert.equal(placeholderPublicItems.data.items[0].status, "inquiry", "placeholder Stripe setup should suppress public direct checkout");
    assert.match(placeholderPublicItems.data.items[0].checkoutDisabledReason, /secrets/i);

    const productionTestStripeEnv = makeEnv({
        "shop-items": JSON.stringify([
            {
                id: "prod-test-direct-1",
                sourcePlatform: "admin",
                title: "Production test-mode item",
                category: "custom-gifts",
                mediaUrl: "https://example.com/prod-test.jpg",
                caption: "Approved item with a test key on production.",
                priceCents: 14000,
                currency: "eur",
                status: "available",
                publishTargets: ["store"],
                hidden: false,
                automationNotes: {
                    approvedMode: "direct-checkout",
                    requiresAdminReview: false,
                    reviewedAt: new Date().toISOString()
                }
            }
        ])
    });
    productionTestStripeEnv.PUBLIC_SITE_URL = "https://maryilu.com";
    productionTestStripeEnv.STRIPE_SECRET_KEY = "sk_test_worker_behavior";
    productionTestStripeEnv.STRIPE_WEBHOOK_SECRET = "whsec_worker_behavior";
    const productionTestStatus = await json(await worker.fetch(request("/automation-status", { admin: true }), productionTestStripeEnv, makeCtx()));
    assert.equal(productionTestStatus.status, 200);
    assert.equal(productionTestStatus.data.configured.stripeSecretKey, false, "production checkout should not count a Stripe test key as ready");
    assert.ok(productionTestStatus.data.launch.checks.some(check => check.key === "stripe" && check.ok === false && /live secret key/i.test(check.detail)));
    const productionTestItems = await json(await worker.fetch(request("/shop-items"), productionTestStripeEnv, makeCtx()));
    assert.equal(productionTestItems.status, 200);
    assert.equal(productionTestItems.data.items[0].status, "inquiry", "production test-mode Stripe should suppress direct checkout");
    assert.match(productionTestItems.data.items[0].checkoutDisabledReason, /live secret key/i);

    const missingWebhookPaymentEnv = makeEnv({
        "order-request:order-no-webhook-1": JSON.stringify({
            id: "order-no-webhook-1",
            name: "No Webhook Buyer",
            email: "no-webhook@example.com",
            productCategory: "Custom Gift Box / Chest",
            status: "Concept approved",
            payments: []
        }),
        "order-requests:index": JSON.stringify(["order-no-webhook-1"])
    });
    missingWebhookPaymentEnv.STRIPE_SECRET_KEY = "sk_test_worker_behavior";
    const missingWebhookPaymentLink = await json(await worker.fetch(request("/order-requests/order-no-webhook-1/payment-link", {
        method: "POST",
        admin: true,
        body: {
            paymentType: "deposit",
            amountCents: 7500,
            currency: "eur"
        }
    }), missingWebhookPaymentEnv, makeCtx()));
    assert.equal(missingWebhookPaymentLink.status, 422, "custom-order payment links should require webhook readiness");

    const originalFetch = globalThis.fetch;
    const stripeCalls = [];
    globalThis.fetch = async (url, options = {}) => {
        const href = String(url);
        if (href === "https://api.stripe.com/v1/checkout/sessions") {
            const body = String(options.body || "");
            stripeCalls.push({ href, body });
            const sessionId = stripeCalls.length === 1 ? "cs_test_art_direct_1" : `cs_test_custom_${stripeCalls.length - 1}`;
            return new Response(JSON.stringify({
                id: sessionId,
                url: stripeCalls.length === 1 ? "https://checkout.stripe.test/art-direct-1" : `https://checkout.stripe.test/${sessionId}`
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(url, options);
    };

    try {
        const checkout = await json(await worker.fetch(request("/checkout/artwork", {
            method: "POST",
            body: { itemId: "art-direct-1" }
        }), stripeEnv, makeCtx()));
        assert.equal(checkout.status, 200);
        assert.equal(checkout.data.success, true);
        assert.equal(checkout.data.sessionId, "cs_test_art_direct_1");
        assert.equal(checkout.data.url, "https://checkout.stripe.test/art-direct-1");
        assert.equal(stripeCalls.length, 1);
        assert.match(stripeCalls[0].body, /metadata%5Btype%5D=artwork/, "Stripe session should include artwork metadata");
        assert.match(stripeCalls[0].body, /success_url=.*type%3Dartwork/, "Artwork success URL should identify the checkout type");
        const artworkCheckoutParams = new URLSearchParams(stripeCalls[0].body);
        const artworkExpiresAt = Number(artworkCheckoutParams.get("expires_at"));
        assert.ok(artworkExpiresAt, "Artwork checkout should set Stripe expires_at");
        assert.ok(artworkExpiresAt - Math.floor(Date.now() / 1000) <= 1800, "Stripe session should expire with the local reservation window");

        const reserved = await shopItem(worker, stripeEnv, "art-direct-1");
        assert.equal(reserved.status, "reserved");
        assert.equal(reserved.stripeSessionId, "cs_test_art_direct_1");
        assert.ok(reserved.reservedAt, "checkout should set reservedAt");

        const secondCheckout = await json(await worker.fetch(request("/checkout/artwork", {
            method: "POST",
            body: { itemId: "art-direct-1" }
        }), stripeEnv, makeCtx()));
        assert.equal(secondCheckout.status, 409, "reserved one-of-one item should not create a second checkout");

        const unpaidWebhook = await sendStripeEvent(worker, stripeEnv, {
            id: "evt_unpaid_artwork",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_test_art_direct_1",
                    payment_status: "unpaid",
                    client_reference_id: "art-direct-1",
                    metadata: {
                        type: "artwork",
                        artworkItemId: "art-direct-1"
                    }
                }
            }
        });
        assert.equal(unpaidWebhook.status, 200);
        assert.equal((await shopItem(worker, stripeEnv, "art-direct-1")).status, "reserved", "unpaid checkout should not mark item sold");

        const paidWebhook = await sendStripeEvent(worker, stripeEnv, {
            id: "evt_paid_artwork",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_test_art_direct_1",
                    payment_status: "paid",
                    payment_intent: "pi_test_art_direct_1",
                    client_reference_id: "art-direct-1",
                    metadata: {
                        type: "artwork",
                        artworkItemId: "art-direct-1"
                    }
                }
            }
        });
        assert.equal(paidWebhook.status, 200);
        const sold = await shopItem(worker, stripeEnv, "art-direct-1");
        assert.equal(sold.status, "sold");
        assert.equal(sold.stripeSessionId, "cs_test_art_direct_1");
        assert.ok(sold.soldAt, "paid webhook should set soldAt");
        assert.equal(sold.reservedAt, "");

        const staleReservationEnv = makeEnv({
            "shop-items": JSON.stringify([
                {
                    id: "art-late-webhook-1",
                    sourcePlatform: "admin",
                    title: "Late webhook artwork",
                    category: "custom-gifts",
                    mediaUrl: "https://example.com/late.jpg",
                    caption: "Checkout may settle late.",
                    priceCents: 18000,
                    currency: "eur",
                    status: "reserved",
                    publishTargets: ["store"],
                    hidden: false,
                    stripeSessionId: "cs_test_art_late_1",
                    reservedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
                    automationNotes: {
                        approvedMode: "direct-checkout",
                        requiresAdminReview: false,
                        reviewedAt: new Date().toISOString()
                    }
                }
            ])
        });
        staleReservationEnv.STRIPE_SECRET_KEY = "sk_test_worker_behavior";
        staleReservationEnv.STRIPE_WEBHOOK_SECRET = "whsec_worker_behavior";
        const releasedLateItem = await shopItem(worker, staleReservationEnv, "art-late-webhook-1");
        assert.equal(releasedLateItem.status, "available", "expired local reservation should reopen before late webhook");
        assert.equal(releasedLateItem.automationNotes.lastReleasedReservation.sessionId, "cs_test_art_late_1");
        const latePaidWebhook = await sendStripeEvent(worker, staleReservationEnv, {
            id: "evt_late_paid_artwork",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_test_art_late_1",
                    payment_status: "paid",
                    payment_intent: "pi_test_art_late_1",
                    client_reference_id: "art-late-webhook-1",
                    metadata: {
                        type: "artwork",
                        artworkItemId: "art-late-webhook-1"
                    }
                }
            }
        });
        assert.equal(latePaidWebhook.status, 200);
        assert.equal((await shopItem(worker, staleReservationEnv, "art-late-webhook-1")).status, "sold", "late paid webhook should still mark matching released reservation sold");

        const customPaymentLink = await json(await worker.fetch(request("/order-requests/order-custom-1/payment-link", {
            method: "POST",
            admin: true,
            body: {
                paymentType: "deposit",
                amountCents: 7500,
                currency: "eur"
            }
        }), stripeEnv, makeCtx()));
        assert.equal(customPaymentLink.status, 200);
        assert.equal(customPaymentLink.data.success, true);
        assert.equal(stripeCalls.length, 2);
        assert.match(stripeCalls[1].body, /metadata%5Btype%5D=custom-order/, "Custom payment link should include custom-order metadata");
        assert.match(stripeCalls[1].body, /success_url=.*type%3Dcustom-order%26payment%3Ddeposit/, "Custom payment success URL should include payment type");

        const customCreated = JSON.parse(await stripeEnv.ART_DATA.get("order-request:order-custom-1"));
        assert.equal(customCreated.payments[0].status, "created");

        const expiredCustomWebhook = await sendStripeEvent(worker, stripeEnv, {
            id: "evt_expired_custom",
            type: "checkout.session.expired",
            data: {
                object: {
                    id: customPaymentLink.data.sessionId,
                    client_reference_id: "order-custom-1",
                    metadata: {
                        type: "custom-order",
                        orderRequestId: "order-custom-1",
                        paymentType: "deposit"
                    }
                }
            }
        });
        assert.equal(expiredCustomWebhook.status, 200);
        const customExpired = JSON.parse(await stripeEnv.ART_DATA.get("order-request:order-custom-1"));
        assert.equal(customExpired.payments[0].status, "expired");
        assert.ok(customExpired.payments[0].expiredAt, "expired custom payment should record expiredAt");

        const paidCustomPaymentLink = await json(await worker.fetch(request("/order-requests/order-custom-1/payment-link", {
            method: "POST",
            admin: true,
            body: {
                paymentType: "final",
                amountCents: 12500,
                currency: "eur"
            }
        }), stripeEnv, makeCtx()));
        assert.equal(paidCustomPaymentLink.status, 200);
        assert.equal(paidCustomPaymentLink.data.success, true);
        assert.equal(stripeCalls.length, 3);

        const paidCustomWebhook = await sendStripeEvent(worker, stripeEnv, {
            id: "evt_paid_custom",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: paidCustomPaymentLink.data.sessionId,
                    payment_status: "paid",
                    payment_intent: "pi_paid_custom",
                    client_reference_id: "order-custom-1",
                    metadata: {
                        type: "custom-order",
                        orderRequestId: "order-custom-1",
                        paymentType: "final"
                    }
                }
            }
        });
        assert.equal(paidCustomWebhook.status, 200);
        const customPaid = JSON.parse(await stripeEnv.ART_DATA.get("order-request:order-custom-1"));
        const paidPayment = customPaid.payments.find(payment => payment.sessionId === paidCustomPaymentLink.data.sessionId);
        assert.equal(paidPayment.status, "paid");
        assert.ok(paidPayment.paidAt, "paid custom payment should record paidAt");
        assert.equal(customPaid.status, "Ready for pickup/shipping");
        const paidEventsBeforeDuplicate = await json(await worker.fetch(request("/automation-events", { admin: true }), stripeEnv, makeCtx()));
        const paidEventCountBeforeDuplicate = paidEventsBeforeDuplicate.data.events.filter(event => event.type === "order_payment.paid").length;

        const duplicatePaidCustomWebhook = await sendStripeEvent(worker, stripeEnv, {
            id: "evt_paid_custom_retry",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: paidCustomPaymentLink.data.sessionId,
                    payment_status: "paid",
                    payment_intent: "pi_paid_custom",
                    client_reference_id: "order-custom-1",
                    metadata: {
                        type: "custom-order",
                        orderRequestId: "order-custom-1",
                        paymentType: "final"
                    }
                }
            }
        });
        assert.equal(duplicatePaidCustomWebhook.status, 200);
        const customAfterDuplicatePaid = JSON.parse(await stripeEnv.ART_DATA.get("order-request:order-custom-1"));
        const duplicatePaidPayment = customAfterDuplicatePaid.payments.find(payment => payment.sessionId === paidCustomPaymentLink.data.sessionId);
        assert.equal(duplicatePaidPayment.status, "paid", "duplicate paid custom webhook should keep payment paid");
        assert.equal(duplicatePaidPayment.paidAt, paidPayment.paidAt, "duplicate paid custom webhook should not rewrite paidAt");
        const paidEventsAfterDuplicate = await json(await worker.fetch(request("/automation-events", { admin: true }), stripeEnv, makeCtx()));
        const paidEventCountAfterDuplicate = paidEventsAfterDuplicate.data.events.filter(event => event.type === "order_payment.paid").length;
        assert.equal(paidEventCountAfterDuplicate, paidEventCountBeforeDuplicate, "duplicate paid custom webhook should not emit a second paid event");

        const lateExpiredPaidCustomWebhook = await sendStripeEvent(worker, stripeEnv, {
            id: "evt_late_expired_paid_custom",
            type: "checkout.session.expired",
            data: {
                object: {
                    id: paidCustomPaymentLink.data.sessionId,
                    client_reference_id: "order-custom-1",
                    metadata: {
                        type: "custom-order",
                        orderRequestId: "order-custom-1",
                        paymentType: "final"
                    }
                }
            }
        });
        assert.equal(lateExpiredPaidCustomWebhook.status, 200);
        const customAfterLateExpired = JSON.parse(await stripeEnv.ART_DATA.get("order-request:order-custom-1"));
        const stillPaidPayment = customAfterLateExpired.payments.find(payment => payment.sessionId === paidCustomPaymentLink.data.sessionId);
        assert.equal(stillPaidPayment.status, "paid", "late terminal events should not downgrade paid custom payments");
        assert.equal(stillPaidPayment.expiredAt, undefined);

        const statusBeforeUnknown = customAfterLateExpired.status;
        const unknownCustomWebhook = await sendStripeEvent(worker, stripeEnv, {
            id: "evt_unknown_custom",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_not_created_by_worker",
                    payment_status: "paid",
                    payment_intent: "pi_unknown_custom",
                    client_reference_id: "order-custom-1",
                    metadata: {
                        type: "custom-order",
                        orderRequestId: "order-custom-1",
                        paymentType: "deposit"
                    }
                }
            }
        });
        assert.equal(unknownCustomWebhook.status, 200);
        const customAfterUnknown = JSON.parse(await stripeEnv.ART_DATA.get("order-request:order-custom-1"));
        assert.equal(customAfterUnknown.status, statusBeforeUnknown, "unknown custom checkout session should not change order status");
        assert.equal(customAfterUnknown.payments.some(payment => payment.sessionId === "cs_not_created_by_worker"), false, "unknown custom checkout session should not create or mark a payment");

        const stripeEvents = await json(await worker.fetch(request("/automation-events", { admin: true }), stripeEnv, makeCtx()));
        assert.equal(stripeEvents.status, 200);
        assert.ok(stripeEvents.data.events.some(event => event.type === "artwork.sold"), "paid artwork webhook should emit an artwork.sold event");
        assert.ok(stripeEvents.data.events.some(event => event.type === "order_payment.expired"), "expired custom checkout should emit an order_payment.expired event");
        assert.ok(stripeEvents.data.events.some(event => event.type === "order_payment.unmatched"), "unknown custom checkout should emit an order_payment.unmatched event");
    } finally {
        globalThis.fetch = originalFetch;
    }

    const oversizedPayload = JSON.stringify({
        id: "evt_oversized_webhook",
        type: "checkout.session.completed",
        data: {
            object: {
                id: "cs_oversized",
                payment_status: "paid",
                metadata: { type: "artwork" },
                filler: "x".repeat(1024 * 1024)
            }
        }
    });
    const oversizedWebhook = await json(await worker.fetch(request("/stripe-webhook", {
        method: "POST",
        rawBody: oversizedPayload,
        headers: {
            "Stripe-Signature": stripeSignature(oversizedPayload, stripeEnv.STRIPE_WEBHOOK_SECRET)
        }
    }), stripeEnv, makeCtx()));
    assert.equal(oversizedWebhook.status, 413, "oversized Stripe webhooks should be rejected even without trusting Content-Length");

    const badPayload = JSON.stringify({
        id: "evt_bad_signature",
        type: "checkout.session.completed",
        data: { object: { id: "cs_bad", metadata: { type: "artwork" } } }
    });
    const badTimestamp = Math.floor(Date.now() / 1000);
    const invalidWebhook = await json(await worker.fetch(request("/stripe-webhook", {
        method: "POST",
        rawBody: badPayload,
        headers: {
            "Stripe-Signature": `t=${badTimestamp},v1=not-a-valid-signature`
        }
    }), stripeEnv, makeCtx()));
    assert.equal(invalidWebhook.status, 400, "invalid Stripe webhook signatures should return 400");

    console.log("Worker behavior tests passed");
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
