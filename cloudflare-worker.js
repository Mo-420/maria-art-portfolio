// Cloudflare Worker to store Maryilu site data in KV and create Stripe Checkout sessions.
// Bind a KV namespace as ART_DATA. Configure secrets with wrangler secret put:
// ADMIN_TOKEN, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID.
// Optional Instagram webhook secrets: INSTAGRAM_WEBHOOK_VERIFY_TOKEN, INSTAGRAM_APP_SECRET.
// Optional: NOTIFICATION_WEBHOOK_URL, NOTIFICATION_WEBHOOK_TOKEN.
// Optional image storage: ART_IMAGES R2, or MARYILU_IMAGE_STORAGE_URL + MARYILU_IMAGE_STORAGE_TOKEN.

const LEAD_STATUSES = [
    "New request",
    "Direction needed",
    "Concept sent",
    "Concept approved",
    "Deposit paid",
    "In progress",
    "Progress update sent",
    "Awaiting final approval",
    "Final payment pending",
    "Ready for pickup/shipping",
    "Completed",
    "Review requested"
];

const SHOP_STATUSES = ["available", "inquiry", "reserved", "sold", "hidden"];
const INSTAGRAM_MEDIA_KEY = "instagram-media";
const INSTAGRAM_SYNC_META_KEY = "instagram-media:sync-meta";
const SHOP_ITEMS_KEY = "shop-items";
const AUTOMATION_EVENTS_KEY = "automation-events";
const SITE_SETTINGS_KEY = "site-settings";
const STRIPE_API_VERSION = "2026-02-25.clover";
const RESERVATION_TTL_MS = 30 * 60 * 1000;
const ARTWORK_CHECKOUT_TTL_SECONDS = Math.floor(RESERVATION_TTL_MS / 1000);
const MAX_WEBHOOK_BYTES = 1024 * 1024;
const MAX_IMAGE_UPLOAD_BYTES = 6 * 1024 * 1024;
const MAX_MEDIA_URL_CHARS = 900000;
const IMAGE_UPLOAD_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
]);

const ALLOWED_ORIGINS = new Set([
    "https://maryilu.com",
    "https://www.maryilu.com",
    "https://portfolio.maryilu.com",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8788",
    "http://127.0.0.1:8788"
]);

const NO_CACHE_HEADERS = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
};

function corsHeaders(request) {
    const origin = request?.headers?.get("Origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://maryilu.com";

    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Cache-Control, Stripe-Signature, X-Hub-Signature-256",
        "Vary": "Origin"
    };
}

function jsonResponse(data, status = 200, request) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders(request),
            ...NO_CACHE_HEADERS
        }
    });
}

function textResponse(message, status = 200, request) {
    return new Response(message, {
        status,
        headers: corsHeaders(request)
    });
}

function timingSafeEqual(a, b) {
    const encoder = new TextEncoder();
    const left = encoder.encode(String(a || ""));
    const right = encoder.encode(String(b || ""));
    const length = Math.max(left.length, right.length);
    let diff = left.length ^ right.length;

    for (let index = 0; index < length; index += 1) {
        diff |= (left[index] || 0) ^ (right[index] || 0);
    }

    return diff === 0;
}

function isAuthorized(request, env) {
    if (!env.ADMIN_TOKEN) return false;
    const header = request.headers.get("Authorization") || "";
    return timingSafeEqual(header, `Bearer ${env.ADMIN_TOKEN}`);
}

function requireAdmin(request, env) {
    if (!env.ADMIN_TOKEN) {
        return jsonResponse({ error: "ADMIN_TOKEN is not configured for protected access." }, 503, request);
    }
    if (!isAuthorized(request, env)) {
        return jsonResponse({ error: "Unauthorized" }, 401, request);
    }
    return null;
}

function cleanString(value, maxLength = 1400) {
    return String(value || "").trim().slice(0, maxLength);
}

function normalizeReferences(references) {
    return {
        links: cleanString(references?.links, 3000),
        files: []
    };
}

function publicSiteUrl(env) {
    return cleanString(env.PUBLIC_SITE_URL || "https://maryilu.com", 220).replace(/\/+$/, "");
}

function publicSiteHostname(env) {
    try {
        return new URL(publicSiteUrl(env)).hostname.toLowerCase();
    } catch (error) {
        return "";
    }
}

function isProductionPublicSite(env) {
    const host = publicSiteHostname(env);
    return host === "maryilu.com" || host === "www.maryilu.com" || host === "portfolio.maryilu.com";
}

function allowsStripeTestMode(env) {
    return /^(1|true|yes)$/i.test(cleanString(env.ALLOW_STRIPE_TEST_MODE || env.STRIPE_ALLOW_TEST_MODE, 12));
}

function truthyEnv(value) {
    return /^(1|true|yes)$/i.test(cleanString(value, 12));
}

function isLocalRequest(request) {
    try {
        return ["localhost", "127.0.0.1", "::1"].includes(new URL(request.url).hostname);
    } catch (error) {
        return false;
    }
}

function allowsSimulatedInstagramSync(request, env) {
    return isLocalRequest(request) || truthyEnv(env.ALLOW_SIMULATED_INSTAGRAM_SYNC || env.ENABLE_SIMULATED_INSTAGRAM_SYNC);
}

function stripeSecretMode(env) {
    const key = cleanString(env.STRIPE_SECRET_KEY, 1000);
    if (/^sk_live_[A-Za-z0-9]/.test(key)) return "live";
    if (/^sk_test_[A-Za-z0-9]/.test(key)) return "test";
    return "";
}

function stripeSecretKeyIssue(env) {
    if (!hasConfiguredValue(env.STRIPE_SECRET_KEY, "stripeSecretKey")) {
        return "STRIPE_SECRET_KEY is not configured.";
    }
    if (isProductionPublicSite(env) && stripeSecretMode(env) === "test" && !allowsStripeTestMode(env)) {
        return "Use a Stripe live secret key for production checkout, or set ALLOW_STRIPE_TEST_MODE=true for a deliberate test deployment.";
    }
    return "";
}

function stripePaymentConfigIssue(env) {
    const keyIssue = stripeSecretKeyIssue(env);
    if (!hasConfiguredValue(env.STRIPE_WEBHOOK_SECRET, "stripeWebhookSecret")) {
        return keyIssue && keyIssue.includes("not configured")
            ? "Stripe checkout and webhook secrets must be configured before checkout can run."
            : (keyIssue || "STRIPE_WEBHOOK_SECRET is not configured.");
    }
    if (keyIssue) return keyIssue;
    return "";
}

function instagramGraphVersion(env) {
    return cleanString(env.INSTAGRAM_GRAPH_VERSION || "v24.0", 16);
}

function instagramConfig(env) {
    return {
        accessToken: env.INSTAGRAM_ACCESS_TOKEN || env.IG_ACCESS_TOKEN || "",
        userId: env.INSTAGRAM_USER_ID || env.IG_USER_ID || ""
    };
}

function instagramWebhookConfig(env) {
    return {
        verifyToken: env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || env.META_WEBHOOK_VERIFY_TOKEN || "",
        appSecret: env.INSTAGRAM_APP_SECRET || env.META_APP_SECRET || env.FACEBOOK_APP_SECRET || ""
    };
}

function notificationConfig(env) {
    return {
        url: cleanString(env.NOTIFICATION_WEBHOOK_URL, 2000),
        token: cleanString(env.NOTIFICATION_WEBHOOK_TOKEN, 1000)
    };
}

function normalizeInstagramMedia(item) {
    const mediaType = cleanString(item.media_type || item.mediaType, 40);
    return {
        id: cleanString(item.id, 80),
        caption: cleanString(item.caption, 2200),
        mediaType,
        mediaUrl: cleanString(item.media_url || item.mediaUrl, 2000),
        thumbnailUrl: cleanString(item.thumbnail_url || item.thumbnailUrl, 2000),
        permalink: cleanString(item.permalink, 1000),
        timestamp: cleanString(item.timestamp, 80),
        username: cleanString(item.username, 120),
        simulated: item.simulated === true
    };
}

function boundedInteger(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
}

function instagramFetchLimit(env) {
    return boundedInteger(env.INSTAGRAM_SYNC_LIMIT || env.INSTAGRAM_PAGE_LIMIT, 50, 1, 100);
}

function instagramMaxPages(env) {
    return boundedInteger(env.INSTAGRAM_SYNC_MAX_PAGES, 6, 1, 20);
}

async function fetchInstagramMediaFromAPIResult(env) {
    const { accessToken, userId } = instagramConfig(env);
    if (!accessToken || !userId) {
        throw new Error("Instagram API credentials are not configured.");
    }

    const fields = [
        "id",
        "caption",
        "media_type",
        "media_url",
        "thumbnail_url",
        "permalink",
        "timestamp",
        "username"
    ].join(",");
    const url = new URL(`https://graph.facebook.com/${instagramGraphVersion(env)}/${encodeURIComponent(userId)}/media`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("limit", String(instagramFetchLimit(env)));
    url.searchParams.set("access_token", accessToken);

    const maxPages = instagramMaxPages(env);
    const itemsById = new Map();
    let nextUrl = url.toString();
    let pageCount = 0;

    while (nextUrl && pageCount < maxPages) {
        const response = await fetch(nextUrl, {
            headers: { "Accept": "application/json" }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error?.message || "Instagram media could not be fetched.");
        }

        pageCount += 1;
        const pageItems = Array.isArray(data.data)
            ? data.data.map(normalizeInstagramMedia).filter(item => item.id && (item.mediaUrl || item.thumbnailUrl || item.permalink))
            : [];
        pageItems.forEach(item => {
            if (!itemsById.has(item.id)) itemsById.set(item.id, item);
        });
        nextUrl = cleanString(data.paging?.next, 3000);
    }

    return {
        media: [...itemsById.values()],
        pagesFetched: pageCount,
        hitPageLimit: Boolean(nextUrl && pageCount >= maxPages)
    };
}

async function fetchInstagramMediaFromAPI(env) {
    return (await fetchInstagramMediaFromAPIResult(env)).media;
}

function titleFromCaption(caption) {
    const line = String(caption || "")
        .split(/\r?\n/)
        .map(part => part.trim())
        .find(part => part && !part.startsWith("#"));
    const fallback = line || "Instagram studio post";
    return fallback.length > 84 ? `${fallback.slice(0, 81)}...` : fallback;
}

function publicTitleFromCaption(caption, category = "studio-post") {
    const raw = titleFromCaption(caption)
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/\b(?:precio|price|coste|cost|valor|por|desde|from)\s*:?\s*(?:€|eur(?:os?)?)?\s*\d{1,6}(?:[.,]\d{1,2})?\s*(?:€|eur(?:os?)?)?\b/gi, "")
        .replace(/[€$£]\s?\d+(?:[.,]\d{1,2})?/gi, "")
        .replace(/\b\d{1,6}(?:[.,]\d{1,2})?\s*(?:€|eur(?:os?)?)\b/gi, "")
        .replace(/\b(?:precio|price|coste|cost|valor)\b/gi, "")
        .replace(/\b(?:dm|message)\s+(?:for|to)\b.*$/i, "")
        .replace(/\b(?:mallorca pickup|shipping by quote|custom colors possible)\b.*$/i, "")
        .trim();
    const firstSentence = raw.split(/[.!?]/).map(part => part.trim()).find(Boolean) || raw;
    const cleaned = firstSentence
        .replace(/^(?:available|disponible|new|nuevo|nueva|fresh|studio process for|process for|proceso del estudio para|proceso de estudio para|custom|personalizado|personalizada)\s+(?:a|an|the|un|una|el|la)?\s*/i, "")
        .replace(/\s{2,}/g, " ")
        .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "")
        .trim();
    const fallbackByCategory = {
        flowers: "Ribbon color study",
        "custom-gifts": "Hand-painted keepsake gift",
        "original-art": "Original Maryilu artwork",
        "baby-shower": "Custom baby shower gift",
        "studio-post": "Fresh Maryilu studio piece"
    };
    const title = cleanString(cleaned || fallbackByCategory[category] || fallbackByCategory["studio-post"], 90);
    return title ? `${title.charAt(0).toUpperCase()}${title.slice(1)}` : title;
}

function categoryFromCaption(caption) {
    const text = String(caption || "").toLowerCase();
    if (/(chest|box|cofre|caja|keepsake|gift)/.test(text)) return "custom-gifts";
    if (/(flower|bouquet|flor|ramo|ribbon)/.test(text)) return "flowers";
    if (/(baby|diaper|shower|bebe|pañal|panal)/.test(text)) return "baby-shower";
    if (/(canvas|painting|artwork|paint|lienzo|cuadro|obra)/.test(text)) return "original-art";
    return "studio-post";
}

function parsePriceCents(caption) {
    const text = String(caption || "");
    const patterns = [
        /(?:€|eur(?:os?)?\b)\s*(\d{1,6}(?:[.,]\d{1,2})?)/i,
        /(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?\b)/i,
        /(?:precio|price|coste|cost|valor|por|desde|from)\s*:?\s*(?:€|eur(?:os?)?)?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?)?\b/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const normalized = normalizePriceNumber(match[1]);
        const value = Number(normalized);
        if (Number.isFinite(value) && value > 0) {
            return Math.round(value * 100);
        }
    }

    return null;
}

function normalizePriceNumber(value) {
    const clean = String(value || "").trim().replace(/\s+/g, "");
    if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(clean)) return clean.replace(/\./g, "").replace(",", ".");
    if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(clean)) return clean.replace(/,/g, "");
    return clean.replace(",", ".");
}

function fulfillmentHintsFromCaption(caption) {
    const text = String(caption || "").toLowerCase();
    const hints = [];
    if (/(shipping|env[ií]o|delivery|entrega)\s+(included|incluido|incluida)|(?:free|gratis)\s+(shipping|env[ií]o)/.test(text)) {
        hints.push({
            key: "shipping-included",
            label: "Shipping appears included",
            detail: "Caption suggests shipping is included; admin should still confirm destination limits.",
            strength: "soft"
        });
    }
    if (/(shipping|env[ií]o|delivery|entrega)\s+(by quote|quoted|aparte|separado|not included|no incluido)|(?:plus|\+)\s+(shipping|env[ií]o)/.test(text)) {
        hints.push({
            key: "shipping-quoted",
            label: "Shipping appears separate",
            detail: "Caption suggests pickup/shipping should be quoted before payment.",
            strength: "guardrail"
        });
    }
    if (/(pickup|pick up|recogida|mallorca pickup|local pickup|entrega local)/.test(text)) {
        hints.push({
            key: "pickup",
            label: "Pickup/local delivery mentioned",
            detail: "Caption mentions pickup or local delivery; admin should confirm the buyer location.",
            strength: "soft"
        });
    }
    return hints;
}

