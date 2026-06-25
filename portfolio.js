(function () {
    const DATA = window.MARYILU_DATA || {};
    const fallbackPoems = [];
    const portfolioState = {
        instagramHref: "https://www.instagram.com/marialuisas_arttt/",
        settings: null
    };

    function escapeHTML(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    const OPTIMIZED_IMAGE_BASES = new Set([
        "maryilu-editorial-store-hero",
        "maryilu-luxury-chest-hero",
        "maria-luisa-portfolio-studio"
    ]);

    function optimizedImageBase(url) {
        const match = String(url || "").match(/(?:^|\/)([^/?#]+)\.png(?:[?#].*)?$/i);
        if (!match) return null;
        return OPTIMIZED_IMAGE_BASES.has(match[1]) ? match[1] : null;
    }

    // <picture> with AVIF/WebP/PNG for our optimized assets, else a plain <img>.
    function pictureMarkup(url, alt, { eager = false, sizes = "" } = {}) {
        const loadAttrs = eager ? `loading="eager" fetchpriority="high"` : `loading="lazy"`;
        const sizeAttr = sizes ? ` sizes="${escapeHTML(sizes)}"` : "";
        const img = `<img src="${escapeHTML(url)}" alt="${escapeHTML(alt || "")}" ${loadAttrs} decoding="async"${sizeAttr}>`;
        const base = optimizedImageBase(url);
        if (!base) return img;
        return `<picture>`
            + `<source type="image/avif" srcset="assets/${base}.avif">`
            + `<source type="image/webp" srcset="assets/${base}.webp">`
            + img
            + `</picture>`;
    }

    function emitRendered(section) {
        document.dispatchEvent(new CustomEvent("portfolio:rendered", { detail: { section } }));
    }

    function safeClassToken(value) {
        return String(value || "item")
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "item";
    }

    function valueOf(value) {
        if (value == null) return "";
        if (typeof value === "string" || typeof value === "number") return String(value);
        return value.en || Object.values(value)[0] || "";
    }

    function normalizeCategory(category) {
        const raw = String(category || "").toLowerCase();
        if (raw.includes("original") || raw.includes("canvas") || raw.includes("painting") || raw.includes("lienzo")) return "original-art";
        if (raw.includes("flower") || raw.includes("bouquet") || raw.includes("flor") || raw.includes("ramo")) return "flowers";
        if (raw.includes("baby") || raw.includes("diaper") || raw.includes("panal")) return "baby-shower";
        if (raw.includes("box") || raw.includes("chest") || raw.includes("gift") || raw.includes("caja") || raw.includes("cofre")) return "custom-gifts";
        return "studio-post";
    }

    function fallbackVisualForCategory(category, index) {
        const visuals = {
            "custom-gifts": "assets/maryilu-luxury-chest-hero.png",
            "baby-shower": "assets/maryilu-luxury-chest-hero.png",
            "flowers": "assets/maryilu-editorial-store-hero.png",
            "original-art": "assets/maria-luisa-portfolio-studio.png",
            "studio-post": index % 2 ? "assets/maryilu-editorial-store-hero.png" : "assets/maria-luisa-portfolio-studio.png"
        };
        return visuals[category] || visuals["studio-post"];
    }

    function portfolioCategoryLabel(category) {
        if (category === "original-art") return "Original artwork";
        if (category === "custom-gifts") return "Custom gift work";
        if (category === "flowers") return "Ribbon flower work";
        if (category === "baby-shower") return "Celebration gift work";
        return "Studio work";
    }

    function isPlainObject(value) {
        return Boolean(value && typeof value === "object" && !Array.isArray(value));
    }

    function setText(selector, value) {
        if (!value) return;
        document.querySelectorAll(selector).forEach((node) => {
            node.textContent = value;
        });
    }

    function setMeta(selector, value) {
        if (!value) return;
        document.querySelector(selector)?.setAttribute("content", value);
    }

    function applySiteSettings(settings) {
        if (!isPlainObject(settings)) return;
        portfolioState.settings = settings;

        const copy = settings.copy?.en || {};
        const portfolioTitle = copy.portfolioTitle || copy.portfolioHeroTitle;
        const portfolioIntro = copy.portfolioIntro || copy.portfolioHeroIntro;
        const socialTitle = copy.portfolioSocialTitle;
        const socialText = copy.portfolioSocialText;
        const aboutTitle = copy.portfolioAboutTitle;
        const aboutText = copy.portfolioAboutText;
        const metaTitle = copy.portfolioMetaTitle || portfolioTitle;
        const metaDescription = copy.portfolioMetaDescription || portfolioIntro;

        if (metaTitle) {
            document.title = metaTitle;
            setMeta('meta[property="og:title"]', metaTitle);
            setMeta('meta[name="twitter:title"]', metaTitle);
        }
        setMeta('meta[name="description"]', metaDescription);
        setMeta('meta[property="og:description"]', metaDescription);
        setMeta('meta[name="twitter:description"]', metaDescription);

        setText("#portfolio-heading", portfolioTitle);
        setText(".portfolio-hero-copy > p", portfolioIntro);
        setText("#social-proof-heading", socialTitle);
        setText("#social-proof-heading + p", socialText);
        setText("#about-heading", aboutTitle);
        if (aboutText) {
            const aboutParagraph = document.querySelector(".about-portfolio-section #about-heading + p");
            if (aboutParagraph) aboutParagraph.textContent = aboutText;
        }

        const instagramHref = settings.social?.instagram?.href || settings.social?.instagramUrl || settings.urls?.instagram;
        if (instagramHref) {
            portfolioState.instagramHref = instagramHref;
            document.querySelectorAll('a[href*="instagram.com"]').forEach((link) => {
                link.setAttribute("href", instagramHref);
            });
        }

        const portfolioImage = settings.assets?.portfolioImage;
        if (portfolioImage) {
            document.querySelectorAll(".portfolio-art-stage img, .about-visual img").forEach((image) => {
                image.setAttribute("src", portfolioImage);
            });
        }
    }

    function cleanCaption(caption) {
        return String(caption || "")
            .replace(/https?:\/\/\S+/gi, "")
            .replace(/#\w+/g, "")
            .replace(/(?:^|\s)[€$£]\s?\d[\d.,]*/g, "")
            .replace(/\b(?:available|sold|reserved|dm|message|pickup|shipping|quote|custom colors possible)\b.*$/i, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function publicTitleFromCaption(caption) {
        const cleaned = cleanCaption(caption);
        if (!cleaned) return "Instagram studio post";
        const firstSentence = cleaned.split(/[.!?]/).find(Boolean) || cleaned;
        const title = firstSentence.length > 58 ? `${firstSentence.slice(0, 55).trim()}...` : firstSentence;
        return title.charAt(0).toUpperCase() + title.slice(1);
    }

    function publicDescriptionFromCaption(caption) {
        const cleaned = cleanCaption(caption);
        if (!cleaned || cleaned.length < 12) return "Recent studio work from Maria Luisa's Instagram.";
        return cleaned.length > 142 ? `${cleaned.slice(0, 139).trim()}...` : cleaned;
    }

    function isSimulatedPost(item) {
        const values = [
            item?.id,
            item?.sourcePostId,
            item?.permalink,
            item?.description,
            item?.caption
        ].map((value) => String(value || "").toLowerCase());
        return Boolean(
            item?.simulated
            || values.some((value) => value.includes("sim_maryilu") || value.includes("/sim_") || value.includes("sim-"))
        );
    }

    function fallbackWorks() {
        if (Array.isArray(DATA.portfolioWorks) && DATA.portfolioWorks.length) {
            return DATA.portfolioWorks.map(normalizeArtwork);
        }

        return [];
    }

    function normalizeArtwork(item) {
        return {
            id: item.id || "",
            sourcePostId: item.sourcePostId || "",
            title: item.title || "Untitled work",
            year: item.year || "",
            medium: item.medium || item.category || "Artwork",
            size: item.size || "",
            description: item.description || item.caption || "",
            imageUrl: item.imageUrl || (Array.isArray(item.images) ? item.images[0] : ""),
            permalink: item.permalink || "",
            simulated: Boolean(item.simulated || isSimulatedPost(item))
        };
    }

    function normalizeInstagramPost(item) {
        const date = item.timestamp ? new Date(item.timestamp) : null;
        const year = date && !Number.isNaN(date.getTime()) ? String(date.getFullYear()) : "";
        return normalizeArtwork({
            id: item.id || "",
            sourcePostId: item.id || "",
            title: publicTitleFromCaption(item.caption),
            year,
            medium: item.mediaType || "Instagram",
            description: publicDescriptionFromCaption(item.caption),
            imageUrl: item.mediaUrl || item.thumbnailUrl,
            permalink: item.permalink,
            simulated: Boolean(item.simulated || isSimulatedPost(item))
        });
    }

    function normalizeShopItem(item) {
        const category = normalizeCategory(item.category);
        return normalizeArtwork({
            id: item.id || "",
            sourcePostId: item.sourcePostId || "",
            title: item.title || publicTitleFromCaption(item.caption),
            year: item.createdAt ? String(new Date(item.createdAt).getFullYear() || "") : "",
            medium: portfolioCategoryLabel(category),
            description: publicDescriptionFromCaption(item.caption || item.description || ""),
            imageUrl: item.mediaUrl || item.thumbnailUrl || item.image || fallbackVisualForCategory(category, 0),
            permalink: item.permalink || "",
            simulated: Boolean(item.simulated || isSimulatedPost(item))
        });
    }

    function workIdentity(item) {
        const work = normalizeArtwork(item);
        // Prefer the stable id so distinct studies that reuse the same photo
        // (curated portfolio works) each render as their own gallery tile.
        const id = String(work.id || work.sourcePostId || "").toLowerCase();
        if (id) return "id:" + id;
        const image = String(work.imageUrl || "").toLowerCase();
        const permalink = String(work.permalink || "").toLowerCase();
        const title = String(work.title || "").toLowerCase();
        return image || permalink || `${title}|${work.medium}`;
    }

    function dedupeWorks(items) {
        const byIdentity = new Map();
        items.filter(Boolean).forEach((item) => {
            const key = workIdentity(item);
            if (key && !byIdentity.has(key)) byIdentity.set(key, normalizeArtwork(item));
        });
        return Array.from(byIdentity.values());
    }

    function renderGallery(items) {
        const gallery = document.getElementById("portfolioGallery");
        if (!gallery) return;

        if (!items.length) {
            gallery.innerHTML = `
                <article class="portfolio-empty-state is-reveal">
                    <h3>Current works are being curated.</h3>
                    <p>Recent studio pieces will appear here once the live artwork feed is connected. For now, follow Maria Luisa on Instagram for the latest work.</p>
                    <a href="${escapeHTML(portfolioState.instagramHref)}" target="_blank" rel="noopener">Open Instagram</a>
                </article>
            `;
            emitRendered("gallery");
            return;
        }

        gallery.innerHTML = items.map((item) => {
            const work = normalizeArtwork(item);
            const meta = [work.year, work.medium, work.size].filter(Boolean).join(" · ");
            const mediaInner = work.imageUrl
                ? pictureMarkup(work.imageUrl, work.title)
                : `<div class="portfolio-work-fallback" aria-hidden="true"></div>`;
            // The media is a button so the artwork opens in the lightbox (keyboard accessible).
            const media = work.imageUrl
                ? `<button type="button" class="portfolio-work-media mo-lightbox-trigger" aria-label="View ${escapeHTML(work.title)} enlarged" data-full="${escapeHTML(work.imageUrl)}" data-title="${escapeHTML(work.title)}" data-meta="${escapeHTML(meta || "Studio work")}">${mediaInner}<span class="mo-view-hint" aria-hidden="true">View</span></button>`
                : `<div class="portfolio-work-media">${mediaInner}</div>`;
            const link = work.permalink && !work.simulated
                ? `<a class="portfolio-work-link" href="${escapeHTML(work.permalink)}" target="_blank" rel="noopener">Open on Instagram</a>`
                : work.simulated
                    ? `<span class="portfolio-work-link portfolio-work-link-muted">Studio proof</span>`
                : "";

            return `
                <article class="portfolio-work-card is-reveal portfolio-work-${escapeHTML(safeClassToken(work.id))}">
                    ${media}
                    <div class="portfolio-work-copy">
                        <small>${escapeHTML(meta || "Studio work")}</small>
                        <h3>${escapeHTML(work.title)}</h3>
                        <p>${escapeHTML(work.description || "A Maryilu studio piece shaped by color, memory, and handmade detail.")}</p>
                        ${link}
                    </div>
                </article>
            `;
        }).join("");
        emitRendered("gallery");
    }

    function renderPoetry(items) {
        const poetry = document.getElementById("portfolioPoetry");
        if (!poetry) return;

        if (!items.length) {
            poetry.innerHTML = `
                <article class="portfolio-poem-card portfolio-empty-state is-reveal">
                    <h3>Poetry notes are being curated.</h3>
                    <p>Written fragments and process notes will appear here when Maria Luisa is ready to publish them.</p>
                </article>
            `;
            emitRendered("poetry");
            return;
        }

        poetry.innerHTML = items.map((item) => `
            <article class="portfolio-poem-card is-reveal">
                <h3>${escapeHTML(item.title || "Untitled poem")}</h3>
                <p>${escapeHTML(item.content || "").replace(/&lt;br\s*\/?&gt;/gi, "<br>")}</p>
                <small>${escapeHTML([item.date, item.theme].filter(Boolean).join(" · ") || "Poetry")}</small>
            </article>
        `).join("");
        emitRendered("poetry");
    }

    function renderSocialProof(items) {
        const social = document.getElementById("portfolioSocialProof");
        if (!social) return;
        const liveItems = items
            .map(normalizeArtwork)
            .filter((work) => !work.simulated)
            .slice(0, 6);

        if (!liveItems.length) {
            social.innerHTML = `
                <article class="portfolio-social-card portfolio-empty-state portfolio-social-profile-card is-reveal">
                    <h3>Instagram profile linked</h3>
                    <p>See Maria Luisa's public studio posts on Instagram. The website feed will turn on after the official Meta connection is finished.</p>
                    <a href="${escapeHTML(portfolioState.instagramHref)}" target="_blank" rel="noopener">Follow on Instagram</a>
                </article>
            `;
            emitRendered("social");
            return;
        }

        social.innerHTML = liveItems.map((work) => {
            const isPreview = Boolean(work.previewSocial || work.simulated);
            const isInstagram = Boolean(work.permalink);
            const media = work.imageUrl
                ? pictureMarkup(work.imageUrl, work.title)
                : `<div class="portfolio-work-fallback" aria-hidden="true"></div>`;
            const link = work.permalink
                ? `<a href="${escapeHTML(work.permalink)}" target="_blank" rel="noopener">${isPreview ? "Open Instagram" : "Follow on Instagram"}</a>`
                : "";

            return `
                <article class="portfolio-social-card is-reveal ${isPreview ? "portfolio-social-card-preview" : ""}">
                    ${media}
                    <small>${isPreview ? "Curated studio work" : isInstagram ? "Instagram studio proof" : "Published studio work"}</small>
                    <p>${escapeHTML(work.description || work.title)}</p>
                    ${link}
                </article>
            `;
        }).join("");
        emitRendered("social");
    }

    function shopHref() {
        const host = window.location.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "/";
        const configured = portfolioState.settings?.urls?.publicSite;
        if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
        if (host === "portfolio.maryilu.com") return "https://maryilu.com/";
        if (host === "maryilu.com" || host === "www.maryilu.com") return "/";
        return "/";
    }

    function updateShopLinks() {
        document.querySelectorAll("[data-shop-link]").forEach((link) => {
            link.setAttribute("href", shopHref());
        });
    }

    function bindNavigation() {
        const toggle = document.getElementById("portfolioMenuToggle");
        const links = document.getElementById("portfolioNavLinks");

        if (toggle && links) {
            toggle.addEventListener("click", () => {
                const isOpen = links.classList.toggle("active");
                toggle.setAttribute("aria-expanded", String(isOpen));
            });
        }

        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener("click", (event) => {
                const target = document.querySelector(anchor.getAttribute("href"));
                if (!target) return;
                event.preventDefault();
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                links?.classList.remove("active");
                toggle?.setAttribute("aria-expanded", "false");
            });
        });
    }

    async function loadSiteSettings(api) {
        if (!api || typeof api.getSiteSettings !== "function") return;
        try {
            applySiteSettings(await api.getSiteSettings());
        } catch (error) {
            console.warn("Portfolio site settings unavailable:", error);
        }
    }

    async function loadData() {
        const api = typeof DataAPI !== "undefined" ? new DataAPI() : null;
        const curatedFallbackWorks = fallbackWorks();
        let portfolioShopItems = [];
        let socialItems = [];
        let instagramWorks = [];
        let artworkItems = [];

        await loadSiteSettings(api);
        updateShopLinks();

        try {
            portfolioShopItems = api ? await api.getShopItems({ target: "portfolio" }) : [];
        } catch (error) {
            console.warn("Portfolio shop items unavailable:", error);
        }

        try {
            const instagramMedia = api ? await api.getInstagramMedia() : [];
            if (Array.isArray(instagramMedia) && instagramMedia.length) {
                instagramWorks = instagramMedia.map(normalizeInstagramPost);
                socialItems = instagramWorks;
            }
        } catch (error) {
            console.warn("Portfolio Instagram feed unavailable:", error);
        }

        try {
            const artworks = api ? await api.getArtworks() : [];
            artworkItems = Array.isArray(artworks) ? artworks.map(normalizeArtwork) : [];
        } catch (error) {
            console.warn("Portfolio artwork feed unavailable:", error);
        }

        const shopWorks = Array.isArray(portfolioShopItems) ? portfolioShopItems.map(normalizeShopItem) : [];
        const galleryItems = dedupeWorks([
            ...shopWorks,
            ...artworkItems,
            ...curatedFallbackWorks
        ]);

        renderGallery(galleryItems.length ? galleryItems : dedupeWorks(instagramWorks));
        if (!socialItems.length && shopWorks.length) socialItems = shopWorks;

        renderSocialProof(socialItems);

        try {
            const poems = api ? await api.getPoetry() : [];
            renderPoetry(Array.isArray(poems) && poems.length ? poems : fallbackPoems);
        } catch (error) {
            renderPoetry(fallbackPoems);
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        updateShopLinks();
        bindNavigation();
        loadData();
    });
})();
