#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";

const rootDir = process.cwd();
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const baseUrl = (valueArg("--base-url") || process.env.LOCAL_SITE_URL || "http://127.0.0.1:4173").replace(/\/+$/, "");
const outDir = valueArg("--out-dir") || process.env.VISUAL_QA_DIR || join(rootDir, "qa", "visuals");
const reportJsonPath = valueArg("--json-out") || join(rootDir, "VISUAL-QA.json");
const reportMdPath = valueArg("--md-out") || join(rootDir, "VISUAL-QA.md");
const chromePath = valueArg("--chrome") || process.env.CHROME_PATH || findChrome();

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

const env = { ...loadDotEnv(join(rootDir, ".dev.vars")), ...process.env };
const adminToken = env.ADMIN_TOKEN || "";

function valueArg(name) {
    const prefix = `${name}=`;
    const found = args.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : "";
}

function findChrome() {
    const playwrightChrome = findPlaywrightChrome();
    const candidates = [
        playwrightChrome,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser"
    ].filter(Boolean);
    return candidates.find((candidate) => existsSync(candidate));
}

function findPlaywrightChrome() {
    const home = process.env.HOME || "";
    const cacheDir = home ? join(home, "Library", "Caches", "ms-playwright") : "";
    if (!cacheDir || !existsSync(cacheDir)) return "";
    try {
        const chromiumDirs = readdirSync(cacheDir)
            .filter((entry) => entry.startsWith("chromium-"))
            .sort();
        for (const dir of chromiumDirs) {
            const candidate = join(cacheDir, dir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
            if (existsSync(candidate)) return candidate;
        }
    } catch {
        return "";
    }
    return "";
}

async function freePort() {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = address && typeof address === "object" ? address.port : 0;
            server.close(() => resolve(port));
        });
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, timeoutMs = 10000) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) return await response.json();
            lastError = new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error;
        }
        await sleep(150);
    }
    throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
    constructor(url) {
        this.url = url;
        this.nextId = 1;
        this.pending = new Map();
        this.handlers = new Map();
        this.socket = null;
    }

    async connect() {
        this.socket = new WebSocket(this.url);
        await new Promise((resolve, reject) => {
            this.socket.addEventListener("open", resolve, { once: true });
            this.socket.addEventListener("error", reject, { once: true });
        });
        this.socket.addEventListener("message", (event) => {
            const data = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
            const message = JSON.parse(data);
            if (message.id && this.pending.has(message.id)) {
                const { resolve, reject } = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
                else resolve(message.result || {});
                return;
            }
            if (message.method && this.handlers.has(message.method)) {
                for (const handler of this.handlers.get(message.method)) handler(message.params || {});
            }
        });
    }

    on(method, handler) {
        if (!this.handlers.has(method)) this.handlers.set(method, []);
        this.handlers.get(method).push(handler);
    }

    once(method, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
            const handler = (params) => {
                clearTimeout(timer);
                resolve(params);
            };
            this.on(method, handler);
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        const payload = JSON.stringify({ id, method, params });
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(payload);
        });
    }

    close() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.close();
    }
}

async function createPage(port, url) {
    const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < 15000) {
        try {
            let response = await fetch(endpoint, { method: "PUT" });
            if (!response.ok) response = await fetch(endpoint);
            if (response.ok) return await response.json();
            lastError = new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error;
        }
        await sleep(250);
    }
    throw new Error(`Could not create Chrome target: ${lastError?.message || "timed out"}`);
}

function jsString(value) {
    return JSON.stringify(String(value || ""));
}

async function waitForPageLoad(client, timeoutMs = 15000) {
    return await client.once("Page.loadEventFired", timeoutMs).catch(() => null);
}

function runtimeExceptionMessage(exceptionDetails) {
    return exceptionDetails?.exception?.description
        || exceptionDetails?.exception?.value
        || exceptionDetails?.text
        || "Runtime evaluation failed";
}

async function evaluatePageScript(client, expression, label) {
    const result = await client.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
    });
    if (result.exceptionDetails) {
        throw new Error(`${label}: ${runtimeExceptionMessage(result.exceptionDetails)}`);
    }
    return result.result?.value;
}