function statusFromCaption(caption, priceCents) {
    const text = String(caption || "").toLowerCase();
    if (/(^|\s|#)(sold|vendido|vendida|soldout|sold-out)(\s|$|[.!?,#])/.test(text)) return "sold";
    if (/(^|\s|#)(reserved|reservado|reservada|hold|on hold)(\s|$|[.!?,#])/.test(text)) return "reserved";
    if (priceCents) return "available";
    return "inquiry";
}

function confidenceLabel(confidence) {
    if (confidence >= 0.75) return "high";
    if (confidence >= 0.45) return "medium";
    return "low";
}

function captionAgentSignals({ priceCents, saleKeywords, commissionKeywords, category, status, detectedTags, fulfillmentHints }) {
    return [
        {
            key: "price",
            label: priceCents ? "EUR price detected" : "No EUR price detected",
            detail: priceCents ? `Parsed ${formatMoney(priceCents, "eur")}.` : "Use inquiry/custom-order CTA unless Maria adds a price.",
            strength: priceCents ? "strong" : "missing"
        },
        {
            key: "sale-language",
            label: saleKeywords ? "Sale language detected" : "No clear sale language",
            detail: saleKeywords ? "Caption contains available, price, buy, order, pedido, or similar wording." : "Confirm this post is meant to sell before enabling direct checkout.",
            strength: saleKeywords ? "medium" : "missing"
        },
        {
            key: "category",
            label: category !== "studio-post" ? "Category inferred" : "Category unclear",
            detail: category !== "studio-post" ? `Matched ${category}.` : "Choose a product category manually before publishing.",
            strength: category !== "studio-post" ? "medium" : "missing"
        },
        {
            key: "status",
            label: `Status inferred as ${status}`,
            detail: status === "available"
                ? "Potential checkout candidate, but hidden until admin review."
                : "Direct checkout should stay off unless Maria changes status and price.",
            strength: status === "available" ? "medium" : "guardrail"
        },
        {
            key: "custom",
            label: commissionKeywords ? "Custom-order language detected" : "No custom-order wording",
            detail: commissionKeywords ? "Good candidate for inquiry/custom request CTAs." : "If this is made-to-order, add custom-order wording before publishing.",
            strength: commissionKeywords ? "soft" : "neutral"
        },
        {
            key: "fulfillment",
            label: fulfillmentHints.length ? "Pickup/shipping language detected" : "No pickup/shipping language",
            detail: fulfillmentHints.length
                ? fulfillmentHints.map(hint => hint.label).join("; ")
                : "Confirm shipping or pickup before enabling checkout.",
            strength: fulfillmentHints.length ? "soft" : "missing"
        },
        {
            key: "hashtags",
            label: detectedTags.length ? `${detectedTags.length} hashtag${detectedTags.length === 1 ? "" : "s"} detected` : "No hashtags detected",
            detail: detectedTags.length ? detectedTags.slice(0, 6).join(" ") : "Hashtags are optional; they can help the admin identify source context.",
            strength: detectedTags.length ? "soft" : "neutral"
        }
    ];
}

function captionAgentWarnings({ priceCents, saleKeywords, category, status, confidence, fulfillmentHints }) {
    const warnings = [];
    if (!priceCents) {
        warnings.push("No EUR price was detected, so this should publish as proof/inquiry unless Maria manually prices it.");
    }
    if (priceCents && !saleKeywords) {
        warnings.push("A price was detected without clear sale wording; confirm the price is for this exact artwork.");
    }
    if (category === "studio-post") {
        warnings.push("The category is unclear; choose a category before making the item public.");
    }
    if (status === "sold" || status === "reserved") {
        warnings.push("The caption looks sold or reserved, so direct checkout should remain disabled.");
    }
    if (status === "available" && priceCents) {
        warnings.push("Direct checkout candidate: keep hidden until the photo, price, stock, and shipping path are reviewed.");
    }
    if (priceCents && !fulfillmentHints.length) {
        warnings.push("No pickup or shipping language was detected; confirm fulfillment cost before checkout approval.");
    }
    if (confidence < 0.45) {
        warnings.push("Low sale signal: publish as social proof first, then let admin decide whether it belongs in the shop.");
    }
    return warnings;
}

function captionReviewChecklist({ priceCents, status, category, fulfillmentHints }) {
    return [
        {
            key: "image",
            label: "Confirm the image is the exact piece being listed.",
            requiredForCheckout: true,
            complete: false
        },
        {
            key: "title-category",
            label: "Review title and category.",
            requiredForCheckout: true,
            complete: category !== "studio-post"
        },
        {
            key: "price",
            label: "Confirm price, currency, and whether shipping is included.",
            requiredForCheckout: true,
            complete: Boolean(priceCents)
        },
        {
            key: "status",
            label: "Confirm the piece is available, not reserved or sold.",
            requiredForCheckout: true,
            complete: status === "available"
        },
        {
            key: "fulfillment",
            label: "Confirm pickup/shipping cost and destination limits.",
            requiredForCheckout: true,
            complete: Boolean(fulfillmentHints.length)
        },
        {
            key: "publish",
            label: "Unhide only after Maria approves the listing.",
            requiredForCheckout: true,
            complete: false
        }
    ];
}

function analyzeInstagramCaption(caption) {
    const text = String(caption || "");
    const normalized = text.toLowerCase();
    const priceCents = parsePriceCents(text);
    const category = categoryFromCaption(text);
    const status = statusFromCaption(text, priceCents);
    const fulfillmentHints = fulfillmentHintsFromCaption(text);
    const detectedTags = Array.from(new Set((text.match(/#[\p{L}\p{N}_-]+/gu) || []).map(tag => tag.slice(0, 40))));
    const saleKeywords = /(available|for sale|dm to buy|shop|price|precio|disponible|comprar|encargo|order|pedido)/i.test(text);
    const commissionKeywords = /(custom|commission|personalized|personalizado|encargo|pedido|made to order|request)/i.test(text);
    const confidence = [
        priceCents ? 0.45 : 0,
        saleKeywords ? 0.25 : 0,
        category !== "studio-post" ? 0.15 : 0,
        status === "available" ? 0.1 : 0,
        commissionKeywords ? 0.05 : 0
    ].reduce((sum, value) => sum + value, 0);
    const saleSignalConfidence = Math.min(1, Number(confidence.toFixed(2)));
    const signalContext = { priceCents, saleKeywords, commissionKeywords, category, status, detectedTags, fulfillmentHints, confidence: saleSignalConfidence };

    const publishTargets = ["portfolio", "social", ...(status !== "sold" ? ["store"] : [])];

    return {
        title: publicTitleFromCaption(text, category),
        category,
        priceCents,
        status,
        fulfillmentHints,
        detectedTags,
        saleSignalConfidence,
        confidenceLabel: confidenceLabel(saleSignalConfidence),
        signals: captionAgentSignals(signalContext),
        warnings: captionAgentWarnings(signalContext),
        reviewChecklist: captionReviewChecklist(signalContext),
        directCheckoutEligible: status === "available" && Boolean(priceCents),
        publishTargets,
        automationNotes: {
            saleKeywords,
            commissionKeywords,
            fulfillmentHints,
            confidenceLabel: confidenceLabel(saleSignalConfidence),
            warnings: captionAgentWarnings(signalContext),
            reviewChecklist: captionReviewChecklist(signalContext),
            source: "instagram-caption-agent",
            requiresAdminReview: true,
            recommendation: status === "available" && priceCents
                ? "direct-checkout-candidate"
                : "publish-as-proof-and-inquiry"
        }
    };
}

function normalizeShopItem(item) {
    const priceCents = item.priceCents == null || item.priceCents === ""
        ? null
        : Math.max(0, Math.round(Number(item.priceCents) || 0));
    const status = SHOP_STATUSES.includes(item.status) ? item.status : (priceCents ? "available" : "inquiry");
    const publishTargets = Array.isArray(item.publishTargets) && item.publishTargets.length
        ? item.publishTargets.map(target => cleanString(target, 32)).filter(Boolean)
        : ["store", "portfolio", "social"];

    return {
        id: cleanString(item.id, 120) || `shop_${Date.now()}_${crypto.randomUUID()}`,
        sourcePlatform: cleanString(item.sourcePlatform, 40) || "admin",
        sourcePostId: cleanString(item.sourcePostId, 120),
        mediaUrl: cleanString(item.mediaUrl, MAX_MEDIA_URL_CHARS),
        thumbnailUrl: cleanString(item.thumbnailUrl, MAX_MEDIA_URL_CHARS),
        permalink: cleanString(item.permalink, 1000),
        caption: cleanString(item.caption, 2200),
        title: cleanString(item.title, 160) || "Untitled Maryilu piece",
        category: cleanString(item.category, 80) || "studio-post",
        priceCents,
        currency: cleanString(item.currency || "eur", 8).toLowerCase(),
        status,
        publishTargets,
        hidden: Boolean(item.hidden || status === "hidden"),
        stripeSessionId: cleanString(item.stripeSessionId, 220),
        reservedAt: cleanString(item.reservedAt, 80),
        soldAt: cleanString(item.soldAt, 80),
        saleSignalConfidence: Number(item.saleSignalConfidence || 0),
        detectedTags: Array.isArray(item.detectedTags) ? item.detectedTags.map(tag => cleanString(tag, 40)).filter(Boolean) : [],
        automationNotes: item.automationNotes && typeof item.automationNotes === "object" ? item.automationNotes : null,
        simulated: item.simulated === true,
        lastSeenAt: cleanString(item.lastSeenAt, 80),
        missingFromLatestSync: item.missingFromLatestSync === true,
        createdAt: cleanString(item.createdAt, 80) || new Date().toISOString(),
        updatedAt: cleanString(item.updatedAt, 80) || new Date().toISOString()
    };
}

function sanitizeClientAutomationNotes(notes, currentNotes = null) {
    const current = currentNotes && typeof currentNotes === "object" ? currentNotes : null;
    if (!notes || typeof notes !== "object") return current;

    const next = { ...notes };
    if (next.approvedMode === "direct-checkout" && current?.approvedMode !== "direct-checkout") {
        delete next.approvedMode;
    }
    return next;
}

function hasManualShopItemOverride(item) {
    const notes = item?.automationNotes || {};
    return Boolean(
        notes.reviewedAt
        || notes.approvedAt
        || notes.approvedBy
        || notes.approvedMode
        || notes.manualOverrideAt
    );
}

function shopItemFromInstagram(media, existing, seenAt = new Date().toISOString()) {
    const analysis = analyzeInstagramCaption(media.caption);
    const preserveManualFields = hasManualShopItemOverride(existing);
    const priceCents = preserveManualFields ? existing?.priceCents : analysis.priceCents;
    const status = preserveManualFields ? existing?.status : analysis.status;
    const now = seenAt || new Date().toISOString();
    const needsCheckoutReview = !preserveManualFields && status === "available" && Boolean(priceCents);

    return normalizeShopItem({
        ...existing,
        id: existing?.id || `instagram_${media.id}`,
        sourcePlatform: "instagram",
        sourcePostId: media.id,
        mediaUrl: media.mediaUrl,
        thumbnailUrl: media.thumbnailUrl,
        permalink: media.permalink,
        simulated: existing?.simulated === true || media.simulated === true,
        caption: media.caption,
        title: preserveManualFields ? existing?.title : (analysis.title || publicTitleFromCaption(media.caption, analysis.category)),
        category: preserveManualFields ? existing?.category : analysis.category,
        priceCents,
        currency: existing?.currency || "eur",
        status,
        publishTargets: preserveManualFields ? existing?.publishTargets : analysis.publishTargets,
        hidden: preserveManualFields ? existing?.hidden : needsCheckoutReview,
        saleSignalConfidence: preserveManualFields ? existing?.saleSignalConfidence : analysis.saleSignalConfidence,
        detectedTags: preserveManualFields ? existing?.detectedTags : analysis.detectedTags,
        automationNotes: preserveManualFields ? existing?.automationNotes : {
            ...analysis.automationNotes,
            requiresAdminReview: needsCheckoutReview
        },
        lastSeenAt: now,
        missingFromLatestSync: false,
        createdAt: existing?.createdAt || media.timestamp || now,
        updatedAt: now
    });
}

async function getJson(env, key, fallback) {
    const raw = await env.ART_DATA.get(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

async function putJson(env, key, value) {
    await env.ART_DATA.put(key, JSON.stringify(value));
}

const DEFAULT_SITE_SETTINGS = {
    version: 1,
    brand: "Maryilu",
    defaultLanguage: "en",
    supportedLanguages: ["en", "es"],
    urls: {
        publicSite: "https://maryilu.com",
        portfolio: "https://portfolio.maryilu.com",
        instagram: "https://www.instagram.com/marialuisas_arttt/"
    },
    social: {
        instagram: {
            label: "Instagram",
            handle: "@marialuisas_arttt",
            href: "https://www.instagram.com/marialuisas_arttt/"
        }
    },
    contact: {
        location: "Mallorca",
        email: "",
        phone: "",
        whatsapp: "",
        instagram: "@marialuisas_arttt"
    },
    commerce: {
        currency: "eur",
        customOrdersOpen: true,
        checkoutMode: "quote-led",
        directCheckoutRequiresReview: true
    },
    copy: {
        en: {
            metaTitle: "Maryilu | Custom Handmade Gifts & Art",
            metaDescription: "Custom handmade gifts and art made around your story. Order custom gift boxes, chests, bouquets, canvases, and baby shower gifts from Maryilu in Mallorca.",
            heroTitle: "Custom Art Gifts Worth Keeping",
            heroSubtitle: "One-of-one art, hand-painted chests, ribbon bouquets, canvases, and baby shower gifts made with heart in Mallorca.",
            heroPrimary: "Shop Available Art",
            heroSecondary: "Start a Custom Gift",
            heroNote: "Handmade gift workshop in Mallorca",
            instagramProofTitle: "New work appears on Instagram first",
            instagramProofText: "Follow @marialuisas_arttt for the latest pieces, studio moments, and custom gift inspiration."
        },
        es: {
            metaTitle: "Maryilu | Regalos y arte handmade personalizados",
            metaDescription: "Regalos handmade y arte personalizado hecho alrededor de tu historia. Encarga cofres, ramos, lienzos y regalos para baby shower de Maryilu en Mallorca.",
            heroTitle: "Regalos artisticos para guardar",
            heroSubtitle: "Arte unico, cofres pintados, ramos de cinta, lienzos y regalos para celebraciones de bebe hechos con corazon en Mallorca.",
            heroPrimary: "Comprar arte disponible",
            heroSecondary: "Empezar regalo personalizado",
            heroNote: "Taller hecho a mano en Mallorca",
            instagramProofTitle: "El trabajo nuevo aparece primero en Instagram",
            instagramProofText: "Sigue @marialuisas_arttt para ver las piezas, momentos del estudio e inspiracion de regalos personalizados."
        }
    },
    assets: {
        storeHero: {
            mediaUrl: "",
            alt: "Maryilu handmade gift preview",
            placeholderLabel: "Photo placeholder: Hero product"
        },
        categories: {
            "gift-boxes": {
                mediaUrl: "",
                alt: "Painted Maryilu chest",
                placeholderLabel: "Photo placeholder: Painted chest"
            },
            flowers: {
                mediaUrl: "",
                alt: "Handmade ribbon bouquet",
                placeholderLabel: "Photo placeholder: Ribbon bouquet"
            },
            canvases: {
                mediaUrl: "",
                alt: "Custom Maryilu canvas",
                placeholderLabel: "Photo placeholder: Custom canvas"
            },
            "baby-shower": {
                mediaUrl: "",
                alt: "Baby shower gift",
                placeholderLabel: "Photo placeholder: Baby gift"
            }
        },
        about: {
            mediaUrl: "",
            alt: "Maria Luisa in the Maryilu studio",
            placeholderLabel: "Photo placeholder: Maria in the studio"
        },
        heroImage: "",
        editorialImage: "",
        portfolioImage: ""
    },
    updatedAt: ""
};

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeSettingValue(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return cleanString(value, 5000);
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (Array.isArray(value)) {
        return value
            .slice(0, 100)
            .map(item => sanitizeSettingValue(item, depth + 1))
            .filter(item => item !== undefined);
    }
    if (isPlainObject(value) && depth < 6) {
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 150)
                .map(([key, item]) => [cleanString(key, 80), sanitizeSettingValue(item, depth + 1)])
                .filter(([key, item]) => key && item !== undefined)
        );
    }
    return undefined;
}

function mergePlainObjects(base, updates) {
    const output = { ...base };
    if (!isPlainObject(updates)) return output;

    Object.entries(updates).forEach(([key, value]) => {
        if (isPlainObject(output[key]) && isPlainObject(value)) {
            output[key] = mergePlainObjects(output[key], value);
        } else {
            output[key] = value;
        }
    });

    return output;
}

function legacySiteContentToSettings(content) {
    if (!isPlainObject(content)) return {};
    const heroTitle = cleanString(content.heroHeading, 220);
    const heroSubtitle = cleanString(content.heroParagraph, 800);
    const aboutText = [
        cleanString(content.aboutParagraph1, 1400),
        cleanString(content.aboutParagraph2, 1400)
    ].filter(Boolean).join("\n\n");

    if (!heroTitle && !heroSubtitle && !aboutText) return {};

    return {
        copy: {
            en: {
                ...(heroTitle ? { heroTitle } : {}),
                ...(heroSubtitle ? { heroSubtitle } : {}),
                ...(aboutText ? { aboutText } : {})
            }
        }
    };
}

function normalizeSiteSettings(settings, options = {}) {
    const sanitized = sanitizeSettingValue(settings || {});
    const merged = mergePlainObjects(DEFAULT_SITE_SETTINGS, isPlainObject(sanitized) ? sanitized : {});
    return {
        ...merged,
        version: boundedInteger(merged.version, 1, 1, 99),
        brand: cleanString(merged.brand || DEFAULT_SITE_SETTINGS.brand, 120),
        defaultLanguage: cleanString(merged.defaultLanguage || "en", 8),
        supportedLanguages: Array.isArray(merged.supportedLanguages)
            ? merged.supportedLanguages.map(language => cleanString(language, 8)).filter(Boolean).slice(0, 8)
            : DEFAULT_SITE_SETTINGS.supportedLanguages,
        updatedAt: options.updatedAt === undefined
            ? cleanString(merged.updatedAt, 80)
            : cleanString(options.updatedAt, 80)
    };
}

async function getSiteSettings(env) {
    const stored = await getJson(env, SITE_SETTINGS_KEY, null);
    if (isPlainObject(stored)) {
        return normalizeSiteSettings(stored);
    }

    const legacyContent = await getJson(env, "site-content", null);
    return normalizeSiteSettings(legacySiteContentToSettings(legacyContent));
}

async function handleSiteSettings(request, env) {
    if (request.method === "GET") {
        return jsonResponse(await getSiteSettings(env), 200, request);
    }

    if (request.method === "PUT") {
        const authError = requireAdmin(request, env);
        if (authError) return authError;

        const body = await request.json().catch(() => null);
        if (!isPlainObject(body)) {
            return jsonResponse({ success: false, error: "Site settings must be a JSON object." }, 400, request);
        }

        const settings = normalizeSiteSettings(body, { updatedAt: new Date().toISOString() });
        await putJson(env, SITE_SETTINGS_KEY, settings);
        return jsonResponse({ success: true, settings }, 200, request);
    }

    return textResponse("Method Not Allowed", 405, request);
}

function hasImageBucket(env) {
    return Boolean(env.ART_IMAGES && typeof env.ART_IMAGES.put === "function" && typeof env.ART_IMAGES.get === "function");
}

function externalImageStorageConfig(env) {
    const baseUrl = cleanString(
        env.MARYILU_IMAGE_STORAGE_URL || env.MARYILU_STORAGE_API_URL || env.IMAGE_STORAGE_API_URL,
        500
    ).replace(/\/+$/, "");
    const token = cleanString(
        env.MARYILU_IMAGE_STORAGE_TOKEN || env.MARYILU_STORAGE_API_TOKEN || env.IMAGE_STORAGE_API_TOKEN,
        500
    );

    if (!baseUrl || !token) return null;
    try {
        const parsed = new URL(baseUrl);
        if (!["https:", "http:"].includes(parsed.protocol)) return null;
        return { baseUrl, token };
    } catch {
        return null;
    }
}

function hasExternalImageStorage(env) {
    return Boolean(externalImageStorageConfig(env));
}

function normalizeMediaKey(value) {
    const decoded = cleanString(decodeURIComponent(String(value || "")), 360).replace(/^\/+/, "");
    if (!decoded || decoded.includes("..") || !/^[A-Za-z0-9/_\-.]+$/.test(decoded)) return "";
    return decoded;
}

function mediaUrlForKey(request, key) {
    const mediaPath = `/media/${key.split("/").map(part => encodeURIComponent(part)).join("/")}`;
    return new URL(mediaPath, request.url).toString();
}

function externalStorageUrl(baseUrl, path) {
    const base = new URL(baseUrl);
    const cleanPath = String(path || "").replace(/^\/+/, "");
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/${cleanPath}`.replace(/\/{2,}/g, "/");
    base.search = "";
    base.hash = "";
    return base.toString();
}

function uploadedImageExtension(file) {
    const type = cleanString(file?.type, 80).toLowerCase().split(";")[0];
    if (IMAGE_UPLOAD_TYPES.has(type)) return IMAGE_UPLOAD_TYPES.get(type);

    const name = cleanString(file?.name, 220).toLowerCase();
    if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
    if (name.endsWith(".png")) return "png";
    if (name.endsWith(".webp")) return "webp";
    return "";
}

function uploadedImageContentType(file, extension) {
    const type = cleanString(file?.type, 80).toLowerCase().split(";")[0];
    if (IMAGE_UPLOAD_TYPES.has(type)) return type;
    if (extension === "jpg") return "image/jpeg";
    if (extension === "png") return "image/png";
    if (extension === "webp") return "image/webp";
    return "";
}

async function uploadImage(request, env) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const form = await request.formData().catch(() => null);
    const file = form?.get("image") || form?.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || typeof file.size !== "number") {
        return jsonResponse({ success: false, error: "Upload an image file." }, 400, request);
    }

    if (file.size <= 0) {
        return jsonResponse({ success: false, error: "Image file is empty." }, 400, request);
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        return jsonResponse({ success: false, error: "Image is too large. Upload a file under 6 MB." }, 413, request);
    }

    const extension = uploadedImageExtension(file);
    const contentType = uploadedImageContentType(file, extension);
    if (!extension || !contentType) {
        return jsonResponse({ success: false, error: "Upload a JPG, PNG, or WebP image." }, 415, request);
    }

    const externalStorage = externalImageStorageConfig(env);
    if (!hasImageBucket(env) && externalStorage) {
        const externalForm = new FormData();
        externalForm.append("image", file, cleanString(file.name, 220) || `maryilu-upload.${extension}`);

        const response = await fetch(externalStorageUrl(externalStorage.baseUrl, "/uploads/images"), {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${externalStorage.token}`
            },
            body: externalForm
        }).catch((error) => ({ ok: false, status: 502, json: async () => ({ error: error.message }) }));

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.key) {
            return jsonResponse({
                success: false,
                error: data.error || "External image storage upload failed.",
                fallback: "compressed-data-url"
            }, response.status || 502, request);
        }

        const mediaUrl = mediaUrlForKey(request, data.key);
        return jsonResponse({
            success: true,
            key: data.key,
            url: mediaUrl,
            mediaUrl,
            storage: "external",
            contentType: data.contentType || contentType,
            size: data.size || file.size,
            uploadedAt: data.uploadedAt || new Date().toISOString()
        }, 201, request);
    }

    if (!hasImageBucket(env)) {
        return jsonResponse({
            success: false,
            error: "Image storage is not configured.",
            fallback: "compressed-data-url"
        }, 503, request);
    }

    const uploadedAt = new Date().toISOString();
    const key = `shop-items/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const body = typeof file.stream === "function" ? file.stream() : await file.arrayBuffer();

    await env.ART_IMAGES.put(key, body, {
        httpMetadata: {
            contentType,
            cacheControl: "public, max-age=31536000, immutable"
        },
        customMetadata: {
            originalName: cleanString(file.name, 220),
            uploadedAt
        }
    });

    const url = mediaUrlForKey(request, key);
    return jsonResponse({
        success: true,
        key,
        url,
        mediaUrl: url,
        storage: "r2",
        contentType,
        size: file.size,
        uploadedAt
    }, 201, request);
}

async function serveMedia(request, env, keyInput) {
    const key = normalizeMediaKey(keyInput);
    if (!key) {
        return textResponse("Invalid media key.", 400, request);
    }

    const externalStorage = externalImageStorageConfig(env);
    if (!hasImageBucket(env) && externalStorage) {
        const response = await fetch(externalStorageUrl(externalStorage.baseUrl, `/media/${key.split("/").map(part => encodeURIComponent(part)).join("/")}`), {
            method: "GET",
            headers: {
                "Accept": request.headers.get("Accept") || "*/*"
            }
        }).catch(() => null);

        if (!response) return textResponse("Image storage is unavailable.", 502, request);
        if (!response.ok) return textResponse(response.status === 404 ? "Media not found." : "Image storage is unavailable.", response.status, request);

        const headers = new Headers(corsHeaders(request));
        const contentType = response.headers.get("Content-Type");
        const contentLength = response.headers.get("Content-Length");
        if (contentType) headers.set("Content-Type", contentType);
        if (contentLength) headers.set("Content-Length", contentLength);
        headers.set("Cache-Control", response.headers.get("Cache-Control") || "public, max-age=31536000, immutable");
        headers.set("X-Content-Type-Options", "nosniff");
        return new Response(response.body, { status: 200, headers });
    }

    if (!hasImageBucket(env)) {
        return textResponse("Image storage is not configured.", 503, request);
    }

    const object = await env.ART_IMAGES.get(key);
    if (!object) {
        return textResponse("Media not found.", 404, request);
    }

    const headers = new Headers(corsHeaders(request));
    if (typeof object.writeHttpMetadata === "function") {
        object.writeHttpMetadata(headers);
    }
    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
    }
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    if (object.size != null) {
        headers.set("Content-Length", String(object.size));
    }

    return new Response(object.body, { status: 200, headers });
}

function compactObject(value) {
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, item]) => item !== undefined && item !== null && item !== "")
            .map(([key, item]) => [key, typeof item === "string" ? cleanString(item, 1000) : item])
    );
}

function normalizeAutomationEvent(event) {
    return {
        id: cleanString(event.id, 120) || `event_${Date.now()}_${crypto.randomUUID()}`,
        type: cleanString(event.type, 80) || "automation.event",
        title: cleanString(event.title, 180) || "Maryilu automation event",
        severity: cleanString(event.severity || "info", 24),
        message: cleanString(event.message, 1200),
        source: cleanString(event.source || "worker", 80),
        referenceId: cleanString(event.referenceId, 160),
        actionUrl: cleanString(event.actionUrl, 1000),
        metadata: compactObject(event.metadata),
        createdAt: cleanString(event.createdAt, 80) || new Date().toISOString()
    };
}

async function getAutomationEvents(env) {
    const events = await getJson(env, AUTOMATION_EVENTS_KEY, []);
    return Array.isArray(events) ? events.map(normalizeAutomationEvent) : [];
}

async function recordAutomationEvent(env, event) {
    const normalized = normalizeAutomationEvent(event);
    const events = await getAutomationEvents(env);
    events.unshift(normalized);
    await putJson(env, AUTOMATION_EVENTS_KEY, events.slice(0, 100));
    return normalized;
}

async function postNotificationWebhook(env, event) {
    const config = notificationConfig(env);
    if (!config.url) return;

    const headers = {
        "Content-Type": "application/json",
        "User-Agent": "maryilu-automation-worker"
    };
    if (config.token) {
        headers.Authorization = `Bearer ${config.token}`;
    }

    const response = await fetch(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
            site: "Maryilu",
            ...event
        })
    });

    if (!response.ok) {
        throw new Error(`Notification webhook failed with HTTP ${response.status}.`);
    }
}

async function emitAutomationEvent(env, event, ctx) {
    const recorded = await recordAutomationEvent(env, event);
    const deliver = postNotificationWebhook(env, recorded).catch(error => {
        console.error(JSON.stringify({
            event: "notification_webhook_failed",
            eventId: recorded.id,
            message: error.message
        }));
    });

    if (ctx?.waitUntil) {
        ctx.waitUntil(deliver);
    } else {
        await deliver;
    }

    return recorded;
}

async function getShopItems(env) {
    const items = await getJson(env, SHOP_ITEMS_KEY, []);
    return Array.isArray(items) ? items.map(normalizeShopItem) : [];
}

async function getShopItemsWithInstagramFallback(env, cached) {
    const items = await releaseExpiredReservations(env, await getShopItems(env));
    if (items.length || !cached?.media?.length) return items;
    return rebuildShopItemsFromInstagram(env, cached.media);
}

async function saveShopItems(env, items) {
    await putJson(env, SHOP_ITEMS_KEY, items.map(normalizeShopItem));
}

async function releaseExpiredReservations(env, items) {
    let changed = false;
    const now = Date.now();
    const nextItems = items.map(item => {
        if (item.status !== "reserved" || !item.reservedAt) return item;
        const reservedAt = new Date(item.reservedAt).getTime();
        if (Number.isNaN(reservedAt) || now - reservedAt < RESERVATION_TTL_MS) return item;
        changed = true;
        const releasedAt = new Date().toISOString();
        return {
            ...item,
            status: item.priceCents ? "available" : "inquiry",
            reservedAt: "",
            stripeSessionId: "",
            automationNotes: {
                ...(item.automationNotes || {}),
                lastReleasedReservation: {
                    sessionId: item.stripeSessionId || "",
                    releasedAt
                }
            },
            updatedAt: releasedAt
        };
    });

    if (changed) {
        await saveShopItems(env, nextItems);
    }

    return nextItems;
}

function markInstagramItemMissingFromLatestSync(item, missingAt) {
    if (item.sourcePlatform !== "instagram") return item;
    if (item.missingFromLatestSync === true && item.automationNotes?.lastMissingFromSyncAt === missingAt) return item;

    return normalizeShopItem({
        ...item,
        missingFromLatestSync: true,
        automationNotes: {
            ...(item.automationNotes || {}),
            missingFromLatestSync: true,
            lastMissingFromSyncAt: missingAt
        },
        updatedAt: missingAt
    });
}

async function rebuildShopItemsFromInstagram(env, media, options = {}) {
    const existingItems = await getShopItems(env);
    const existingBySource = new Map(existingItems.map(item => [`${item.sourcePlatform}:${item.sourcePostId}`, item]));
    const seen = new Set();
    const seenAt = cleanString(options.seenAt, 80) || new Date().toISOString();
    const generated = media.map(item => {
        const key = `instagram:${item.id}`;
        seen.add(key);
        return shopItemFromInstagram(item, existingBySource.get(key), seenAt);
    });
    const retained = existingItems
        .filter(item => item.sourcePlatform !== "instagram" || !seen.has(`${item.sourcePlatform}:${item.sourcePostId}`))
        .map(item => item.sourcePlatform === "instagram" ? markInstagramItemMissingFromLatestSync(item, seenAt) : item);
    const nextItems = [...generated, ...retained];
    await saveShopItems(env, nextItems);
    return nextItems;
}

async function syncInstagramMedia(env, ctx) {
    const attemptedAt = new Date().toISOString();
    const fetchResult = await fetchInstagramMediaFromAPIResult(env);
    const media = fetchResult.media;
    const previousItems = await getShopItems(env);
    const previousReviewIds = new Set(
        previousItems
            .filter(item => item.sourcePlatform === "instagram" && item.hidden && item.status === "available" && item.priceCents)
            .map(item => item.id)
    );
    const syncedAt = new Date().toISOString();
    const shopItems = await rebuildShopItemsFromInstagram(env, media, { seenAt: syncedAt });
    const newReviewItems = shopItems.filter(item => (
        item.sourcePlatform === "instagram"
        && item.hidden
        && item.status === "available"
        && item.priceCents
        && !previousReviewIds.has(item.id)
    ));
    const reviewItems = reviewCandidateShopItems(shopItems);
    const missingItems = shopItems.filter(item => item.sourcePlatform === "instagram" && item.missingFromLatestSync);
    const meta = {
        attemptedAt,
        syncedAt,
        lastError: "",
        count: media.length,
        pagesFetched: fetchResult.pagesFetched,
        hitPageLimit: fetchResult.hitPageLimit,
        shopItemCount: shopItems.length,
        missingItemCount: missingItems.length,
        newReviewCandidateCount: newReviewItems.length,
        reviewCandidateCount: reviewItems.length
    };

    await putJson(env, INSTAGRAM_MEDIA_KEY, media);
    await putJson(env, INSTAGRAM_SYNC_META_KEY, meta);

    if (newReviewItems.length) {
        await emitAutomationEvent(env, {
            type: "instagram.review_candidates",
            title: `${newReviewItems.length} Instagram item${newReviewItems.length === 1 ? "" : "s"} need review`,
            severity: "action",
            message: "Priced Instagram posts were converted into hidden checkout candidates. Review them in Admin > Shop Items before publishing.",
            source: "instagram-sync",
            metadata: {
                count: newReviewItems.length,
                itemIds: newReviewItems.map(item => item.id).join(","),
                titles: newReviewItems.map(item => item.title).join(" | ")
            }
        }, ctx);
    }

    return { media, shopItems, meta };
}

async function recordInstagramSyncFailure(env, error, ctx) {
    const previous = await getJson(env, INSTAGRAM_SYNC_META_KEY, null);
    const meta = {
        ...(previous && typeof previous === "object" ? previous : {}),
        attemptedAt: new Date().toISOString(),
        lastError: cleanString(error?.message || "Instagram sync failed.", 500)
    };
    await putJson(env, INSTAGRAM_SYNC_META_KEY, meta);
    await emitAutomationEvent(env, {
        type: "instagram.sync_failed",
        title: "Instagram sync failed",
        severity: "error",
        message: meta.lastError,
        source: "instagram-sync"
    }, ctx);
    return meta;
}

async function getCachedInstagramMedia(env) {
    const media = await getJson(env, INSTAGRAM_MEDIA_KEY, []);
    const meta = await getJson(env, INSTAGRAM_SYNC_META_KEY, null);
    return { media: Array.isArray(media) ? media : [], meta };
}

async function listInstagramMedia(request, env) {
    const cached = await getCachedInstagramMedia(env);
    return jsonResponse({ success: true, ...cached }, 200, request);
}

async function syncInstagramMediaRequest(request, env, ctx) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    try {
        const result = await syncInstagramMedia(env, ctx);
        return jsonResponse({ success: true, ...result }, 200, request);
    } catch (error) {
        await recordInstagramSyncFailure(env, error, ctx);
        return jsonResponse({ success: false, error: error.message }, 500, request);
    }
}

async function simulateInstagramSyncRequest(request, env, ctx) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    if (!allowsSimulatedInstagramSync(request, env)) {
        return jsonResponse({ success: false, error: "Simulated Instagram sync is only available locally unless ALLOW_SIMULATED_INSTAGRAM_SYNC=true is configured." }, 403, request);
    }

    const body = await request.json().catch(() => ({}));
    const mediaInput = Array.isArray(body.media) ? body.media : [];
    if (!mediaInput.length) {
        return jsonResponse({ success: false, error: "media array is required." }, 400, request);
    }

    const now = new Date().toISOString();
    const media = mediaInput
        .map((item, index) => normalizeInstagramMedia({
            ...item,
            id: item.id || `simulated_${index + 1}`,
            permalink: "",
            simulated: true,
            timestamp: item.timestamp || now,
            username: item.username || "marialuisas_arttt"
        }))
        .filter(item => item.id && item.caption);

    if (!media.length) {
        return jsonResponse({ success: false, error: "At least one simulated post needs an id and caption." }, 400, request);
    }

    const previousItems = await getShopItems(env);
    const previousReviewIds = new Set(
        previousItems
            .filter(item => item.sourcePlatform === "instagram" && item.hidden && item.status === "available" && item.priceCents)
            .map(item => item.id)
    );
    const shopItems = await rebuildShopItemsFromInstagram(env, media, { seenAt: now });
    const newReviewItems = shopItems.filter(item => (
        item.sourcePlatform === "instagram"
        && item.hidden
        && item.status === "available"
        && item.priceCents
        && !previousReviewIds.has(item.id)
    ));
    const reviewItems = reviewCandidateShopItems(shopItems);
    const missingItems = shopItems.filter(item => item.sourcePlatform === "instagram" && item.missingFromLatestSync);
    const meta = {
        attemptedAt: now,
        syncedAt: now,
        simulated: true,
        lastError: "",
        count: media.length,
        pagesFetched: 1,
        hitPageLimit: false,
        shopItemCount: shopItems.length,
        missingItemCount: missingItems.length,
        newReviewCandidateCount: newReviewItems.length,
        reviewCandidateCount: reviewItems.length
    };

    await putJson(env, INSTAGRAM_MEDIA_KEY, media);
    await putJson(env, INSTAGRAM_SYNC_META_KEY, meta);
    await emitAutomationEvent(env, {
        type: "instagram.simulated_sync",
        title: "Simulated Instagram sync imported",
        severity: reviewItems.length ? "action" : "info",
        message: `${media.length} simulated post${media.length === 1 ? "" : "s"} imported for local QA. ${newReviewItems.length} new checkout candidate${newReviewItems.length === 1 ? "" : "s"} and ${reviewItems.length} total review candidate${reviewItems.length === 1 ? "" : "s"}.`,
        source: "instagram-simulated-sync",
        metadata: {
            count: media.length,
            newReviewCandidateCount: newReviewItems.length,
            reviewCandidateCount: reviewItems.length,
            itemIds: newReviewItems.map(item => item.id).join(",")
        }
    }, ctx);

    return jsonResponse({ success: true, media, shopItems, meta }, 200, request);
}

function hasConfiguredValue(value, kind = "generic") {
    const clean = cleanString(value, 1000);
    if (!clean) return false;
    if (/^(todo|changeme|change-me|placeholder|replace-me|replace_me|test-placeholder|sk_test_placeholder|whsec_placeholder)$/i.test(clean)) {
        return false;
    }
    if (/(replace[-_\s]?me|replace[-_\s]?with|placeholder|example|changeme|todo|your[-_\s]?)/i.test(clean)) {
        return false;
    }

    if (kind === "stripeSecretKey") return /^sk_(test|live)_[A-Za-z0-9]/.test(clean);
    if (kind === "stripeWebhookSecret") return /^whsec_[A-Za-z0-9]/.test(clean);
    if (kind === "instagramUserId") return /^\d+$/.test(clean);
    if (kind === "instagramAccessToken") return clean.length >= 20 && !/\s/.test(clean);

    return true;
}

function getConfiguredSystems(env) {
    const stripeSecretIssue = stripeSecretKeyIssue(env);
    const stripeWebhookSecret = hasConfiguredValue(env.STRIPE_WEBHOOK_SECRET, "stripeWebhookSecret");
    const instagramWebhook = instagramWebhookConfig(env);
    return {
        adminToken: hasConfiguredValue(env.ADMIN_TOKEN),
        stripeSecretKey: !stripeSecretIssue,
        stripeWebhookSecret,
        stripeMode: stripeSecretMode(env) || "unconfigured",
        stripeTestModeAllowed: allowsStripeTestMode(env),
        stripeSecretIssue,
        instagramAccessToken: hasConfiguredValue(env.INSTAGRAM_ACCESS_TOKEN || env.IG_ACCESS_TOKEN, "instagramAccessToken"),
        instagramUserId: hasConfiguredValue(env.INSTAGRAM_USER_ID || env.IG_USER_ID, "instagramUserId"),
        instagramWebhookVerifyToken: hasConfiguredValue(instagramWebhook.verifyToken),
        instagramWebhookAppSecret: hasConfiguredValue(instagramWebhook.appSecret),
        notificationWebhook: Boolean(notificationConfig(env).url)
    };
}

function visibleStoreShopItems(shopItems) {
    return shopItems.filter(item => !item.hidden && item.status !== "hidden" && item.publishTargets.includes("store"));
}

function visibleTargetShopItems(shopItems, target = "store") {
    const publishTarget = cleanString(target || "store", 32) || "store";
    return shopItems.filter(item => !item.hidden && item.status !== "hidden" && item.publishTargets.includes(publishTarget));
}

function isDirectCheckoutCandidate(item) {
    return !item.hidden && item.status === "available" && Boolean(item.priceCents) && item.publishTargets.includes("store");
}

function isDirectCheckoutApproved(item) {
    return item.automationNotes?.approvedMode === "direct-checkout" && item.automationNotes?.requiresAdminReview !== true;
}

function directCheckoutIssue(item, env) {
    if (!isDirectCheckoutCandidate(item)) return "";
    if (item.simulated) return "Local preview items cannot be approved for direct checkout.";
    const stripeIssue = stripePaymentConfigIssue(env);
    if (stripeIssue) return stripeIssue;
    if (!item.mediaUrl) return "Add an image URL before publishing direct checkout.";
    if (!isDirectCheckoutApproved(item)) return "Direct checkout requires explicit admin approval.";
    return "";
}

function isDirectCheckoutReady(item, env) {
    return isDirectCheckoutCandidate(item) && !directCheckoutIssue(item, env);
}

function directCheckoutApprovalIssue(item, env) {
    if (item.simulated) return "Local preview items cannot be approved for direct checkout.";
    if (item.status !== "available") return "Only available items can be approved for direct checkout.";
    if (!item.publishTargets.includes("store")) return "Direct checkout items must publish to the store.";
    if (!item.priceCents) return "Add a confirmed price before approving direct checkout.";
    if (!item.mediaUrl) return "Add an image URL before publishing direct checkout.";
    const stripeIssue = stripePaymentConfigIssue(env);
    if (stripeIssue) return stripeIssue;
    if (!isDirectCheckoutApproved(item)) return "Direct checkout requires explicit admin approval.";
    return "";
}

function publicShopItem(item, env) {
    if (!isDirectCheckoutCandidate(item) || isDirectCheckoutReady(item, env)) return item;
    return {
        ...item,
        status: "inquiry",
        reservedAt: "",
        stripeSessionId: "",
        checkoutDisabledReason: directCheckoutIssue(item, env)
    };
}

function reviewCandidateShopItems(shopItems) {
    return shopItems.filter(item =>
        item.automationNotes?.requiresAdminReview ||
        (item.sourcePlatform === "instagram" && item.hidden)
    );
}

function reviewCandidateAction(item, env) {
    const notes = item.automationNotes || {};
    if (item.simulated) return "Keep as inquiry/proof only. Local preview items cannot become direct checkout inventory.";
    if (!item.mediaUrl) return "Add or confirm the exact image before publishing.";
    if (!item.priceCents) return "Publish as inquiry/proof, or add a confirmed price before considering direct checkout.";
    if (item.status !== "available") return "Confirm availability. Sold or reserved work should not open checkout.";
    const checkoutIssue = directCheckoutIssue(item, env);
    if (checkoutIssue) return checkoutIssue;
    if (notes.requiresAdminReview) return "Review title, image, price, status, and publish targets before making this public.";
    return "Ready for admin approval or inquiry publishing.";
}

function reviewCandidateBrief(item, env) {
    const notes = item.automationNotes || {};
    return {
        id: item.id,
        title: item.title,
        category: item.category,
        priceCents: item.priceCents,
        currency: item.currency,
        status: item.status,
        sourcePlatform: item.sourcePlatform,
        sourcePostId: item.sourcePostId,
        permalink: item.permalink,
        hidden: item.hidden,
        simulated: item.simulated === true,
        lastSeenAt: item.lastSeenAt,
        missingFromLatestSync: item.missingFromLatestSync === true,
        recommendation: cleanString(notes.recommendation || (item.priceCents ? "direct-checkout-candidate" : "publish-as-proof-and-inquiry"), 120),
        confidenceLabel: cleanString(notes.confidenceLabel, 40),
        warnings: Array.isArray(notes.warnings) ? notes.warnings.slice(0, 6).map(warning => cleanString(warning, 260)).filter(Boolean) : [],
        reviewChecklist: Array.isArray(notes.reviewChecklist)
            ? notes.reviewChecklist.slice(0, 8).map(step => ({
                key: cleanString(step.key, 80),
                label: cleanString(step.label, 220),
                requiredForCheckout: step.requiredForCheckout === true,
                complete: step.complete === true
            }))
            : [],
        nextAction: reviewCandidateAction(item, env),
        directCheckoutIssue: directCheckoutIssue(item, env)
    };
}

function buildLaunchChecks(configured, reviewCandidates, buyableItems) {
    const stripeReady = configured.stripeSecretKey && configured.stripeWebhookSecret;
    const instagramReady = configured.instagramAccessToken && configured.instagramUserId;
    const instagramWebhookReady = configured.instagramWebhookVerifyToken && configured.instagramWebhookAppSecret;

    return [
        {
            key: "admin",
            label: "Admin access",
            ok: configured.adminToken,
            required: true,
            detail: configured.adminToken ? "Admin operations are protected." : "Set ADMIN_TOKEN before exposing the admin portal.",
            action: "Set ADMIN_TOKEN as a Worker secret."
        },
        {
            key: "stripe",
            label: "Stripe checkout",
            ok: stripeReady,
            required: true,
            detail: stripeReady
                ? `Checkout sessions and webhooks can run server-side${configured.stripeMode === "test" ? " in deliberate test mode" : ""}.`
                : (configured.stripeSecretIssue || "Direct checkout and custom-order payment links need both Stripe secrets."),
            action: "Set STRIPE_SECRET_KEY, deploy the Worker, create /stripe-webhook, then set STRIPE_WEBHOOK_SECRET."
        },
        {
            key: "instagram",
            label: "Instagram automation",
            ok: instagramReady,
            required: true,
            detail: instagramReady ? "The official Meta API sync can fetch Maria's posts." : "The agent cannot sync live posts until Meta credentials are configured.",
            action: "Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID."
        },
        {
            key: "review",
            label: "Review queue",
            ok: reviewCandidates.length === 0,
            required: false,
            detail: reviewCandidates.length
                ? `${reviewCandidates.length} Instagram or caption-agent draft${reviewCandidates.length === 1 ? "" : "s"} need review before publishing.`
                : "No hidden automation drafts are waiting for review.",
            action: "Open Shop Items, confirm title, image, price, status, and publish targets."
        },
        {
            key: "instagram-webhook",
            label: "Instagram webhook",
            ok: instagramWebhookReady,
            required: false,
            detail: instagramWebhookReady
                ? "Meta webhook verification and signed post notifications can nudge the sync immediately."
                : "Cron sync still runs, but Meta webhook verify token and app secret are not configured.",
            action: "Set INSTAGRAM_WEBHOOK_VERIFY_TOKEN and INSTAGRAM_APP_SECRET, then subscribe Meta to /instagram-webhook."
        },
        {
            key: "direct-buy",
            label: "Direct-buy inventory",
            ok: buyableItems.length > 0,
            required: false,
            detail: buyableItems.length
                ? `${buyableItems.length} visible item${buyableItems.length === 1 ? "" : "s"} can use direct Stripe checkout.`
                : "No visible one-of-one item is currently marked available with a price.",
            action: "Publish a reviewed priced item when Maria is ready to sell it directly."
        }
    ];
}

function launchNextAction(launchChecks, fallback = "Run the production launch report after deployment.") {
    const requiredBlockers = launchChecks.filter(check => check.required && !check.ok);
    if (requiredBlockers.length > 1) {
        const labels = requiredBlockers.map(check => check.label).join(", ");
        const actions = requiredBlockers.map(check => check.action).join(" ");
        return `Configure required setup: ${labels}. ${actions}`;
    }
    return launchChecks.find(check => !check.ok)?.action || fallback;
}

function buildAgentSetupRunbook({ configured, reviewCandidates, buyableItems }) {
    const stripeSecretReady = Boolean(configured.stripeSecretKey);
    const stripeWebhookReady = Boolean(configured.stripeWebhookSecret);
    const instagramCredentialsReady = Boolean(configured.instagramAccessToken && configured.instagramUserId);
    const instagramWebhookReady = Boolean(configured.instagramWebhookVerifyToken && configured.instagramWebhookAppSecret);

    return [
        {
            key: "stripe-secret",
            label: "Add Stripe secret",
            required: true,
            done: stripeSecretReady,
            action: "Set STRIPE_SECRET_KEY as a Worker secret. Use test mode first unless launch mode is final.",
            command: "wrangler secret put STRIPE_SECRET_KEY",
            verify: "Automation status shows Stripe key ready."
        },
        {
            key: "stripe-webhook",
            label: "Connect Stripe webhook",
            required: true,
            done: stripeWebhookReady,
            action: "Deploy the Worker, create a Stripe webhook endpoint at /stripe-webhook, then set the signing secret.",
            command: "wrangler secret put STRIPE_WEBHOOK_SECRET",
            verify: "Automation status shows Stripe webhook ready and test checkout events update items/orders."
        },
        {
            key: "instagram-meta",
            label: "Connect Meta Instagram API",
            required: true,
            done: instagramCredentialsReady,
            action: "Set Maria's official Meta Instagram access token and Instagram user ID. Do not scrape Instagram pages.",
            command: "wrangler secret put INSTAGRAM_ACCESS_TOKEN; then wrangler secret put INSTAGRAM_USER_ID",
            verify: "Sync Real Instagram returns recent media and the feed source changes from local preview to real Meta API."
        },
        {
            key: "instagram-webhook",
            label: "Add Meta webhook nudges",
            required: false,
            done: instagramWebhookReady,
            action: "Optional: set the Meta webhook verify token and app secret, then subscribe the Meta app to /instagram-webhook.",
            command: "wrangler secret put INSTAGRAM_WEBHOOK_VERIFY_TOKEN; then wrangler secret put INSTAGRAM_APP_SECRET",
            verify: "Meta webhook verification passes and signed notifications create automation events."
        },
        {
            key: "review-drafts",
            label: "Review generated drafts",
            required: false,
            done: reviewCandidates.length === 0,
            action: reviewCandidates.length
                ? `Review ${reviewCandidates.length} hidden Instagram/caption draft${reviewCandidates.length === 1 ? "" : "s"} before publishing or enabling checkout.`
                : "No hidden automation drafts are waiting right now.",
            command: "",
            verify: "Every public item has confirmed image, title, price/status, shipping path, and publish target."
        },
        {
            key: "direct-buy",
            label: "Publish direct-buy inventory",
            required: false,
            done: buyableItems.length > 0,
            action: buyableItems.length
                ? `${buyableItems.length} reviewed item${buyableItems.length === 1 ? " is" : "s are"} direct-buy ready.`
                : "When Maria wants direct sales, publish at least one reviewed, priced, available one-of-one item.",
            command: "",
            verify: "Public shop shows a buy button only on reviewed, available, priced items."
        }
    ];
}

function buildAgentRunMode({ configured, cached, proofSource, reviewCandidates, buyableItems, requestableItems, setupBlockers, stripeReady, instagramReady }) {
    const simulated = cached.meta?.simulated === true;
    const webhookReady = configured.instagramWebhookVerifyToken && configured.instagramWebhookAppSecret;
    const tone = setupBlockers.length
        ? "setup"
        : reviewCandidates.length
            ? "review"
            : buyableItems.length
                ? "ready"
                : "watch";
    const inputMode = instagramReady
        ? "Live Meta API"
        : proofSource === "instagram"
            ? "Cached Instagram proof"
        : simulated
            ? "Local preview feed"
            : "Curated/manual feed";
    const publishingMode = reviewCandidates.length
        ? "Auto proof, hidden sale drafts"
        : "Auto proof, no sale drafts waiting";
    const checkoutMode = stripeReady
        ? (buyableItems.length ? "Direct checkout ready" : "Stripe ready, needs inventory")
        : "Quote-led until Stripe is connected";
    const buyerMode = buyableItems.length
        ? "Direct-buy plus custom requests"
        : "Request-led store";
    const title = tone === "ready"
        ? "Instagram-to-store agent is ready to sell reviewed pieces."
        : tone === "review"
            ? "Instagram-to-store agent is running with a human review gate."
            : tone === "setup"
                ? "Instagram-to-store agent is staged, but launch setup is unfinished."
                : "Instagram-to-store agent is staged for proof and custom requests.";
    const summary = instagramReady
        ? (webhookReady
            ? "New posts can nudge an immediate Meta sync, publish as proof, and become hidden shop candidates when sale metadata is detected."
            : "New posts can sync through Meta on the scheduled refresh, publish as proof, and become hidden shop candidates when sale metadata is detected.")
        : "The local agent path is wired for testing; live Instagram ingestion starts after the Meta token and Instagram user ID are set.";
    const nextHumanStep = setupBlockers[0]?.action
        || (reviewCandidates.length ? "Review hidden drafts before making them public or direct-buy." : "Keep the sync running and approve only exact, priced, available items for checkout.");
    const guardrail = stripeReady
        ? "Priced items still need exact-image, status, fulfillment, and admin approval before direct checkout."
        : "Buy buttons stay hidden until Stripe secrets, webhook, and reviewed inventory are ready.";

    return {
        tone,
        title,
        summary,
        buyerMode,
        inputMode,
        publishingMode,
        checkoutMode,
        proofSource,
        guardrail,
        nextHumanStep,
        signals: [
            {
                label: "Input",
                value: inputMode,
                detail: instagramReady
                    ? (webhookReady ? "Official Meta API sync and webhook nudges are available." : "Official Meta API sync is available; webhook nudges are not configured yet.")
                    : proofSource === "instagram"
                        ? "Previously synced posts are cached; reconnect credentials to keep them fresh."
                    : simulated
                        ? "Preview posts prove the flow without scraping or credentials."
                        : "Curated/manual items keep the store usable before live sync."
            },
            {
                label: "Publishing",
                value: publishingMode,
                detail: "Posts can appear as proof; sale-like posts stay hidden until Maria reviews them."
            },
            {
                label: "Checkout",
                value: checkoutMode,
                detail: guardrail
            },
            {
                label: "Buyer mode",
                value: buyerMode,
                detail: `${requestableItems.length} requestable item${requestableItems.length === 1 ? "" : "s"} and ${buyableItems.length} direct-buy item${buyableItems.length === 1 ? "" : "s"}.`
            }
        ]
    };
}

async function getAutomationStatus(request, env) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const [shopItemsRaw, cached, orderIndex, events] = await Promise.all([
        getShopItems(env),
        getCachedInstagramMedia(env),
        getJson(env, "order-requests:index", []),
        getAutomationEvents(env)
    ]);

    const shopItems = shopItemsRaw.length
        ? await releaseExpiredReservations(env, shopItemsRaw)
        : await getShopItemsWithInstagramFallback(env, cached);
    const visibleShopItems = visibleStoreShopItems(shopItems);
    const buyableItems = visibleShopItems.filter(item => isDirectCheckoutReady(item, env));
    const reviewCandidates = reviewCandidateShopItems(shopItems);
    const configured = getConfiguredSystems(env);
    const stripeReady = configured.stripeSecretKey && configured.stripeWebhookSecret;
    const instagramReady = configured.instagramAccessToken && configured.instagramUserId;
    const launchChecks = buildLaunchChecks(configured, reviewCandidates, buyableItems);

    return jsonResponse({
        success: true,
        configured,
        instagram: {
            cachedPosts: cached.media.length,
            lastAttemptedAt: cached.meta?.attemptedAt || null,
            lastSyncedAt: cached.meta?.syncedAt || null,
            lastError: cached.meta?.lastError || null,
            simulated: cached.meta?.simulated === true,
            graphVersion: instagramGraphVersion(env),
            pagesFetched: cached.meta?.pagesFetched || null,
            hitPageLimit: cached.meta?.hitPageLimit === true,
            missingItems: cached.meta?.missingItemCount || shopItems.filter(item => item.sourcePlatform === "instagram" && item.missingFromLatestSync).length
        },
        shop: {
            totalItems: shopItems.length,
            visibleItems: visibleShopItems.length,
            buyableItems: buyableItems.length,
            reviewCandidates: reviewCandidates.length,
            reservedItems: shopItems.filter(item => item.status === "reserved").length,
            soldItems: shopItems.filter(item => item.status === "sold").length
        },
        orders: {
            totalRequests: Array.isArray(orderIndex) ? orderIndex.length : 0
        },
        automation: {
            recentEvents: events.length,
            latestEventAt: events[0]?.createdAt || null,
            latestEventType: events[0]?.type || null
        },
        launch: {
            readyForCustomOrders: configured.adminToken,
            readyForDirectArtworkCheckout: stripeReady && buyableItems.length > 0,
            readyForInstagramAutomation: instagramReady,
            requiredReady: launchChecks.filter(check => check.required).every(check => check.ok),
            nextAction: launchNextAction(launchChecks, "Run the production launch report after deployment."),
            checks: launchChecks
        }
    }, 200, request);
}

async function getAgentBrief(request, env) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const [shopItemsRaw, cached, orderIndex, events] = await Promise.all([
        getShopItems(env),
        getCachedInstagramMedia(env),
        getJson(env, "order-requests:index", []),
        getAutomationEvents(env)
    ]);
    const shopItems = shopItemsRaw.length
        ? await releaseExpiredReservations(env, shopItemsRaw)
        : await getShopItemsWithInstagramFallback(env, cached);
    const configured = getConfiguredSystems(env);
    const visibleShopItems = visibleStoreShopItems(shopItems);
    const buyableItems = visibleShopItems.filter(item => isDirectCheckoutReady(item, env));
    const requestableItems = visibleShopItems.filter(item => !isDirectCheckoutReady(item, env) && item.status !== "sold");
    const reviewCandidates = reviewCandidateShopItems(shopItems);
    const launchChecks = buildLaunchChecks(configured, reviewCandidates, buyableItems);
    const setupBlockers = launchChecks.filter(check => check.required && !check.ok);
    const watchedItems = launchChecks.filter(check => !check.ok && !check.required);
    const instagramBackedItems = visibleShopItems.filter(item => item.sourcePlatform === "instagram" && item.permalink);
    const simulatedProof = cached.meta?.simulated === true;
    const hasInstagramProof = cached.media.length > 0 || instagramBackedItems.length > 0;
    const proofSource = simulatedProof ? "local-preview" : hasInstagramProof ? "instagram" : "curated";
    const stripeReady = configured.stripeSecretKey && configured.stripeWebhookSecret;
    const instagramReady = configured.instagramAccessToken && configured.instagramUserId;

    const status = setupBlockers.length
        ? "needs-setup"
        : reviewCandidates.length
            ? "needs-review"
            : buyableItems.length
                ? "ready"
                : "needs-review";
    const headline = setupBlockers.length
        ? `${setupBlockers.length} launch setup item${setupBlockers.length === 1 ? "" : "s"} still need attention.`
        : reviewCandidates.length
            ? `${reviewCandidates.length} Instagram draft${reviewCandidates.length === 1 ? "" : "s"} need Maria's review.`
            : buyableItems.length
                ? "The shop has direct-buy inventory ready to sell."
                : "The site is running, but no direct-buy artwork is published yet.";
    const nextAction = launchNextAction(launchChecks, "Check the latest orders and keep the Instagram sync running.");
    const operatorChecklist = [...setupBlockers, ...watchedItems]
        .map(check => ({
            key: check.key,
            label: check.label,
            required: check.required,
            action: check.action,
            detail: check.detail
        }))
        .slice(0, 8);
    const setupRunbook = buildAgentSetupRunbook({ configured, reviewCandidates, buyableItems });
    const runMode = buildAgentRunMode({
        configured,
        cached,
        proofSource,
        reviewCandidates,
        buyableItems,
        requestableItems,
        setupBlockers,
        stripeReady,
        instagramReady
    });

    return jsonResponse({
        success: true,
        generatedAt: new Date().toISOString(),
        status,
        headline,
        nextAction,
        runMode,
        setupBlockers: setupBlockers.map(check => ({
            key: check.key,
            label: check.label,
            action: check.action,
            detail: check.detail
        })),
        reviewQueue: {
            total: reviewCandidates.length,
            items: reviewCandidates.slice(0, 5).map(item => reviewCandidateBrief(item, env))
        },
        sync: {
            instagramReady,
            cachedPosts: cached.media.length,
            lastSyncedAt: cached.meta?.syncedAt || null,
            lastAttemptedAt: cached.meta?.attemptedAt || null,
            lastError: cached.meta?.lastError || null,
            simulated: simulatedProof,
            pagesFetched: cached.meta?.pagesFetched || null,
            hitPageLimit: cached.meta?.hitPageLimit === true,
            missingItems: cached.meta?.missingItemCount || shopItems.filter(item => item.sourcePlatform === "instagram" && item.missingFromLatestSync).length,
            proofSource
        },
        commerce: {
            totalItems: shopItems.length,
            visibleItems: visibleShopItems.length,
            buyableItems: buyableItems.length,
            requestableItems: requestableItems.length,
            reservedItems: shopItems.filter(item => item.status === "reserved").length,
            soldItems: shopItems.filter(item => item.status === "sold").length,
            readyForDirectArtworkCheckout: stripeReady && buyableItems.length > 0
        },
        orders: {
            totalRequests: Array.isArray(orderIndex) ? orderIndex.length : 0
        },
        recentEvents: events.slice(0, 5),
        operatorChecklist,
        setupRunbook
    }, 200, request);
}

async function getPublicAutomationStatus(request, env) {
    const cached = await getCachedInstagramMedia(env);
    const shopItems = await getShopItemsWithInstagramFallback(env, cached);
    const configured = getConfiguredSystems(env);

    const visibleShopItems = visibleStoreShopItems(shopItems);
    const buyableItems = visibleShopItems.filter(item => isDirectCheckoutReady(item, env));
    const requestableItems = visibleShopItems.filter(item => !isDirectCheckoutReady(item, env) && item.status !== "sold");
    const instagramBackedItems = visibleShopItems.filter(item => item.sourcePlatform === "instagram" && item.permalink);
    const simulatedProof = cached.meta?.simulated === true;
    const hasInstagramProof = cached.media.length > 0 || instagramBackedItems.length > 0;
    const proofSource = simulatedProof ? "local-preview" : hasInstagramProof ? "instagram" : "curated";

    return jsonResponse({
        success: true,
        shop: {
            visibleItems: visibleShopItems.length,
            buyableItems: buyableItems.length,
            requestableItems: requestableItems.length,
            soldItems: shopItems.filter(item => item.status === "sold").length
        },
        instagram: {
            cachedPosts: cached.media.length,
            lastSyncedAt: cached.meta?.syncedAt || null,
            lastAttemptedAt: cached.meta?.attemptedAt || null,
            hasLiveProof: hasInstagramProof && !simulatedProof,
            hasPreviewProof: hasInstagramProof && simulatedProof,
            ready: Boolean(configured.instagramAccessToken && configured.instagramUserId),
            simulated: simulatedProof
        },
        automation: {
            proofSource,
            directCheckoutActive: buyableItems.length > 0,
            checkoutGuard: "available-reserved-sold"
        }
    }, 200, request);
}

async function listAutomationEvents(request, env) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const events = await getAutomationEvents(env);
    return jsonResponse({ success: true, events }, 200, request);
}

async function analyzeCaptionRequest(request, env) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const caption = cleanString(body.caption, 2200);
    if (!caption) {
        return jsonResponse({ success: false, error: "Caption is required." }, 400, request);
    }

    const analysis = analyzeInstagramCaption(caption);
    const now = new Date().toISOString();
    const draft = normalizeShopItem({
        id: `caption_agent_${Date.now()}_${crypto.randomUUID()}`,
        sourcePlatform: "caption-agent",
        caption,
        title: analysis.title,
        category: analysis.category,
        priceCents: analysis.priceCents,
        currency: "eur",
        status: analysis.status,
        publishTargets: analysis.publishTargets,
        hidden: true,
        saleSignalConfidence: analysis.saleSignalConfidence,
        detectedTags: analysis.detectedTags,
        automationNotes: analysis.automationNotes,
        createdAt: now,
        updatedAt: now
    });

    return jsonResponse({ success: true, analysis, draft }, 200, request);
}

async function listShopItems(request, env) {
    const url = new URL(request.url);
    const includeHidden = url.searchParams.get("includeHidden") === "1";
    const target = cleanString(url.searchParams.get("target"), 32);
    if (includeHidden) {
        const authError = requireAdmin(request, env);
        if (authError) return authError;
    }

    let items = await releaseExpiredReservations(env, await getShopItems(env));
    if (!items.length) {
        const cached = await getCachedInstagramMedia(env);
        if (cached.media.length) {
            items = await rebuildShopItemsFromInstagram(env, cached.media);
        }
    }

    const publicItems = includeHidden
        ? (target ? items.filter(item => item.publishTargets.includes(target)) : items)
        : visibleTargetShopItems(items, target || "store")
            .map(item => publicShopItem(item, env));

    return jsonResponse({ success: true, items: publicItems }, 200, request);
}

async function createShopItem(request, env) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const body = await request.json();
    const items = await getShopItems(env);
    const now = new Date().toISOString();
    const item = normalizeShopItem({
        sourcePlatform: "admin",
        status: "inquiry",
        publishTargets: ["store", "portfolio", "social"],
        ...body,
        id: cleanString(body.id, 120) || `admin_${Date.now()}_${crypto.randomUUID()}`,
        automationNotes: sanitizeClientAutomationNotes(body.automationNotes),
        createdAt: body.createdAt || now,
        updatedAt: now
    });

    const directCheckoutError = directCheckoutIssue(item, env);
    if (directCheckoutError) {
        return jsonResponse({ success: false, error: directCheckoutError }, 422, request);
    }

    items.unshift(item);
    await saveShopItems(env, items);
    return jsonResponse({ success: true, item }, 201, request);
}

