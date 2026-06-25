(function () {
    const DATA = window.MARYILU_DATA;
    function createDataAPI() {
        const ApiConstructor = window.DataAPI || (typeof DataAPI === "function" ? DataAPI : null);
        if (typeof ApiConstructor === "function") {
            try {
                return new ApiConstructor();
            } catch (error) {
                console.warn("Data API could not initialize:", error);
            }
        }
        const unavailable = () => Promise.reject(new Error("Store API unavailable"));
        return {
            checkoutArtwork: unavailable,
            getPublicAutomationStatus: () => Promise.resolve(null),
            getSiteSettings: () => Promise.resolve(null),
            getShopItems: () => Promise.resolve([]),
            getInstagramMedia: () => Promise.resolve([]),
            getArtworks: () => Promise.resolve([]),
            submitOrderRequest: unavailable
        };
    }

    const dataAPI = createDataAPI();
    const state = {
        lang: localStorage.getItem("maryiluLanguage") || "en",
        shopFilter: "available",
        shopItems: [],
        instagramItems: [],
        publicAutomationStatus: null,
        siteSettings: null,
        scrollContext: null,
        scrollRefreshTimer: null
    };

    const categoryToFormValue = {
        canvases: "Custom Canvas",
        flowers: "Handmade Flower Bouquet",
        "gift-boxes": "Custom Gift Box / Chest",
        "custom-gifts": "Custom Gift Box / Chest",
        "baby-shower": "Baby Shower Gift",
        "original-art": "Custom Canvas",
        "studio-post": "I’m not sure yet"
    };

    function valueOf(value) {
        if (value == null) return "";
        if (typeof value === "string" || typeof value === "number") return String(value);
        return value[state.lang] || value.en || Object.values(value)[0] || "";
    }

    function copy(key) {
        return DATA.copy[state.lang][key] || DATA.copy.en[key] || "";
    }

    function localizeInlineCopy() {
        document.querySelectorAll("[data-copy-en]").forEach((node) => {
            const localized = state.lang === "es" ? node.dataset.copyEs : node.dataset.copyEn;
            if (localized) node.textContent = localized;
        });
    }

    function isPlainObject(value) {
        return Boolean(value && typeof value === "object" && !Array.isArray(value));
    }

    function mergePlainObjects(base, updates) {
        const output = { ...(isPlainObject(base) ? base : {}) };
        if (!isPlainObject(updates)) return output;
        Object.entries(updates).forEach(([key, value]) => {
            output[key] = isPlainObject(output[key]) && isPlainObject(value)
                ? mergePlainObjects(output[key], value)
                : value;
        });
        return output;
    }

    function applySiteSettings(settings) {
        if (!isPlainObject(settings)) return;
        state.siteSettings = settings;

        if (isPlainObject(settings.copy)) {
            DATA.copy = mergePlainObjects(DATA.copy, settings.copy);
        }

        const instagramHref = settings.social?.instagram?.href || settings.social?.instagramUrl || settings.urls?.instagram;
        const instagramHandle = settings.social?.instagram?.handle || settings.social?.instagramHandle;
        if (instagramHref || instagramHandle) {
            const current = DATA.socialLinks.find((link) => link.id === "instagram");
            if (current) {
                if (instagramHref) current.href = instagramHref;
                if (instagramHandle) {
                    current.handle = instagramHandle;
                    current.tag = { en: instagramHandle, es: instagramHandle };
                }
            }
            document.querySelectorAll('a[href*="instagram.com"]').forEach((link) => {
                if (instagramHref) link.setAttribute("href", instagramHref);
            });
        }

        const langCopy = settings.copy?.[state.lang] || settings.copy?.en || {};
        if (langCopy.metaTitle) {
            document.title = langCopy.metaTitle;
            document.querySelector('meta[property="og:title"]')?.setAttribute("content", langCopy.metaTitle);
            document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", langCopy.metaTitle);
        }
        if (langCopy.metaDescription) {
            document.querySelector('meta[name="description"]')?.setAttribute("content", langCopy.metaDescription);
            document.querySelector('meta[property="og:description"]')?.setAttribute("content", langCopy.metaDescription);
            document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", langCopy.metaDescription);
        }

        if (settings.cta?.primaryHref) {
            document.querySelectorAll("[data-commerce-primary]").forEach((link) => {
                link.setAttribute("href", settings.cta.primaryHref);
            });
        }
        if (settings.cta?.secondaryHref) {
            document.querySelectorAll("[data-commerce-secondary]").forEach((link) => {
                link.setAttribute("href", settings.cta.secondaryHref);
            });
        }

        renderStoreAssetSlots();
    }

    async function loadSiteSettings() {
        try {
            const settings = await dataAPI.getSiteSettings();
            applySiteSettings(settings);
        } catch (error) {
            console.warn("Site settings unavailable:", error);
        }
    }

    function escapeHTML(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function normalizeStoreCategoryId(category) {
        if (category === "custom-gifts") return "gift-boxes";
        if (category === "original-art" || category === "studio-post") return "canvases";
        return category || "gift-boxes";
    }

    function categoryPlaceholderLabel(category) {
        const labels = {
            "gift-boxes": "Photo placeholder: Painted chest",
            flowers: "Photo placeholder: Ribbon bouquet",
            canvases: "Photo placeholder: Custom canvas",
            "baby-shower": "Photo placeholder: Baby gift"
        };
        return labels[normalizeStoreCategoryId(category)] || "Photo placeholder: Maryilu artwork";
    }

    function cleanMediaUrl(value) {
        const url = String(value || "").trim();
        const oldGeneratedPlaceholders = [
            "assets/maryilu-luxury-chest-hero.png",
            "assets/maryilu-editorial-store-hero.png",
            "assets/maria-luisa-portfolio-studio.png"
        ];
        return oldGeneratedPlaceholders.includes(url) ? "" : url;
    }

    function normalizeAssetSlot(slot, fallbackLabel, fallbackAlt = "") {
        if (typeof slot === "string") {
            return {
                mediaUrl: cleanMediaUrl(slot),
                alt: fallbackAlt,
                placeholderLabel: fallbackLabel
            };
        }
        if (!isPlainObject(slot)) {
            return {
                mediaUrl: "",
                alt: fallbackAlt,
                placeholderLabel: fallbackLabel
            };
        }
        return {
            mediaUrl: cleanMediaUrl(slot.mediaUrl || slot.url || slot.src),
            alt: String(slot.alt || fallbackAlt || "").trim(),
            placeholderLabel: String(slot.placeholderLabel || fallbackLabel || "Photo placeholder").trim()
        };
    }

    function storeAssets() {
        const assets = state.siteSettings?.assets || {};
        const storeHero = normalizeAssetSlot(
            assets.storeHero,
            "Photo placeholder: Hero product",
            "Maryilu handmade gift preview"
        );
        if (!storeHero.mediaUrl && assets.heroImage) {
            storeHero.mediaUrl = cleanMediaUrl(assets.heroImage);
        }

        const about = normalizeAssetSlot(
            assets.about,
            "Photo placeholder: Maria in the studio",
            "Maria Luisa in the Maryilu studio"
        );
        if (!about.mediaUrl && assets.portfolioImage) {
            about.mediaUrl = cleanMediaUrl(assets.portfolioImage);
        }

        const flowers = normalizeAssetSlot(assets.categories?.flowers, categoryPlaceholderLabel("flowers"), "Handmade ribbon bouquet");
        if (!flowers.mediaUrl && assets.editorialImage) {
            flowers.mediaUrl = cleanMediaUrl(assets.editorialImage);
        }

        const canvases = normalizeAssetSlot(assets.categories?.canvases, categoryPlaceholderLabel("canvases"), "Custom Maryilu canvas");
        if (!canvases.mediaUrl && assets.portfolioImage) {
            canvases.mediaUrl = cleanMediaUrl(assets.portfolioImage);
        }

        return {
            storeHero,
            about,
            categories: {
                "gift-boxes": normalizeAssetSlot(assets.categories?.["gift-boxes"], categoryPlaceholderLabel("gift-boxes"), "Painted Maryilu chest"),
                flowers,
                canvases,
                "baby-shower": normalizeAssetSlot(assets.categories?.["baby-shower"], categoryPlaceholderLabel("baby-shower"), "Baby shower gift")
            }
        };
    }

    function placeholderMarkup(label, extraClass = "") {
        return `<div class="warm-placeholder ${escapeHTML(extraClass)}">${escapeHTML(label || "Photo placeholder")}</div>`;
    }

    function imageSlotMarkup(slot, fallbackLabel, extraClass = "") {
        const normalized = normalizeAssetSlot(slot, fallbackLabel);
        if (normalized.mediaUrl) {
            return `<img src="${escapeHTML(normalized.mediaUrl)}" alt="${escapeHTML(normalized.alt || normalized.placeholderLabel || fallbackLabel)}" loading="lazy" decoding="async" sizes="(max-width: 700px) 100vw, 50vw">`;
        }
        return placeholderMarkup(normalized.placeholderLabel || fallbackLabel, extraClass);
    }

    function renderStoreAssetSlots() {
        const assets = storeAssets();
        const heroSlot = document.getElementById("heroVisualSlot");
        if (heroSlot) heroSlot.innerHTML = imageSlotMarkup(assets.storeHero, "Photo placeholder: Hero product", "hero-placeholder");

        const aboutSlot = document.getElementById("aboutVisualSlot");
        if (aboutSlot) aboutSlot.innerHTML = imageSlotMarkup(assets.about, "Photo placeholder: Maria in the studio", "about-placeholder");

        document.querySelectorAll("[data-category-slot]").forEach((slot) => {
            const category = normalizeStoreCategoryId(slot.dataset.categorySlot);
            slot.innerHTML = imageSlotMarkup(assets.categories[category], categoryPlaceholderLabel(category), "category-placeholder");
        });
    }

    function formatMoney(cents, currency = "eur") {
        if (!cents) return "";
        return new Intl.NumberFormat(state.lang === "es" ? "es-ES" : "en", {
            style: "currency",
            currency: String(currency || "eur").toUpperCase()
        }).format(Number(cents) / 100);
    }

    function localizedPriceGuide(value) {
        const text = valueOf(value);
        if (state.lang !== "es") return text;
        return text
            .replace(/^from\s+/i, "desde ")
            .replace(/^on request$/i, "bajo pedido")
            .replace(/^custom quote$/i, "presupuesto personalizado");
    }

    function normalizeCategory(category) {
        const raw = String(category || "").toLowerCase();
        if (raw.includes("original") || raw.includes("canvas") || raw.includes("painting") || raw.includes("lienzo")) return "original-art";
        if (raw.includes("flower") || raw.includes("bouquet") || raw.includes("flor") || raw.includes("ramo")) return "flowers";
        if (raw.includes("baby") || raw.includes("diaper") || raw.includes("panal")) return "baby-shower";
        if (raw.includes("box") || raw.includes("chest") || raw.includes("gift") || raw.includes("caja") || raw.includes("cofre")) return "custom-gifts";
        return "studio-post";
    }

    function categoryMeta(categoryId) {
        if (categoryId === "original-art") {
            return {
                publicCategory: { en: "Original artwork", es: "Obra original" },
                shortName: { en: "Original Art", es: "Arte original" },
                priceFrom: "from €90",
                summary: { en: "One-of-one artwork from Maria’s studio.", es: "Obra unica del estudio de Maria." }
            };
        }
        if (categoryId === "custom-gifts") {
            return DATA.categoryMeta.find((category) => category.id === "gift-boxes") || DATA.categoryMeta[0];
        }
        return DATA.categoryMeta.find((category) => category.id === categoryId) || {
            publicCategory: { en: "Studio post", es: "Post de estudio" },
            shortName: { en: "Studio", es: "Estudio" },
            summary: { en: "Studio preview.", es: "Vista previa del estudio." }
        };
    }

    function titleFromCaption(caption) {
        const firstLine = String(caption || "").split(/\r?\n/).map(line => line.trim()).find(Boolean) || "";
        return firstLine.length > 78 ? `${firstLine.slice(0, 75)}...` : firstLine;
    }

    function cleanCaptionForStore(caption) {
        return String(caption || "")
            .replace(/https?:\/\/\S+/gi, "")
            .replace(/#\w+/g, "")
            .replace(/\b(?:dm|message)\s+(?:for|to)\b.*$/i, "")
            .replace(/\b(?:mallorca pickup|shipping by quote|custom colors possible)\b.*$/i, "")
            .replace(/[€$£]\s?\d+(?:[.,]\d{1,2})?/gi, "")
            .replace(/\s{2,}/g, " ")
            .trim();
    }

    function titleLooksLikeCaption(title) {
        const text = String(title || "");
        return text.length > 58 || /[#€$£]|\.| dm | message | shipping | pickup/i.test(text);
    }

    function sentenceCaseTitle(title) {
        const text = String(title || "").trim();
        return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
    }

    function displayTitleForShopItem(item) {
        const title = valueOf(item.title);
        if (item.sourcePlatform !== "instagram" && !titleLooksLikeCaption(title)) return title;
        const cleaned = cleanCaptionForStore(title || item.caption)
            .split(/[.!?]/)
            .map(part => part.trim())
            .find(Boolean);
        const simplified = String(cleaned || "")
            .replace(/^(?:available|new|fresh|studio process for|process for|custom)\s+(?:a|an|the)?\s*/i, "")
            .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "")
            .trim();
        const fallback = {
            flowers: { en: "Ribbon color study", es: "Estudio de color con cinta" },
            "custom-gifts": { en: "Hand-painted keepsake chest", es: "Cofre recuerdo pintado a mano" },
            "original-art": { en: "Custom canvas story piece", es: "Lienzo personalizado con historia" },
            "baby-shower": { en: "Custom baby shower gift", es: "Regalo personalizado baby shower" },
            "studio-post": { en: "Fresh studio piece", es: "Pieza reciente del estudio" }
        };
        return sentenceCaseTitle(simplified || valueOf(fallback[item.category] || fallback["studio-post"]));
    }

    function displayDescriptionForShopItem(item, meta) {
        const caption = cleanCaptionForStore(valueOf(item.caption));
        if (!caption || caption === valueOf(item.title) || titleLooksLikeCaption(caption)) {
            return valueOf(meta.summary);
        }
        return caption.length > 150 ? `${caption.slice(0, 147)}...` : caption;
    }

    function displayCaptionForSocialItem(item, title, isPreview) {
        const raw = item.caption || title;
        if (!isPreview) return raw;
        const cleaned = cleanCaptionForStore(raw)
            .replace(/^(?:available|sold|reserved)\s+/i, "")
            .replace(/\s*,\s*\./g, ".")
            .replace(/,\s*$/g, "")
            .replace(/\s+\./g, ".")
            .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "")
            .trim();
        return sentenceCaseTitle(cleaned || title);
    }

    function sourceProofLabel(item) {
        if (isSimulatedInstagramItem(item)) return copy("socialPreviewLabel");
        if (item.sourcePlatform === "instagram") return copy("shopProofInstagram");
        return copy("shopProofCurated");
    }

    function isSimulatedInstagramItem(item) {
        if (item?.fallbackSocial) return false;
        const values = [
            item?.id,
            item?.sourcePostId,
            item?.permalink,
            item?.caption
        ].map((value) => String(value || "").toLowerCase());
        const explicitPreview = item?.simulated
            || values.some((value) => value.includes("sim_maryilu") || value.includes("/sim_") || value.includes("sim-"));
        const looksInstagramBacked = item?.sourcePlatform === "instagram"
            || Boolean(item?.sourcePostId)
            || values.some((value) => value.includes("instagram.com"));
        return Boolean(
            explicitPreview
            || (state.publicAutomationStatus?.instagram?.simulated && looksInstagramBacked)
        );
    }

    function normalizeShopItem(item) {
        const category = normalizeCategory(item.category || item.caption || item.title);
        const image = cleanMediaUrl(item.mediaUrl || item.thumbnailUrl || item.imageUrl || item.image || (Array.isArray(item.images) ? item.images[0] : ""));
        const title = item.title || titleFromCaption(item.caption) || valueOf(categoryMeta(category).publicCategory);
        const status = item.status || (item.priceCents ? "available" : "inquiry");
        return {
            id: item.id || item.sourcePostId || `${category}-${title}`,
            sourcePlatform: item.sourcePlatform || "",
            sourcePostId: item.sourcePostId || "",
            category,
            title,
            caption: item.caption || item.description || valueOf(categoryMeta(category).summary),
            image,
            permalink: item.permalink || "",
            simulated: Boolean(item.simulated),
            priceCents: item.priceCents || null,
            currency: item.currency || "eur",
            status,
            hidden: Boolean(item.hidden)
        };
    }

    function normalizeInstagramPost(item) {
        const category = normalizeCategory(`${item.caption || ""} ${item.mediaType || ""}`);
        return {
            id: item.id || item.permalink || `instagram-${Date.now()}`,
            category,
            sourcePlatform: "instagram",
            sourcePostId: item.id || "",
            title: titleFromCaption(item.caption) || valueOf(categoryMeta(category).publicCategory),
            caption: item.caption || valueOf(categoryMeta(category).summary),
            image: cleanMediaUrl(item.mediaUrl || item.thumbnailUrl),
            permalink: item.permalink || "",
            simulated: Boolean(item.simulated),
            status: "social"
        };
    }

    function fallbackShopItems() {
        return DATA.galleryPlaceholders.map((item, index) => ({
            id: `fallback-${index}`,
            category: normalizeCategory(item.category || item.title),
            title: valueOf(item.title),
            caption: valueOf(item.caption),
            image: "",
            permalink: "",
            priceCents: null,
            currency: "eur",
            status: "inquiry"
        }));
    }

    function instagramProfileUrl() {
        const instagram = DATA.socialLinks.find((link) => link.id === "instagram" && link.href);
        return instagram?.href || "https://www.instagram.com/marialuisas_arttt/";
    }

    function setStatusMessage(status, message, withInstagramAction = false) {
        if (!status) return;
        status.textContent = "";
        if (!message) return;

        const text = document.createElement("span");
        text.textContent = message;
        status.appendChild(text);

        if (withInstagramAction) {
            const link = document.createElement("a");
            link.className = "status-action";
            link.href = instagramProfileUrl();
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = copy("instagramCta");
            status.appendChild(link);
        }
    }

    function fallbackSocialItems() {
        return fallbackShopItems().slice(0, 3).map((item, index) => ({
            ...item,
            id: `social-fallback-${index}`,
            fallbackSocial: true,
            permalink: instagramProfileUrl()
        }));
    }

    function fallbackVisualForCategory() {
        return "";
    }

    function portfolioHref() {
        const host = window.location.hostname;
        if (host === "portfolio.maryilu.com") return "/";
        if (host === "maryilu.com" || host === "www.maryilu.com") return "/portfolio.html";
        return "/portfolio.html";
    }

    function updatePortfolioLinks() {
        document.querySelectorAll("[data-portfolio-link]").forEach((link) => {
            link.setAttribute("href", portfolioHref());
        });
    }

    function bindSpotlightInteraction() {
        const selector = [
            ".gallery-proof-card",
            ".collector-proof-card",
            ".commerce-os-card",
            ".trust-system-card",
            ".custom-order-card",
            ".mallorca-proof-card",
            ".price-card",
            ".process-card",
            ".addons-panel",
            ".trust-card",
            ".trust-bento-card",
            ".order-form",
            ".instagram-card",
            ".shipping-card",
            ".faq-panel",
            ".studio-signal",
            ".store-signal-panel",
            ".store-signal-steps article",
            ".assurance-grid article",
            ".automation-flow-card",
            ".automation-live-metric",
            ".hero-art-image",
            ".hero-live-hud",
            ".hero-live-hud article"
        ].join(",");

        document.addEventListener("pointermove", (event) => {
            const card = event.target.closest(selector);
            if (!card) return;
            const rect = card.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            card.style.setProperty("--spot-x", `${Math.max(0, Math.min(100, x)).toFixed(2)}%`);
            card.style.setProperty("--spot-y", `${Math.max(0, Math.min(100, y)).toFixed(2)}%`);
        });
    }

    function setLanguage(lang) {
        state.lang = lang === "es" ? "es" : "en";
        localStorage.setItem("maryiluLanguage", state.lang);
        document.documentElement.lang = copy("htmlLang");
        document.title = copy("metaTitle");
        const description = document.querySelector('meta[name="description"]');
        if (description) description.setAttribute("content", copy("metaDescription"));

        document.querySelectorAll("[data-i18n]").forEach((node) => {
            const key = node.getAttribute("data-i18n");
            node.textContent = copy(key);
        });
        localizeInlineCopy();

        document.querySelectorAll(".lang-btn").forEach((button) => {
            const active = button.dataset.lang === state.lang;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        const preferredLanguage = document.getElementById("preferredLanguage");
        if (preferredLanguage) preferredLanguage.value = state.lang === "es" ? "Spanish" : "English";

        renderAll();
    }

    function renderAll() {
        renderCategoryCards();
        renderStoreAssetSlots();
        renderShopFilters();
        renderShop();
        renderInstagramRail();
        renderHowSteps();
        renderProductTables();
        renderAddOns();
        renderShipping();
        renderFAQ();
        renderSocialLinks();
        renderFormOptions();
        renderHeroTrust();
        renderHeroLiveHud();
        renderCommerceTone();
        renderAutomationPanel();
        updatePortfolioLinks();
    }

    function hashTarget(hash = window.location.hash) {
        if (!hash || hash === "#") return null;
        const id = decodeURIComponent(hash.slice(1));
        const byId = id ? document.getElementById(id) : null;
        if (byId) return byId;
        try {
            return document.querySelector(hash);
        } catch (error) {
            return null;
        }
    }

    function scrollToAnchorTarget(target, behavior = "smooth") {
        if (!target) return;
        const header = document.querySelector(".sales-header");
        const headerHeight = header?.getBoundingClientRect().height || 0;
        const scrollMargin = Number.parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;
        const targetTop = target.getBoundingClientRect().top + window.scrollY;
        const cleanLandingNudges = {
            shop: 108,
            order: 108,
            "social-proof": 108,
            about: 108
        };
        const desktopCleanLanding = window.matchMedia("(min-width: 861px)").matches;
        const landingNudge = desktopCleanLanding ? (cleanLandingNudges[target.id] || 0) : 0;
        const top = Math.max(0, targetTop - Math.max(headerHeight + 16, scrollMargin) + landingNudge);
        const scrollBehavior = behavior === "smooth" ? "auto" : behavior;
        window.scrollTo({ top, behavior: scrollBehavior });
    }

    function alignHashTarget(behavior = "auto") {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scrollToAnchorTarget(hashTarget(), behavior);
            });
        });
        [260, 900, 1600].forEach((delay) => {
            window.setTimeout(() => scrollToAnchorTarget(hashTarget(), behavior), delay);
        });
    }

    function hasInstagramBackedContent() {
        return Boolean(state.instagramItems.length || state.shopItems.some((item) => item.sourcePlatform === "instagram" || item.permalink));
    }

    function hasLiveInstagramProof() {
        const publicStatus = state.publicAutomationStatus;
        if (publicStatus?.instagram?.simulated || publicStatus?.automation?.proofSource === "local-preview") {
            return false;
        }
        if (publicStatus?.instagram?.ready && publicStatus?.instagram?.hasLiveProof) {
            return true;
        }
        const publicItems = [
            ...state.instagramItems,
            ...state.shopItems
        ];
        return publicItems.some((item) => (
            !item?.fallbackSocial
            && !isSimulatedInstagramItem(item)
            && (item?.sourcePlatform === "instagram" || Boolean(item?.sourcePostId) || String(item?.permalink || "").includes("instagram.com"))
        ));
    }

    function directCheckoutPublicActive() {
        return Boolean(state.publicAutomationStatus?.success && state.publicAutomationStatus?.automation?.directCheckoutActive);
    }

    function shopSignalSummary() {
        const availableCount = availableCheckoutItems().length;
        const requestableCount = customInquiryItems().length;
        const publicStatus = state.publicAutomationStatus;
        const instagramReady = Boolean(publicStatus?.instagram?.ready);
        const instagramSimulated = Boolean(publicStatus?.instagram?.simulated || publicStatus?.instagram?.hasPreviewProof || publicStatus?.automation?.proofSource === "local-preview");
        const instagramBacked = hasInstagramBackedContent() || Boolean(publicStatus?.instagram?.hasLiveProof || publicStatus?.instagram?.hasPreviewProof);
        const sourceText = instagramBacked
            ? (instagramSimulated
                ? copy("engineSourceInstagramPreview")
                : (instagramReady ? copy("engineSourceInstagram") : copy("engineSourceInstagramPending")))
            : copy("engineSourceManual");
        const agentText = instagramSimulated
            ? copy("engineAgentSimulated")
            : (instagramReady && instagramBacked
                ? copy("engineAgentLive")
                : (publicStatus?.success ? copy("engineAgentPending") : copy("engineAgentPreview")));
        const footerText = instagramSimulated
            ? copy("engineFooterSimulated")
            : (instagramBacked
            ? copy("engineFooterLive")
            : copy("engineFooter"));

        return {
            availableCount,
            requestableCount,
            sourceText,
            agentText,
            footerText,
            directCheckoutActive: Boolean(publicStatus?.automation?.directCheckoutActive)
        };
    }

    function countCopy(key, count) {
        return copy(key).replace("{count}", String(count));
    }

    function renderHeroTrust() {
        const container = document.getElementById("heroTrustStrip");
        if (!container) return;

        const availableCount = availableCheckoutItems().length;
        const customCount = customInquiryItems().length;
        const secondSignal = availableCount
            ? countCopy("heroTrustDirect", availableCount)
            : (customCount ? countCopy("heroTrustCustom", customCount) : copy("heroTrustQuote"));
        const thirdSignal = hasInstagramBackedContent()
            ? copy("heroTrustInstagram")
            : copy("heroTrustManual");

        const items = [
            ["01", copy("heroTrustStudio")],
            ["02", secondSignal],
            ["03", thirdSignal]
        ];

        container.innerHTML = items.map(([number, label]) => `
            <span><strong>${escapeHTML(number)}</strong> ${escapeHTML(label)}</span>
        `).join("");
    }

    function renderHeroLiveHud() {
        const container = document.getElementById("heroLiveHud");
        if (!container) return;

        const signal = shopSignalSummary();
        const shopLabel = signal.availableCount ? copy("engineAvailableLabel") : copy("engineCustomLabel");
        const shopValue = signal.availableCount
            ? countCopy("engineAvailableValue", signal.availableCount)
            : (signal.requestableCount ? countCopy("engineCustomValue", signal.requestableCount) : copy("heroHudCustomReady"));
        const checkoutValue = signal.directCheckoutActive ? copy("engineGuardValue") : copy("shopRequestLed");

        const labels = {
            shopMode: shopLabel,
            proofSource: copy("engineSourceLabel"),
            checkoutGuard: copy("engineGuardLabel")
        };
        const values = {
            shopMode: shopValue,
            proofSource: signal.sourceText,
            checkoutGuard: checkoutValue
        };

        Object.entries(labels).forEach(([key, value]) => {
            const node = container.querySelector(`[data-hero-hud-label="${key}"]`);
            if (node) node.textContent = value;
        });
        Object.entries(values).forEach(([key, value]) => {
            const node = container.querySelector(`[data-hero-hud-value="${key}"]`);
            if (node) node.textContent = value;
        });
        container.dataset.mode = signal.directCheckoutActive ? "checkout" : "request";
    }

    function renderCommerceTone() {
        const hasBuyable = availableCheckoutItems().length > 0;
        const liveInstagramProof = hasLiveInstagramProof();
        const setAdaptiveCopy = (key, previewKey, liveKey) => {
            document.querySelectorAll(`[data-i18n="${key}"]`).forEach((node) => {
                node.textContent = copy(liveInstagramProof ? liveKey : previewKey);
            });
        };

        document.querySelectorAll("[data-commerce-primary]").forEach((link) => {
            link.textContent = copy(hasBuyable ? "heroPrimaryAvailable" : "heroPrimaryShopPreview");
            link.setAttribute("href", "#shop");
        });
        document.querySelectorAll("[data-commerce-secondary]").forEach((link) => {
            link.textContent = copy("heroSecondary");
            link.setAttribute("href", "#order");
        });
        document.querySelectorAll("[data-commerce-shop-text]").forEach((node) => {
            node.textContent = copy(hasBuyable ? "shopTextAvailable" : "shopTextCustom");
        });
        document.querySelectorAll("[data-commerce-shop-title]").forEach((node) => {
            node.textContent = copy(hasBuyable ? "shopTitleAvailable" : "shopTitleCustom");
        });
        document.querySelectorAll("[data-commerce-nav-shop]").forEach((node) => {
            node.textContent = copy(hasBuyable ? "navProductsAvailable" : "navProductsCustom");
        });

        setAdaptiveCopy("proofText", "proofText", "proofTextLive");
        setAdaptiveCopy("heroMicroOne", "heroMicroOne", "heroMicroOneLive");
        setAdaptiveCopy("proofStudioTitle", "proofStudioTitle", "proofStudioTitleLive");
        setAdaptiveCopy("proofStudioText", "proofStudioText", "proofStudioTextLive");
        setAdaptiveCopy("trustSystemText", "trustSystemText", "trustSystemTextLive");
        setAdaptiveCopy("trustSystemStatusLive", "trustSystemStatusLive", "trustSystemStatusLiveConnected");
        setAdaptiveCopy("trustSystemCardProofTitle", "trustSystemCardProofTitle", "trustSystemCardProofTitleLive");
        setAdaptiveCopy("trustSystemCardProofText", "trustSystemCardProofText", "trustSystemCardProofTextLive");
    }

    function renderCategoryCards() {
        const container = document.getElementById("categoryCards");
        if (!container) return;
        container.innerHTML = DATA.categoryMeta.map((category, index) => `
            <article class="product-category-card product-category-card-${escapeHTML(category.id)}">
                <div class="category-card-media" data-category-slot="${escapeHTML(category.id)}">
                    ${placeholderMarkup(categoryPlaceholderLabel(category.id), "category-placeholder")}
                </div>
                <div>
                    <p class="category-count">${String(index + 1).padStart(2, "0")}</p>
                    <h3>${escapeHTML(valueOf(category.publicCategory))}</h3>
                    <p>${escapeHTML(valueOf(category.summary))}</p>
                    <div class="category-card-footer">
                        <span>${escapeHTML(category.priceFrom)}</span>
                        <button type="button" class="text-action" data-order-category="${escapeHTML(category.id)}">${escapeHTML(copy("heroSecondary"))}</button>
                    </div>
                </div>
            </article>
        `).join("");

        container.querySelectorAll("[data-order-category]").forEach((button) => {
            button.addEventListener("click", () => {
                setOrderCategory(button.dataset.orderCategory);
                scrollToAnchorTarget(document.getElementById("order"), "smooth");
            });
        });
        renderStoreAssetSlots();
    }

    function renderShopFilters() {
        const container = document.getElementById("shopFilters");
        if (!container) return;
        const hasBuyable = availableCheckoutItems().length > 0;
        const hasSold = state.shopItems.some((item) => item.status === "sold");
        const filters = hasBuyable
            ? [
                { id: "available", label: copy("shopAvailable") },
                { id: "custom", label: copy("shopCustomOrders") }
            ]
            : [
                { id: "custom", label: copy("shopCustomOrders") }
            ];
        if (hasSold) {
            filters.push({ id: "sold", label: copy("shopSoldArchive") });
        }

        if (!filters.some((filter) => filter.id === state.shopFilter)) {
            state.shopFilter = filters[0].id;
        }

        if (filters.length <= 1) {
            container.innerHTML = "";
            container.hidden = true;
            return;
        }

        container.hidden = false;
        container.innerHTML = filters.map((filter) => `
            <button type="button" class="filter-btn ${state.shopFilter === filter.id ? "active" : ""}" data-shop-filter="${escapeHTML(filter.id)}" aria-pressed="${state.shopFilter === filter.id}">
                ${escapeHTML(filter.label)}
            </button>
        `).join("");

        container.querySelectorAll("[data-shop-filter]").forEach((button) => {
            button.addEventListener("click", () => {
                state.shopFilter = button.dataset.shopFilter;
                renderShopFilters();
                renderShop();
            });
        });
    }

    function availableCheckoutItems() {
        if (!directCheckoutPublicActive()) return [];
        return state.shopItems.filter((item) => item.status === "available" && item.priceCents);
    }

    function customInquiryItems() {
        return state.shopItems.filter((item) => !(item.status === "available" && item.priceCents) && item.status !== "sold");
    }

    function shopItemRank(item) {
        if (item.status === "available" && item.priceCents) return 4;
        if (item.sourcePlatform === "curated-preview") return 3;
        if (item.sourcePlatform === "instagram") return 2;
        return 1;
    }

    function shopItemIdentity(item) {
        const image = String(item.image || "").trim().toLowerCase();
        const title = displayTitleForShopItem(item).trim().toLowerCase();
        const category = String(item.category || "studio-post").trim().toLowerCase();
        const requestLed = !(item.status === "available" && item.priceCents);
        if (requestLed && image) return `${category}|${image}`;
        if (image && title) return `${title}|${image}`;
        if (image) return `${item.category || "studio-post"}|${image}`;
        return `${item.category || "studio-post"}|${title}`;
    }

    function dedupeShopItems(items) {
        const byIdentity = new Map();
        items.forEach((item) => {
            const key = shopItemIdentity(item);
            const current = byIdentity.get(key);
            if (!current || shopItemRank(item) > shopItemRank(current)) {
                byIdentity.set(key, item);
            }
        });
        return Array.from(byIdentity.values());
    }

    function socialItemIdentity(item) {
        const image = String(item.image || item.mediaUrl || "").trim().toLowerCase();
        const permalink = String(item.permalink || "").trim().toLowerCase();
        const sourcePostId = String(item.sourcePostId || item.id || "").trim().toLowerCase();
        const title = String(item.title || titleFromCaption(item.caption || "") || "").trim().toLowerCase();
        if (image) return `image|${image}`;
        if (permalink) return `link|${permalink}`;
        if (sourcePostId) return `post|${sourcePostId}`;
        return `title|${title}`;
    }

    function dedupeSocialItems(items) {
        const byIdentity = new Map();
        items.forEach((item) => {
            const key = socialItemIdentity(item);
            if (!byIdentity.has(key)) byIdentity.set(key, item);
        });
        return Array.from(byIdentity.values());
    }

    function chooseShopLandingFilter() {
        if (!availableCheckoutItems().length && customInquiryItems().length) {
            state.shopFilter = "custom";
            return;
        }
        state.shopFilter = "available";
    }

    function visibleShopItems() {
        if (state.shopFilter === "available") {
            return availableCheckoutItems();
        }
        if (state.shopFilter === "sold") {
            return state.shopItems.filter((item) => item.status === "sold");
        }
        return dedupeShopItems(customInquiryItems());
    }

    function canBuyShopItem(item) {
        return directCheckoutPublicActive() && item.status === "available" && Boolean(item.priceCents);
    }

    function statusLabel(item) {
        if (item.status === "sold") return copy("sold");
        if (item.status === "reserved") return copy("reserved");
        if (canBuyShopItem(item)) return copy("shopAvailable");
        return copy("inquiryOnly");
    }

    function renderShop() {
        const container = document.getElementById("shopGrid");
        const status = document.getElementById("shopStatus");
        if (!container) return;

        const items = visibleShopItems();
        setStatusMessage(status, "");
        if (!items.length) {
            const customButton = state.shopFilter === "available"
                ? `<button type="button" class="button button-secondary" data-shop-filter-jump="custom">${escapeHTML(copy("shopCustomOrders"))}</button>`
                : `<a class="button button-primary" href="#order">${escapeHTML(copy("customOrderCardCta"))}</a>`;
            container.innerHTML = `
                <div class="shop-empty">
                    <p>${escapeHTML(copy("shopEmpty"))}</p>
                    ${customButton}
                </div>
            `;
            container.querySelector("[data-shop-filter-jump]")?.addEventListener("click", () => {
                state.shopFilter = "custom";
                renderShopFilters();
                renderShop();
            });
            return;
        }

        container.innerHTML = items.map((item, index) => {
            const meta = categoryMeta(item.category);
            const title = displayTitleForShopItem(item);
            const caption = displayDescriptionForShopItem(item, meta);
            const image = item.image || fallbackVisualForCategory(item.category, index);
            const imageMarkup = image
                ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(title)}" loading="lazy" decoding="async" sizes="(max-width: 700px) 100vw, 42vw">`
                : placeholderMarkup(categoryPlaceholderLabel(item.category), "shop-placeholder");
            const priceGuide = localizedPriceGuide(meta.priceFrom);
            const priceMarkup = item.priceCents
                ? `<strong class="shop-price">${escapeHTML(formatMoney(item.priceCents, item.currency))}</strong>`
                : (priceGuide
                    ? `<strong class="shop-price shop-price-guide"><span>${escapeHTML(copy("shopPriceGuideLabel"))}:</span> ${escapeHTML(priceGuide)}</strong>`
                    : "");
            const canBuy = canBuyShopItem(item);
            const commerceNote = canBuy ? copy("shopDirectReady") : copy("shopRequestLed");

            return `
                <article class="gallery-proof-card shop-item-card shop-category-${escapeHTML(item.category)}" data-category="${escapeHTML(item.category)}" data-status="${escapeHTML(item.status)}">
                    <div class="gallery-media shop-card-media">
                        ${imageMarkup}
                        <span class="shop-chip shop-chip-light">${escapeHTML(statusLabel(item))}</span>
                    </div>
                    <div class="gallery-proof-content">
                        <p class="gallery-category">${escapeHTML(valueOf(meta.publicCategory))}</p>
                        <h3>${escapeHTML(title)}</h3>
                        <p>${escapeHTML(caption)}</p>
                        <div class="shop-card-proof">
                            <span>${escapeHTML(sourceProofLabel(item))}</span>
                            <span>${escapeHTML(commerceNote)}</span>
                        </div>
                        ${priceMarkup}
                        <div class="shop-card-actions">
                            ${canBuy ? `<button type="button" class="button button-primary" data-checkout-id="${escapeHTML(item.id)}">${escapeHTML(copy("buyWithStripe"))}</button>` : ""}
                            <button type="button" class="button button-secondary" data-similar-category="${escapeHTML(item.category)}" data-similar-title="${escapeHTML(title)}">${escapeHTML(copy("requestSimilar"))}</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        container.querySelectorAll("[data-checkout-id]").forEach((button) => {
            button.addEventListener("click", async () => {
                await startCheckout(button.dataset.checkoutId, button);
            });
        });

        container.querySelectorAll("[data-similar-category]").forEach((button) => {
            button.addEventListener("click", () => {
                setOrderCategory(button.dataset.similarCategory);
                const notes = document.querySelector('[name="notes"]');
                if (notes && !notes.value.trim()) {
                    notes.value = `${copy("requestSimilar")}: ${button.dataset.similarTitle}`;
                }
                scrollToAnchorTarget(document.getElementById("order"), "smooth");
            });
        });
    }

    async function startCheckout(itemId, button) {
        const status = document.getElementById("shopStatus");
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = copy("checkoutStarting");
        setStatusMessage(status, copy("checkoutStarting"));

        try {
            const result = await dataAPI.checkoutArtwork(itemId);
            if (!result || !result.success || !result.url) {
                throw new Error(result?.error || "Checkout failed");
            }
            window.location.href = result.url;
        } catch (error) {
            console.error("Checkout failed:", error);
            setStatusMessage(status, copy("checkoutError"), true);
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    function renderInstagramRail() {
        const container = document.getElementById("instagramRail");
        if (!container) return;
        const liveSource = state.instagramItems.length
            ? state.instagramItems
            : state.shopItems.filter((item) => item.permalink).slice(0, 8);
        const isFallback = !liveSource.length;
        let items = isFallback
            ? fallbackSocialItems()
            : dedupeSocialItems(liveSource).slice(0, 8);
        if (!isFallback && items.length < 3) {
            const usedIds = new Set(items.map((item) => item.id));
            const uniqueFillers = fallbackSocialItems().filter((item) => {
                if (usedIds.has(item.id)) return false;
                usedIds.add(item.id);
                return true;
            });
            items = [
                ...items,
                ...uniqueFillers.map((item, index) => ({
                    ...item,
                    id: `social-preview-fill-${index}`
                }))
            ].slice(0, 3);
        }
        if (!items.length) {
            container.innerHTML = "";
            return;
        }

        const hasPreviewItems = !isFallback && items.some(isSimulatedInstagramItem);
        document.querySelectorAll("[data-social-title]").forEach((node) => {
            node.textContent = copy(isFallback ? "socialFallbackTitle" : hasPreviewItems ? "socialPreviewTitle" : "socialTitle");
        });
        document.querySelectorAll("[data-social-text]").forEach((node) => {
            node.textContent = copy(isFallback ? "socialFallbackText" : hasPreviewItems ? "socialPreviewText" : "socialText");
        });

        container.dataset.mode = isFallback ? "fallback" : hasPreviewItems ? "preview" : "live";
        container.innerHTML = items.map((item, index) => {
            const title = item.title || titleFromCaption(item.caption);
            const isPreview = isSimulatedInstagramItem(item);
            const image = item.image || fallbackVisualForCategory(item.category || "studio-post", index);
            const imageMarkup = image
                ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(title)}" loading="lazy" decoding="async" sizes="(max-width: 700px) 100vw, 32vw">`
                : placeholderMarkup(categoryPlaceholderLabel(item.category || "studio-post"), "social-placeholder");
            const label = item.fallbackSocial
                ? copy("socialFallbackLabel")
                : isPreview
                    ? copy("socialPreviewLabel")
                    : copy("autoPublishNote");
            const action = item.fallbackSocial ? copy("socialFallbackCta") : copy("viewOnInstagram");
            const linkMarkup = item.permalink && !isPreview
                ? `<a href="${escapeHTML(item.permalink)}" target="_blank" rel="noopener">${escapeHTML(action)}</a>`
                : `<span>${escapeHTML(isPreview ? copy("socialPreviewNote") : copy("autoPublishNote"))}</span>`;
            const caption = displayCaptionForSocialItem(item, title, isPreview);
            return `
                <article class="instagram-card ${item.fallbackSocial ? "instagram-card-fallback" : ""} ${isPreview ? "instagram-card-preview" : ""}">
                    <div class="instagram-media">${imageMarkup}</div>
                    <div class="instagram-card-content">
                        <small class="instagram-card-label">${escapeHTML(label)}</small>
                        <h3>${escapeHTML(title)}</h3>
                        <p>${escapeHTML(caption)}</p>
                    </div>
                    ${linkMarkup}
                </article>
            `;
        }).join("");
    }

    function renderAutomationPanel() {
        const container = document.getElementById("automationLivePanel");
        if (!container) return;
        const signal = shopSignalSummary();

        container.innerHTML = `
            <div class="automation-live-heading">
                <span>${escapeHTML(copy("engineTitle"))}</span>
                <strong>${escapeHTML(signal.footerText)}</strong>
            </div>
            <div class="automation-live-grid">
                <article class="automation-live-metric">
                    <span>${escapeHTML(copy("engineProofLabel"))}</span>
                    <strong>${escapeHTML(copy("engineProofValue"))}</strong>
                </article>
                <article class="automation-live-metric">
                    <span>${escapeHTML(copy("engineReviewLabel"))}</span>
                    <strong>${escapeHTML(copy("engineReviewValue"))}</strong>
                </article>
                <article class="automation-live-metric">
                    <span>${escapeHTML(copy("enginePaymentLabel"))}</span>
                    <strong>${escapeHTML(copy("enginePaymentValue"))}</strong>
                </article>
                <article class="automation-live-metric">
                    <span>${escapeHTML(copy("engineAgentLabel"))}</span>
                    <strong>${escapeHTML(signal.agentText)}</strong>
                </article>
            </div>
        `;
    }

    async function loadShopAndSocial() {
        try {
            const publicStatus = await dataAPI.getPublicAutomationStatus();
            state.publicAutomationStatus = publicStatus?.success ? publicStatus : null;
        } catch (error) {
            console.warn("Public automation status unavailable:", error);
            state.publicAutomationStatus = null;
        }

        try {
            const shopItems = await dataAPI.getShopItems();
            state.shopItems = Array.isArray(shopItems) && shopItems.length ? shopItems.map(normalizeShopItem) : [];
        } catch (error) {
            console.warn("Shop API unavailable:", error);
        }

        try {
            const instagramMedia = await dataAPI.getInstagramMedia();
            state.instagramItems = Array.isArray(instagramMedia) ? instagramMedia.map(normalizeInstagramPost) : [];
        } catch (error) {
            console.warn("Instagram API unavailable:", error);
        }

        if (!state.shopItems.length && state.instagramItems.length) {
            state.shopItems = state.instagramItems.map(normalizeShopItem);
        }

        if (!state.shopItems.length) {
            try {
                const artworks = await dataAPI.getArtworks();
                if (Array.isArray(artworks) && artworks.length) {
                    state.shopItems = artworks.map((item) => normalizeShopItem({
                        ...item,
                        category: item.category || item.medium || "original-art",
                        mediaUrl: item.imageUrl || (Array.isArray(item.images) ? item.images[0] : ""),
                        status: "inquiry"
                    }));
                }
            } catch (error) {
                console.warn("Artwork API unavailable:", error);
            }
        }

        if (!state.shopItems.length) {
            state.shopItems = fallbackShopItems();
        }

        state.shopItems = dedupeShopItems(state.shopItems);
        chooseShopLandingFilter();
        renderShopFilters();
        renderShop();
        renderInstagramRail();
        renderHeroTrust();
        renderHeroLiveHud();
        renderCommerceTone();
        renderAutomationPanel();
    }

    function renderHowSteps() {
        const container = document.getElementById("howSteps");
        if (!container) return;
        container.innerHTML = DATA.howItWorks.map((step, index) => `
            <li>
                <span>${String(index + 1).padStart(2, "0")}</span>
                <p>${escapeHTML(valueOf(step))}</p>
            </li>
        `).join("");
    }

    function renderProductTables() {
        const container = document.getElementById("productTables");
        if (!container) return;
        container.innerHTML = DATA.categoryMeta.map((category) => {
            const products = DATA.products.filter((product) => product.enabled && !product.standby && product.category === category.id);
            return `
                <details class="price-card price-card-${escapeHTML(category.id)}">
                    <summary>
                        <span class="price-mark" aria-hidden="true"></span>
                        <span class="price-summary-copy">
                            <span class="price-from">${escapeHTML(category.priceFrom)}</span>
                            <strong id="table-${escapeHTML(category.id)}">${escapeHTML(valueOf(category.publicCategory))}</strong>
                            <small>${escapeHTML(valueOf(category.summary))}</small>
                        </span>
                        <span class="price-summary-action">${escapeHTML(copy("viewDetails") || "Details")}</span>
                    </summary>
                    <div class="price-details" aria-labelledby="table-${escapeHTML(category.id)}">
                        ${products.map((product) => `
                            <article class="price-tier">
                                <div>
                                    <strong>${escapeHTML(valueOf(product.name))}</strong>
                                    <small>${escapeHTML(product.size)} · ${escapeHTML(product.productionTime)}</small>
                                </div>
                                <span>${escapeHTML(product.priceFrom)}</span>
                            </article>
                        `).join("")}
                    </div>
                </details>
            `;
        }).join("");
    }

    function renderAddOns() {
        const container = document.getElementById("addonsList");
        if (!container) return;
        container.innerHTML = DATA.addOns.map((item) => `
            <div class="addon-item">
                <span>${escapeHTML(valueOf(item.name))}</span>
                <strong>${escapeHTML(valueOf(item.price))}</strong>
            </div>
        `).join("");
    }

    function renderShipping() {
        const container = document.getElementById("shippingCards");
        if (!container) return;
        container.innerHTML = DATA.shippingPolicy.map((item) => `
            <details class="shipping-card">
                <summary>${escapeHTML(valueOf(item.title))}</summary>
                <ul>
                    ${item.lines.map((line) => `<li>${escapeHTML(valueOf(line))}</li>`).join("")}
                </ul>
            </details>
        `).join("");
    }

    function renderFAQ() {
        const container = document.getElementById("faqList");
        if (!container) return;
        container.innerHTML = DATA.faqs.map((item) => `
            <details class="faq-item">
                <summary>${escapeHTML(valueOf(item.q))}</summary>
                <p>${escapeHTML(valueOf(item.a))}</p>
            </details>
        `).join("");
    }

    function renderSocialLinks() {
        const containers = document.querySelectorAll("[data-social-links]");
        if (!containers.length) return;

        const activeLinks = DATA.socialLinks.filter((link) => Boolean(link.href));
        const markup = activeLinks.map((link) => {
            const label = valueOf(link.label);
            const tag = valueOf(link.tag);
            const icon = link.icon || label.slice(0, 2).toUpperCase();
            const available = Boolean(link.href);
            const content = `
                <span class="social-icon" aria-hidden="true">${escapeHTML(icon)}</span>
                <span class="social-copy">
                    <strong>${escapeHTML(label)}</strong>
                    <small>${escapeHTML(tag)}</small>
                </span>
                <span class="social-status">${escapeHTML(available ? copy("socialOpen") : copy("socialComingSoon"))}</span>
            `;

            if (!available) {
                return `<span class="social-link is-pending">${content}</span>`;
            }

            return `<a class="social-link" href="${escapeHTML(link.href)}" target="_blank" rel="noopener">${content}</a>`;
        }).join("");

        containers.forEach((container) => {
            container.innerHTML = markup;
        });
    }

    function optionLabel(option) {
        if (typeof option === "string") {
            const spanishBudgets = {
                "Under €60": "Menos de €60",
                "I need help choosing": "Necesito ayuda para elegir"
            };
            return state.lang === "es" ? (spanishBudgets[option] || option) : option;
        }
        return valueOf(option.label);
    }

    function renderOptions(select, options, includeBlank) {
        if (!select) return;
        const current = select.value;
        select.innerHTML = `${includeBlank ? `<option value="">${escapeHTML(state.lang === "es" ? "Selecciona una opcion" : "Choose an option")}</option>` : ""}${options.map((option) => {
            const value = typeof option === "string" ? option : option.value;
            return `<option value="${escapeHTML(value)}">${escapeHTML(optionLabel(option))}</option>`;
        }).join("")}`;
        if (current) select.value = current;
    }

    function renderFormOptions() {
        renderOptions(document.getElementById("productCategory"), DATA.selectOptions.productCategories, true);
        renderOptions(document.getElementById("deadline"), DATA.selectOptions.deadlines, true);
        renderOptions(document.getElementById("budget"), DATA.selectOptions.budgets, true);
        renderOptions(document.getElementById("pickupShipping"), DATA.selectOptions.pickupShipping, true);
        renderOptions(document.getElementById("involvement"), DATA.selectOptions.involvement, true);

        const tierOptions = [
            { value: "I’m not sure yet", label: { en: "I’m not sure yet", es: "Aun no estoy seguro/a" } },
            ...DATA.products
                .filter((product) => product.enabled && !product.standby)
                .map((product) => ({
                    value: valueOf(product.name),
                    label: {
                        en: `${product.name.en || valueOf(product.name)} - ${product.priceFrom}`,
                        es: `${product.name.es || valueOf(product.name)} - ${product.priceFrom}`
                    }
                }))
        ];
        renderOptions(document.getElementById("productTier"), tierOptions, false);
    }

    function setOrderCategory(categoryId) {
        const select = document.getElementById("productCategory");
        if (select) select.value = categoryToFormValue[categoryId] || "I’m not sure yet";
    }

    function bindNavigation() {
        const mobileToggle = document.getElementById("mobileMenuToggle");
        const navLinks = document.getElementById("navLinks");
        const header = document.querySelector(".sales-header");

        if (mobileToggle && navLinks) {
            mobileToggle.addEventListener("click", () => {
                const isOpen = navLinks.classList.toggle("active");
                mobileToggle.classList.toggle("active", isOpen);
                mobileToggle.setAttribute("aria-expanded", String(isOpen));
                document.body.classList.toggle("nav-open", isOpen);
            });
        }

        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener("click", (event) => {
                const href = anchor.getAttribute("href");
                const target = hashTarget(href);
                if (!target) return;
                event.preventDefault();
                if (window.location.hash !== href) {
                    window.history.pushState(null, "", href);
                }
                scrollToAnchorTarget(target, "smooth");
                navLinks?.classList.remove("active");
                mobileToggle?.classList.remove("active");
                mobileToggle?.setAttribute("aria-expanded", "false");
                document.body.classList.remove("nav-open");
            });
        });

        window.addEventListener("hashchange", () => alignHashTarget("auto"));

        window.addEventListener("scroll", () => {
            header?.classList.toggle("scrolled", window.scrollY > 30);
        }, { passive: true });
    }

    function bindLanguageSwitcher() {
        document.querySelectorAll(".lang-btn").forEach((button) => {
            button.addEventListener("click", () => setLanguage(button.dataset.lang));
        });
    }

    function clamp(value, min = 0, max = 1) {
        return Math.min(max, Math.max(min, value));
    }

    function canRunScrollMotion() {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const wideEnough = window.matchMedia("(min-width: 861px)").matches;
        const saveData = navigator.connection?.saveData === true;
        return Boolean(window.gsap && window.ScrollTrigger && !reduced && wideEnough && !saveData);
    }

    function setStoryStep(progress) {
        const story = document.querySelector('[data-scroll-scene="heirloom"]');
        const storySteps = story ? Array.from(story.querySelectorAll("[data-story-step]")) : [];
        const storyIndex = story?.querySelector("[data-story-index]");
        if (!storySteps.length) return;
        const activeIndex = Math.min(storySteps.length - 1, Math.floor(clamp(progress) * storySteps.length));
        storySteps.forEach((step, index) => {
            const active = index === activeIndex;
            step.classList.toggle("is-active", active);
            step.setAttribute("aria-current", active ? "step" : "false");
        });
        if (storyIndex) {
            storyIndex.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(storySteps.length).padStart(2, "0")}`;
        }
    }

    function cleanupScrollAnimations() {
        if (state.scrollRefreshTimer) {
            window.clearTimeout(state.scrollRefreshTimer);
            state.scrollRefreshTimer = null;
        }
        if (state.scrollContext && typeof state.scrollContext.revert === "function") {
            state.scrollContext.revert();
        }
        state.scrollContext = null;
        document.body.classList.remove("premium-motion-ready", "transform-ready");
        document.querySelector(".kinetic-gallery-track")?.style.removeProperty("transform");
        setStoryStep(0);
    }

    function initScrollAnimations() {
        cleanupScrollAnimations();
        if (!canRunScrollMotion()) return;

        const { gsap, ScrollTrigger } = window;
        gsap.registerPlugin(ScrollTrigger);
        document.body.classList.add("premium-motion-ready", "transform-ready");

        state.scrollContext = gsap.context(() => {
            const story = document.querySelector('[data-scroll-scene="heirloom"]');
            const storyStage = story?.querySelector(".story-stage");
            const storyMain = story?.querySelector(".story-media-main");
            const storySecondary = story?.querySelector(".story-media-secondary");
            const storyRing = story?.querySelector(".story-liquid-ring");
            const storyPinDistance = 2400;

            if (story && storyStage) {
                const storyTimeline = gsap.timeline({
                    scrollTrigger: {
                        id: "maryilu-heirloom-story",
                        trigger: story,
                        start: "top top",
                        end: `+=${storyPinDistance}`,
                        scrub: 0.9,
                        pin: storyStage,
                        anticipatePin: 1,
                        invalidateOnRefresh: true,
                        onUpdate: (self) => setStoryStep(self.progress),
                        refreshPriority: 1
                    }
                });

                if (storyMain) {
                    storyTimeline.fromTo(storyMain, {
                        x: -28,
                        y: 0,
                        rotate: -3,
                        scale: 0.96
                    }, {
                        x: 46,
                        y: -24,
                        rotate: 4,
                        scale: 1.08,
                        ease: "none"
                    }, 0);
                }
                if (storySecondary) {
                    storyTimeline.fromTo(storySecondary, {
                        autoAlpha: 0.42,
                        x: 44,
                        y: 34,
                        rotate: 6,
                        scale: 0.88
                    }, {
                        autoAlpha: 1,
                        x: -30,
                        y: -10,
                        rotate: -2,
                        scale: 1.04,
                        ease: "none"
                    }, 0);
                }
                if (storyRing) {
                    storyTimeline.fromTo(storyRing, {
                        scale: 0.74,
                        autoAlpha: 0.55
                    }, {
                        scale: 1.42,
                        autoAlpha: 0.92,
                        ease: "none"
                    }, 0);
                }
            }

            gsap.utils.toArray(".shop-item-card, .price-card, .instagram-card, .shipping-card, .faq-item").forEach((card) => {
                gsap.fromTo(card, {
                    autoAlpha: 0,
                    y: 26
                }, {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.7,
                    ease: "power2.out",
                    scrollTrigger: {
                        trigger: card,
                        start: "top 88%",
                        toggleActions: "play none none reverse"
                    }
                });
            });
        }, document.body);

        window.requestAnimationFrame(() => {
            updateKineticGalleryRail();
            ScrollTrigger.refresh();
        });
    }

    function queueScrollAnimationRefresh() {
        if (state.scrollRefreshTimer) window.clearTimeout(state.scrollRefreshTimer);
        state.scrollRefreshTimer = window.setTimeout(() => {
            initScrollAnimations();
            updateKineticGalleryRail();
        }, 120);
    }

    function canRunGalleryMotion() {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const wideEnough = window.matchMedia("(min-width: 861px)").matches;
        const saveData = navigator.connection?.saveData === true;
        return !reduced && wideEnough && !saveData;
    }

    function updateKineticGalleryRail() {
        const gallery = document.querySelector('[data-scroll-scene="formats"]');
        const viewport = gallery?.querySelector(".kinetic-gallery-viewport");
        const track = gallery?.querySelector(".kinetic-gallery-track");
        if (!gallery || !viewport || !track) return;

        if (!canRunGalleryMotion()) {
            track.style.removeProperty("transform");
            return;
        }

        const travel = Math.max(1, gallery.offsetHeight - window.innerHeight);
        const progress = clamp(-gallery.getBoundingClientRect().top / travel);
        const distance = Math.max(0, track.scrollWidth - viewport.clientWidth + 32);
        gallery.style.setProperty("--gallery-progress", progress.toFixed(4));
        gallery.classList.toggle("is-rail-complete", progress > 0.985);
        track.style.transform = `translate3d(${-distance * progress}px, 0, 0)`;
    }

    function bindPremiumScrollScenes() {
        if (!document.querySelector(".kinetic-gallery-section, .transform-story-section")) return;
        document.querySelectorAll(".kinetic-gallery-section [data-order-category]").forEach((button) => {
            button.addEventListener("click", () => {
                setOrderCategory(button.dataset.orderCategory);
                scrollToAnchorTarget(document.getElementById("order"), "smooth");
            });
        });
        window.addEventListener("scroll", () => {
            updateKineticGalleryRail();
        }, { passive: true });
        window.addEventListener("resize", () => {
            updateKineticGalleryRail();
        });
        window.addEventListener("resize", queueScrollAnimationRefresh);
        window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", queueScrollAnimationRefresh);
        document.fonts?.ready?.then(queueScrollAnimationRefresh).catch(() => {});
        document.querySelectorAll(".transform-story-section img, .kinetic-gallery-section img").forEach((image) => {
            if (!image.complete) image.addEventListener("load", queueScrollAnimationRefresh, { once: true });
        });
        queueScrollAnimationRefresh();
        updateKineticGalleryRail();
    }

    function formDataToPayload(form) {
        const formData = new FormData(form);
        return {
            id: "",
            createdAt: "",
            status: DATA.leadStatuses[0],
            language: state.lang,
            source: window.location.href,
            company: formData.get("company"),
            name: formData.get("name"),
            email: formData.get("email"),
            phone: formData.get("phone"),
            instagram: formData.get("instagram"),
            preferredLanguage: formData.get("preferredLanguage"),
            countryCity: formData.get("countryCity"),
            productCategory: formData.get("productCategory"),
            productTier: formData.get("productTier"),
            occasion: formData.get("occasion"),
            deadline: formData.get("deadline"),
            budget: formData.get("budget"),
            pickupShipping: formData.get("pickupShipping"),
            recipient: formData.get("recipient"),
            ageRange: formData.get("ageRange"),
            interests: formData.get("interests"),
            colors: formData.get("colors"),
            includeThemes: formData.get("includeThemes"),
            avoidThemes: formData.get("avoidThemes"),
            memories: formData.get("memories"),
            songQuote: formData.get("songQuote"),
            involvement: formData.get("involvement"),
            references: {
                links: formData.get("referenceLinks"),
                files: []
            },
            notes: formData.get("notes"),
            consent: formData.get("consent") === "on"
        };
    }

    function setFormStatus(type, message, withInstagramAction = false) {
        const status = document.getElementById("formStatus");
        if (!status) return;
        status.className = `form-status ${type ? `form-status-${type}` : ""}`;
        setStatusMessage(status, message, withInstagramAction);
    }

    function bindOrderForm() {
        const form = document.getElementById("orderForm");
        if (!form) return;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            setFormStatus("", "");

            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const submitButton = form.querySelector(".form-submit");
            const originalText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = copy("submitting");

            try {
                const payload = formDataToPayload(form);
                const result = await dataAPI.submitOrderRequest(payload);

                if (!result || !result.success) {
                    throw new Error(result?.error || "Submission failed");
                }

                form.reset();
                document.getElementById("preferredLanguage").value = state.lang === "es" ? "Spanish" : "English";
                renderFormOptions();
                setFormStatus("success", copy("success"));
            } catch (error) {
                console.error("Order request failed:", error);
                setFormStatus("error", copy("error"), true);
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }
        });
    }

    async function init() {
        bindNavigation();
        bindLanguageSwitcher();
        bindOrderForm();
        bindSpotlightInteraction();
        bindPremiumScrollScenes();
        await loadSiteSettings();
        setLanguage(state.lang);
        await loadShopAndSocial();
        alignHashTarget();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