async function capturePage(port, spec) {
    const target = await createPage(port, "about:blank");
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    const errors = [];
    client.on("Runtime.exceptionThrown", (params) => {
        errors.push(params.exceptionDetails?.text || params.exceptionDetails?.exception?.description || "Runtime exception");
    });
    client.on("Log.entryAdded", (params) => {
        if (params.entry?.level === "error") errors.push(params.entry.text);
    });

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable").catch(() => {});
    await client.send("Emulation.setDeviceMetricsOverride", {
        width: spec.width,
        height: spec.initialHeight,
        deviceScaleFactor: 1,
        mobile: spec.width <= 520
    });

    if (spec.localStorage) {
        const setupLoad = waitForPageLoad(client);
        await client.send("Page.navigate", { url: spec.setupUrl || spec.url });
        await setupLoad;
        for (const [key, value] of Object.entries(spec.localStorage)) {
            await evaluatePageScript(
                client,
                `localStorage.setItem(${jsString(key)}, ${jsString(value)});`,
                "Local storage setup failed"
            );
        }
    }

    const load = waitForPageLoad(client);
    await client.send("Page.navigate", { url: spec.url });
    await load;
    await sleep(spec.waitMs || 1200);

    if (spec.beforeScreenshotScript) {
        await evaluatePageScript(client, spec.beforeScreenshotScript, "Before screenshot script failed").catch((error) => {
            errors.push(`Before screenshot script failed: ${error.message}`);
        });
        await sleep(350);
    }

    let assertions = null;
    if (spec.assertionScript) {
        assertions = await evaluatePageScript(client, spec.assertionScript, "Visual assertion failed").catch((error) => {
            errors.push(`Visual assertion failed: ${error.message}`);
            return null;
        });
        if (assertions?.issues?.length) {
            errors.push(...assertions.issues.map((issue) => `Visual assertion: ${issue}`));
        }
    }

    const layout = await client.send("Page.getLayoutMetrics");
    const contentHeight = Math.ceil(layout.cssContentSize?.height || spec.initialHeight);
    const captureHeight = spec.fullPage === false
        ? spec.initialHeight
        : Math.min(contentHeight, spec.maxHeight || 16000);
    await client.send("Emulation.setDeviceMetricsOverride", {
        width: spec.width,
        height: captureHeight,
        deviceScaleFactor: 1,
        mobile: spec.width <= 520
    });
    await sleep(500);
    const viewportScroll = spec.fullPage === false
        ? await evaluatePageScript(
            client,
            "({ x: window.scrollX || 0, y: window.scrollY || 0 })",
            "Scroll position read failed"
        ).catch(() => ({ x: 0, y: 0 }))
        : { x: 0, y: 0 };

    const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        clip: {
            x: Math.max(0, Math.round(viewportScroll.x || 0)),
            y: Math.max(0, Math.round(viewportScroll.y || 0)),
            width: spec.width,
            height: captureHeight,
            scale: 1
        }
    });
    client.close();

    mkdirSync(outDir, { recursive: true });
    const path = join(outDir, spec.file);
    const bytes = Buffer.from(screenshot.data, "base64");
    writeFileSync(path, bytes);

    return {
        key: spec.key,
        label: spec.label,
        url: spec.url,
        path,
        width: spec.width,
        height: captureHeight,
        viewport: {
            width: spec.width,
            height: captureHeight
        },
        contentHeight,
        viewportOnly: spec.fullPage === false,
        bytes: bytes.length,
        truncated: spec.fullPage === false ? false : contentHeight > captureHeight,
        assertions,
        errors
    };
}