async function updateShopItem(request, env, itemId) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const body = await request.json();
    const items = await getShopItems(env);
    const index = items.findIndex(item => item.id === itemId);
    if (index === -1) {
        return jsonResponse({ success: false, error: "Shop item not found." }, 404, request);
    }

    const current = items[index];
    const now = new Date().toISOString();
    const manualFields = [
        "mediaUrl",
        "thumbnailUrl",
        "caption",
        "title",
        "category",
        "priceCents",
        "currency",
        "status",
        "publishTargets",
        "hidden"
    ].filter(field => Object.prototype.hasOwnProperty.call(body, field));
    const next = normalizeShopItem({
        ...current,
        mediaUrl: body.mediaUrl ?? current.mediaUrl,
        thumbnailUrl: body.thumbnailUrl ?? current.thumbnailUrl,
        caption: body.caption ?? current.caption,
        title: body.title ?? current.title,
        category: body.category ?? current.category,
        priceCents: body.priceCents ?? current.priceCents,
        currency: body.currency ?? current.currency,
        status: body.status ?? current.status,
        publishTargets: body.publishTargets ?? current.publishTargets,
        hidden: body.hidden ?? current.hidden,
        automationNotes: body.automationNotes === undefined
            ? current.automationNotes
            : sanitizeClientAutomationNotes(body.automationNotes, current.automationNotes),
        updatedAt: now
    });

    if (manualFields.length) {
        next.automationNotes = {
            ...(next.automationNotes || {}),
            manualOverrideAt: now,
            manualOverrideFields: Array.from(new Set([
                ...((next.automationNotes && Array.isArray(next.automationNotes.manualOverrideFields)) ? next.automationNotes.manualOverrideFields : []),
                ...manualFields
            ])).slice(0, 20)
        };
    }

    if (!next.hidden && next.automationNotes?.requiresAdminReview) {
        next.automationNotes = {
            ...next.automationNotes,
            requiresAdminReview: false,
            reviewedAt: now
        };
    }

    if (next.status !== "reserved") {
        next.reservedAt = "";
        if (next.status !== "sold") next.stripeSessionId = "";
    }

    const directCheckoutError = directCheckoutIssue(next, env);
    if (directCheckoutError) {
        return jsonResponse({ success: false, error: directCheckoutError }, 422, request);
    }

    items[index] = next;
    await saveShopItems(env, items);
    return jsonResponse({ success: true, item: next }, 200, request);
}

