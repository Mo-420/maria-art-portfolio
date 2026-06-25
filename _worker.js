const ADMIN_REALM = "Maryilu Admin";
const SITE_SETTINGS_KEY = "site-settings";
const ALLOWED_API_ORIGINS = new Set([
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

function noStoreHeaders(extra = {}) {
    return {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        ...extra
    };
}

function adminPassword(env) {
    return String(env?.ADMIN_PAGE_PASSWORD || "").trim();
}

function adminUser(env) {
    return String(env?.ADMIN_PAGE_USER || "maryilu").trim() || "maryilu";
}

function boolEnv(value) {
    return String(value || "").trim().toLowerCase() === "true";
}

function cleanString(value, maxLength = 1400) {
    return String(value || "").trim().slice(0, maxLength);
}

function apiCorsHeaders(request) {
    const origin = request?.headers?.get("Origin") || "";
    const allowedOrigin = ALLOWED_API_ORIGINS.has(origin) ? origin : "https://maryilu.com";

    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Cache-Control",
        "Vary": "Origin"
    };
}

function apiJsonResponse(data, status = 200, request) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...apiCorsHeaders(request),
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    });
}

function apiTextResponse(message, status = 200, request) {
    return new Response(message, {
        status,
        headers: apiCorsHeaders(request)
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

function isApiAuthorized(request, env) {
    if (!env?.ADMIN_TOKEN) return false;
    const header = request.headers.get("Authorization") || "";
    return timingSafeEqual(header, `Bearer ${env.ADMIN_TOKEN}`);
}

function requireApiAdmin(request, env) {
    if (!env?.ADMIN_TOKEN) {
        return apiJsonResponse({ error: "ADMIN_TOKEN is not configured for protected access." }, 503, request);
    }
    if (!isApiAuthorized(request, env)) {
        return apiJsonResponse({ error: "Unauthorized" }, 401, request);
    }
    return null;
}

function hasDataStore(env) {
    return Boolean(env?.ART_DATA && typeof env.ART_DATA.get === "function" && typeof env.ART_DATA.put === "function");
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedInteger(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
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

async function getJson(env, key, fallback) {
    if (!hasDataStore(env)) return fallback;
    const raw = await env.ART_DATA.get(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
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
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: apiCorsHeaders(request) });
    }

    if (request.method === "GET") {
        return apiJsonResponse(await getSiteSettings(env), 200, request);
    }

    if (request.method === "PUT") {
        const authError = requireApiAdmin(request, env);
        if (authError) return authError;

        if (!hasDataStore(env)) {
            return apiJsonResponse({ success: false, error: "ART_DATA KV storage is not configured." }, 503, request);
        }

        const body = await request.json().catch(() => null);
        if (!isPlainObject(body)) {
            return apiJsonResponse({ success: false, error: "Site settings must be a JSON object." }, 400, request);
        }

        const settings = normalizeSiteSettings(body, { updatedAt: new Date().toISOString() });
        await env.ART_DATA.put(SITE_SETTINGS_KEY, JSON.stringify(settings));
        return apiJsonResponse({ success: true, settings }, 200, request);
    }

    return apiTextResponse("Method Not Allowed", 405, request);
}

function isLocalHost(hostname) {
    return ["localhost", "127.0.0.1", "::1"].includes(String(hostname || "").toLowerCase());
}

function isExternalAdminAccessManaged(env) {
    return boolEnv(env?.ADMIN_PAGE_ACCESS_MANAGED);
}

function decodeBasicAuthorization(header) {
    const match = String(header || "").match(/^Basic\s+(.+)$/i);
    if (!match) return null;
    try {
        const decoded = atob(match[1]);
        const separator = decoded.indexOf(":");
        if (separator === -1) return null;
        return {
            user: decoded.slice(0, separator),
            password: decoded.slice(separator + 1)
        };
    } catch {
        return null;
    }
}

function isAdminPageAuthorized(request, env) {
    const password = adminPassword(env);
    if (!password) return isLocalHost(new URL(request.url).hostname) || isExternalAdminAccessManaged(env);
    const credentials = decodeBasicAuthorization(request.headers.get("Authorization"));
    return Boolean(credentials && credentials.user === adminUser(env) && credentials.password === password);
}

function adminProtectionMissingResponse() {
    return new Response("Admin page protection is not configured.", {
        status: 403,
        headers: noStoreHeaders({
            "Content-Type": "text/plain; charset=utf-8"
        })
    });
}

function adminUnauthorizedResponse(env) {
    return new Response("Admin login required", {
        status: 401,
        headers: noStoreHeaders({
            "Content-Type": "text/plain; charset=utf-8",
            "WWW-Authenticate": `Basic realm="${ADMIN_REALM}", charset="UTF-8"`
        })
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const host = url.hostname.toLowerCase();
        const path = url.pathname.toLowerCase();
        const isPortfolioHost = host === "portfolio.maryilu.com";
        const isMainHost = host === "maryilu.com" || host === "www.maryilu.com";

        if (path === "/site-settings") {
            return await handleSiteSettings(request, env);
        }

        const blockedExactPaths = new Set([
            "/cloudflare-worker.js",
            "/wrangler.toml",
            "/package.json",
            "/package-lock.json",
            "/readme.md",
            "/setup-backend.md",
            "/github-deploy.md",
            "/build-public.sh",
            "/start-local.sh",
            "/capacitor.config.json",
            "/art-site_admin.apk",
            "/maria-art-admin.apk",
            "/maria-art-admin.apk.cpgz",
            "/_worker.js"
        ]);
        const blockedPrefixes = [
            "/.git/",
            "/android/",
            "/node_modules/",
            "/admin-build/"
        ];

        if (blockedExactPaths.has(path) || blockedPrefixes.some(prefix => path.startsWith(prefix))) {
            return new Response("Not found", {
                status: 404,
                headers: noStoreHeaders()
            });
        }

        const isAdminPath = path === "/admin.html" || path === "/admin" || path === "/admin/";
        if (isAdminPath) {
            if (!adminPassword(env) && !isLocalHost(url.hostname) && !isExternalAdminAccessManaged(env)) {
                return adminProtectionMissingResponse();
            }
            if (!isAdminPageAuthorized(request, env)) {
                return adminUnauthorizedResponse(env);
            }
            url.pathname = "/admin.html";
            return env.ASSETS.fetch(new Request(url, request));
        }

        const portfolioRedirectReady = env?.PORTFOLIO_REDIRECT_READY === "true";
        if (isMainHost && url.pathname === "/portfolio.html" && portfolioRedirectReady) {
            return Response.redirect("https://portfolio.maryilu.com/", 301);
        }

        if (isPortfolioHost) {
            const allowedPortfolioPaths = new Set([
                "/",
                "/index.html",
                "/portfolio",
                "/portfolio.html",
                "/portfolio.css",
                "/portfolio.js",
                "/site-data.js",
                "/data-api.js",
                "/manifest.json",
                "/heart-icon.png",
                "/robots.txt",
                "/sitemap.xml"
            ]);
            const isPortfolioAsset = url.pathname.startsWith("/assets/") || url.pathname.startsWith("/images/");

            if (!allowedPortfolioPaths.has(url.pathname) && !isPortfolioAsset) {
                return Response.redirect(`https://maryilu.com${url.pathname}`, 302);
            }

            if (url.pathname === "/" || url.pathname === "/index.html") {
                url.pathname = "/portfolio";
                return env.ASSETS.fetch(new Request(url, request));
            }

            if (url.pathname === "/portfolio.html" && portfolioRedirectReady) {
                return Response.redirect("https://portfolio.maryilu.com/", 301);
            }
        }

        return env.ASSETS.fetch(request);
    }
};