async function main() {
    if (!chromePath) {
        throw new Error("Chrome/Chromium was not found. Set CHROME_PATH=/path/to/chrome and rerun.");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const siteCheck = await fetch(baseUrl).catch((error) => {
        throw new Error(`Local site is not reachable at ${baseUrl}: ${error.message}`);
    });
    if (!siteCheck.ok) throw new Error(`Local site returned HTTP ${siteCheck.status} at ${baseUrl}`);

    const port = await freePort();
    const userDataDir = mkdtempSync(join(tmpdir(), "maryilu-chrome-"));
    const chrome = spawn(chromePath, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--remote-debugging-address=127.0.0.1",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        "about:blank"
    ], { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    chrome.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
    });

    try {
        await waitForJson(`http://127.0.0.1:${port}/json/version`, 30000);
        const cacheBust = `visual-${timestamp}`;
        const storeAssertionScript = [
            "(() => {",
            "  const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\\s+/g, ' ').trim() || '';",
            "  const titles = Array.from(document.querySelectorAll('.shop-item-card h3')).map((node) => node.textContent.replace(/\\s+/g, ' ').trim());",
            "  const isVisible = (node) => {",
            "    if (!node) return false;",
            "    const rect = node.getBoundingClientRect();",
            "    const style = getComputedStyle(node);",
            "    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;",
            "  };",
            "  const trustCockpit = document.querySelector('.trust-cockpit-section');",
            "  const styles = Array.from(document.styleSheets).map((sheet) => sheet.href || '');",
            "  const scripts = Array.from(document.scripts).map((script) => script.src || '');",
            "  const placeholders = Array.from(document.querySelectorAll('.warm-placeholder')).filter(isVisible).map((node) => node.textContent.replace(/\\s+/g, ' ').trim());",
            "  const overflow = Math.round(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);",
            "  const expectedTitles = ['Baby shower keepsake gift', 'Ribbon bouquet gift', 'Personal memory canvas', 'Painted keepsake chest'];",
            "  const removedSections = ['.commerce-os-section', '.trust-system-section', '.store-signal-band', '.kinetic-gallery-section', '.transform-story-section'];",
            "  const issues = [];",
            "  if (text('#shop-heading') !== 'Gift Ideas & Custom Art') issues.push('shop heading mismatch');",
            "  if (titles.length < expectedTitles.length) issues.push(`expected at least ${expectedTitles.length} shop cards, got ${titles.length}`);",
            "  for (const title of expectedTitles) if (!titles.includes(title)) issues.push(`missing shop card: ${title}`);",
            "  if (isVisible(trustCockpit)) issues.push('hidden trust cockpit should not be visible on the public store');",
            "  if (!styles.some((src) => src.includes('store-warm.css?v=20260624-rose-studio'))) issues.push('warm store css cache-bust marker missing');",
            "  if (styles.some((src) => src.includes('store-final.css') || src.includes('maryilu-pro-max.css') || src.includes('store-review-panel.css'))) issues.push('old sales css should not load on the warm store');",
            "  if (scripts.some((src) => src.includes('vendor/gsap') || src.includes('ScrollTrigger'))) issues.push('GSAP/ScrollTrigger should not load on the sales homepage');",
            "  if (typeof window.gsap !== 'undefined' || typeof window.ScrollTrigger !== 'undefined') issues.push('GSAP globals should not exist on the sales homepage');",
            "  if (placeholders.length < 6) issues.push(`expected visible labeled placeholders, got ${placeholders.length}`);",
            "  for (const selector of removedSections) {",
            "    const node = document.querySelector(selector);",
            "    if (node) issues.push(`${selector} should be removed from the public store`);",
            "  }",
            "  if (!scripts.some((src) => src.includes('site-data.js?v=20260624-transforming-store'))) issues.push('site-data cache-bust marker missing');",
            "  if (!scripts.some((src) => src.includes('script.js?v=20260624-rose-studio'))) issues.push('script cache-bust marker missing');",
            "  if (overflow > 1) issues.push(`horizontal overflow ${overflow}px`);",
            "  return { shopHeading: text('#shop-heading'), shopCards: titles.length, cardTitles: titles, placeholders, trustCockpitVisible: isVisible(trustCockpit), trustCockpitHeading: text('#trust-cockpit-heading'), overflow, issues };",
            "})()"
        ].join("\n");
        const portfolioAssertionScript = [
            "(() => {",
            "  const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\\s+/g, ' ').trim() || '';",
            "  const isVisible = (node) => {",
            "    if (!node) return false;",
            "    const rect = node.getBoundingClientRect();",
            "    const style = getComputedStyle(node);",
            "    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;",
            "  };",
            "  const workCards = Array.from(document.querySelectorAll('.portfolio-work-card')).filter(isVisible).length;",
            "  const socialCards = Array.from(document.querySelectorAll('.portfolio-social-card')).filter(isVisible).length;",
            "  const previewSocialCards = Array.from(document.querySelectorAll('.portfolio-social-card-preview')).filter(isVisible).length;",
            "  const credCards = Array.from(document.querySelectorAll('.portfolio-cred-grid article')).filter(isVisible).length;",
            "  const scripts = Array.from(document.scripts).map((script) => script.src || '');",
            "  const styles = Array.from(document.styleSheets).map((sheet) => sheet.href || '');",
            "  const overflow = Math.round(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);",
            "  const issues = [];",
            "  if (text('#portfolio-heading') !== 'Maryilu Art Portfolio') issues.push('portfolio heading mismatch');",
            "  if (workCards < 3) issues.push(`expected at least 3 portfolio work cards, got ${workCards}`);",
            "  if (socialCards < 1) issues.push(`expected an honest Instagram profile card or live proof cards, got ${socialCards}`);",
            "  if (previewSocialCards > 0) issues.push(`preview social cards should not masquerade as live proof: ${previewSocialCards}`);",
            "  if (credCards !== 3) issues.push(`expected 3 credibility cards, got ${credCards}`);",
            "  if (!scripts.some((src) => src.includes('site-data.js?v=20260624-transforming-store'))) issues.push('portfolio site-data cache-bust marker missing');",
            "  if (!scripts.some((src) => src.includes('portfolio.js?v=20260624-burgundy-portfolio'))) issues.push('portfolio script cache-bust marker missing');",
            "  if (!styles.some((src) => src.includes('portfolio.css?v=20260624-burgundy-portfolio'))) issues.push('portfolio css cache-bust marker missing');",
            "  if (!styles.some((src) => src.includes('maryilu-pro-max.css?v=20260624-premium-palette-cleanup5'))) issues.push('portfolio premium palette css marker missing');",
            "  if (overflow > 1) issues.push(`horizontal overflow ${overflow}px`);",
            "  return { portfolioHeading: text('#portfolio-heading'), workCards, socialCards, previewSocialCards, credCards, overflow, issues };",
            "})()"
        ].join("\n");
        const specs = [
            {
                key: "storeHeroDesktop",
                label: "Store first viewport desktop",
                url: `${baseUrl}/?preview=store&v=${cacheBust}`,
                file: "maryilu-store-first-viewport-desktop.png",
                width: 1440,
                initialHeight: 900,
                fullPage: false,
                assertionScript: storeAssertionScript
            },
            {
                key: "storeHeroMobile",
                label: "Store first viewport mobile",
                url: `${baseUrl}/?preview=store&v=${cacheBust}`,
                file: "maryilu-store-first-viewport-mobile.png",
                width: 390,
                initialHeight: 844,
                fullPage: false,
                assertionScript: storeAssertionScript
            },
            {
                key: "storeDesktop",
                label: "Store desktop",
                url: `${baseUrl}/?preview=store&v=${cacheBust}`,
                file: "maryilu-store-desktop-final-clean.png",
                width: 1440,
                initialHeight: 900,
                assertionScript: storeAssertionScript
            },
            {
                key: "storeMobile",
                label: "Store mobile",
                url: `${baseUrl}/?preview=store&v=${cacheBust}`,
                file: "maryilu-store-mobile-final-clean.png",
                width: 390,
                initialHeight: 844,
                fullPage: false,
                assertionScript: storeAssertionScript
            },
            {
                key: "storeMobileShop",
                label: "Store mobile shop",
                url: `${baseUrl}/?preview=store&v=${cacheBust}`,
                file: "maryilu-store-mobile-shop.png",
                width: 390,
                initialHeight: 844,
                fullPage: false,
                beforeScreenshotScript: "document.getElementById('shop')?.scrollIntoView({ block: 'start' });",
                assertionScript: storeAssertionScript
            },
            {
                key: "storeMobileOrder",
                label: "Store mobile order form",
                url: `${baseUrl}/?preview=store&v=${cacheBust}`,
                file: "maryilu-store-mobile-order.png",
                width: 390,
                initialHeight: 844,
                fullPage: false,
                beforeScreenshotScript: "document.getElementById('order')?.scrollIntoView({ block: 'start' });",
                assertionScript: storeAssertionScript
            },
            {
                key: "storeMobileMenu",
                label: "Store mobile menu",
                url: `${baseUrl}/?preview=store&v=${cacheBust}`,
                file: "maryilu-store-mobile-menu.png",
                width: 390,
                initialHeight: 844,
                fullPage: false,
                beforeScreenshotScript: "document.getElementById('mobileMenuToggle')?.click();",
                assertionScript: storeAssertionScript
            },
            {
                key: "portfolioDesktop",
                label: "Portfolio desktop",
                url: `${baseUrl}/portfolio.html?v=${cacheBust}`,
                file: "maryilu-portfolio-desktop-final-clean.png",
                width: 1440,
                initialHeight: 900,
                assertionScript: portfolioAssertionScript
            },
            {
                key: "portfolioMobile",
                label: "Portfolio mobile",
                url: `${baseUrl}/portfolio.html?v=${cacheBust}`,
                file: "maryilu-portfolio-mobile-final-clean.png",
                width: 390,
                initialHeight: 844,
                assertionScript: portfolioAssertionScript
            }
        ];

        if (secretLooksConfigured(adminToken)) {
            specs.push({
                key: "adminUploadManager",
                label: "Admin upload manager",
                url: `${baseUrl}/admin.html?v=${cacheBust}`,
                setupUrl: `${baseUrl}/?v=${cacheBust}`,
                localStorage: {
                    maryiluAdminToken: adminToken,
                    adminLoggedIn: "true",
                    "pwa-install-dismissed": "true"
                },
                beforeScreenshotScript: [
                    "(async () => {",
                    "  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
                    `  const token = ${jsString(adminToken)};`,
                    "  localStorage.setItem('maryiluAdminToken', token);",
                    "  localStorage.setItem('adminLoggedIn', 'true');",
                    "  localStorage.setItem('pwa-install-dismissed', 'true');",
                    "  document.getElementById('pwa-install-prompt')?.remove();",
                    "  const admin = typeof artAdmin !== 'undefined' ? artAdmin : null;",
                    "  if (admin) {",
                    "    admin.adminToken = token;",
                    "    admin.syncAdminTokenInputs?.();",
                    "    admin.showDashboard?.();",
                    "    admin.showSection?.('shop-item-management');",
                    "    admin.updateActiveNav?.('view-shop-items');",
                    "    if (typeof admin.loadShopItems === 'function') await admin.loadShopItems();",
                    "  } else {",
                    "    const tokenInput = document.getElementById('loginAdminToken');",
                    "    const loginForm = document.getElementById('loginForm');",
                    "    if (tokenInput && loginForm) {",
                    "      tokenInput.value = token;",
                    "      loginForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));",
                    "    }",
                    "  }",
                    "  for (let i = 0; i < 40 && !document.querySelector('.agent-operator-checklist'); i += 1) await wait(250);",
                    "  document.querySelectorAll('input[type=password]').forEach((input) => { input.value = ''; });",
                    "  const dashboard = document.getElementById('admin-dashboard');",
                    "  const checklist = document.querySelector('.agent-operator-checklist');",
                    "  const uploadForm = document.getElementById('shopUploadForm');",
                    "  if (!dashboard || getComputedStyle(dashboard).display === 'none') throw new Error('Admin dashboard did not unlock for visual QA.');",
                    "  if (!checklist) throw new Error('Admin operator checklist not visible for visual QA.');",
                    "  if (!uploadForm) throw new Error('Admin upload composer not visible for visual QA.');",
                    "  uploadForm.scrollIntoView({ block: 'center' });",
                    "  return checklist.textContent.trim();",
                    "})()"
                ].join("\n"),
                file: "maryilu-admin-operator-checklist.png",
                width: 1440,
                initialHeight: 900,
                fullPage: false,
                waitMs: 2400
            });
            specs.push({
                key: "adminStoreImages",
                label: "Admin store image slots",
                url: `${baseUrl}/admin.html?v=${cacheBust}`,
                setupUrl: `${baseUrl}/?v=${cacheBust}`,
                localStorage: {
                    maryiluAdminToken: adminToken,
                    adminLoggedIn: "true",
                    "pwa-install-dismissed": "true"
                },
                beforeScreenshotScript: [
                    "(async () => {",
                    "  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
                    `  const token = ${jsString(adminToken)};`,
                    "  localStorage.setItem('maryiluAdminToken', token);",
                    "  localStorage.setItem('adminLoggedIn', 'true');",
                    "  localStorage.setItem('pwa-install-dismissed', 'true');",
                    "  document.getElementById('pwa-install-prompt')?.remove();",
                    "  const admin = typeof artAdmin !== 'undefined' ? artAdmin : null;",
                    "  if (admin) {",
                    "    admin.adminToken = token;",
                    "    admin.syncAdminTokenInputs?.();",
                    "    admin.showDashboard?.();",
                    "    if (typeof admin.activateSection === 'function') await admin.activateSection('edit-content-section', 'edit-content');",
                    "    else admin.showSection?.('edit-content-section');",
                    "    if (typeof admin.loadSiteContent === 'function') await admin.loadSiteContent();",
                    "  } else {",
                    "    const tokenInput = document.getElementById('loginAdminToken');",
                    "    const loginForm = document.getElementById('loginForm');",
                    "    if (tokenInput && loginForm) {",
                    "      tokenInput.value = token;",
                    "      loginForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));",
                    "    }",
                    "  }",
                    "  for (let i = 0; i < 40 && !document.querySelector('.store-image-editor'); i += 1) await wait(250);",
                    "  document.querySelectorAll('input[type=password]').forEach((input) => { input.value = ''; });",
                    "  const dashboard = document.getElementById('admin-dashboard');",
                    "  const editor = document.querySelector('.store-image-editor');",
                    "  const slots = Array.from(document.querySelectorAll('[data-store-image-slot]'));",
                    "  if (!dashboard || getComputedStyle(dashboard).display === 'none') throw new Error('Admin dashboard did not unlock for visual QA.');",
                    "  if (!editor) throw new Error('Store Images editor not visible for visual QA.');",
                    "  if (slots.length < 6) throw new Error(`Expected 6 store image slots, got ${slots.length}.`);",
                    "  editor.scrollIntoView({ block: 'center' });",
                    "  return slots.map((slot) => slot.getAttribute('data-store-image-slot')).join(', ');",
                    "})()"
                ].join("\n"),
                file: "maryilu-admin-store-image-slots.png",
                width: 1440,
                initialHeight: 900,
                fullPage: false,
                waitMs: 2400
            });
        }

        const captures = [];
        for (const spec of specs) {
            if (!jsonMode) console.log(`Capturing ${spec.label}...`);
            captures.push(await capturePage(port, spec));
        }

        const screenshots = captures.reduce((acc, capture) => {
            acc[capture.key] = capture.path;
            return acc;
        }, {});
        const report = {
            generatedAt: new Date().toISOString(),
            baseUrl,
            chromePath,
            outDir,
            screenshots,
            captures,
            ok: captures.every((capture) => !capture.truncated && !capture.errors.length)
        };

        writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
        writeFileSync(reportMdPath, [
            "# Maryilu Visual QA",
            "",
            `Generated at: ${report.generatedAt}`,
            `Base URL: ${baseUrl}`,
            "",
            ...captures.flatMap((capture) => [
                `- ${capture.label}: ${capture.path}`,
                `  - Size: ${capture.width}x${capture.height}`,
                `  - URL: ${capture.url}`,
                `  - Assertions: ${capture.assertions ? (capture.assertions.issues?.length ? capture.assertions.issues.join("; ") : "passed") : "not applicable"}`,
                `  - Errors: ${capture.errors.length ? capture.errors.join("; ") : "none"}`,
                `  - Truncated: ${capture.truncated ? "yes" : "no"}`
            ]),
            ""
        ].join("\n"));

        if (jsonMode) console.log(JSON.stringify(report, null, 2));
        else {
            console.log(`Visual QA screenshots written to ${outDir}`);
            for (const capture of captures) console.log(`${capture.label}: ${capture.path}`);
            console.log(`Visual QA report written to ${reportMdPath}`);
        }

        if (!report.ok) process.exitCode = 1;
    } finally {
        chrome.kill("SIGTERM");
        try {
            rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch {
            // Chrome can leave a short-lived profile lock behind; it should not fail a successful capture.
        }
        if (process.exitCode && stderr && !jsonMode) {
            console.error(stderr.split(/\r?\n/).filter(Boolean).slice(-8).join("\n"));
        }
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