async function archiveShopItem(request, env, itemId) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const items = await getShopItems(env);
    const index = items.findIndex(item => item.id === itemId);
    if (index === -1) {
        return jsonResponse({ success: false, error: "Shop item not found." }, 404, request);
    }

    const current = items[index];
    const now = new Date().toISOString();
    const next = normalizeShopItem({
        ...current,
        hidden: true,
        status: "hidden",
        reservedAt: "",
        stripeSessionId: current.status === "sold" ? current.stripeSessionId : "",
        automationNotes: {
            ...(current.automationNotes || {}),
            archivedAt: now,
            archivedBy: "admin",
            archivedReason: cleanString(body.reason, 240) || "Archived by admin"
        },
        updatedAt: now
    });

    items[index] = next;
    await saveShopItems(env, items);
    return jsonResponse({ success: true, item: next }, 200, request);
}

async function approveShopItemDirectCheckout(request, env, itemId, ctx) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));
    const items = await releaseExpiredReservations(env, await getShopItems(env));
    const index = items.findIndex(item => item.id === itemId);
    if (index === -1) {
        return jsonResponse({ success: false, error: "Shop item not found." }, 404, request);
    }

    const current = items[index];
    if (current.status === "sold") {
        return jsonResponse({ success: false, error: "Sold items cannot be approved for direct checkout." }, 409, request);
    }
    if (current.status === "reserved") {
        return jsonResponse({ success: false, error: "Reserved items cannot be approved for direct checkout until the reservation is released." }, 409, request);
    }

    const now = new Date().toISOString();
    const publishTargets = Array.from(new Set([
        ...((Array.isArray(body.publishTargets) ? body.publishTargets : current.publishTargets) || []),
        "store",
        "portfolio",
        "social"
    ]));
    const next = normalizeShopItem({
        ...current,
        mediaUrl: body.mediaUrl ?? current.mediaUrl,
        thumbnailUrl: body.thumbnailUrl ?? current.thumbnailUrl,
        caption: body.caption ?? current.caption,
        title: body.title ?? current.title,
        category: body.category ?? current.category,
        priceCents: body.priceCents ?? current.priceCents,
        currency: body.currency ?? current.currency,
        status: "available",
        publishTargets,
        hidden: false,
        reservedAt: "",
        stripeSessionId: "",
        automationNotes: {
            ...(current.automationNotes || {}),
            ...sanitizeClientAutomationNotes(body.automationNotes, current.automationNotes),
            requiresAdminReview: false,
            approvedMode: "direct-checkout",
            reviewedAt: now,
            approvedBy: "admin"
        },
        updatedAt: now
    });

    const directCheckoutError = directCheckoutApprovalIssue(next, env);
    if (directCheckoutError) {
        return jsonResponse({ success: false, error: directCheckoutError }, 422, request);
    }

    items[index] = next;
    await saveShopItems(env, items);
    await emitAutomationEvent(env, {
        type: "shop_item.direct_checkout_approved",
        itemId: next.id,
        sourcePlatform: next.sourcePlatform,
        sourcePostId: next.sourcePostId,
        title: next.title,
        priceCents: next.priceCents,
        currency: next.currency
    }, ctx);

    return jsonResponse({ success: true, item: next }, 200, request);
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

