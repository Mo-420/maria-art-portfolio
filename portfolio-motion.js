/* Maryilu Portfolio — premium motion controller (vanilla, GSAP-free).
   Reveals, condensing header, progress bar, count-up, accessible lightbox,
   Mallorca map + seal, and a desktop cursor. All animation respects
   prefers-reduced-motion and degrades to fully-visible content. */
(function () {
    "use strict";

    var docEl = document.documentElement;
    var reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    function reduced() { return reduceMq.matches; }

    // Cancel the head-script safety timeout: motion JS is alive.
    docEl.classList.add("mo-armed");

    var OPTIMIZED = { "maryilu-editorial-store-hero": 1, "maryilu-luxury-chest-hero": 1, "maria-luisa-portfolio-studio": 1 };
    function preferOptimized(url) {
        var m = String(url || "").match(/(?:^|\/)([^/?#]+)\.png(?:[?#].*)?$/i);
        return m && OPTIMIZED[m[1]] ? "assets/" + m[1] + ".webp" : url;
    }

    // ---------- Scroll reveal ----------
    var revealIO = null;
    function observeReveals(scope) {
        if (!revealIO) return;
        var nodes = scope.querySelectorAll(".is-reveal");
        Array.prototype.forEach.call(nodes, function (el) {
            if (el.dataset.moBound) return;
            el.dataset.moBound = "1";
            var sibs = el.parentElement
                ? Array.prototype.filter.call(el.parentElement.children, function (c) { return c.classList.contains("is-reveal"); })
                : [el];
            el.style.setProperty("--i", String(Math.min(5, Math.max(0, sibs.indexOf(el)))));
            revealIO.observe(el);
        });
    }
    function setupReveal() {
        if (reduced() || !("IntersectionObserver" in window)) {
            Array.prototype.forEach.call(document.querySelectorAll(".is-reveal, .portfolio-section-heading"), function (el) {
                el.classList.add("is-in");
            });
            return;
        }
        revealIO = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                e.target.classList.add("is-in");
                revealIO.unobserve(e.target);
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
        observeReveals(document);
    }
    document.addEventListener("portfolio:rendered", function () { observeReveals(document); });

    // ---------- Hero entrance ----------
    function heroIntro() {
        // Timeout fallback covers background tabs where rAF is throttled.
        var reveal = function () { document.body.classList.add("hero-in"); };
        requestAnimationFrame(function () { requestAnimationFrame(reveal); });
        window.setTimeout(reveal, 200);
    }

    // ---------- Condensing header + scroll progress ----------
    function setupScroll() {
        var header = document.querySelector(".portfolio-header");
        var progress = document.createElement("div");
        progress.className = "mo-progress";
        document.body.appendChild(progress);
        var ticking = false;
        function update() {
            ticking = false;
            var y = window.scrollY;
            if (header) header.classList.toggle("is-condensed", y > 24);
            var max = docEl.scrollHeight - window.innerHeight;
            progress.style.setProperty("--mo-p", max > 0 ? Math.min(1, y / max).toFixed(4) : "0");
        }
        function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        update();
    }

    // ---------- Count-up ----------
    function setupCountUp() {
        var els = document.querySelectorAll("[data-countup]");
        if (!els.length) return;
        Array.prototype.forEach.call(els, function (el) {
            var target = parseInt(el.getAttribute("data-countup"), 10) || 0;
            if (reduced() || !("IntersectionObserver" in window)) { el.textContent = String(target); return; }
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (!e.isIntersecting) return;
                    io.unobserve(el);
                    var start = null;
                    function step(ts) {
                        if (!start) start = ts;
                        var p = Math.min(1, (ts - start) / 900);
                        el.textContent = String(Math.round((1 - Math.pow(1 - p, 3)) * target));
                        if (p < 1) requestAnimationFrame(step); else el.textContent = String(target);
                    }
                    requestAnimationFrame(step);
                    // Safety: guarantee the final value even if rAF is throttled.
                    setTimeout(function () { el.textContent = String(target); }, 1400);
                });
            }, { threshold: 0.6 });
            io.observe(el);
        });
    }

    // ---------- Lightbox ----------
    var lightbox, lbImg, lbTitle, lbMeta, closeBtn, prevBtn, nextBtn;
    var triggers = [], currentIndex = -1, lastFocus = null;
    var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    var ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
    var ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

    function buildLightbox() {
        lightbox = document.createElement("div");
        lightbox.className = "mo-lightbox";
        lightbox.setAttribute("role", "dialog");
        lightbox.setAttribute("aria-modal", "true");
        lightbox.setAttribute("aria-label", "Artwork viewer");
        lightbox.innerHTML =
            '<button type="button" class="mo-lightbox-close" aria-label="Close viewer">' + ICON_CLOSE + "</button>"
            + '<button type="button" class="mo-lightbox-prev" aria-label="Previous artwork">' + ICON_PREV + "</button>"
            + '<button type="button" class="mo-lightbox-next" aria-label="Next artwork">' + ICON_NEXT + "</button>"
            + '<figure><img alt=""><figcaption><small></small><span></span></figcaption></figure>';
        document.body.appendChild(lightbox);
        lbImg = lightbox.querySelector("img");
        lbMeta = lightbox.querySelector("figcaption small");
        lbTitle = lightbox.querySelector("figcaption span");
        closeBtn = lightbox.querySelector(".mo-lightbox-close");
        prevBtn = lightbox.querySelector(".mo-lightbox-prev");
        nextBtn = lightbox.querySelector(".mo-lightbox-next");
        closeBtn.addEventListener("click", closeLightbox);
        prevBtn.addEventListener("click", function () { navLightbox(-1); });
        nextBtn.addEventListener("click", function () { navLightbox(1); });
        lightbox.addEventListener("click", function (e) { if (e.target === lightbox) closeLightbox(); });
    }
    function renderItem(trigger) {
        lbImg.src = preferOptimized(trigger.getAttribute("data-full"));
        lbImg.alt = trigger.getAttribute("data-title") || "";
        lbTitle.textContent = trigger.getAttribute("data-title") || "";
        lbMeta.textContent = trigger.getAttribute("data-meta") || "";
    }
    function openLightbox(trigger) {
        lastFocus = trigger;
        renderItem(trigger);
        var single = triggers.length < 2;
        prevBtn.style.display = single ? "none" : "";
        nextBtn.style.display = single ? "none" : "";
        docEl.style.overflow = "hidden";
        lightbox.classList.add("is-open");
        document.addEventListener("keydown", onKeydown);
        // Timeout (not rAF) so focus lands reliably once visibility flips.
        setTimeout(function () { closeBtn.focus(); }, 60);
    }
    function navLightbox(dir) {
        if (triggers.length < 2) return;
        currentIndex = (currentIndex + dir + triggers.length) % triggers.length;
        lastFocus = triggers[currentIndex];
        renderItem(triggers[currentIndex]);
    }
    function closeLightbox() {
        lightbox.classList.remove("is-open");
        docEl.style.overflow = "";
        document.removeEventListener("keydown", onKeydown);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function onKeydown(e) {
        if (e.key === "Escape") { closeLightbox(); }
        else if (e.key === "ArrowLeft") { navLightbox(-1); }
        else if (e.key === "ArrowRight") { navLightbox(1); }
        else if (e.key === "Tab") {
            var f = [closeBtn, prevBtn, nextBtn].filter(function (b) { return b.style.display !== "none"; });
            var i = f.indexOf(document.activeElement);
            if (e.shiftKey) { if (i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } }
            else { if (i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
        }
    }
    document.addEventListener("click", function (e) {
        var trigger = e.target.closest ? e.target.closest(".mo-lightbox-trigger") : null;
        if (!trigger) return;
        e.preventDefault();
        triggers = Array.prototype.slice.call(document.querySelectorAll(".mo-lightbox-trigger"));
        currentIndex = triggers.indexOf(trigger);
        openLightbox(trigger);
    });

    // ---------- Mallorca map + seal ----------
    function mapSVG() {
        return '<svg viewBox="0 0 220 160" role="img" aria-labelledby="pf-map-title">'
            + '<title id="pf-map-title">Map of Mallorca with the studio near Palma</title>'
            + '<defs><filter id="pfMallorcaGlow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="#f0c878" flood-opacity="0.32"/></filter></defs>'
            + '<g class="mallorca-grid" aria-hidden="true"><line x1="0" y1="53" x2="220" y2="53"/><line x1="0" y1="106" x2="220" y2="106"/><line x1="73" y1="0" x2="73" y2="160"/><line x1="146" y1="0" x2="146" y2="160"/></g>'
            + '<path class="mallorca-island" filter="url(#pfMallorcaGlow)" d="M22 87 L46 67 L76 53 L112 37 L158 22 L137 39 L144 52 L181 58 L202 65 L179 92 L165 120 L133 136 L123 130 L89 122 L84 98 L66 86 L47 105 Z"/>'
            + '<circle class="mallorca-ping" cx="76" cy="95" r="6"/><circle class="mallorca-ping delay" cx="76" cy="95" r="6"/><circle class="mallorca-pin-dot" cx="76" cy="95" r="3.6"/>'
            + "</svg>";
    }
    function sealSVG() {
        return '<span class="mallorca-seal" aria-hidden="true">'
            + '<svg class="seal-ring" viewBox="0 0 100 100"><defs><path id="pfSealArc" d="M50,50 m-39,0 a39,39 0 1,1 78,0 a39,39 0 1,1 -78,0"/></defs>'
            + '<text><textPath href="#pfSealArc" startOffset="0">HANDMADE · IN MALLORCA · WITH HEART · </textPath></text></svg>'
            + '<span class="seal-core">ML</span></span>';
    }
    function injectMap() {
        var arts = document.querySelectorAll(".portfolio-cred-grid article");
        var target = null;
        Array.prototype.forEach.call(arts, function (a) { if (/mallorca/i.test(a.textContent)) target = a; });
        if (target && !target.querySelector(".portfolio-mallorca-map")) {
            var d = document.createElement("div");
            d.className = "portfolio-mallorca-map";
            d.innerHTML = mapSVG();
            target.insertBefore(d, target.firstChild);
        }
    }
    function injectSeal() {
        var footer = document.querySelector(".portfolio-footer");
        if (footer && !footer.querySelector(".mallorca-seal")) {
            var wrap = document.createElement("div");
            wrap.innerHTML = sealSVG();
            footer.insertBefore(wrap.firstChild, footer.firstChild);
        }
    }

    // ---------- Desktop cursor follower ----------
    function setupCursor() {
        if (reduced() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        var cursor = document.createElement("div");
        cursor.className = "mo-cursor";
        cursor.textContent = "View";
        document.body.appendChild(cursor);
        var x = 0, y = 0, raf = null;
        document.addEventListener("pointermove", function (e) {
            x = e.clientX; y = e.clientY;
            if (!raf) raf = requestAnimationFrame(function () { cursor.style.left = x + "px"; cursor.style.top = y + "px"; raf = null; });
            var overTile = e.target.closest ? e.target.closest(".mo-lightbox-trigger") : null;
            cursor.classList.toggle("is-active", !!overTile);
        }, { passive: true });
        document.addEventListener("mouseleave", function () { cursor.classList.remove("is-active"); });
    }

    function init() {
        buildLightbox();
        setupReveal();
        heroIntro();
        setupScroll();
        setupCountUp();
        injectMap();
        injectSeal();
        setupCursor();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