async function rateLimit(request, env, namespace, limit = 8, ttl = 600) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const key = `rate:${namespace}:${ip}`;
    const current = Number(await env.ART_DATA.get(key) || "0");

    if (current >= limit) {
        return jsonResponse({ success: false, error: "Too many requests. Please try again later." }, 429, request);
    }

    await env.ART_DATA.put(key, String(current + 1), { expirationTtl: ttl });
    return null;
}

async function handleCollection(request, env, key, fallback) {
    if (request.method === "POST") {
        const authError = requireAdmin(request, env);
        if (authError) return authError;

        const data = await request.json();
        await putJson(env, key, data);
        return jsonResponse({ success: true }, 200, request);
    }

    if (request.method === "GET") {
        const data = await env.ART_DATA.get(key);
        return new Response(data || JSON.stringify(fallback), {
            headers: {
                ...corsHeaders(request),
                ...NO_CACHE_HEADERS
            }
        });
    }

    return textResponse("Method Not Allowed", 405, request);
}

function normalizeOrderRequest(data) {
    const now = new Date().toISOString();
    const id = `order_${Date.now()}_${crypto.randomUUID()}`;
    return {
        id,
        createdAt: now,
        updatedAt: now,
        status: LEAD_STATUSES[0],
        language: cleanString(data.language, 8) || "en",
        source: cleanString(data.source, 500),
        name: cleanString(data.name, 160),
        email: cleanString(data.email, 220),
        phone: cleanString(data.phone, 80),
        instagram: cleanString(data.instagram, 80),
        preferredLanguage: cleanString(data.preferredLanguage, 80),
        countryCity: cleanString(data.countryCity, 180),
        productCategory: cleanString(data.productCategory, 160),
        productTier: cleanString(data.productTier, 220),
        occasion: cleanString(data.occasion, 180),
        deadline: cleanString(data.deadline, 120),
        budget: cleanString(data.budget, 120),
        pickupShipping: cleanString(data.pickupShipping, 140),
        recipient: cleanString(data.recipient, 1200),
        ageRange: cleanString(data.ageRange, 80),
        interests: cleanString(data.interests, 1400),
        colors: cleanString(data.colors, 800),
        includeThemes: cleanString(data.includeThemes, 1000),
        avoidThemes: cleanString(data.avoidThemes, 1000),
        memories: cleanString(data.memories, 1800),
        songQuote: cleanString(data.songQuote, 1000),
        involvement: cleanString(data.involvement, 180),
        references: normalizeReferences(data.references),
        notes: cleanString(data.notes, 1800),
        consent: Boolean(data.consent),
        payments: []
    };
}

async function createOrderRequest(request, env, ctx) {
    const data = await request.json();

    if (cleanString(data.company)) {
        return jsonResponse({ success: true, status: LEAD_STATUSES[0] }, 200, request);
    }

    const rateLimitError = await rateLimit(request, env, "order", 8, 600);
    if (rateLimitError) return rateLimitError;

    const requiredFields = [
        "name",
        "email",
        "phone",
        "preferredLanguage",
        "countryCity",
        "productCategory",
        "occasion",
        "deadline",
        "budget",
        "pickupShipping",
        "recipient"
    ];
    const missingFields = requiredFields.filter((field) => !cleanString(data[field]));
    if (missingFields.length || !data.consent) {
        return jsonResponse({
            success: false,
            error: "Missing required order request fields.",
            missingFields: data.consent ? missingFields : missingFields.concat("consent")
        }, 400, request);
    }

    if (!isValidEmail(data.email)) {
        return jsonResponse({ success: false, error: "Please enter a valid email address." }, 400, request);
    }

    const orderRequest = normalizeOrderRequest(data);
    const index = await getJson(env, "order-requests:index", []);
    index.unshift(orderRequest.id);

    await putJson(env, `order-request:${orderRequest.id}`, orderRequest);
    await putJson(env, "order-requests:index", index.slice(0, 500));

    await emitAutomationEvent(env, {
        type: "order_request.created",
        title: "New Maryilu custom order request",
        severity: "action",
        message: `${orderRequest.name || "A customer"} requested ${orderRequest.productCategory || "a custom piece"}.`,
        source: "order-form",
        referenceId: orderRequest.id,
        metadata: {
            productCategory: orderRequest.productCategory,
            productTier: orderRequest.productTier,
            countryCity: orderRequest.countryCity,
            preferredLanguage: orderRequest.preferredLanguage,
            deadline: orderRequest.deadline
        }
    }, ctx);

    return jsonResponse({ success: true, id: orderRequest.id, status: orderRequest.status }, 200, request);
}

async function listOrderRequests(request, env) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const index = await getJson(env, "order-requests:index", []);
    const requests = [];

    for (const id of index) {
        const item = await getJson(env, `order-request:${id}`, null);
        if (item) requests.push(item);
    }

    return jsonResponse({ success: true, requests }, 200, request);
}

async function updateOrderRequestStatus(request, env, requestId) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const body = await request.json();
    if (!LEAD_STATUSES.includes(body.status)) {
        return jsonResponse({ success: false, error: "Invalid lead status." }, 400, request);
    }

    const key = `order-request:${requestId}`;
    const orderRequest = await getJson(env, key, null);
    if (!orderRequest) {
        return jsonResponse({ success: false, error: "Order request not found." }, 404, request);
    }

    orderRequest.status = body.status;
    orderRequest.updatedAt = new Date().toISOString();
    await putJson(env, key, orderRequest);

    return jsonResponse({ success: true, request: orderRequest }, 200, request);
}

function appendStripeParams(params, key, value) {
    if (value == null) return;
    if (Array.isArray(value)) {
        value.forEach((item, index) => appendStripeParams(params, `${key}[${index}]`, item));
        return;
    }
    if (typeof value === "object") {
        Object.entries(value).forEach(([childKey, childValue]) => appendStripeParams(params, `${key}[${childKey}]`, childValue));
        return;
    }
    params.append(key, String(value));
}

async function stripePost(env, path, payload) {
    const keyIssue = stripeSecretKeyIssue(env);
    if (keyIssue) throw new Error(keyIssue);

    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => appendStripeParams(params, key, value));

    const response = await fetch(`https://api.stripe.com/v1${path}`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Stripe-Version": STRIPE_API_VERSION
        },
        body: params
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error?.message || "Stripe request failed.");
    }

    return data;
}

function formatMoney(cents, currency = "eur") {
    const amount = (Number(cents) || 0) / 100;
    return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format(amount);
}

async function createArtworkCheckout(request, env) {
    const rateLimitError = await rateLimit(request, env, "checkout", 20, 600);
    if (rateLimitError) return rateLimitError;

    const body = await request.json();
    const itemId = cleanString(body.itemId, 120);
    const items = await releaseExpiredReservations(env, await getShopItems(env));
    const itemIndex = items.findIndex(item => item.id === itemId);
    const item = items[itemIndex];

    if (!item || item.hidden || item.status === "hidden") {
        return jsonResponse({ success: false, error: "This item is not available." }, 404, request);
    }
    if (item.status !== "available" || !item.priceCents) {
        return jsonResponse({ success: false, error: "This item is available by request, not direct checkout." }, 409, request);
    }
    const directCheckoutError = directCheckoutIssue(item, env);
    if (directCheckoutError) {
        return jsonResponse({ success: false, error: directCheckoutError }, 409, request);
    }

    const now = new Date().toISOString();
    const reservationExpiresAt = Math.floor(Date.now() / 1000) + ARTWORK_CHECKOUT_TTL_SECONDS;
    const reservationId = crypto.randomUUID();
    const pendingSessionId = `pending:${reservationId}`;
    items[itemIndex] = {
        ...item,
        status: "reserved",
        stripeSessionId: pendingSessionId,
        reservedAt: now,
        updatedAt: now
    };
    await saveShopItems(env, items);

    const siteUrl = publicSiteUrl(env);
    let session;
    try {
        session = await stripePost(env, "/checkout/sessions", {
            mode: "payment",
            success_url: `${siteUrl}/checkout-success.html?type=artwork&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${siteUrl}/#shop`,
            client_reference_id: item.id,
            expires_at: reservationExpiresAt,
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: item.currency || "eur",
                        unit_amount: item.priceCents,
                        product_data: {
                            name: item.title,
                            description: item.caption ? item.caption.slice(0, 480) : "Original Maryilu artwork",
                            images: item.mediaUrl ? [item.mediaUrl] : []
                        }
                    }
                }
            ],
            metadata: {
                type: "artwork",
                artworkItemId: item.id,
                reservationId,
                sourcePlatform: item.sourcePlatform || "",
                sourcePostId: item.sourcePostId || ""
            }
        });
    } catch (error) {
        await releasePendingArtworkReservation(env, item.id, pendingSessionId);
        throw error;
    }

    const latestItems = await getShopItems(env);
    const latestIndex = latestItems.findIndex(latestItem => latestItem.id === item.id);
    if (latestIndex === -1 || latestItems[latestIndex].stripeSessionId !== pendingSessionId) {
        await expireCheckoutSession(env, session.id);
        return jsonResponse({ success: false, error: "This item is already being checked out." }, 409, request);
    }

    latestItems[latestIndex] = {
        ...latestItems[latestIndex],
        stripeSessionId: session.id,
        updatedAt: new Date().toISOString()
    };
    await saveShopItems(env, latestItems);

    return jsonResponse({ success: true, url: session.url, sessionId: session.id }, 200, request);
}

async function releasePendingArtworkReservation(env, itemId, pendingSessionId) {
    const items = await getShopItems(env);
    const index = items.findIndex(item => item.id === itemId);
    if (index === -1 || items[index].stripeSessionId !== pendingSessionId) return;

    items[index] = {
        ...items[index],
        status: "available",
        reservedAt: "",
        stripeSessionId: "",
        updatedAt: new Date().toISOString()
    };
    await saveShopItems(env, items);
}

async function expireCheckoutSession(env, sessionId) {
    try {
        await stripePost(env, `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {});
    } catch (error) {
        console.warn("Unable to expire superseded Stripe Checkout session:", error.message);
    }
}

async function createOrderPaymentLink(request, env, requestId) {
    const authError = requireAdmin(request, env);
    if (authError) return authError;

    const stripeIssue = stripePaymentConfigIssue(env);
    if (stripeIssue) {
        return jsonResponse({
            success: false,
            error: stripeIssue
        }, 422, request);
    }

    const body = await request.json();
    const amountCents = Math.round(Number(body.amountCents) || 0);
    const paymentType = cleanString(body.paymentType || "deposit", 40);
    const description = cleanString(body.description || `Maryilu ${paymentType} payment`, 240);

    if (amountCents < 100) {
        return jsonResponse({ success: false, error: "Amount must be at least 1.00." }, 400, request);
    }

    const key = `order-request:${requestId}`;
    const orderRequest = await getJson(env, key, null);
    if (!orderRequest) {
        return jsonResponse({ success: false, error: "Order request not found." }, 404, request);
    }

    const siteUrl = publicSiteUrl(env);
    const successPaymentType = encodeURIComponent(paymentType || "payment");
    const session = await stripePost(env, "/checkout/sessions", {
        mode: "payment",
        success_url: `${siteUrl}/checkout-success.html?type=custom-order&payment=${successPaymentType}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/#order`,
        client_reference_id: orderRequest.id,
        customer_email: orderRequest.email || undefined,
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: cleanString(body.currency || "eur", 8).toLowerCase(),
                    unit_amount: amountCents,
                    product_data: {
                        name: description,
                        description: `${orderRequest.productCategory || "Custom Maryilu order"} - ${orderRequest.name || "customer"}`
                    }
                }
            }
        ],
        metadata: {
            type: "custom-order",
            orderRequestId: orderRequest.id,
            paymentType
        }
    });

    orderRequest.payments = Array.isArray(orderRequest.payments) ? orderRequest.payments : [];
    orderRequest.payments.unshift({
        sessionId: session.id,
        url: session.url,
        paymentType,
        amountCents,
        currency: cleanString(body.currency || "eur", 8).toLowerCase(),
        status: "created",
        createdAt: new Date().toISOString()
    });
    orderRequest.status = paymentType === "final" ? "Final payment pending" : "Concept approved";
    orderRequest.updatedAt = new Date().toISOString();
    await putJson(env, key, orderRequest);

    return jsonResponse({ success: true, url: session.url, sessionId: session.id, request: orderRequest }, 200, request);
}

function parseStripeSignatureHeader(header) {
    return String(header || "").split(",").reduce((acc, part) => {
        const [key, value] = part.split("=");
        if (!key || !value) return acc;
        if (key === "v1") acc.signatures.push(value);
        if (key === "t") acc.timestamp = value;
        return acc;
    }, { timestamp: "", signatures: [] });
}

function bufferToHex(buffer) {
    return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeWebhook(request, env, payload) {
    if (!hasConfiguredValue(env.STRIPE_WEBHOOK_SECRET, "stripeWebhookSecret")) {
        throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    }

    const signatureHeader = request.headers.get("Stripe-Signature") || "";
    const parsed = parseStripeSignatureHeader(signatureHeader);
    const timestamp = Number(parsed.timestamp);
    if (!timestamp || !parsed.signatures.length) {
        throw new Error("Missing Stripe webhook signature.");
    }
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
        throw new Error("Stripe webhook signature timestamp is outside the tolerance window.");
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.STRIPE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signedPayload = `${parsed.timestamp}.${payload}`;
    const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const expected = bufferToHex(digest);

    if (!parsed.signatures.some(signature => timingSafeEqual(signature, expected))) {
        throw new Error("Invalid Stripe webhook signature.");
    }
}

async function hmacSha256Hex(secret, payload) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    return bufferToHex(digest);
}

async function readBoundedWebhookPayload(request) {
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > MAX_WEBHOOK_BYTES) {
        return { error: "Webhook payload too large.", status: 413, payload: "" };
    }
    const payload = await request.text();
    if (new TextEncoder().encode(payload).byteLength > MAX_WEBHOOK_BYTES) {
        return { error: "Webhook payload too large.", status: 413, payload: "" };
    }
    return { payload };
}

function handleInstagramWebhookVerify(request, env) {
    const config = instagramWebhookConfig(env);
    if (!hasConfiguredValue(config.verifyToken)) {
        return textResponse("Instagram webhook verify token is not configured.", 503, request);
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode") || "";
    const token = url.searchParams.get("hub.verify_token") || "";
    const challenge = url.searchParams.get("hub.challenge") || "";

    if (mode === "subscribe" && challenge && timingSafeEqual(token, config.verifyToken)) {
        return new Response(challenge, {
            status: 200,
            headers: {
                ...corsHeaders(request),
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache, no-store, must-revalidate"
            }
        });
    }

    return textResponse("Instagram webhook verification failed.", 403, request);
}

async function verifyInstagramWebhookSignature(request, env, payload) {
    const config = instagramWebhookConfig(env);
    if (!hasConfiguredValue(config.appSecret)) {
        throw new Error("INSTAGRAM_APP_SECRET is not configured.");
    }

    const signatureHeader = request.headers.get("X-Hub-Signature-256") || "";
    const match = signatureHeader.match(/^sha256=([a-f0-9]{64})$/i);
    if (!match) {
        throw new Error("Missing Instagram webhook signature.");
    }

    const expected = await hmacSha256Hex(config.appSecret, payload);
    if (!timingSafeEqual(match[1], expected)) {
        throw new Error("Invalid Instagram webhook signature.");
    }
}

async function handleInstagramWebhook(request, env, ctx) {
    const payloadResult = await readBoundedWebhookPayload(request);
    if (payloadResult.error) {
        return jsonResponse({ success: false, error: payloadResult.error }, payloadResult.status, request);
    }

    try {
        await verifyInstagramWebhookSignature(request, env, payloadResult.payload);
    } catch (error) {
        const status = error.message.includes("configured") ? 503 : 400;
        return jsonResponse({ success: false, error: error.message }, status, request);
    }

    let payload;
    try {
        payload = JSON.parse(payloadResult.payload || "{}");
    } catch (error) {
        return jsonResponse({ success: false, error: "Invalid Instagram webhook payload." }, 400, request);
    }

    const changes = Array.isArray(payload.entry)
        ? payload.entry.reduce((count, entry) => count + (Array.isArray(entry.changes) ? entry.changes.length : 0), 0)
        : 0;
    await emitAutomationEvent(env, {
        type: "instagram.webhook_received",
        title: "Instagram webhook received",
        severity: "info",
        message: "Meta sent an Instagram change notification. A sync has been queued.",
        source: "instagram-webhook",
        metadata: {
            object: cleanString(payload.object, 80),
            entries: Array.isArray(payload.entry) ? payload.entry.length : 0,
            changes
        }
    }, ctx);

    const syncPromise = syncInstagramMedia(env, ctx).catch(error => recordInstagramSyncFailure(env, error, ctx));
    if (ctx?.waitUntil) {
        ctx.waitUntil(syncPromise);
        return jsonResponse({ success: true, received: true, sync: "queued" }, 202, request);
    }

    await syncPromise;
    return jsonResponse({ success: true, received: true, sync: "completed" }, 200, request);
}

async function markArtworkSold(env, session, ctx) {
    const itemId = session.metadata?.artworkItemId || session.client_reference_id || "";
    if (!itemId) return;
    const items = await getShopItems(env);
    const index = items.findIndex(item => item.id === itemId);
    if (index === -1) return;
    if (items[index].status === "sold") return;
    const lastReleasedSessionId = items[index].automationNotes?.lastReleasedReservation?.sessionId || "";
    const activeReservationMatches = items[index].status === "reserved" && items[index].stripeSessionId === session.id;
    const releasedReservationMatches = !items[index].stripeSessionId && lastReleasedSessionId === session.id && items[index].status !== "reserved";
    if (!activeReservationMatches && !releasedReservationMatches) return;

    items[index] = {
        ...items[index],
        status: "sold",
        soldAt: new Date().toISOString(),
        reservedAt: "",
        stripeSessionId: session.id,
        updatedAt: new Date().toISOString()
    };
    await saveShopItems(env, items);
    await emitAutomationEvent(env, {
        type: "artwork.sold",
        title: `${items[index].title || "Artwork"} sold`,
        severity: "success",
        message: "Stripe confirmed the artwork checkout. The piece was marked sold and removed from direct availability.",
        source: "stripe-webhook",
        referenceId: itemId,
        metadata: {
            sessionId: session.id,
            paymentIntent: session.payment_intent || "",
            amountTotal: session.amount_total || "",
            currency: session.currency || items[index].currency || "eur"
        }
    }, ctx);
}

async function releaseArtworkReservation(env, session, ctx) {
    const itemId = session.metadata?.artworkItemId || session.client_reference_id || "";
    if (!itemId) return;
    const items = await getShopItems(env);
    const index = items.findIndex(item => item.id === itemId);
    if (index === -1 || items[index].status !== "reserved" || items[index].stripeSessionId !== session.id) return;
    const releasedAt = new Date().toISOString();

    items[index] = {
        ...items[index],
        status: items[index].priceCents ? "available" : "inquiry",
        reservedAt: "",
        stripeSessionId: "",
        automationNotes: {
            ...(items[index].automationNotes || {}),
            lastReleasedReservation: {
                sessionId: session.id,
                releasedAt
            }
        },
        updatedAt: releasedAt
    };
    await saveShopItems(env, items);
    await emitAutomationEvent(env, {
        type: "artwork.reservation_released",
        title: `${items[index].title || "Artwork"} reservation released`,
        severity: "info",
        message: "Stripe reported the checkout did not complete, so the artwork was made available again.",
        source: "stripe-webhook",
        referenceId: itemId,
        metadata: {
            sessionId: session.id,
            status: session.status || ""
        }
    }, ctx);
}

async function emitUnmatchedOrderPaymentSession(env, orderRequest, session, status, ctx) {
    const paymentType = session.metadata?.paymentType || "payment";
    await emitAutomationEvent(env, {
        type: "order_payment.unmatched",
        title: `${paymentType} payment not matched`,
        severity: "warning",
        message: "Stripe sent a custom-order checkout event, but the session was not created or stored by this Worker.",
        source: "stripe-webhook",
        referenceId: orderRequest.id || session.metadata?.orderRequestId || session.client_reference_id || "",
        metadata: {
            sessionId: session.id || "",
            paymentType,
            status
        }
    }, ctx);
}

async function markOrderPayment(env, session, ctx) {
    const requestId = session.metadata?.orderRequestId || session.client_reference_id || "";
    if (!requestId) return;
    const key = `order-request:${requestId}`;
    const orderRequest = await getJson(env, key, null);
    if (!orderRequest) return;

    orderRequest.payments = Array.isArray(orderRequest.payments) ? orderRequest.payments : [];
    const paymentIndex = orderRequest.payments.findIndex(payment => payment.sessionId === session.id);
    if (paymentIndex === -1) {
        await emitUnmatchedOrderPaymentSession(env, orderRequest, session, "paid", ctx);
        return;
    }
    const paymentType = orderRequest.payments[paymentIndex].paymentType || session.metadata?.paymentType || "payment";
    if (orderRequest.payments[paymentIndex].status === "paid") {
        return;
    }
    orderRequest.payments = orderRequest.payments.map(payment => {
        if (payment.sessionId !== session.id) return payment;
        return {
            ...payment,
            status: "paid",
            paidAt: new Date().toISOString(),
            paymentIntent: cleanString(session.payment_intent, 220)
        };
    });

    orderRequest.status = paymentType === "final" ? "Ready for pickup/shipping" : "Deposit paid";
    orderRequest.updatedAt = new Date().toISOString();
    await putJson(env, key, orderRequest);
    await emitAutomationEvent(env, {
        type: "order_payment.paid",
        title: `${paymentType === "final" ? "Final payment" : "Deposit"} paid`,
        severity: "success",
        message: `Stripe confirmed the ${paymentType} payment for ${orderRequest.name || "a custom order"}.`,
        source: "stripe-webhook",
        referenceId: requestId,
        metadata: {
            sessionId: session.id,
            paymentType,
            paymentIntent: session.payment_intent || ""
        }
    }, ctx);
}

async function markOrderPaymentEnded(env, session, status, ctx) {
    const requestId = session.metadata?.orderRequestId || session.client_reference_id || "";
    if (!requestId) return;
    const key = `order-request:${requestId}`;
    const orderRequest = await getJson(env, key, null);
    if (!orderRequest) return;

    const endedAtKey = status === "expired" ? "expiredAt" : "failedAt";
    orderRequest.payments = Array.isArray(orderRequest.payments) ? orderRequest.payments : [];
    const paymentIndex = orderRequest.payments.findIndex(payment => payment.sessionId === session.id);
    if (paymentIndex === -1) {
        await emitUnmatchedOrderPaymentSession(env, orderRequest, session, status, ctx);
        return;
    }
    if (orderRequest.payments[paymentIndex].status === "paid") {
        return;
    }
    const paymentType = orderRequest.payments[paymentIndex].paymentType || session.metadata?.paymentType || "payment";
    orderRequest.payments = orderRequest.payments.map(payment => {
        if (payment.sessionId !== session.id) return payment;
        return {
            ...payment,
            status,
            [endedAtKey]: new Date().toISOString()
        };
    });
    orderRequest.updatedAt = new Date().toISOString();
    await putJson(env, key, orderRequest);
    await emitAutomationEvent(env, {
        type: status === "expired" ? "order_payment.expired" : "order_payment.failed",
        title: `${paymentType} payment ${status}`,
        severity: status === "expired" ? "warning" : "error",
        message: `Stripe marked the ${paymentType} checkout for ${orderRequest.name || "a custom order"} as ${status}.`,
        source: "stripe-webhook",
        referenceId: requestId,
        metadata: {
            sessionId: session.id,
            paymentType,
            status
        }
    }, ctx);
}

function isPaidCheckoutSession(session) {
    return session?.payment_status === "paid";
}

async function handleStripeWebhook(request, env, ctx) {
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > MAX_WEBHOOK_BYTES) {
        return jsonResponse({ error: "Webhook payload too large." }, 413, request);
    }

    const payload = await request.text();
    if (new TextEncoder().encode(payload).byteLength > MAX_WEBHOOK_BYTES) {
        return jsonResponse({ error: "Webhook payload too large." }, 413, request);
    }
    try {
        await verifyStripeWebhook(request, env, payload);
    } catch (error) {
        const status = error.message.includes("configured") ? 500 : 400;
        return jsonResponse({ error: error.message }, status, request);
    }

    let event;
    try {
        event = JSON.parse(payload);
    } catch (error) {
        return jsonResponse({ error: "Invalid Stripe webhook payload." }, 400, request);
    }

    const session = event.data?.object;

    if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && session && isPaidCheckoutSession(session)) {
        if (session.metadata?.type === "artwork") {
            await markArtworkSold(env, session, ctx);
        }
        if (session.metadata?.type === "custom-order") {
            await markOrderPayment(env, session, ctx);
        }
    }

    if ((event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") && session && session.metadata?.type === "artwork") {
        await releaseArtworkReservation(env, session, ctx);
    }

    if (event.type === "checkout.session.expired" && session && session.metadata?.type === "custom-order") {
        await markOrderPaymentEnded(env, session, "expired", ctx);
    }

    if (event.type === "checkout.session.async_payment_failed" && session && session.metadata?.type === "custom-order") {
        await markOrderPaymentEnded(env, session, "failed", ctx);
    }

    return jsonResponse({ received: true }, 200, request);
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders(request) });
        }

        try {
            if (path === "/artworks") {
                return await handleCollection(request, env, "artworks", []);
            }

            if (path === "/poetry") {
                return await handleCollection(request, env, "poetry", []);
            }

            if (path === "/site-content") {
                return await handleCollection(request, env, "site-content", {});
            }

            if (path === "/site-settings") {
                return await handleSiteSettings(request, env);
            }

            if (path === "/instagram-media" && request.method === "GET") {
                return await listInstagramMedia(request, env);
            }

            if (path === "/sync-instagram" && request.method === "POST") {
                return await syncInstagramMediaRequest(request, env, ctx);
            }

            if (path === "/instagram-webhook" && request.method === "GET") {
                return handleInstagramWebhookVerify(request, env);
            }

            if (path === "/instagram-webhook" && request.method === "POST") {
                return await handleInstagramWebhook(request, env, ctx);
            }

            if (path === "/simulate-instagram-sync" && request.method === "POST") {
                return await simulateInstagramSyncRequest(request, env, ctx);
            }

            if (path === "/automation-status" && request.method === "GET") {
                return await getAutomationStatus(request, env);
            }

            if (path === "/agent-brief" && request.method === "GET") {
                return await getAgentBrief(request, env);
            }

            if (path === "/automation-public-status" && request.method === "GET") {
                return await getPublicAutomationStatus(request, env);
            }

            if (path === "/automation-events" && request.method === "GET") {
                return await listAutomationEvents(request, env);
            }

            if (path === "/analyze-caption" && request.method === "POST") {
                return await analyzeCaptionRequest(request, env);
            }

            if (path === "/uploads/images" && request.method === "POST") {
                return await uploadImage(request, env);
            }

            const mediaMatch = path.match(/^\/media\/(.+)$/);
            if (mediaMatch && request.method === "GET") {
                return await serveMedia(request, env, mediaMatch[1]);
            }

            if (path === "/shop-items" && request.method === "GET") {
                return await listShopItems(request, env);
            }

            if (path === "/shop-items" && request.method === "POST") {
                return await createShopItem(request, env);
            }

            const shopItemMatch = path.match(/^\/shop-items\/([^/]+)$/);
            if (shopItemMatch && request.method === "PATCH") {
                return await updateShopItem(request, env, decodeURIComponent(shopItemMatch[1]));
            }

            const shopItemArchiveMatch = path.match(/^\/shop-items\/([^/]+)\/archive$/);
            if (shopItemArchiveMatch && request.method === "POST") {
                return await archiveShopItem(request, env, decodeURIComponent(shopItemArchiveMatch[1]));
            }

            const shopItemDirectCheckoutMatch = path.match(/^\/shop-items\/([^/]+)\/approve-direct-checkout$/);
            if (shopItemDirectCheckoutMatch && request.method === "POST") {
                return await approveShopItemDirectCheckout(request, env, decodeURIComponent(shopItemDirectCheckoutMatch[1]), ctx);
            }

            if (path === "/checkout/artwork" && request.method === "POST") {
                return await createArtworkCheckout(request, env);
            }

            if (path === "/stripe-webhook" && request.method === "POST") {
                return await handleStripeWebhook(request, env, ctx);
            }

            if (path === "/order-requests" && request.method === "POST") {
                return await createOrderRequest(request, env, ctx);
            }

            if (path === "/order-requests" && request.method === "GET") {
                return await listOrderRequests(request, env);
            }

            const paymentLinkMatch = path.match(/^\/order-requests\/([^/]+)\/payment-link$/);
            if (paymentLinkMatch && request.method === "POST") {
                return await createOrderPaymentLink(request, env, decodeURIComponent(paymentLinkMatch[1]));
            }

            const statusMatch = path.match(/^\/order-requests\/([^/]+)\/status$/);
            if (statusMatch && request.method === "PATCH") {
                return await updateOrderRequestStatus(request, env, decodeURIComponent(statusMatch[1]));
            }

            return textResponse("Not Found", 404, request);
        } catch (error) {
            return jsonResponse({ success: false, error: error.message }, 500, request);
        }
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(syncInstagramMedia(env, ctx).catch(error => {
            console.error(JSON.stringify({ event: "instagram_sync_failed", message: error.message }));
            return recordInstagramSyncFailure(env, error, ctx);
        }));
    }
};
