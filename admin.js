// Admin Portal JavaScript
class ArtAdmin {
    constructor() {
        this.dataAPI = new DataAPI();
        this.artworks = [];
        this.poetry = [];
        this.orderRequests = [];
        this.shopItems = [];
        this.leadStatuses = (window.MARYILU_DATA && window.MARYILU_DATA.leadStatuses) || [
            'New request',
            'Direction needed',
            'Concept sent',
            'Concept approved',
            'Deposit paid',
            'In progress',
            'Progress update sent',
            'Awaiting final approval',
            'Final payment pending',
            'Ready for pickup/shipping',
            'Completed',
            'Review requested'
        ];
        this.adminToken = localStorage.getItem('maryiluAdminToken') || '';
        this.siteContent = {};
        this.siteSettings = null;
        this.siteSettingsSource = 'Default copy';
        this.activeSiteEditorLang = 'en';
        this.siteEditorCopyFields = [
            'metaTitle',
            'metaDescription',
            'heroTitle',
            'heroSubtitle',
            'heroNote',
            'portfolioTitle',
            'portfolioIntro',
            'portfolioSocialTitle',
            'portfolioSocialText',
            'portfolioAboutTitle',
            'portfolioAboutText',
            'heroPrimaryAvailable',
            'heroPrimaryCustom',
            'heroExplore',
            'heroSecondary',
            'finalCtaTitle',
            'finalCtaText',
            'trustCockpitTitle',
            'trustCockpitText',
            'trustCockpitStepOneTitle',
            'trustCockpitStepOneText',
            'trustCockpitStepTwoTitle',
            'trustCockpitStepTwoText',
            'trustCockpitStepThreeTitle',
            'trustCockpitStepThreeText',
            'pricesTitle',
            'pricesText',
            'priceFromLabel',
            'socialTitle',
            'socialText',
            'socialFallbackText',
            'instagramCta',
            'orderTitle',
            'orderIntro',
            'responseExpectation',
            'depositNotice',
            'requiredNote',
            'privacyNote'
        ];
        this.currentUser = null;
        this.captionAgentDraft = null;
        this.automationStatus = null;
        this.agentBrief = null;
        this.dataReady = this.loadData();
        this.init();
    }

    async loadData() {
        // Load from API (with localStorage fallback)
        this.artworks = await this.dataAPI.getArtworks();
        this.poetry = await this.dataAPI.getPoetry();
        this.siteContent = await this.dataAPI.getSiteContent();
        
        // Empty states are better than generic sample art in the real admin.
    }

    loadSampleData() {
        // Load sample data if no artworks exist
        if (this.artworks.length === 0) {
            const sampleArtworks = [
                {
                    id: 1,
                    title: "Sunset Dreams",
                    year: 2024,
                    medium: "Oil on Canvas",
                    size: "24x36 inches",
                    description: "A vibrant exploration of color and light, capturing the ethereal beauty of a sunset over rolling hills. This piece represents the artist's fascination with the interplay between natural light and emotional response.",
                    imageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImdyYWQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmZjY2MDA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSI1MCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmZmNjMDA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojNjY5OWZmO3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JhZCkiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE4IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlN1bnNldCBEcmVhbXM8L3RleHQ+PC9zdmc+",
                    createdAt: "2024-01-15T10:00:00Z"
                },
                {
                    id: 2,
                    title: "Urban Reflections",
                    year: 2024,
                    medium: "Acrylic on Canvas",
                    size: "30x40 inches",
                    description: "An abstract interpretation of city life, featuring bold geometric shapes and vibrant colors that reflect the energy and complexity of urban environments.",
                    imageUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzMzIi8+PHJlY3QgeD0iMjAlIiB5PSIxMCUiIHdpZHRoPSI2MCUiIGhlaWdodD0iODAlIiBmaWxsPSIjNjY2Ii8+PHJlY3QgeD0iMzAlIiB5PSIyMCUiIHdpZHRoPSI0MCUiIGhlaWdodD0iNjAlIiBmaWxsPSIjOTk5Ii8+PHJlY3QgeD0iNDAlIiB5PSIzMCUiIHdpZHRoPSIyMCUiIGhlaWdodD0iNDAlIiBmaWxsPSIjY2NjIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlVyYmFuIFJlZmxlY3Rpb25zPC90ZXh0Pjwvc3ZnPg==",
                    createdAt: "2024-02-20T14:30:00Z"
                }
            ];
            this.artworks = sampleArtworks;
            localStorage.setItem('artworks', JSON.stringify(this.artworks));
        }

        // Load sample poetry data if no poetry exists
        if (this.poetry.length === 0) {
            const samplePoetry = [
                {
                    id: 1,
                    title: "Urban Dreams",
                    content: "In the city's heartbeat,<br>Where shadows meet light,<br>I paint my dreams<br>In colors bold and bright.",
                    date: "March 2024",
                    theme: "Urban Life",
                    createdAt: "2024-03-15T10:00:00Z"
                },
                {
                    id: 2,
                    title: "Nature's Whisper",
                    content: "Through the trees,<br>A gentle breeze,<br>Nature speaks<br>In silent ease.",
                    date: "February 2024",
                    theme: "Nature",
                    createdAt: "2024-02-20T14:30:00Z"
                },
                {
                    id: 3,
                    title: "Creative Fire",
                    content: "In my studio,<br>Where magic flows,<br>Every brushstroke<br>A story grows.",
                    date: "January 2024",
                    theme: "Art & Creation",
                    createdAt: "2024-01-10T09:15:00Z"
                },
                {
                    id: 4,
                    title: "Evening Light",
                    content: "As day turns to night,<br>Golden hour's glow,<br>Captures the soul<br>Of all we know.",
                    date: "December 2023",
                    theme: "Time & Light",
                    createdAt: "2023-12-05T16:45:00Z"
                }
            ];
            this.poetry = samplePoetry;
            localStorage.setItem('poetry', JSON.stringify(this.poetry));
        }
    }

    init() {
        this.renderWorkerEnvironmentBadge();
        this.bindEvents();
        this.checkAuth();
    }

    renderWorkerEnvironmentBadge() {
        const badge = document.getElementById('workerEnvironmentBadge');
        if (!badge) return;

        const isLocalApi = this.dataAPI.isLocalApiUrl();
        badge.textContent = isLocalApi ? 'Local Worker' : 'Production Worker';
        badge.className = `worker-env-badge ${isLocalApi ? 'is-local' : 'is-production'}`;
        badge.title = this.dataAPI.apiUrl;
    }

    describeStripeMode(configured = {}) {
        const mode = configured.stripeMode || 'unconfigured';
        if (mode === 'live') return 'Live mode';
        if (mode === 'test') return configured.stripeTestModeAllowed ? 'Test mode allowed' : 'Test mode blocked';
        return 'Not configured';
    }

    publicTargetsFromSelection(updates, requiredTargets = []) {
        const selected = Array.isArray(updates.publishTargets)
            ? updates.publishTargets.filter(Boolean)
            : [];
        const targets = selected.length ? selected : ['store'];
        return Array.from(new Set([...targets, ...requiredTargets]));
    }

    syncAdminTokenInputs() {
        ['adminToken', 'shopAdminToken', 'loginAdminToken', 'settingsAdminToken'].forEach((id) => {
            const input = document.getElementById(id);
            if (input) input.value = this.adminToken || '';
        });
    }

    readAdminTokenFromInputs() {
        const values = ['settingsAdminToken', 'shopAdminToken', 'adminToken', 'loginAdminToken']
            .map((id) => document.getElementById(id)?.value.trim())
            .filter(Boolean);
        this.adminToken = values[0] || this.adminToken || '';
        this.syncAdminTokenInputs();
        return this.adminToken;
    }

    async saveAdminTokenFromInputs(source = 'lead') {
        this.readAdminTokenFromInputs();
        localStorage.setItem('maryiluAdminToken', this.adminToken);
        if (source === 'shop') {
            this.showShopItemMessage('Admin token saved in this browser.');
            await this.loadShopItems();
            return;
        }
        if (source === 'settings') {
            this.setStudioSettingsStatus('Admin token saved in this browser.', 'success');
            this.updateSettingsPanel();
            return;
        }
        this.showLeadMessage('Admin token saved in this browser.');
        await this.loadOrderRequests();
    }

    bindEvents() {
        // Camera functionality
        document.getElementById('cameraBtn').addEventListener('click', () => {
            this.openCamera();
        });
        
        document.getElementById('galleryBtn').addEventListener('click', () => {
            document.getElementById('artworkImage').click();
        });
        
        // Login form
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // Navigation - improved with data attributes
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                const sectionId = btn.getAttribute('data-section');
                if (sectionId) {
                    await this.activateSection(sectionId, btn.getAttribute('data-nav-target') || btn.id);
                }
            });
        });

        document.querySelectorAll('[data-studio-jump]').forEach((button) => {
            button.addEventListener('click', async () => {
                await this.activateSection(
                    button.getAttribute('data-studio-jump'),
                    button.getAttribute('data-nav-target'),
                    button.getAttribute('data-studio-anchor')
                );
            });
        });

        const adminTokenInput = document.getElementById('adminToken');
        if (adminTokenInput) {
            adminTokenInput.value = this.adminToken;
        }
        this.syncAdminTokenInputs();

        const saveAdminToken = document.getElementById('saveAdminToken');
        if (saveAdminToken) {
            saveAdminToken.addEventListener('click', async () => {
                await this.saveAdminTokenFromInputs('lead');
            });
        }

        const saveShopAdminToken = document.getElementById('saveShopAdminToken');
        if (saveShopAdminToken) {
            saveShopAdminToken.addEventListener('click', async () => {
                await this.saveAdminTokenFromInputs('shop');
            });
        }

        const refreshLeads = document.getElementById('refreshLeads');
        if (refreshLeads) {
            refreshLeads.addEventListener('click', async () => {
                await this.loadOrderRequests();
            });
        }

        const syncInstagram = document.getElementById('syncInstagram');
        if (syncInstagram) {
            syncInstagram.addEventListener('click', async () => {
                await this.syncInstagramMedia();
            });
        }

        const refreshShopItems = document.getElementById('refreshShopItems');
        if (refreshShopItems) {
            refreshShopItems.addEventListener('click', async () => {
                await this.loadShopItems();
            });
        }

        const syncInstagramShop = document.getElementById('syncInstagramShop');
        if (syncInstagramShop) {
            syncInstagramShop.addEventListener('click', async () => {
                await this.syncInstagramMedia();
            });
        }

        const simulateInstagramSync = document.getElementById('simulateInstagramSync');
        if (simulateInstagramSync) {
            const isLocalApi = this.dataAPI.isLocalApiUrl();
            simulateInstagramSync.disabled = !isLocalApi;
            simulateInstagramSync.title = isLocalApi
                ? 'Run the local Instagram automation path with safe sample posts.'
                : 'Local Worker only. Use Sync Instagram for production.';
            simulateInstagramSync.addEventListener('click', async () => {
                await this.simulateInstagramSync();
            });
        }

        const addManualShopItem = document.getElementById('addManualShopItem');
        if (addManualShopItem) {
            addManualShopItem.addEventListener('click', async () => {
                await this.createManualShopItem();
            });
        }

        const openShopUploadComposer = document.getElementById('openShopUploadComposer');
        if (openShopUploadComposer) {
            openShopUploadComposer.addEventListener('click', () => {
                this.focusShopUploadComposer();
            });
        }

        const shopUploadImage = document.getElementById('shopUploadImage');
        if (shopUploadImage) {
            shopUploadImage.addEventListener('change', () => {
                this.previewShopUploadImage(shopUploadImage.files && shopUploadImage.files[0]);
            });
        }

        const shopUploadForm = document.getElementById('shopUploadForm');
        if (shopUploadForm) {
            shopUploadForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                await this.handleShopUploadSubmit();
            });
        }

        const resetShopUploadForm = document.getElementById('resetShopUploadForm');
        if (resetShopUploadForm) {
            resetShopUploadForm.addEventListener('click', () => {
                this.resetShopUploadForm();
            });
        }

        const analyzeCaptionAgent = document.getElementById('analyzeCaptionAgent');
        if (analyzeCaptionAgent) {
            analyzeCaptionAgent.addEventListener('click', async () => {
                await this.analyzeCaptionAgent();
            });
        }

        const createCaptionDraft = document.getElementById('createCaptionDraft');
        if (createCaptionDraft) {
            createCaptionDraft.addEventListener('click', async () => {
                await this.createCaptionDraftFromAnalysis();
            });
        }

        document.getElementById('logout').addEventListener('click', () => {
            this.logout();
        });

        // Artwork form
        document.getElementById('artworkForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleArtworkSubmit();
        });

        document.getElementById('cancelAdd').addEventListener('click', () => {
            this.showSection('artwork-management');
            this.updateActiveNav('view-artworks');
            document.getElementById('artworkForm').reset();
            document.getElementById('imagePreview').innerHTML = '';
        });

        // Poetry form
        document.getElementById('poetryForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handlePoetrySubmit();
        });

        document.getElementById('cancelPoetryAdd').addEventListener('click', () => {
            this.showSection('poetry-management');
            this.updateActiveNav('view-poetry');
            document.getElementById('poetryForm').reset();
        });

        // Site editor
        const contentForm = document.getElementById('contentForm');
        if (contentForm) {
            contentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleContentSubmit();
            });
        }

        const reloadSiteSettings = document.getElementById('reloadSiteSettings');
        if (reloadSiteSettings) {
            reloadSiteSettings.addEventListener('click', async () => {
                await this.loadSiteContent({ forceRemote: true });
            });
        }

        document.querySelectorAll('.site-language-tab').forEach((button) => {
            button.addEventListener('click', () => {
                this.setSiteEditorLanguage(button.getAttribute('data-site-lang') || 'en');
            });
        });

        document.querySelectorAll('[data-store-image-upload]').forEach((button) => {
            button.addEventListener('click', async () => {
                await this.handleStoreImageUpload(button.getAttribute('data-store-image-upload'));
            });
        });

        document.querySelectorAll('[data-store-image-file]').forEach((input) => {
            input.addEventListener('change', () => {
                this.previewStoreImageFile(
                    input.getAttribute('data-store-image-file'),
                    input.files && input.files[0]
                );
            });
        });

        document.querySelectorAll('[data-store-image-field]').forEach((input) => {
            input.addEventListener('input', () => {
                const slotId = input.getAttribute('data-store-image-slot-id');
                this.renderStoreImagePreview(slotId, this.readStoreImageSlotFromFields(slotId));
            });
        });

        const cancelContentEdit = document.getElementById('cancelContentEdit');
        if (cancelContentEdit) {
            cancelContentEdit.addEventListener('click', async () => {
                await this.activateSection('studio-dashboard-section', 'view-dashboard');
            });
        }

        const saveStudioSettings = document.getElementById('saveStudioSettings');
        if (saveStudioSettings) {
            saveStudioSettings.addEventListener('click', async () => {
                await this.saveStudioConnectionSettings();
            });
        }

        const resetStudioSettings = document.getElementById('resetStudioSettings');
        if (resetStudioSettings) {
            resetStudioSettings.addEventListener('click', () => {
                localStorage.removeItem('maryiluApiUrl');
                const input = document.getElementById('settingsApiUrl');
                if (input) input.value = '';
                this.setStudioSettingsStatus('Default API restored for the next reload.', 'success');
                this.updateSettingsPanel();
            });
        }

        // Image preview
        document.getElementById('artworkImage').addEventListener('change', (e) => {
            this.previewImage(e.target.files[0]);
        });
    }

    checkAuth() {
        const isLoggedIn = localStorage.getItem('adminLoggedIn') === 'true' && Boolean(this.adminToken);
        if (isLoggedIn) {
            this.showDashboard();
            this.activateSection('studio-dashboard-section', 'view-dashboard');
            this.dataReady.then(() => this.refreshStudioDashboard());
        } else {
            this.showLogin();
        }
    }

    async handleLogin() {
        const tokenInput = document.getElementById('loginAdminToken');
        const loginStatus = document.getElementById('loginStatus');
        const submitButton = document.querySelector('#loginForm .login-btn');
        const token = tokenInput ? tokenInput.value.trim() : '';

        if (!token) {
            if (loginStatus) {
                loginStatus.textContent = 'Enter the Worker admin token.';
                loginStatus.className = 'login-status error';
            }
            return;
        }

        if (loginStatus) {
            loginStatus.textContent = 'Checking token...';
            loginStatus.className = 'login-status';
        }
        if (submitButton) submitButton.disabled = true;

        const status = await this.dataAPI.getAutomationStatus(token);
        if (!status || !status.success) {
            if (submitButton) submitButton.disabled = false;
            if (loginStatus) {
                loginStatus.textContent = status?.error || 'Token could not be verified.';
                loginStatus.className = 'login-status error';
            }
            return;
        }

        this.adminToken = token;
        this.currentUser = { username: 'admin' };
        localStorage.setItem('maryiluAdminToken', this.adminToken);
        localStorage.setItem('adminLoggedIn', 'true');
        this.syncAdminTokenInputs();
        if (submitButton) submitButton.disabled = false;
        if (loginStatus) {
            loginStatus.textContent = 'Admin unlocked.';
            loginStatus.className = 'login-status success';
        }
        this.showDashboard();
        await this.dataReady;
        await this.activateSection('studio-dashboard-section', 'view-dashboard');
        await this.refreshStudioDashboard();
    }

    logout() {
        localStorage.removeItem('adminLoggedIn');
        localStorage.removeItem('maryiluAdminToken');
        this.adminToken = '';
        this.currentUser = null;
        this.syncAdminTokenInputs();
        this.showLogin();
    }

    showLogin() {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('admin-dashboard').style.display = 'none';
        const loginTokenInput = document.getElementById('loginAdminToken');
        if (loginTokenInput) loginTokenInput.value = this.adminToken || '';
    }

    showDashboard() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'block';
    }

    showSection(sectionId) {
        document.querySelectorAll('.management-section').forEach(section => {
            section.style.display = 'none';
        });
        const section = document.getElementById(sectionId);
        if (section) section.style.display = 'block';
    }

    updateActiveNav(activeId) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const active = document.getElementById(activeId);
        if (active) active.classList.add('active');
    }

    navIdForSection(sectionId) {
        const navMap = {
            'studio-dashboard-section': 'view-dashboard',
            'edit-content-section': 'edit-content',
            'artwork-management': 'view-artworks',
            'add-artwork-section': 'view-artworks',
            'poetry-management': 'view-artworks',
            'add-poetry-section': 'view-artworks',
            'lead-management': 'view-leads',
            'shop-item-management': 'view-shop-items',
            'settings-section': 'view-settings'
        };
        return navMap[sectionId] || 'view-dashboard';
    }

    async activateSection(sectionId, activeNavId, anchorId = '') {
        if (!sectionId) return;
        this.showSection(sectionId);
        this.updateActiveNav(activeNavId || this.navIdForSection(sectionId));

        if (sectionId === 'studio-dashboard-section') {
            this.renderStudioDashboard();
        } else if (sectionId === 'artwork-management') {
            this.loadArtworks();
        } else if (sectionId === 'poetry-management') {
            this.loadPoetry();
        } else if (sectionId === 'lead-management') {
            await this.loadOrderRequests();
        } else if (sectionId === 'shop-item-management') {
            await this.loadShopItems();
        } else if (sectionId === 'edit-content-section') {
            await this.loadSiteContent();
        } else if (sectionId === 'settings-section') {
            this.updateSettingsPanel();
        }

        if (anchorId) {
            window.requestAnimationFrame(() => {
                document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    }

    escapeHTML(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    localizedValue(value, lang = 'en') {
        if (value == null) return '';
        if (typeof value === 'string' || typeof value === 'number') return String(value);
        return value[lang] || value.en || Object.values(value)[0] || '';
    }

    deepMerge(base, override) {
        const output = Array.isArray(base) ? [...base] : { ...(base || {}) };
        Object.entries(override || {}).forEach(([key, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                output[key] = this.deepMerge(output[key] || {}, value);
                return;
            }
            output[key] = value;
        });
        return output;
    }

    getNestedValue(source, path, fallback = '') {
        return String(path || '').split('.').reduce((current, key) => {
            if (current && Object.prototype.hasOwnProperty.call(current, key)) return current[key];
            return undefined;
        }, source) ?? fallback;
    }

    setNestedValue(target, path, value) {
        const keys = String(path || '').split('.').filter(Boolean);
        const last = keys.pop();
        if (!last) return;
        const parent = keys.reduce((current, key) => {
            current[key] = current[key] || {};
            return current[key];
        }, target);
        parent[last] = value;
    }

    getDefaultSiteSettings() {
        const data = window.MARYILU_DATA || {};
        const copy = data.copy || {};
        const copySettings = { en: {}, es: {} };
        this.siteEditorCopyFields.forEach((field) => {
            copySettings.en[field] = copy.en?.[field] || '';
            copySettings.es[field] = copy.es?.[field] || copy.en?.[field] || '';
        });

        const instagram = (data.socialLinks || []).find((link) => link.id === 'instagram') || {};
        const pricingCards = (data.categoryMeta || []).map((category) => ({
            id: category.id || '',
            label: this.localizedValue(category.shortName || category.publicCategory, 'en'),
            labelEs: this.localizedValue(category.shortName || category.publicCategory, 'es'),
            priceFrom: category.priceFrom || '',
            note: this.localizedValue(category.summary || category.priceNote, 'en'),
            noteEs: this.localizedValue(category.summary || category.priceNote, 'es')
        }));

        return {
            version: 1,
            updatedAt: null,
            copy: copySettings,
            cta: {
                primaryHref: '#products',
                secondaryHref: '#order'
            },
            pricing: {
                currency: 'EUR',
                showStartingPrices: true,
                cards: pricingCards
            },
            social: {
                showSocialSection: true,
                useLiveInstagram: false,
                instagramUrl: instagram.href || 'https://www.instagram.com/marialuisas_arttt/',
                instagramHandle: instagram.handle || '@marialuisas_arttt'
            },
            form: {
                ordersOpen: true,
                directCheckoutEnabled: false,
                depositPercent: 50
            },
            assets: {
                storeHero: {
                    mediaUrl: '',
                    alt: 'Maryilu handmade gift preview',
                    placeholderLabel: 'Photo placeholder: Hero product'
                },
                categories: {
                    'gift-boxes': {
                        mediaUrl: '',
                        alt: 'Painted Maryilu chest',
                        placeholderLabel: 'Photo placeholder: Painted chest'
                    },
                    flowers: {
                        mediaUrl: '',
                        alt: 'Handmade ribbon bouquet',
                        placeholderLabel: 'Photo placeholder: Ribbon bouquet'
                    },
                    canvases: {
                        mediaUrl: '',
                        alt: 'Custom Maryilu canvas',
                        placeholderLabel: 'Photo placeholder: Custom canvas'
                    },
                    'baby-shower': {
                        mediaUrl: '',
                        alt: 'Baby shower gift',
                        placeholderLabel: 'Photo placeholder: Baby gift'
                    }
                },
                about: {
                    mediaUrl: '',
                    alt: 'Maria Luisa in the Maryilu studio',
                    placeholderLabel: 'Photo placeholder: Maria in the studio'
                },
                heroImage: '',
                editorialImage: '',
                portfolioImage: ''
            }
        };
    }

    getStoreImageSlots() {
        return [
            { id: 'storeHero', path: ['assets', 'storeHero'], legacy: ['assets', 'heroImage'], label: 'Hero product' },
            { id: 'gift-boxes', path: ['assets', 'categories', 'gift-boxes'], label: 'Painted chests' },
            { id: 'flowers', path: ['assets', 'categories', 'flowers'], legacy: ['assets', 'editorialImage'], label: 'Ribbon bouquets' },
            { id: 'canvases', path: ['assets', 'categories', 'canvases'], legacy: ['assets', 'portfolioImage'], label: 'Custom canvases' },
            { id: 'baby-shower', path: ['assets', 'categories', 'baby-shower'], label: 'Baby gifts' },
            { id: 'about', path: ['assets', 'about'], legacy: ['assets', 'portfolioImage'], label: 'About Maryilu' }
        ];
    }

    normalizeStoreImageSlot(slot, defaults = {}, legacyUrl = '') {
        const cleanMediaUrl = (value) => {
            const url = String(value || '').trim();
            const oldGeneratedPlaceholders = [
                'assets/maryilu-luxury-chest-hero.png',
                'assets/maryilu-editorial-store-hero.png',
                'assets/maria-luisa-portfolio-studio.png'
            ];
            return oldGeneratedPlaceholders.includes(url) ? '' : url;
        };
        const base = {
            mediaUrl: defaults.mediaUrl || '',
            alt: defaults.alt || '',
            placeholderLabel: defaults.placeholderLabel || 'Photo placeholder'
        };
        if (typeof slot === 'string') {
            return { ...base, mediaUrl: cleanMediaUrl(slot) };
        }
        if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
            return { ...base, mediaUrl: cleanMediaUrl(legacyUrl || base.mediaUrl) };
        }
        return {
            mediaUrl: cleanMediaUrl(slot.mediaUrl || slot.url || slot.src || legacyUrl || base.mediaUrl),
            alt: String(slot.alt || base.alt || '').trim(),
            placeholderLabel: String(slot.placeholderLabel || base.placeholderLabel || 'Photo placeholder').trim()
        };
    }

    getValueByPath(source, path = []) {
        return path.reduce((current, key) => {
            if (current && Object.prototype.hasOwnProperty.call(current, key)) return current[key];
            return undefined;
        }, source);
    }

    setValueByPath(target, path = [], value) {
        const keys = [...path];
        const last = keys.pop();
        if (!last) return;
        const parent = keys.reduce((current, key) => {
            current[key] = current[key] || {};
            return current[key];
        }, target);
        parent[last] = value;
    }

    normalizeSiteSettings(settings = {}) {
        const defaults = this.getDefaultSiteSettings();
        const normalized = this.deepMerge(defaults, settings || {});
        normalized.copy = normalized.copy || {};
        ['en', 'es'].forEach((lang) => {
            normalized.copy[lang] = {
                ...(defaults.copy[lang] || {}),
                ...(settings.copy?.[lang] || normalized.copy[lang] || {})
            };
        });
        normalized.pricing = normalized.pricing || defaults.pricing;
        normalized.pricing.cards = Array.isArray(normalized.pricing.cards)
            ? normalized.pricing.cards
            : defaults.pricing.cards;
        normalized.assets = normalized.assets || defaults.assets;
        this.getStoreImageSlots().forEach((slotDef) => {
            const slotValue = this.getValueByPath(normalized, slotDef.path);
            const defaultValue = this.getValueByPath(defaults, slotDef.path) || {};
            const legacyUrl = slotDef.legacy ? String(this.getValueByPath(normalized, slotDef.legacy) || '') : '';
            this.setValueByPath(normalized, slotDef.path, this.normalizeStoreImageSlot(slotValue, defaultValue, legacyUrl));
        });
        return normalized;
    }

    readLocalSiteSettingsDraft() {
        try {
            const raw = localStorage.getItem('maryiluSiteSettingsDraft');
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.warn('Local site settings draft could not be read:', error);
            return null;
        }
    }

    async fetchSiteSettingsFromWorker() {
        try {
            const headers = this.adminToken ? { Authorization: `Bearer ${this.adminToken}` } : {};
            const response = await fetch(`${this.dataAPI.apiUrl}/site-settings?t=${Date.now()}`, {
                cache: 'no-store',
                headers
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                return {
                    ok: false,
                    status: response.status,
                    error: data.error || `Worker returned ${response.status}`
                };
            }
            return {
                ok: true,
                settings: data.settings || data.siteSettings || data
            };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    async saveSiteSettingsToWorker(settings) {
        try {
            const response = await fetch(`${this.dataAPI.apiUrl}/site-settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.adminToken || ''}`
                },
                body: JSON.stringify(settings)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                return {
                    ok: false,
                    status: response.status,
                    error: data.error || `Worker returned ${response.status}`
                };
            }
            return { ok: true, settings: data.settings || data.siteSettings || settings };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    async loadSiteSettings({ forceRemote = false } = {}) {
        const remote = await this.fetchSiteSettingsFromWorker();
        if (remote.ok) {
            return {
                settings: this.normalizeSiteSettings(remote.settings),
                source: 'Worker /site-settings'
            };
        }

        const localDraft = this.readLocalSiteSettingsDraft();
        if (localDraft && !forceRemote) {
            return {
                settings: this.normalizeSiteSettings(localDraft),
                source: 'Local draft',
                warning: remote.error
            };
        }

        return {
            settings: this.normalizeSiteSettings(localDraft || {}),
            source: localDraft ? 'Local draft' : 'Default copy',
            warning: remote.error
        };
    }

    renderPricingEditorList(cards = []) {
        const container = document.getElementById('pricingEditorList');
        if (!container) return;
        const rows = cards.length ? cards : this.getDefaultSiteSettings().pricing.cards;
        container.innerHTML = rows.map((card, index) => `
            <div class="pricing-editor-row" data-pricing-index="${index}">
                <label>
                    <span>English label</span>
                    <input type="text" data-pricing-field="label" value="${this.escapeHTML(card.label || '')}">
                </label>
                <label>
                    <span>Spanish label</span>
                    <input type="text" data-pricing-field="labelEs" value="${this.escapeHTML(card.labelEs || '')}">
                </label>
                <label>
                    <span>Starting price</span>
                    <input type="text" data-pricing-field="priceFrom" value="${this.escapeHTML(card.priceFrom || '')}">
                </label>
                <label>
                    <span>Note</span>
                    <input type="text" data-pricing-field="note" value="${this.escapeHTML(card.note || '')}">
                </label>
            </div>
        `).join('');
    }

    renderStoreImagePreview(slotId, slot = {}) {
        const preview = document.querySelector(`[data-store-image-preview="${slotId}"]`);
        if (!preview) return;
        const mediaUrl = String(slot.mediaUrl || '').trim();
        if (mediaUrl) {
            preview.innerHTML = `<img src="${this.escapeHTML(mediaUrl)}" alt="${this.escapeHTML(slot.alt || slot.placeholderLabel || 'Store image preview')}">`;
            return;
        }
        preview.textContent = slot.placeholderLabel || 'Photo placeholder';
    }

    previewStoreImageFile(slotId, file) {
        if (!slotId) return;
        if (!file) {
            this.renderStoreImagePreview(slotId, this.readStoreImageSlotFromFields(slotId));
            this.setStoreImageStatus(slotId, '');
            return;
        }
        if (!/^image\/(jpe?g|png|webp)$/i.test(file.type || '')) {
            this.setStoreImageStatus(slotId, 'Use a JPG, PNG, or WebP image.', 'error');
            return;
        }
        const preview = document.querySelector(`[data-store-image-preview="${slotId}"]`);
        if (!preview) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            preview.innerHTML = `<img src="${this.escapeHTML(event.target.result)}" alt="Selected store image preview">`;
            const sizeKb = Math.max(1, Math.round((file.size || 0) / 1024));
            this.setStoreImageStatus(slotId, `Selected ${file.name || 'image'} (${sizeKb} KB). Upload, then save Site Settings.`, 'success');
        };
        reader.onerror = () => {
            this.setStoreImageStatus(slotId, 'Image preview could not be loaded.', 'error');
        };
        reader.readAsDataURL(file);
    }

    setStoreImageStatus(slotId, message, type = '') {
        const status = document.querySelector(`[data-store-image-status="${slotId}"]`);
        if (!status) return;
        status.textContent = message || '';
        status.className = `store-image-status ${type}`;
    }

    populateStoreImageFields(settings) {
        this.getStoreImageSlots().forEach((slotDef) => {
            const slot = this.getValueByPath(settings, slotDef.path) || {};
            document.querySelectorAll(`[data-store-image-slot-id="${slotDef.id}"]`).forEach((input) => {
                input.value = slot[input.getAttribute('data-store-image-field')] || '';
            });
            this.renderStoreImagePreview(slotDef.id, slot);
            this.setStoreImageStatus(slotDef.id, '');
        });
    }

    readStoreImageFields(settings) {
        this.getStoreImageSlots().forEach((slotDef) => {
            const current = this.getValueByPath(settings, slotDef.path) || {};
            const slot = {
                mediaUrl: String(current.mediaUrl || '').trim(),
                alt: String(current.alt || '').trim(),
                placeholderLabel: String(current.placeholderLabel || '').trim()
            };
            document.querySelectorAll(`[data-store-image-slot-id="${slotDef.id}"]`).forEach((input) => {
                slot[input.getAttribute('data-store-image-field')] = input.value.trim();
            });
            this.setValueByPath(settings, slotDef.path, slot);
        });
        return settings;
    }

    readStoreImageSlotFromFields(slotId) {
        const normalized = this.normalizeSiteSettings(this.siteSettings || {});
        const slotDef = this.getStoreImageSlots().find((slot) => slot.id === slotId);
        const current = slotDef ? (this.getValueByPath(normalized, slotDef.path) || {}) : {};
        const slot = {
            mediaUrl: String(current.mediaUrl || '').trim(),
            alt: String(current.alt || '').trim(),
            placeholderLabel: String(current.placeholderLabel || '').trim()
        };
        document.querySelectorAll(`[data-store-image-slot-id="${slotId}"]`).forEach((input) => {
            slot[input.getAttribute('data-store-image-field')] = input.value.trim();
        });
        return slot;
    }

    async handleStoreImageUpload(slotId) {
        this.readAdminTokenFromInputs();
        const slotDef = this.getStoreImageSlots().find((slot) => slot.id === slotId);
        if (!slotDef) return;

        const fileInput = document.querySelector(`[data-store-image-file="${slotId}"]`);
        const mediaInput = document.querySelector(`[data-store-image-field="mediaUrl"][data-store-image-slot-id="${slotId}"]`);
        const file = fileInput?.files && fileInput.files[0];
        if (!file) {
            this.setStoreImageStatus(slotId, 'Choose an image first.', 'error');
            return;
        }
        if (!this.adminToken) {
            this.setStoreImageStatus(slotId, 'Save the Worker ADMIN_TOKEN first.', 'error');
            return;
        }

        this.setStoreImageStatus(slotId, 'Preparing image...');
        try {
            const prepared = await this.prepareStoreImageFile(file);
            this.setStoreImageStatus(slotId, 'Uploading image...');
            const upload = await this.dataAPI.uploadImage(prepared.file, this.adminToken);
            let mediaUrl = '';
            let successMessage = '';
            if (upload && upload.success && (upload.mediaUrl || upload.url)) {
                mediaUrl = upload.mediaUrl || upload.url;
                successMessage = `Uploaded to Maryilu media (${prepared.width}x${prepared.height}). Save Site Settings to publish this slot.`;
            } else if (upload?.status === 401) {
                throw new Error('The admin token was rejected.');
            } else if (this.dataAPI.isLocalApiUrl()) {
                mediaUrl = prepared.dataUrl;
                successMessage = `Local image prepared (${prepared.width}x${prepared.height}). Save Site Settings to keep this local preview.`;
            } else {
                throw new Error(upload?.error || 'Image upload failed. Check the media service connection.');
            }

            if (mediaInput) mediaInput.value = mediaUrl;
            const slot = this.readStoreImageSlotFromFields(slotId);
            slot.mediaUrl = mediaUrl;
            this.renderStoreImagePreview(slotId, slot);
            this.setStoreImageStatus(slotId, successMessage, 'success');
        } catch (error) {
            this.setStoreImageStatus(slotId, error.message || 'Image upload failed.', 'error');
        }
    }

    setSiteEditorStatus(message, type = '') {
        const status = document.getElementById('siteEditorStatus');
        if (!status) return;
        status.textContent = message || '';
        status.className = `site-editor-status ${type}`;
    }

    updateSiteSettingsSource(source, warning = '') {
        this.siteSettingsSource = source || 'Default copy';
        const sourceEl = document.getElementById('siteSettingsSource');
        if (sourceEl) {
            sourceEl.textContent = warning
                ? `${this.siteSettingsSource} - Worker fallback active`
                : this.siteSettingsSource;
            sourceEl.className = `site-editor-source ${warning ? 'is-warning' : 'is-ready'}`;
        }
        this.updateSettingsPanel();
        this.renderStudioDashboard();
    }

    populateSiteSettingsForm(settings) {
        const normalized = this.normalizeSiteSettings(settings);
        this.siteEditorCopyFields.forEach((field) => {
            ['en', 'es'].forEach((lang) => {
                const input = document.querySelector(`[data-copy-field="${field}"][data-lang="${lang}"]`);
                if (input) input.value = normalized.copy?.[lang]?.[field] || '';
            });
        });

        const optionPaths = {
            ordersOpen: 'form.ordersOpen',
            showStartingPrices: 'pricing.showStartingPrices',
            showSocialSection: 'social.showSocialSection',
            useLiveInstagram: 'social.useLiveInstagram',
            directCheckoutEnabled: 'form.directCheckoutEnabled'
        };
        Object.entries(optionPaths).forEach(([field, path]) => {
            const input = document.querySelector(`[data-option-field="${field}"]`);
            if (input) input.checked = Boolean(this.getNestedValue(normalized, path, false));
        });

        document.querySelectorAll('[data-setting-path]').forEach((input) => {
            input.value = this.getNestedValue(normalized, input.getAttribute('data-setting-path'), '');
        });

        this.renderPricingEditorList(normalized.pricing?.cards || []);
        this.populateStoreImageFields(normalized);
        this.siteSettings = normalized;
        this.renderSiteEditorPreview();
    }

    readSiteSettingsForm() {
        const settings = this.normalizeSiteSettings(this.siteSettings || {});
        this.siteEditorCopyFields.forEach((field) => {
            ['en', 'es'].forEach((lang) => {
                const input = document.querySelector(`[data-copy-field="${field}"][data-lang="${lang}"]`);
                if (!settings.copy[lang]) settings.copy[lang] = {};
                if (input) settings.copy[lang][field] = input.value.trim();
            });
        });

        const optionPaths = {
            ordersOpen: 'form.ordersOpen',
            showStartingPrices: 'pricing.showStartingPrices',
            showSocialSection: 'social.showSocialSection',
            useLiveInstagram: 'social.useLiveInstagram',
            directCheckoutEnabled: 'form.directCheckoutEnabled'
        };
        Object.entries(optionPaths).forEach(([field, path]) => {
            const input = document.querySelector(`[data-option-field="${field}"]`);
            if (input) this.setNestedValue(settings, path, Boolean(input.checked));
        });

        document.querySelectorAll('[data-setting-path]').forEach((input) => {
            const rawValue = input.type === 'number' ? Number(input.value || 0) : input.value.trim();
            this.setNestedValue(settings, input.getAttribute('data-setting-path'), rawValue);
        });
        this.readStoreImageFields(settings);

        const existingCards = settings.pricing?.cards || [];
        settings.pricing.cards = Array.from(document.querySelectorAll('.pricing-editor-row')).map((row, index) => {
            const card = { ...(existingCards[index] || {}) };
            row.querySelectorAll('[data-pricing-field]').forEach((input) => {
                card[input.getAttribute('data-pricing-field')] = input.value.trim();
            });
            return card;
        });

        settings.updatedAt = new Date().toISOString();
        return settings;
    }

    setSiteEditorLanguage(lang = 'en') {
        this.activeSiteEditorLang = lang === 'es' ? 'es' : 'en';
        document.querySelectorAll('.site-language-tab').forEach((button) => {
            button.classList.toggle('active', button.getAttribute('data-site-lang') === this.activeSiteEditorLang);
        });
        document.querySelectorAll('.site-editor-panel').forEach((panel) => {
            panel.hidden = panel.getAttribute('data-site-panel') !== this.activeSiteEditorLang;
        });
        this.renderSiteEditorPreview();
    }

    renderSiteEditorPreview() {
        const preview = document.getElementById('siteEditorPreview');
        if (!preview) return;
        const settings = this.readSiteSettingsFormSafe();
        const lang = this.activeSiteEditorLang || 'en';
        const copy = settings.copy?.[lang] || {};
        preview.innerHTML = `
            <span>${this.escapeHTML(lang === 'es' ? 'Vista previa' : 'Preview')}</span>
            <strong>${this.escapeHTML(copy.heroTitle || 'Maryilu')}</strong>
            <p>${this.escapeHTML(copy.heroSubtitle || '')}</p>
            <div class="site-preview-actions">
                <em>${this.escapeHTML(copy.heroPrimaryAvailable || copy.heroPrimaryCustom || '')}</em>
                <em>${this.escapeHTML(copy.heroSecondary || '')}</em>
            </div>
        `;
    }

    readSiteSettingsFormSafe() {
        try {
            return this.readSiteSettingsForm();
        } catch (error) {
            return this.siteSettings || this.getDefaultSiteSettings();
        }
    }

    renderStudioDashboard() {
        const editorStatus = document.getElementById('dashboardEditorStatus');
        const artworkCount = document.getElementById('dashboardArtworkCount');
        const orderCount = document.getElementById('dashboardOrderCount');
        const shopCount = document.getElementById('dashboardShopCount');
        const dashboardStatus = document.getElementById('studioDashboardStatus');

        if (editorStatus) editorStatus.textContent = this.siteSettingsSource || 'Default copy';
        if (artworkCount) {
            const count = this.artworks.length;
            artworkCount.textContent = `${count} work${count === 1 ? '' : 's'}`;
        }
        if (orderCount) {
            orderCount.textContent = this.adminToken
                ? `${this.orderRequests.length} request${this.orderRequests.length === 1 ? '' : 's'}`
                : 'Token needed';
        }
        if (shopCount) {
            shopCount.textContent = this.adminToken
                ? `${this.shopItems.length} item${this.shopItems.length === 1 ? '' : 's'}`
                : 'Token needed';
        }
        if (dashboardStatus) {
            dashboardStatus.textContent = this.dataAPI.isLocalApiUrl() ? 'Local Worker mode' : 'Production Worker mode';
        }
    }

    async refreshStudioDashboard() {
        this.renderStudioDashboard();
        if (!this.adminToken) return;
        try {
            const [orders, shopItems] = await Promise.all([
                this.dataAPI.getOrderRequests(this.adminToken).catch(() => this.orderRequests),
                this.dataAPI.getShopItems({ includeHidden: true, adminToken: this.adminToken }).catch(() => this.shopItems)
            ]);
            this.orderRequests = Array.isArray(orders) ? orders : this.orderRequests;
            this.shopItems = Array.isArray(shopItems) ? shopItems : this.shopItems;
            this.renderStudioDashboard();
        } catch (error) {
            console.warn('Dashboard refresh unavailable:', error);
        }
    }

    updateSettingsPanel() {
        const tokenInput = document.getElementById('settingsAdminToken');
        const apiInput = document.getElementById('settingsApiUrl');
        const currentApi = document.getElementById('settingsCurrentApi');
        const siteSource = document.getElementById('settingsCurrentSiteSource');
        const mode = document.getElementById('settingsCurrentMode');

        if (tokenInput) tokenInput.value = this.adminToken || '';
        if (apiInput) apiInput.value = localStorage.getItem('maryiluApiUrl') || '';
        if (currentApi) currentApi.textContent = this.dataAPI.apiUrl || 'Default API';
        if (siteSource) siteSource.textContent = this.siteSettingsSource || 'Not loaded';
        if (mode) mode.textContent = this.dataAPI.isLocalApiUrl() ? 'Local Worker' : 'Production Worker';
    }

    setStudioSettingsStatus(message, type = '') {
        const status = document.getElementById('studioSettingsStatus');
        if (!status) return;
        status.textContent = message || '';
        status.className = `site-editor-status ${type}`;
    }

    async saveStudioConnectionSettings() {
        const token = document.getElementById('settingsAdminToken')?.value.trim() || '';
        const apiUrl = document.getElementById('settingsApiUrl')?.value.trim() || '';
        if (token) {
            this.adminToken = token;
            localStorage.setItem('maryiluAdminToken', token);
            localStorage.setItem('adminLoggedIn', 'true');
        }
        if (apiUrl) {
            localStorage.setItem('maryiluApiUrl', apiUrl.replace(/\/+$/, ''));
            this.dataAPI.apiUrl = apiUrl.replace(/\/+$/, '');
        } else {
            localStorage.removeItem('maryiluApiUrl');
        }
        this.syncAdminTokenInputs();
        this.renderWorkerEnvironmentBadge();
        this.updateSettingsPanel();
        this.setStudioSettingsStatus('Studio settings saved in this browser.', 'success');
        await this.refreshStudioDashboard();
    }

    isSimulatedInstagramItem(item) {
        const values = [
            item?.id,
            item?.sourcePostId,
            item?.permalink,
            item?.caption
        ].map(value => String(value || '').toLowerCase());
        return Boolean(
            item?.simulated
            || values.some(value => value.includes('sim_maryilu') || value.includes('/sim_') || value.includes('sim-'))
        );
    }

    focusShopUploadComposer() {
        const form = document.getElementById('shopUploadForm');
        const input = document.getElementById('shopUploadImage');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (input) input.focus({ preventScroll: true });
    }

    setShopUploadStatus(message, type = 'info') {
        const status = document.getElementById('shopUploadStatus');
        if (!status) return;
        status.className = `shop-upload-status ${type}`;
        status.textContent = message || '';
    }

    resetShopUploadForm() {
        const form = document.getElementById('shopUploadForm');
        if (form) form.reset();
        const preview = document.getElementById('shopUploadPreview');
        if (preview) preview.innerHTML = '<span>Upload Art</span>';
        this.setShopUploadStatus('');
    }

    previewShopUploadImage(file) {
        const preview = document.getElementById('shopUploadPreview');
        if (!preview) return;
        if (!file) {
            preview.innerHTML = '<span>Upload Art</span>';
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            preview.innerHTML = `<img src="${this.escapeHTML(event.target.result)}" alt="Artwork preview">`;
        };
        reader.readAsDataURL(file);
    }

    blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Image could not be read.'));
            reader.readAsDataURL(blob);
        });
    }

    loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);
            image.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Image could not be opened.'));
            };
            image.src = objectUrl;
        });
    }

    async renderOptimizedImage(file, maxEdge, quality) {
        const image = await this.loadImageFromFile(file);
        const largestEdge = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height, 1);
        const scale = Math.min(1, maxEdge / largestEdge);
        const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob) throw new Error('Image could not be optimized.');
        const dataUrl = await this.blobToDataURL(blob);
        const cleanName = String(file.name || 'maryilu-art').replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'maryilu-art';
        const optimizedFile = typeof File === 'function'
            ? new File([blob], `${cleanName}.webp`, { type: 'image/webp', lastModified: Date.now() })
            : blob;
        return { file: optimizedFile, dataUrl, width, height, size: blob.size };
    }

    async prepareShopImageFile(file) {
        if (!file || !/^image\/(jpe?g|png|webp)$/i.test(file.type || '')) {
            throw new Error('Use a JPG, PNG, or WebP image.');
        }

        const variants = [
            { maxEdge: 1400, quality: 0.82 },
            { maxEdge: 1100, quality: 0.76 },
            { maxEdge: 900, quality: 0.72 }
        ];
        let prepared = null;
        for (const variant of variants) {
            prepared = await this.renderOptimizedImage(file, variant.maxEdge, variant.quality);
            if (prepared.dataUrl.length < 820000) break;
        }
        return {
            ...prepared,
            originalName: file.name || 'artwork image',
            originalSize: file.size || 0
        };
    }

    async prepareStoreImageFile(file) {
        if (!file || !/^image\/(jpe?g|png|webp)$/i.test(file.type || '')) {
            throw new Error('Use a JPG, PNG, or WebP image.');
        }

        const variants = [
            { maxEdge: 2400, quality: 0.9 },
            { maxEdge: 2000, quality: 0.86 },
            { maxEdge: 1700, quality: 0.82 }
        ];
        let prepared = null;
        for (const variant of variants) {
            prepared = await this.renderOptimizedImage(file, variant.maxEdge, variant.quality);
            if (!this.dataAPI.isLocalApiUrl() || prepared.dataUrl.length < 1500000) break;
        }
        return {
            ...prepared,
            originalName: file.name || 'store image',
            originalSize: file.size || 0,
            qualityProfile: 'store-high'
        };
    }

    async resolveShopImageUpload(file) {
        const prepared = await this.prepareShopImageFile(file);
        const upload = await this.dataAPI.uploadImage(prepared.file, this.adminToken);
        if (upload && upload.success && (upload.mediaUrl || upload.url)) {
            return {
                mediaUrl: upload.mediaUrl || upload.url,
                storage: 'media-service',
                prepared,
                upload
            };
        }

        if (upload?.status === 401) {
            throw new Error('The admin token was rejected.');
        }

        if (upload?.fallback === 'compressed-data-url' || upload?.status === 503 || this.dataAPI.isLocalApiUrl()) {
            return {
                mediaUrl: prepared.dataUrl,
                storage: 'compressed-data-url',
                prepared,
                upload
            };
        }

        throw new Error(upload?.error || 'Image upload failed.');
    }

    async handleShopUploadSubmit() {
        this.readAdminTokenFromInputs();
        if (!this.adminToken) {
            this.setShopUploadStatus('Save the Worker ADMIN_TOKEN first.', 'error');
            return;
        }

        const form = document.getElementById('shopUploadForm');
        const submitButton = form?.querySelector('button[type="submit"]');
        const file = document.getElementById('shopUploadImage')?.files?.[0];
        const title = document.getElementById('shopUploadTitle')?.value.trim() || '';
        const category = document.getElementById('shopUploadCategory')?.value || 'custom-gifts';
        const caption = document.getElementById('shopUploadCaption')?.value.trim() || '';
        const priceValue = Number(document.getElementById('shopUploadPrice')?.value || 0);
        const publishPublic = Boolean(document.getElementById('shopUploadPublishPublic')?.checked);

        if (!file) {
            this.setShopUploadStatus('Choose an artwork image.', 'error');
            return;
        }
        if (!title) {
            this.setShopUploadStatus('Add a title.', 'error');
            return;
        }

        this.setShopUploadStatus('Preparing image...');
        if (submitButton) submitButton.disabled = true;
        try {
            const image = await this.resolveShopImageUpload(file);
            this.setShopUploadStatus('Saving item...');
            const now = new Date().toISOString();
            const result = await this.dataAPI.createShopItem({
                title,
                category,
                caption,
                mediaUrl: image.mediaUrl,
                thumbnailUrl: image.mediaUrl,
                sourcePlatform: 'admin-upload',
                priceCents: priceValue > 0 ? Math.round(priceValue * 100) : null,
                currency: 'eur',
                status: 'inquiry',
                hidden: !publishPublic,
                publishTargets: ['store', 'portfolio', 'social'],
                automationNotes: {
                    recommendation: 'manual-upload',
                    requiresAdminReview: !publishPublic,
                    approvedMode: publishPublic ? 'inquiry' : '',
                    reviewedAt: publishPublic ? now : '',
                    imageStorage: image.storage,
                    originalImageName: image.prepared.originalName,
                    originalImageSize: image.prepared.originalSize,
                    optimizedImageSize: image.prepared.size,
                    uploadedAt: now
                }
            }, this.adminToken);

            if (!result || !result.success) {
                throw new Error(result?.error || 'Unable to save the shop item.');
            }

            this.shopItems = [result.item, ...this.shopItems.filter(item => item.id !== result.item.id)];
            this.renderShopItems();
            this.resetShopUploadForm();
            this.setShopUploadStatus(image.storage === 'media-service' ? 'Artwork uploaded and saved.' : 'Artwork saved with an optimized local image.', 'success');
        } catch (error) {
            this.setShopUploadStatus(error.message || 'Artwork could not be saved.', 'error');
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }

    showLeadMessage(message, type = 'info') {
        const messageEl = document.getElementById('leadStatusMessage');
        if (!messageEl) return;
        messageEl.className = `lead-status-message ${type}`;
        messageEl.textContent = message || '';
    }

    async loadOrderRequests() {
        const leadList = document.getElementById('leadList');
        if (!leadList) return;

        this.readAdminTokenFromInputs();

        if (!this.adminToken) {
            leadList.innerHTML = `
                <div class="empty-state">
                    <h3>Admin token required</h3>
                    <p>Enter the Worker ADMIN_TOKEN to view protected order requests.</p>
                </div>
            `;
            this.showLeadMessage('');
            this.renderStudioDashboard();
            return;
        }

        this.showLeadMessage('Loading order requests...');

        try {
            await this.ensureAutomationStatus();
            this.orderRequests = await this.dataAPI.getOrderRequests(this.adminToken);
            this.renderOrderRequests();
            this.renderStudioDashboard();
            this.showLeadMessage(`${this.orderRequests.length} order request${this.orderRequests.length === 1 ? '' : 's'} loaded.`, 'success');
        } catch (error) {
            leadList.innerHTML = `
                <div class="empty-state">
                    <h3>Could not load order requests</h3>
                    <p>${this.escapeHTML(error.message || 'Check the token and Worker configuration.')}</p>
                </div>
            `;
            this.showLeadMessage('Lead inbox could not be loaded.', 'error');
            this.renderStudioDashboard();
        }
    }

    renderOrderRequests() {
        const leadList = document.getElementById('leadList');
        if (!leadList) return;

        if (!this.orderRequests.length) {
            leadList.innerHTML = `
                <div class="empty-state">
                    <h3>No order requests yet</h3>
                    <p>New custom order leads will appear here after visitors submit the public form.</p>
                </div>
            `;
            return;
        }

        leadList.innerHTML = this.orderRequests.map(request => this.createLeadElement(request)).join('');
    }

    createLeadElement(request) {
        const referenceFiles = request.references && Array.isArray(request.references.files)
            ? request.references.files.map(file => `${file.name || 'reference'} (${Math.round((file.size || 0) / 1024)} KB)`).join(', ')
            : '';
        const referenceLinks = request.references && request.references.links ? request.references.links : '';
        const statusOptions = this.leadStatuses.map(status => `
            <option value="${this.escapeHTML(status)}" ${request.status === status ? 'selected' : ''}>${this.escapeHTML(status)}</option>
        `).join('');
        const payments = Array.isArray(request.payments) ? request.payments : [];
        const paymentRows = payments.length
            ? payments.map(payment => `
                <p><strong>${this.escapeHTML(payment.paymentType || 'payment')}:</strong> ${this.escapeHTML(this.formatMoney(payment.amountCents, payment.currency))} · ${this.escapeHTML(payment.status || 'created')} ${payment.url ? `· <a href="${this.escapeHTML(payment.url)}" target="_blank" rel="noopener">open checkout</a>` : ''}</p>
            `).join('')
            : '<p>No Stripe payment links created yet.</p>';
        const paymentDisabledReason = this.stripePaymentSetupIssue();
        const paymentButtonDisabled = paymentDisabledReason
            ? `disabled aria-disabled="true" title="${this.escapeHTML(paymentDisabledReason)}"`
            : '';
        const paymentHint = paymentDisabledReason
            ? `<p class="lead-payment-hint status-error">${this.escapeHTML(paymentDisabledReason)}</p>`
            : '<p class="lead-payment-hint">Create links only after Maria confirms the quote, amount, and payment stage.</p>';

        return `
            <article class="lead-card">
                <div class="lead-card-header">
                    <div>
                        <h3>${this.escapeHTML(request.name || 'Unnamed request')}</h3>
                        <p>${this.escapeHTML(this.formatLeadDate(request.createdAt))} • ${this.escapeHTML(request.productCategory || 'No category')}</p>
                    </div>
                    <label class="lead-status-select">
                        <span>Status</span>
                        <select onchange="artAdmin.updateLeadStatus('${this.escapeHTML(request.id)}', this.value)">
                            ${statusOptions}
                        </select>
                    </label>
                </div>
                <div class="lead-details-grid">
                    <p><strong>Email:</strong> ${this.escapeHTML(request.email)}</p>
                    <p><strong>Phone:</strong> ${this.escapeHTML(request.phone)}</p>
                    <p><strong>Instagram:</strong> ${this.escapeHTML(request.instagram || 'Not provided')}</p>
                    <p><strong>Location:</strong> ${this.escapeHTML(request.countryCity)}</p>
                    <p><strong>Budget:</strong> ${this.escapeHTML(request.budget)}</p>
                    <p><strong>Deadline:</strong> ${this.escapeHTML(request.deadline)}</p>
                    <p><strong>Tier:</strong> ${this.escapeHTML(request.productTier)}</p>
                    <p><strong>Shipping:</strong> ${this.escapeHTML(request.pickupShipping)}</p>
                </div>
                <div class="lead-story">
                    <p><strong>Occasion:</strong> ${this.escapeHTML(request.occasion)}</p>
                    <p><strong>Gift recipient:</strong> ${this.escapeHTML(request.recipient)}</p>
                    <p><strong>Age range:</strong> ${this.escapeHTML(request.ageRange || 'Not provided')}</p>
                    <p><strong>Interests:</strong> ${this.escapeHTML(request.interests)}</p>
                    <p><strong>Colors/style:</strong> ${this.escapeHTML(request.colors)}</p>
                    <p><strong>Themes to include:</strong> ${this.escapeHTML(request.includeThemes || 'Not provided')}</p>
                    <p><strong>Themes to avoid:</strong> ${this.escapeHTML(request.avoidThemes || 'Not provided')}</p>
                    <p><strong>Memories/inside jokes:</strong> ${this.escapeHTML(request.memories || 'Not provided')}</p>
                    <p><strong>Song/quote/text:</strong> ${this.escapeHTML(request.songQuote || 'Not provided')}</p>
                    <p><strong>Creative involvement:</strong> ${this.escapeHTML(request.involvement)}</p>
                    <p><strong>Reference links:</strong> ${this.escapeHTML(referenceLinks || 'Not provided')}</p>
                    <p><strong>Uploaded references:</strong> ${this.escapeHTML(referenceFiles || 'None')}</p>
                    <p><strong>Notes:</strong> ${this.escapeHTML(request.notes || 'None')}</p>
                </div>
                <div class="lead-payment-panel">
                    <h4>Stripe payments</h4>
                    <div class="lead-payment-grid">
                        <label>
                            <span>Amount (€)</span>
                            <input type="number" min="1" step="0.01" id="paymentAmount-${this.escapeHTML(request.id)}" placeholder="75.00">
                        </label>
                        <label>
                            <span>Type</span>
                            <select id="paymentType-${this.escapeHTML(request.id)}">
                                <option value="deposit">Deposit</option>
                                <option value="final">Final payment</option>
                            </select>
                        </label>
                        <label>
                            <span>Description</span>
                            <input type="text" id="paymentDescription-${this.escapeHTML(request.id)}" value="Maryilu custom order payment">
                        </label>
                        <button type="button" class="submit-btn" onclick="artAdmin.createPaymentLink('${this.escapeHTML(request.id)}')" ${paymentButtonDisabled}>Create Stripe Checkout</button>
                    </div>
                    ${paymentHint}
                    <div class="lead-payment-links">${paymentRows}</div>
                </div>
            </article>
        `;
    }

    formatMoney(cents, currency = 'eur') {
        const value = (Number(cents) || 0) / 100;
        return new Intl.NumberFormat('en', {
            style: 'currency',
            currency: String(currency || 'eur').toUpperCase()
        }).format(value);
    }

    formatLeadDate(value) {
        if (!value) return 'No date';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString();
    }

    formatCompactDate(value) {
        if (!value) return 'not recorded';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString();
    }

    renderShopItemSyncState(item) {
        if (item.sourcePlatform !== 'instagram') return '';
        const lastSeen = item.lastSeenAt || item.automationNotes?.lastSeenAt || '';
        const lastMissing = item.automationNotes?.lastMissingFromSyncAt || '';
        const simulated = this.isSimulatedInstagramItem(item);
        if (item.missingFromLatestSync) {
            return `
                <p class="shop-sync-state is-missing">
                    <strong>Not seen in latest sync.</strong>
                    <span>Last seen: ${this.escapeHTML(this.formatCompactDate(lastSeen))}${lastMissing ? ` · Missing since: ${this.escapeHTML(this.formatCompactDate(lastMissing))}` : ''}</span>
                </p>
            `;
        }
        return `
            <p class="shop-sync-state ${simulated ? 'is-preview' : 'is-seen'}">
                <strong>${simulated ? 'Local preview sync' : 'Seen in latest sync.'}</strong>
                <span>Last seen: ${this.escapeHTML(this.formatCompactDate(lastSeen))}</span>
            </p>
        `;
    }

    async updateLeadStatus(requestId, status) {
        const result = await this.dataAPI.updateOrderRequestStatus(requestId, status, this.adminToken);
        if (!result || !result.success) {
            this.showLeadMessage(result && result.error ? result.error : 'Unable to update status.', 'error');
            return;
        }

        this.orderRequests = this.orderRequests.map(request => {
            if (request.id === requestId) {
                return result.request || { ...request, status };
            }
            return request;
        });
        this.showLeadMessage('Lead status updated.', 'success');
    }

    async createPaymentLink(requestId) {
        await this.ensureAutomationStatus();
        const stripeIssue = this.stripePaymentSetupIssue();
        if (stripeIssue) {
            this.showLeadMessage(`${stripeIssue} Payment links stay disabled until Stripe is configured in the Worker.`, 'error');
            this.renderOrderRequests();
            return;
        }

        const amountInput = document.getElementById(`paymentAmount-${requestId}`);
        const typeInput = document.getElementById(`paymentType-${requestId}`);
        const descriptionInput = document.getElementById(`paymentDescription-${requestId}`);
        const amount = Number(amountInput ? amountInput.value : 0);

        if (!amount || amount < 1) {
            this.showLeadMessage('Enter a Stripe payment amount of at least €1.', 'error');
            return;
        }

        const request = this.orderRequests.find(item => item.id === requestId) || {};
        const paymentType = typeInput ? typeInput.value : 'deposit';
        const description = descriptionInput ? descriptionInput.value : 'Maryilu custom order payment';
        if (!window.confirm(`Create a Stripe ${paymentType} checkout?\n\nCustomer: ${request.name || 'Unknown request'}\nAmount: €${amount.toFixed(2)}\n\nOnly continue if the quote, amount, and payment stage are correct.`)) {
            return;
        }

        const result = await this.dataAPI.createOrderPaymentLink(requestId, {
            amountCents: Math.round(amount * 100),
            currency: 'eur',
            paymentType,
            description
        }, this.adminToken);

        if (!result || !result.success) {
            this.showLeadMessage(result && result.error ? result.error : 'Unable to create Stripe checkout.', 'error');
            return;
        }

        this.orderRequests = this.orderRequests.map(request => request.id === requestId ? (result.request || request) : request);
        this.renderOrderRequests();
        this.showLeadMessage('Stripe checkout created. Open the link in the payment panel and send it to the customer.', 'success');
    }

    async syncInstagramMedia() {
        this.readAdminTokenFromInputs();
        const showSyncMessage = (message, type = '') => {
            this.showLeadMessage(message, type);
            this.showShopItemMessage(message, type);
        };

        if (!this.adminToken) {
            showSyncMessage('Save the Worker ADMIN_TOKEN before syncing Instagram.', 'error');
            return;
        }

        showSyncMessage('Syncing Instagram posts...');
        const result = await this.dataAPI.syncInstagramMedia(this.adminToken);
        if (!result || !result.success) {
            showSyncMessage(result && result.error ? result.error : 'Instagram sync failed.', 'error');
            return;
        }

        const count = result.media ? result.media.length : result.meta?.count || 0;
        showSyncMessage(`Instagram sync complete. ${count} post${count === 1 ? '' : 's'} cached.`, 'success');
        if (document.getElementById('shop-item-management')?.style.display !== 'none') {
            await this.loadShopItems();
        }
    }

    getLocalInstagramTestMedia() {
        const fixture = window.MARYILU_INSTAGRAM_FIXTURES?.simulatedInstagramMedia;
        if (!Array.isArray(fixture) || !fixture.length) return [];
        return fixture.map(item => ({ ...item }));
    }

    async simulateInstagramSync() {
        const simulateButton = document.getElementById('simulateInstagramSync');
        this.readAdminTokenFromInputs();

        if (!this.adminToken) {
            this.showShopItemMessage('Save the Worker ADMIN_TOKEN before running a local test import.', 'error');
            return;
        }

        if (!this.dataAPI.isLocalApiUrl()) {
            this.showShopItemMessage('Local test import is only enabled for the local Worker. Use Sync Instagram in production.', 'error');
            return;
        }

        if (simulateButton) simulateButton.disabled = true;
        this.showShopItemMessage('Running local Instagram test import...');
        const result = await this.dataAPI.simulateInstagramSync(this.getLocalInstagramTestMedia(), this.adminToken);
        if (simulateButton) simulateButton.disabled = false;

        if (!result || !result.success) {
            this.showShopItemMessage(result?.error || 'Local Instagram test import failed.', 'error');
            return;
        }

        const postCount = result.media?.length || result.meta?.count || 0;
        const reviewCount = result.meta?.reviewCandidateCount || 0;
        await this.loadShopItems();
        this.showShopItemMessage(
            `Local test import complete. ${postCount} sample post${postCount === 1 ? '' : 's'} imported; ${reviewCount} checkout candidate${reviewCount === 1 ? '' : 's'} waiting for review.`,
            'success'
        );
    }

    showShopItemMessage(message, type = '') {
        const messageEl = document.getElementById('shopItemStatusMessage');
        if (!messageEl) return;
        messageEl.textContent = message || '';
        messageEl.className = `lead-status-message ${type}`;
    }

    async loadShopItems() {
        const list = document.getElementById('shopItemList');
        if (!list) return;

        this.readAdminTokenFromInputs();

        if (!this.adminToken) {
            list.innerHTML = `
                <div class="empty-state">
                    <h3>Admin token required</h3>
                    <p>Enter the Worker ADMIN_TOKEN above and save it before editing shop items.</p>
                </div>
            `;
            this.renderStudioDashboard();
            return;
        }

        this.showShopItemMessage('Loading shop items...');
        try {
            await this.loadAutomationStatus();
            this.shopItems = await this.dataAPI.getShopItems({ includeHidden: true, adminToken: this.adminToken });
            this.renderShopItems();
            this.renderStudioDashboard();
            this.showShopItemMessage(`${this.shopItems.length} shop item${this.shopItems.length === 1 ? '' : 's'} loaded.`, 'success');
        } catch (error) {
            list.innerHTML = `
                <div class="empty-state">
                    <h3>Could not load shop items</h3>
                    <p>${this.escapeHTML(error.message || 'Check the token and Worker configuration.')}</p>
                </div>
            `;
            this.showShopItemMessage('Shop items could not be loaded.', 'error');
            this.renderStudioDashboard();
        }
    }

    async loadAutomationStatus() {
        const panel = document.getElementById('automationStatusPanel');
        const briefPanel = document.getElementById('agentBriefPanel');
        const cockpitPanel = document.getElementById('launchCockpitPanel');
        if (!panel || !this.adminToken) return;

        if (briefPanel) {
            briefPanel.innerHTML = '<div class="agent-brief-card is-loading"><strong>Building morning brief...</strong><small>Checking shop, Instagram, Stripe, and recent leads.</small></div>';
        }
        panel.innerHTML = '<div class="automation-status-card"><strong>Checking system status...</strong></div>';
        if (cockpitPanel) {
            cockpitPanel.innerHTML = '<div class="launch-cockpit-empty"><strong>Checking launch cockpit...</strong><small>Reading Worker status, agent brief, and recent automation events.</small></div>';
        }
        const [status, eventsResult, briefResult] = await Promise.all([
            this.dataAPI.getAutomationStatus(this.adminToken),
            this.dataAPI.getAutomationEvents(this.adminToken),
            this.dataAPI.getAgentBrief(this.adminToken)
        ]);
        if (briefPanel) {
            this.renderAgentBrief(briefPanel, briefResult);
        }
        if (!status || !status.success) {
            panel.innerHTML = `<div class="automation-status-card status-error"><strong>Status unavailable</strong><small>${this.escapeHTML(status?.error || 'Check Worker configuration.')}</small></div>`;
            if (cockpitPanel) {
                cockpitPanel.innerHTML = `<div class="launch-cockpit-empty is-error"><strong>Launch cockpit unavailable</strong><small>${this.escapeHTML(status?.error || 'Check Worker configuration and admin token.')}</small></div>`;
            }
            return;
        }
        this.automationStatus = status;
        if (cockpitPanel) {
            this.renderLaunchCockpit(cockpitPanel, status, briefResult, eventsResult);
        }

        const configured = status.configured || {};
        const stripeModeLabel = this.describeStripeMode(configured);
        const stripeIssue = configured.stripeSecretIssue || '';
        const workerApiUrl = this.dataAPI?.apiUrl || 'Worker URL unavailable';
        const checks = [
            { label: 'Admin token', ok: configured.adminToken },
            { label: `Stripe key · ${stripeModeLabel}`, ok: configured.stripeSecretKey },
            { label: 'Stripe webhook', ok: configured.stripeWebhookSecret },
            { label: 'Instagram token', ok: configured.instagramAccessToken },
            { label: 'Instagram user', ok: configured.instagramUserId },
            { label: 'Meta webhook verify token', ok: configured.instagramWebhookVerifyToken, optional: true },
            { label: 'Meta webhook app secret', ok: configured.instagramWebhookAppSecret, optional: true },
            { label: 'Alert webhook', ok: configured.notificationWebhook, optional: true }
        ];
        const checkMarkup = checks.map((check) => `
            <span class="${check.ok ? 'status-ok' : check.optional ? 'status-optional' : 'status-missing'}">${check.ok ? 'Ready' : check.optional ? 'Optional' : 'Missing'} · ${this.escapeHTML(check.label)}</span>
        `).join('');
        const lastSync = status.instagram?.lastSyncedAt
            ? new Date(status.instagram.lastSyncedAt).toLocaleString()
            : 'Not synced yet';
        const lastAttempt = status.instagram?.lastAttemptedAt
            ? new Date(status.instagram.lastAttemptedAt).toLocaleString()
            : 'No attempt recorded';
        const syncError = status.instagram?.lastError
            ? `<small class="automation-sync-error">Last sync error: ${this.escapeHTML(status.instagram.lastError)}</small>`
            : '<small class="automation-sync-ok">No Instagram sync error recorded.</small>';
        const syncSource = status.instagram?.simulated ? 'simulated local QA' : 'real Meta API';
        const pagesFetched = status.instagram?.pagesFetched
            ? ` · Pages: ${this.escapeHTML(String(status.instagram.pagesFetched))}${status.instagram.hitPageLimit ? ' (limit hit)' : ''}`
            : '';
        const missingItems = Number(status.instagram?.missingItems || 0);
        const missingSyncText = missingItems
            ? ` · ${this.escapeHTML(String(missingItems))} not seen in latest sync`
            : '';
        const syncWarning = status.instagram?.simulated
            ? '<small class="automation-sync-warning">Cached posts are local test data, not a live Meta API sync.</small>'
            : '';
        const stripeDetail = stripeIssue
            ? `<small class="automation-sync-error">Stripe: ${this.escapeHTML(stripeIssue)}</small>`
            : `<small class="automation-sync-ok">Stripe: ${this.escapeHTML(stripeModeLabel)}${configured.stripeWebhookSecret ? ' with webhook configured.' : '. Add webhook secret before checkout.'}</small>`;
        const workerDetail = `<small class="automation-sync-warning">Worker: ${this.escapeHTML(workerApiUrl)}</small>`;
        const events = Array.isArray(eventsResult?.events) ? eventsResult.events.slice(0, 3) : [];
        const eventMarkup = events.length
            ? events.map((event) => `
                <li>
                    <span>${this.escapeHTML(event.type || 'automation.event')}</span>
                    <strong>${this.escapeHTML(event.title || 'Automation event')}</strong>
                    <small>${this.escapeHTML(event.createdAt ? new Date(event.createdAt).toLocaleString() : '')}</small>
                </li>
            `).join('')
            : '<li><strong>No automation events yet</strong><small>New leads and Instagram review candidates will appear here.</small></li>';
        const launch = status.launch || {};
        const launchChecks = Array.isArray(launch.checks) ? launch.checks : [];
        const launchMarkup = launchChecks.length
            ? launchChecks.map((check) => {
                const state = check.ok ? 'ready' : check.required ? 'blocked' : 'watch';
                const stateLabel = check.ok ? 'Ready' : check.required ? 'Blocked' : 'Watch';
                return `
                    <article class="automation-launch-card launch-${state}">
                        <span>${this.escapeHTML(stateLabel)}</span>
                        <strong>${this.escapeHTML(check.label || 'Launch check')}</strong>
                        <p>${this.escapeHTML(check.detail || '')}</p>
                        ${check.ok ? '' : `<small>${this.escapeHTML(check.action || '')}</small>`}
                    </article>
                `;
            }).join('')
            : '';
        const launchSummary = launch.requiredReady
            ? 'Required launch systems are configured. Run the production launch report after deploy.'
            : (launch.nextAction || 'Finish the required setup before launch.');

        panel.innerHTML = `
            <div class="automation-status-card">
                <div>
                    <strong>Automation status</strong>
                    <small>Instagram: ${this.escapeHTML(String(status.instagram?.cachedPosts || 0))} cached post${status.instagram?.cachedPosts === 1 ? '' : 's'} · Source: ${this.escapeHTML(syncSource)}${pagesFetched}${missingSyncText} · Last sync: ${this.escapeHTML(lastSync)} · Last attempt: ${this.escapeHTML(lastAttempt)}</small>
                    ${syncError}
                    ${syncWarning}
                    ${stripeDetail}
                    ${workerDetail}
                </div>
                <div class="automation-status-checks">${checkMarkup}</div>
                <div class="automation-status-metrics">
                    <span>${this.escapeHTML(String(status.shop?.visibleItems || 0))} visible</span>
                    <span>${this.escapeHTML(String(status.shop?.buyableItems || 0))} buyable</span>
                    <span>${this.escapeHTML(String(status.orders?.totalRequests || 0))} leads</span>
                    <span>${this.escapeHTML(String(status.automation?.recentEvents || 0))} events</span>
                </div>
                <ol class="automation-event-list">${eventMarkup}</ol>
                ${launchMarkup ? `
                    <div class="automation-launch-console">
                        <div>
                            <strong>Launch console</strong>
                            <small>${this.escapeHTML(launchSummary)}</small>
                        </div>
                        <div class="automation-launch-grid">${launchMarkup}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderLaunchCockpit(panel, status, brief, eventsResult) {
        const configured = status.configured || {};
        const launch = status.launch || {};
        const stripeReady = Boolean(configured.stripeSecretKey && configured.stripeWebhookSecret);
        const instagramReady = Boolean(configured.instagramAccessToken && configured.instagramUserId);
        const instagramLive = Boolean(instagramReady && !status.instagram?.simulated);
        const reviewQueue = Number(brief?.reviewQueue?.total || 0);
        const directBuyItems = Number(brief?.commerce?.buyableItems || status.shop?.buyableItems || 0);
        const requestableItems = Number(brief?.commerce?.requestableItems || status.shop?.visibleItems || 0);
        const requiredReady = Boolean(launch.requiredReady);
        const eventCount = Number(status.automation?.recentEvents || (Array.isArray(eventsResult?.events) ? eventsResult.events.length : 0));
        const workerUrl = this.dataAPI?.apiUrl || 'Worker URL unavailable';
        const nextAction = brief?.nextAction || launch.nextAction || 'Review shop items and keep setup moving.';
        const headline = brief?.headline || (requiredReady ? 'Launch systems look ready. Verify production deploy.' : 'Launch systems still need setup.');

        const card = ({ key, label, value, detail, state, action }) => `
            <article class="launch-cockpit-card launch-cockpit-${this.escapeHTML(state)}">
                <span>${this.escapeHTML(label)}</span>
                <strong>${this.escapeHTML(value)}</strong>
                <p>${this.escapeHTML(detail)}</p>
                ${action ? `<small>${this.escapeHTML(action)}</small>` : ''}
            </article>
        `;

        const cards = [
            card({
                key: 'store',
                label: 'Store mode',
                value: directBuyItems ? 'Direct sales ready' : 'Request-led',
                detail: directBuyItems
                    ? `${directBuyItems} reviewed item${directBuyItems === 1 ? '' : 's'} can use checkout.`
                    : `${requestableItems} public item${requestableItems === 1 ? '' : 's'} route buyers to request or inquiry.`,
                state: directBuyItems ? 'ready' : 'watch',
                action: directBuyItems ? 'Check sold/reserved states after each sale.' : 'Keep buy buttons hidden until Stripe and reviewed inventory are ready.'
            }),
            card({
                key: 'stripe',
                label: 'Stripe',
                value: stripeReady ? 'Ready server-side' : 'Setup needed',
                detail: stripeReady
                    ? 'Checkout sessions and webhooks can run through the Worker.'
                    : (configured.stripeSecretIssue || 'Set Stripe secret key and webhook secret before checkout.'),
                state: stripeReady ? 'ready' : 'blocked',
                action: stripeReady ? 'Run a test Checkout event before direct sales.' : 'Add STRIPE_SECRET_KEY, deploy Worker, then add STRIPE_WEBHOOK_SECRET.'
            }),
            card({
                key: 'instagram',
                label: 'Instagram agent',
                value: instagramLive ? 'Live Meta API' : 'Staged preview',
                detail: instagramLive
                    ? `${status.instagram?.cachedPosts || 0} cached post${status.instagram?.cachedPosts === 1 ? '' : 's'} from the official API.`
                    : 'Local preview proof is visible, but live posts need Meta credentials.',
                state: instagramLive ? 'ready' : 'blocked',
                action: instagramLive ? 'Review sale-like posts before publishing checkout.' : 'Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID.'
            }),
            card({
                key: 'review',
                label: 'Review queue',
                value: reviewQueue ? `${reviewQueue} draft${reviewQueue === 1 ? '' : 's'}` : 'Clear',
                detail: reviewQueue
                    ? 'Sale-like posts are hidden until Maria approves title, image, price, and status.'
                    : 'No hidden Instagram sale drafts are waiting right now.',
                state: reviewQueue ? 'review' : 'ready',
                action: reviewQueue ? 'Open each draft before enabling public or payment status.' : 'New sale-like posts will appear here automatically.'
            }),
            card({
                key: 'mobile',
                label: 'Mobile app',
                value: 'Test wrapper ready',
                detail: 'Maryilu Studio opens the same admin portal inside the Android shell.',
                state: requiredReady ? 'ready' : 'watch',
                action: requiredReady ? 'Build a fresh debug APK for Maria after production checks pass.' : 'Do not hand off the APK until admin is protected and production Worker is deployed.'
            }),
            card({
                key: 'production',
                label: 'Production',
                value: requiredReady ? 'Worker setup ready' : 'Not launch-ready',
                detail: requiredReady
                    ? 'Required Worker systems are configured; still verify Pages, DNS, and live routes.'
                    : (launch.nextAction || 'Finish Stripe, Instagram, Pages, Worker, admin protection, and DNS setup.'),
                state: requiredReady ? 'ready' : 'blocked',
                action: `Worker: ${workerUrl}`
            })
        ].join('');

        panel.innerHTML = `
            <section class="launch-cockpit-hero">
                <div>
                    <span>Maryilu launch cockpit</span>
                    <h3>${this.escapeHTML(headline)}</h3>
                    <p>${this.escapeHTML(nextAction)}</p>
                </div>
                <div class="launch-cockpit-pulse launch-cockpit-${requiredReady ? 'ready' : 'blocked'}">
                    <strong>${this.escapeHTML(requiredReady ? 'Ready checks' : 'Setup checks')}</strong>
                    <small>${this.escapeHTML(eventCount)} automation signal${eventCount === 1 ? '' : 's'} recorded</small>
                </div>
            </section>
            <div class="launch-cockpit-grid">${cards}</div>
        `;
    }

    renderAgentBrief(panel, brief) {
        if (!brief || !brief.success) {
            panel.innerHTML = `
                <div class="agent-brief-card status-error">
                    <strong>Morning brief unavailable</strong>
                    <small>${this.escapeHTML(brief?.error || 'Check the Worker connection and admin token.')}</small>
                </div>
            `;
            return;
        }

        this.agentBrief = brief;
        const allowedStatuses = ['ready', 'needs-setup', 'needs-review', 'blocked'];
        const status = allowedStatuses.includes(brief.status) ? brief.status : 'needs-review';
        const statusLabel = {
            ready: 'Ready',
            'needs-setup': 'Needs setup',
            'needs-review': 'Needs review',
            blocked: 'Blocked'
        }[status];
        const generatedAt = brief.generatedAt ? new Date(brief.generatedAt).toLocaleString() : 'Just now';
        const syncLabel = brief.sync?.lastSyncedAt
            ? new Date(brief.sync.lastSyncedAt).toLocaleString()
            : (brief.sync?.lastAttemptedAt ? `Attempted ${new Date(brief.sync.lastAttemptedAt).toLocaleString()}` : 'Not synced yet');
        const syncSourceLabel = brief.sync?.simulated ? 'simulated local QA' : (brief.sync?.instagramReady ? 'real Meta API' : 'not configured');
        const pagesFetched = brief.sync?.pagesFetched ? String(brief.sync.pagesFetched) : '0';
        const missingItems = Number(brief.sync?.missingItems || 0);
        const syncCoverage = brief.sync?.simulated
            ? 'Local preview data'
            : brief.sync?.instagramReady
                ? `${pagesFetched} page${pagesFetched === '1' ? '' : 's'} fetched${brief.sync?.hitPageLimit ? ' · limit hit' : ''}`
                : 'Live sync not connected';
        const checkoutLabel = brief.commerce?.readyForDirectArtworkCheckout
            ? `${brief.commerce.buyableItems || 0} direct-buy item${brief.commerce.buyableItems === 1 ? '' : 's'} ready`
            : 'Direct checkout off';
        const checkoutDetail = brief.commerce?.readyForDirectArtworkCheckout
            ? 'Reviewed, priced artwork can open Stripe Checkout.'
            : 'Buy buttons stay as inquiry buttons until Stripe and one priced item are ready.';
        const reviewTotal = Number(brief.reviewQueue?.total || 0);
        const actionTone = status === 'ready' ? 'ready' : status === 'needs-review' ? 'review' : 'setup';
        const signalCards = [
            {
                label: 'Checkout',
                value: checkoutLabel,
                detail: checkoutDetail,
                tone: brief.commerce?.readyForDirectArtworkCheckout ? 'ready' : 'watch'
            },
            {
                label: 'Instagram',
                value: syncSourceLabel,
                detail: `${syncCoverage}${missingItems ? ` · ${missingItems} stale item${missingItems === 1 ? '' : 's'}` : ''}`,
                tone: brief.sync?.instagramReady && !brief.sync?.simulated ? 'ready' : 'watch'
            },
            {
                label: 'Review',
                value: `${reviewTotal} draft${reviewTotal === 1 ? '' : 's'}`,
                detail: reviewTotal ? 'Approve, hide, reprice, or mark sold before publishing.' : 'No hidden Instagram sale drafts waiting.',
                tone: reviewTotal ? 'review' : 'ready'
            },
            {
                label: 'Store mode',
                value: brief.commerce?.readyForDirectArtworkCheckout ? 'Sell direct' : 'Request-led',
                detail: brief.commerce?.requestableItems
                    ? `${brief.commerce.requestableItems} public item${brief.commerce.requestableItems === 1 ? '' : 's'} use inquiry/custom order.`
                    : 'Public items can still collect custom requests.',
                tone: brief.commerce?.readyForDirectArtworkCheckout ? 'ready' : 'watch'
            }
        ].map(card => `
            <section class="agent-signal-card agent-signal-${card.tone}">
                <span>${this.escapeHTML(card.label)}</span>
                <strong>${this.escapeHTML(card.value)}</strong>
                <small>${this.escapeHTML(card.detail)}</small>
            </section>
        `).join('');
        const metrics = [
            { label: 'Review queue', value: String(brief.reviewQueue?.total || 0) },
            { label: 'Buyable items', value: String(brief.commerce?.buyableItems || 0) },
            { label: 'Order leads', value: String(brief.orders?.totalRequests || 0) },
            { label: 'Cached posts', value: String(brief.sync?.cachedPosts || 0) }
        ].map(metric => `
            <span>
                <strong>${this.escapeHTML(metric.value)}</strong>
                ${this.escapeHTML(metric.label)}
            </span>
        `).join('');
        const blockers = Array.isArray(brief.setupBlockers) ? brief.setupBlockers.slice(0, 4) : [];
        const blockerMarkup = blockers.length
            ? blockers.map(blocker => `
                <li>
                    <strong>${this.escapeHTML(blocker.label || 'Setup item')}</strong>
                    <small>${this.escapeHTML(blocker.action || blocker.detail || '')}</small>
                </li>
            `).join('')
            : '<li><strong>No required setup blockers in this environment</strong><small>Use the launch report before production deploy.</small></li>';
        const reviewItems = Array.isArray(brief.reviewQueue?.items) ? brief.reviewQueue.items.slice(0, 5) : [];
        const reviewMarkup = reviewItems.length
            ? reviewItems.map(item => `
                <li>
                    <strong>${this.escapeHTML(item.title || 'Untitled Maryilu piece')}</strong>
                    <small>${this.escapeHTML(item.status || 'draft')} · ${this.escapeHTML(item.priceCents ? this.formatCurrency(item.priceCents, item.currency) : 'No direct price')}</small>
                </li>
            `).join('')
            : '<li><strong>No Instagram drafts waiting</strong><small>New sale-like posts will land here hidden for review.</small></li>';
        const recentEvents = Array.isArray(brief.recentEvents) ? brief.recentEvents.slice(0, 3) : [];
        const eventMarkup = recentEvents.length
            ? recentEvents.map(event => `
                <li>
                    <strong>${this.escapeHTML(event.title || 'Automation event')}</strong>
                    <small>${this.escapeHTML(event.createdAt ? new Date(event.createdAt).toLocaleString() : event.type || '')}</small>
                </li>
            `).join('')
            : '<li><strong>No recent automation events</strong><small>Orders, sold pieces, and sync notices will appear here.</small></li>';
        const operatorChecklist = Array.isArray(brief.operatorChecklist) ? brief.operatorChecklist.slice(0, 6) : [];
        const operatorChecklistMarkup = operatorChecklist.length
            ? operatorChecklist.map((item, index) => `
                <li class="${item.required ? 'is-required' : 'is-watch'}">
                    <span>${String(index + 1).padStart(2, '0')}</span>
                    <div>
                        <strong>${this.escapeHTML(item.label || 'Operator step')}</strong>
                        <small>${this.escapeHTML(item.action || item.detail || 'Review this item before launch.')}</small>
                    </div>
                </li>
            `).join('')
            : '';
        const runMode = brief.runMode || {};
        const runTone = ['ready', 'review', 'setup', 'watch'].includes(runMode.tone) ? runMode.tone : 'watch';
        const runSignals = Array.isArray(runMode.signals) && runMode.signals.length
            ? runMode.signals.slice(0, 4).map(signal => `
                <article>
                    <span>${this.escapeHTML(signal.label || 'Signal')}</span>
                    <strong>${this.escapeHTML(signal.value || 'Unknown')}</strong>
                    <small>${this.escapeHTML(signal.detail || '')}</small>
                </article>
            `).join('')
            : '';
        const runModeMarkup = runMode.title ? `
            <section class="agent-run-mode agent-run-${runTone}" aria-label="Instagram agent run mode">
                <div class="agent-run-mode-copy">
                    <span>Agent run mode</span>
                    <strong>${this.escapeHTML(runMode.title)}</strong>
                    <p>${this.escapeHTML(runMode.summary || '')}</p>
                    ${runMode.guardrail ? `<small>${this.escapeHTML(runMode.guardrail)}</small>` : ''}
                </div>
                ${runSignals ? `<div class="agent-run-mode-grid">${runSignals}</div>` : ''}
            </section>
        ` : '';
        const setupRunbook = Array.isArray(brief.setupRunbook) ? brief.setupRunbook.slice(0, 6) : [];
        const setupRunbookMarkup = setupRunbook.length
            ? setupRunbook.map((step, index) => `
                <li class="${step.done ? 'is-done' : step.required ? 'is-required' : 'is-watch'}">
                    <span>${step.done ? 'Ready' : step.required ? 'Required' : 'Watch'}</span>
                    <div>
                        <strong>${String(index + 1).padStart(2, '0')} · ${this.escapeHTML(step.label || 'Setup step')}</strong>
                        <small>${this.escapeHTML(step.action || '')}</small>
                        ${step.command ? `<code>${this.escapeHTML(step.command)}</code>` : ''}
                        ${step.verify ? `<em>${this.escapeHTML(step.verify)}</em>` : ''}
                    </div>
                </li>
            `).join('')
            : '';

        panel.innerHTML = `
            <article class="agent-brief-card agent-brief-${status}">
                <div class="agent-brief-header">
                    <div>
                        <span>Morning brief</span>
                        <h3>${this.escapeHTML(brief.headline || 'Maryilu operations are ready to review.')}</h3>
                    </div>
                    <strong class="agent-brief-status">${this.escapeHTML(statusLabel)}</strong>
                </div>
                <div class="agent-next-action agent-next-action-${actionTone}">
                    <span>Today's action</span>
                    <strong>${this.escapeHTML(brief.nextAction || 'Review shop items and recent leads.')}</strong>
                </div>
                ${runModeMarkup}
                ${setupRunbookMarkup ? `
                    <section class="agent-setup-runbook" aria-label="Instagram and Stripe setup runbook">
                        <div>
                            <span>Connection runbook</span>
                            <strong>How this becomes automatic</strong>
                        </div>
                        <ol>${setupRunbookMarkup}</ol>
                    </section>
                ` : ''}
                ${operatorChecklistMarkup ? `
                    <section class="agent-operator-checklist" aria-label="Morning operator checklist">
                        <div>
                            <span>Operator checklist</span>
                            <strong>What has to happen before this can run itself</strong>
                        </div>
                        <ol>${operatorChecklistMarkup}</ol>
                    </section>
                ` : ''}
                <div class="agent-signal-grid">${signalCards}</div>
                <div class="agent-brief-metrics">${metrics}</div>
                <div class="agent-brief-grid">
                    <section>
                        <h4>Setup</h4>
                        <ol class="agent-brief-list">${blockerMarkup}</ol>
                    </section>
                    <section>
                        <h4>Review</h4>
                        <ol class="agent-brief-list">${reviewMarkup}</ol>
                    </section>
                    <section>
                        <h4>Recent signals</h4>
                        <ol class="agent-brief-list">${eventMarkup}</ol>
                    </section>
                </div>
                <div class="agent-brief-footer">
                    <span>Instagram: ${this.escapeHTML(syncLabel)}</span>
                    <span>Source: ${this.escapeHTML(syncSourceLabel)}</span>
                    <span>Coverage: ${this.escapeHTML(syncCoverage)}</span>
                    <span>Generated ${this.escapeHTML(generatedAt)}</span>
                </div>
            </article>
        `;
    }

    async createManualShopItem() {
        this.readAdminTokenFromInputs();

        if (!this.adminToken) {
            this.showShopItemMessage('Save the Worker ADMIN_TOKEN before creating a shop item.', 'error');
            return;
        }

        const result = await this.dataAPI.createShopItem({
            title: 'Untitled Maryilu piece',
            category: 'original-art',
            status: 'inquiry',
            publishTargets: ['store', 'portfolio', 'social'],
            caption: 'Manual shop item. Add image, price, status, and description before publishing.',
            hidden: true
        }, this.adminToken);

        if (!result || !result.success) {
            this.showShopItemMessage(result && result.error ? result.error : 'Unable to create manual shop item.', 'error');
            return;
        }

        this.shopItems = [result.item, ...this.shopItems];
        this.renderShopItems();
        this.showShopItemMessage('Manual shop item created as hidden. Edit it, then unhide when ready.', 'success');
    }

    formatCurrency(cents, currency = 'eur') {
        if (!cents) return 'No direct price found';
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: String(currency || 'eur').toUpperCase()
        }).format(Number(cents) / 100);
    }

    async analyzeCaptionAgent() {
        const captionInput = document.getElementById('captionAgentInput');
        const resultEl = document.getElementById('captionAgentResult');
        const createButton = document.getElementById('createCaptionDraft');
        const analyzeButton = document.getElementById('analyzeCaptionAgent');

        this.readAdminTokenFromInputs();
        this.captionAgentDraft = null;
        if (createButton) createButton.disabled = true;

        if (!this.adminToken) {
            this.showShopItemMessage('Save the Worker ADMIN_TOKEN before analyzing captions.', 'error');
            return;
        }

        const caption = captionInput ? captionInput.value.trim() : '';
        if (!caption) {
            this.showShopItemMessage('Paste an Instagram caption first.', 'error');
            if (resultEl) resultEl.innerHTML = '';
            return;
        }

        if (resultEl) {
            resultEl.innerHTML = '<div class="caption-agent-result-card"><strong>Reading caption...</strong></div>';
        }
        if (analyzeButton) analyzeButton.disabled = true;

        const result = await this.dataAPI.analyzeCaption(caption, this.adminToken);
        if (analyzeButton) analyzeButton.disabled = false;

        if (!result || !result.success) {
            if (resultEl) {
                resultEl.innerHTML = `<div class="caption-agent-result-card status-error"><strong>Analysis failed</strong><p>${this.escapeHTML(result?.error || 'Caption could not be analyzed.')}</p></div>`;
            }
            this.showShopItemMessage(result?.error || 'Caption could not be analyzed.', 'error');
            return;
        }

        this.captionAgentDraft = {
            ...result.draft,
            hidden: true
        };
        this.renderCaptionAgentResult(result.analysis, this.captionAgentDraft);
        if (createButton) createButton.disabled = false;
        this.showShopItemMessage('Caption analyzed. Review the hidden draft before creating it.', 'success');
    }

    renderCaptionAgentResult(analysis, draft) {
        const resultEl = document.getElementById('captionAgentResult');
        if (!resultEl || !analysis) return;

        const confidence = Math.round(Number(analysis.saleSignalConfidence || 0) * 100);
        const confidenceLabel = analysis.confidenceLabel || (confidence >= 75 ? 'high' : confidence >= 45 ? 'medium' : 'low');
        const tags = Array.isArray(analysis.detectedTags) && analysis.detectedTags.length
            ? analysis.detectedTags.slice(0, 8).map(tag => `<span>${this.escapeHTML(tag)}</span>`).join('')
            : '<span>No hashtags detected</span>';
        const targets = Array.isArray(analysis.publishTargets) && analysis.publishTargets.length
            ? analysis.publishTargets.join(', ')
            : 'portfolio, social';
        const recommendation = analysis.automationNotes?.recommendation || 'publish-as-proof-and-inquiry';
        const warnings = Array.isArray(analysis.warnings) && analysis.warnings.length
            ? analysis.warnings.map(warning => `<li>${this.escapeHTML(warning)}</li>`).join('')
            : '<li>No agent warnings. Still review before publishing.</li>';
        const signals = Array.isArray(analysis.signals) && analysis.signals.length
            ? analysis.signals.map(signal => `
                <li>
                    <strong>${this.escapeHTML(signal.label || 'Signal')}</strong>
                    <small>${this.escapeHTML(signal.detail || '')}</small>
                </li>
            `).join('')
            : '<li><strong>No signals</strong><small>Paste a richer caption or fill the item manually.</small></li>';
        const checklist = Array.isArray(analysis.reviewChecklist) && analysis.reviewChecklist.length
            ? analysis.reviewChecklist.map(item => `
                <li class="${item.complete ? 'is-complete' : ''}">
                    <span>${item.complete ? 'Ready' : 'Review'}</span>
                    <strong>${this.escapeHTML(item.label || 'Review item')}</strong>
                </li>
            `).join('')
            : '';

        resultEl.innerHTML = `
            <div class="caption-agent-result-card">
                <div class="caption-agent-summary">
                    <span>${this.escapeHTML(this.formatCurrency(analysis.priceCents, draft?.currency || 'eur'))}</span>
                    <span>${this.escapeHTML(analysis.status || 'inquiry')}</span>
                    <span>${confidence}% sale signal</span>
                    <span>${this.escapeHTML(confidenceLabel)} confidence</span>
                </div>
                <dl>
                    <div>
                        <dt>Draft title</dt>
                        <dd>${this.escapeHTML(draft?.title || analysis.title || 'Untitled Maryilu piece')}</dd>
                    </div>
                    <div>
                        <dt>Category</dt>
                        <dd>${this.escapeHTML(analysis.category || 'studio-post')}</dd>
                    </div>
                    <div>
                        <dt>Publish targets</dt>
                        <dd>${this.escapeHTML(targets)}</dd>
                    </div>
                    <div>
                        <dt>Recommendation</dt>
                        <dd>${this.escapeHTML(recommendation)}</dd>
                    </div>
                </dl>
                <div class="caption-agent-evidence">
                    <div>
                        <strong>Agent evidence</strong>
                        <ul>${signals}</ul>
                    </div>
                    <div>
                        <strong>Guardrails</strong>
                        <ul>${warnings}</ul>
                    </div>
                </div>
                ${checklist ? `<ol class="caption-agent-checklist">${checklist}</ol>` : ''}
                <div class="shop-agent-tags">${tags}</div>
            </div>
        `;
    }

    async createCaptionDraftFromAnalysis() {
        const createButton = document.getElementById('createCaptionDraft');
        this.readAdminTokenFromInputs();

        if (!this.adminToken) {
            this.showShopItemMessage('Save the Worker ADMIN_TOKEN before creating a draft.', 'error');
            return;
        }

        if (!this.captionAgentDraft) {
            this.showShopItemMessage('Analyze a caption before creating a draft.', 'error');
            return;
        }

        if (createButton) createButton.disabled = true;
        const { id, createdAt, updatedAt, ...draftPayload } = this.captionAgentDraft;
        const result = await this.dataAPI.createShopItem({
            ...draftPayload,
            hidden: true
        }, this.adminToken);

        if (!result || !result.success) {
            if (createButton) createButton.disabled = false;
            this.showShopItemMessage(result?.error || 'Unable to create caption draft.', 'error');
            return;
        }

        this.shopItems = [result.item, ...this.shopItems.filter(item => item.id !== result.item.id)];
        this.renderShopItems();
        this.captionAgentDraft = null;
        const captionInput = document.getElementById('captionAgentInput');
        const resultEl = document.getElementById('captionAgentResult');
        if (captionInput) captionInput.value = '';
        if (resultEl) {
            resultEl.innerHTML = '<div class="caption-agent-result-card"><strong>Hidden draft created.</strong><p>Edit the image, price, and publish settings below before making it public.</p></div>';
        }
        this.showShopItemMessage('Hidden draft created from caption.', 'success');
    }

    renderShopItems() {
        const list = document.getElementById('shopItemList');
        if (!list) return;

        if (!this.shopItems.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <h3>No shop items yet</h3>
                    <p>Sync Instagram to auto-publish posts into shop and portfolio content.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this.shopItems.map(item => this.createShopItemElement(item)).join('');
    }

    isStripeCheckoutConfigured() {
        return Boolean(this.automationStatus?.configured?.stripeSecretKey && this.automationStatus?.configured?.stripeWebhookSecret);
    }

    async ensureAutomationStatus() {
        if (this.automationStatus?.success) return true;
        try {
            await this.loadAutomationStatus();
        } catch (error) {
            console.warn('Automation status could not be checked:', error);
        }
        return Boolean(this.automationStatus?.success);
    }

    stripePaymentSetupIssue() {
        if (!this.automationStatus?.configured) {
            return 'Stripe setup status has not been checked yet.';
        }
        const configured = this.automationStatus.configured;
        if (!configured.stripeSecretKey && !configured.stripeWebhookSecret) {
            return 'Stripe key and webhook are missing.';
        }
        if (!configured.stripeSecretKey) {
            return 'Stripe secret key is missing.';
        }
        if (!configured.stripeWebhookSecret) {
            return 'Stripe webhook secret is missing.';
        }
        return '';
    }

    describeShopItemSalesMode(item) {
        const notes = item.automationNotes || {};
        const approvedDirect = notes.approvedMode === 'direct-checkout' && notes.requiresAdminReview !== true;
        const hasPrice = Boolean(item.priceCents);
        const hasImage = Boolean(item.mediaUrl || item.thumbnailUrl || item.imageUrl);
        const stripeConfigured = this.isStripeCheckoutConfigured();

        if (item.status === 'sold') {
            return {
                tone: 'sold',
                label: 'Sold',
                headline: 'This piece is closed',
                detail: 'It can stay visible as proof, but checkout stays off.'
            };
        }

        if (item.status === 'reserved') {
            return {
                tone: 'watch',
                label: 'Reserved',
                headline: 'Temporarily held',
                detail: 'The Worker will release stale reservations automatically.'
            };
        }

        if (approvedDirect && item.status === 'available' && hasPrice) {
            if (!stripeConfigured) {
                return {
                    tone: 'blocked',
                    label: 'Checkout paused',
                    headline: 'Approved, but Stripe setup is missing',
                    detail: 'Set the Stripe key and webhook before buyers can pay.'
                };
            }
            if (!hasImage) {
                return {
                    tone: 'blocked',
                    label: 'Needs image',
                    headline: 'Add an image before checkout',
                    detail: 'One-of-one checkout requires a visible artwork image.'
                };
            }
            return {
                tone: 'ready',
                label: 'Direct checkout',
                headline: 'Buy button can appear publicly',
                detail: 'Stripe opens only for this reviewed one-of-one item.'
            };
        }

        if (item.hidden || notes.requiresAdminReview) {
            return {
                tone: 'review',
                label: 'Review needed',
                headline: hasPrice ? 'Priced draft is hidden' : 'Draft is hidden',
                detail: 'Publish as inquiry or approve direct checkout after review.'
            };
        }

        if (hasPrice) {
            return {
                tone: 'watch',
                label: 'Priced inquiry',
                headline: 'Price found, checkout not approved',
                detail: 'The public site asks buyers to request unless direct checkout is approved.'
            };
        }

        return {
            tone: 'inquiry',
            label: 'Request only',
            headline: 'Public CTA uses the request form',
            detail: 'Add a price only when this should become one-of-one inventory.'
        };
    }

    createShopItemElement(item) {
        const statusOptions = ['available', 'inquiry', 'reserved', 'sold', 'hidden'].map(status => `
            <option value="${status}" ${item.status === status ? 'selected' : ''}>${status}</option>
        `).join('');
        const price = item.priceCents ? (Number(item.priceCents) / 100).toFixed(2) : '';
        const image = item.mediaUrl || item.thumbnailUrl || item.imageUrl || '';
        const caption = item.caption || '';
        const publishTargets = Array.isArray(item.publishTargets) ? item.publishTargets : [];
        const targetOptions = ['store', 'portfolio', 'social'].map(target => `
            <label class="checkbox-row shop-target-row">
                <input type="checkbox" data-shop-target="${this.escapeHTML(item.id)}" value="${target}" ${publishTargets.includes(target) ? 'checked' : ''}>
                <span>${target}</span>
            </label>
        `).join('');
        const confidence = Math.round(Number(item.saleSignalConfidence || 0) * 100);
        const recommendation = item.automationNotes?.recommendation || (item.priceCents ? 'direct-checkout-candidate' : 'publish-as-proof-and-inquiry');
        const warnings = Array.isArray(item.automationNotes?.warnings) && item.automationNotes.warnings.length
            ? item.automationNotes.warnings.slice(0, 3).map(warning => `<li>${this.escapeHTML(warning)}</li>`).join('')
            : '';
        const checklist = Array.isArray(item.automationNotes?.reviewChecklist) && item.automationNotes.reviewChecklist.length
            ? item.automationNotes.reviewChecklist.map(step => `
                <li class="${step.complete ? 'is-complete' : ''}">
                    <span>${step.complete ? 'Ready' : 'Review'}</span>
                    <strong>${this.escapeHTML(step.label || 'Review item')}</strong>
                </li>
            `).join('')
            : '';
        const tags = Array.isArray(item.detectedTags) && item.detectedTags.length
            ? item.detectedTags.slice(0, 6).map(tag => `<span>${this.escapeHTML(tag)}</span>`).join('')
            : '<span>No hashtags detected</span>';
        const salesMode = this.describeShopItemSalesMode(item);
        const isSimulated = this.isSimulatedInstagramItem(item);
        const directDisabledReason = isSimulated
            ? 'Local preview items cannot be approved for direct checkout.'
            : this.stripePaymentSetupIssue();
        const directButtonDisabled = directDisabledReason
            ? `disabled aria-disabled="true" title="${this.escapeHTML(directDisabledReason)}"`
            : '';
        const sourceLink = item.permalink && !isSimulated
            ? `· <a href="${this.escapeHTML(item.permalink)}" target="_blank" rel="noopener">view post</a>`
            : isSimulated
                ? '· local preview only'
                : '';
        const openPostLink = item.permalink && !isSimulated
            ? `<a class="cancel-btn" href="${this.escapeHTML(item.permalink)}" target="_blank" rel="noopener">Open Post</a>`
            : '';
        const syncState = this.renderShopItemSyncState(item);

        return `
            <article class="shop-admin-card">
                <div class="shop-admin-media">
                    ${image ? `<img src="${this.escapeHTML(image)}" alt="${this.escapeHTML(item.title || 'Shop item')}">` : '<div class="empty-state"><p>No image</p></div>'}
                    <div class="shop-agent-badge">
                        <strong>${confidence}%</strong>
                        <span>sale signal</span>
                    </div>
                </div>
                <div class="shop-admin-fields">
                    <label>
                        <span>Title</span>
                        <input type="text" id="shopTitle-${this.escapeHTML(item.id)}" value="${this.escapeHTML(item.title || '')}">
                    </label>
                    <label>
                        <span>Category</span>
                        <input type="text" id="shopCategory-${this.escapeHTML(item.id)}" value="${this.escapeHTML(item.category || '')}">
                    </label>
                    <label>
                        <span>Price (€)</span>
                        <input type="number" min="0" step="0.01" id="shopPrice-${this.escapeHTML(item.id)}" value="${this.escapeHTML(price)}">
                    </label>
                    <label>
                        <span>Image URL</span>
                        <input type="url" id="shopMediaUrl-${this.escapeHTML(item.id)}" value="${this.escapeHTML(image)}">
                    </label>
                    <div class="shop-inline-upload">
                        <label>
                            <span>Upload / replace image</span>
                            <input type="file" id="shopImageFile-${this.escapeHTML(item.id)}" accept="image/jpeg,image/png,image/webp">
                        </label>
                        <button type="button" class="cancel-btn" onclick="artAdmin.uploadImageForShopItem('${this.escapeHTML(item.id)}')">Upload Image</button>
                        <small id="shopImageStatus-${this.escapeHTML(item.id)}" aria-live="polite"></small>
                    </div>
                    <label>
                        <span>Status</span>
                        <select id="shopStatus-${this.escapeHTML(item.id)}">${statusOptions}</select>
                    </label>
                    <label class="shop-caption-field">
                        <span>Description / caption</span>
                        <textarea rows="3" id="shopCaption-${this.escapeHTML(item.id)}">${this.escapeHTML(caption || '')}</textarea>
                    </label>
                    <label class="checkbox-row">
                        <input type="checkbox" id="shopHidden-${this.escapeHTML(item.id)}" ${item.hidden ? 'checked' : ''}>
                        <span>Hide from public site</span>
                    </label>
                    <fieldset class="shop-targets">
                        <legend>Publish to</legend>
                        ${targetOptions}
                    </fieldset>
                    <div class="shop-agent-panel">
                        <div class="shop-sales-mode shop-sales-${this.escapeHTML(salesMode.tone)}">
                            <span>${this.escapeHTML(salesMode.label)}</span>
                            <strong>${this.escapeHTML(salesMode.headline)}</strong>
                            <small>${this.escapeHTML(salesMode.detail)}</small>
                        </div>
                        <p><strong>Agent recommendation:</strong> ${this.escapeHTML(recommendation)}</p>
                        <p><strong>Source:</strong> ${this.escapeHTML(item.sourcePlatform || 'admin')} ${sourceLink}</p>
                        ${syncState}
                        ${warnings ? `<ul class="shop-agent-warnings">${warnings}</ul>` : ''}
                        ${checklist ? `<ol class="caption-agent-checklist shop-agent-checklist">${checklist}</ol>` : ''}
                        <div class="shop-agent-tags">${tags}</div>
                    </div>
                    <div class="shop-admin-actions">
                        <div class="shop-admin-action-group">
                            <span>Safe edits</span>
                            <button type="button" class="submit-btn" onclick="artAdmin.updateShopItem('${this.escapeHTML(item.id)}')">Save Item</button>
                            <button type="button" class="cancel-btn" onclick="artAdmin.keepShopItemHidden('${this.escapeHTML(item.id)}')">Keep Hidden</button>
                        </div>
                        <div class="shop-admin-action-group shop-admin-action-group-public">
                            <span>Public publish</span>
                            <button type="button" class="submit-btn shop-review-btn" onclick="artAdmin.publishShopItemAsInquiry('${this.escapeHTML(item.id)}')">Publish as Inquiry</button>
                        </div>
                        <div class="shop-admin-action-group shop-admin-action-group-payment">
                            <span>Payment</span>
                            <button type="button" class="submit-btn shop-direct-btn" onclick="artAdmin.enableDirectCheckoutForItem('${this.escapeHTML(item.id)}')" ${directButtonDisabled}>Approve Direct Checkout</button>
                            ${directDisabledReason ? `<small class="shop-payment-hint">${this.escapeHTML(directDisabledReason)}</small>` : '<small class="shop-payment-hint">Only approve after title, price, image, shipping, and availability are confirmed.</small>'}
                        </div>
                        <div class="shop-admin-action-group shop-admin-action-group-archive">
                            <span>Archive</span>
                            <button type="button" class="cancel-btn" onclick="artAdmin.archiveShopItem('${this.escapeHTML(item.id)}')">Archive Item</button>
                        </div>
                        ${openPostLink ? `<div class="shop-admin-action-group shop-admin-action-group-source"><span>Source</span>${openPostLink}</div>` : ''}
                    </div>
                    <p class="shop-admin-caption">${this.escapeHTML(caption || 'No caption')}</p>
                </div>
            </article>
        `;
    }

    async uploadImageForShopItem(itemId) {
        this.readAdminTokenFromInputs();
        const input = document.getElementById(`shopImageFile-${itemId}`);
        const status = document.getElementById(`shopImageStatus-${itemId}`);
        const urlInput = document.getElementById(`shopMediaUrl-${itemId}`);
        const file = input?.files?.[0];

        if (!this.adminToken) {
            if (status) status.textContent = 'Save token first.';
            this.showShopItemMessage('Save the Worker ADMIN_TOKEN before uploading images.', 'error');
            return;
        }

        if (!file) {
            if (status) status.textContent = 'Choose an image first.';
            return;
        }

        if (status) status.textContent = 'Uploading...';
        try {
            const image = await this.resolveShopImageUpload(file);
            if (urlInput) urlInput.value = image.mediaUrl;
            const now = new Date().toISOString();
            const updates = {
                ...this.buildShopItemUpdates(itemId),
                mediaUrl: image.mediaUrl,
                thumbnailUrl: image.mediaUrl,
                automationNotes: {
                    imageStorage: image.storage,
                    originalImageName: image.prepared.originalName,
                    originalImageSize: image.prepared.originalSize,
                    optimizedImageSize: image.prepared.size,
                    uploadedAt: now
                }
            };
            await this.saveShopItemUpdates(itemId, updates, image.storage === 'media-service' ? 'Image uploaded and item saved.' : 'Optimized image saved on this item.');
        } catch (error) {
            if (status) status.textContent = error.message || 'Upload failed.';
            this.showShopItemMessage(error.message || 'Image upload failed.', 'error');
        }
    }

    buildShopItemUpdates(itemId) {
        const priceInput = document.getElementById(`shopPrice-${itemId}`);
        const priceValue = Number(priceInput ? priceInput.value : 0);
        return {
            title: document.getElementById(`shopTitle-${itemId}`)?.value || '',
            category: document.getElementById(`shopCategory-${itemId}`)?.value || '',
            mediaUrl: document.getElementById(`shopMediaUrl-${itemId}`)?.value || '',
            caption: document.getElementById(`shopCaption-${itemId}`)?.value || '',
            priceCents: priceValue > 0 ? Math.round(priceValue * 100) : null,
            status: document.getElementById(`shopStatus-${itemId}`)?.value || 'inquiry',
            hidden: Boolean(document.getElementById(`shopHidden-${itemId}`)?.checked),
            publishTargets: Array.from(document.querySelectorAll('[data-shop-target]:checked'))
                .filter(input => input.getAttribute('data-shop-target') === itemId)
                .map(input => input.value)
        };
    }

    confirmShopAction(itemId, action, detail) {
        const item = this.shopItems.find(shopItem => shopItem.id === itemId) || {};
        const title = item.title || document.getElementById(`shopTitle-${itemId}`)?.value || 'this shop item';
        return window.confirm(`${action}\n\n${title}\n\n${detail}`);
    }

    async saveShopItemUpdates(itemId, updates, successMessage = 'Shop item saved.') {
        const current = this.shopItems.find(item => item.id === itemId) || {};
        const mergedNotes = {
            ...(current.automationNotes || {}),
            ...(updates.automationNotes || {})
        };
        if (Object.keys(mergedNotes).length) {
            updates.automationNotes = mergedNotes;
        }

        const result = await this.dataAPI.updateShopItem(itemId, updates, this.adminToken);
        if (!result || !result.success) {
            this.showShopItemMessage(result && result.error ? result.error : 'Unable to save shop item.', 'error');
            return;
        }

        this.shopItems = this.shopItems.map(item => item.id === itemId ? result.item : item);
        this.renderShopItems();
        this.showShopItemMessage(successMessage, 'success');
    }

    async updateShopItem(itemId, overrides = {}) {
        const updates = {
            ...this.buildShopItemUpdates(itemId),
            ...overrides
        };
        if (updates.status === 'available' && updates.priceCents && !updates.hidden) {
            this.showShopItemMessage('Use Approve Direct Checkout for priced available items, or publish this as inquiry.', 'error');
            return;
        }
        await this.saveShopItemUpdates(itemId, updates, 'Shop item saved.');
    }

    async publishShopItemAsInquiry(itemId) {
        const updates = this.buildShopItemUpdates(itemId);
        if (!this.confirmShopAction(
            itemId,
            'Publish this item as request-only public content?',
            'It will appear on the store/portfolio/social surfaces, but buyers will be asked to request something similar instead of checking out directly.'
        )) {
            return;
        }
        updates.status = 'inquiry';
        updates.hidden = false;
        updates.publishTargets = this.publicTargetsFromSelection(updates);
        updates.automationNotes = {
            requiresAdminReview: false,
            approvedMode: 'inquiry',
            reviewedAt: new Date().toISOString()
        };
        await this.saveShopItemUpdates(itemId, updates, 'Published as inquiry content. It will ask buyers to request a similar/custom piece.');
    }

    async enableDirectCheckoutForItem(itemId) {
        const updates = this.buildShopItemUpdates(itemId);
        const current = this.shopItems.find(item => item.id === itemId) || {};
        if (this.isSimulatedInstagramItem(current)) {
            this.showShopItemMessage('Local preview items cannot be approved for direct checkout. Publish as inquiry or replace with a real reviewed post/item.', 'error');
            return;
        }
        const stripeConfigured = Boolean(this.automationStatus?.configured?.stripeSecretKey && this.automationStatus?.configured?.stripeWebhookSecret);
        if (!stripeConfigured) {
            this.showShopItemMessage('Configure Stripe key and webhook before approving direct checkout. Publish as inquiry for now.', 'error');
            return;
        }
        if (!updates.priceCents) {
            this.showShopItemMessage('Add a price before approving direct checkout.', 'error');
            return;
        }
        if (!updates.mediaUrl) {
            this.showShopItemMessage('Add an image URL before approving direct checkout.', 'error');
            return;
        }
        if (!this.confirmShopAction(
            itemId,
            'Approve direct Stripe checkout for this one-of-one item?',
            'Buyers will be able to purchase it directly. Confirm the image, title, price, shipping path, and availability before continuing.'
        )) {
            return;
        }

        updates.status = 'available';
        updates.hidden = false;
        updates.publishTargets = this.publicTargetsFromSelection(updates, ['store']);
        updates.automationNotes = {
            requiresAdminReview: false,
            approvedMode: 'direct-checkout',
            reviewedAt: new Date().toISOString()
        };
        const result = await this.dataAPI.approveDirectCheckoutItem(itemId, updates, this.adminToken);
        if (!result || !result.success) {
            this.showShopItemMessage(result && result.error ? result.error : 'Unable to approve direct checkout.', 'error');
            return;
        }

        this.shopItems = this.shopItems.map(item => item.id === itemId ? result.item : item);
        this.renderShopItems();
        this.showShopItemMessage('Direct checkout approved. Buyers can purchase this item through Stripe.', 'success');
    }

    async keepShopItemHidden(itemId) {
        if (!this.confirmShopAction(
            itemId,
            'Keep this item hidden from the public site?',
            'It will remain available for admin review, but it will not appear to buyers.'
        )) {
            return;
        }
        const updates = {
            ...this.buildShopItemUpdates(itemId),
            hidden: true,
            automationNotes: {
                requiresAdminReview: true,
                reviewedAt: ''
            }
        };
        await this.saveShopItemUpdates(itemId, updates, 'Item kept hidden for later review.');
    }

    async archiveShopItem(itemId) {
        if (!this.confirmShopAction(
            itemId,
            'Archive this item?',
            'It will be removed from the public store and kept in admin history as hidden.'
        )) {
            return;
        }
        const reason = window.prompt('Optional archive note:', 'Stale or no longer public') || 'Archived from admin';
        const result = await this.dataAPI.archiveShopItem(itemId, reason, this.adminToken);
        if (!result || !result.success) {
            this.showShopItemMessage(result && result.error ? result.error : 'Unable to archive shop item.', 'error');
            return;
        }

        this.shopItems = this.shopItems.map(item => item.id === itemId ? result.item : item);
        this.renderShopItems();
        this.showShopItemMessage('Item archived and removed from the public store.', 'success');
    }

    loadArtworks() {
        const artworkList = document.getElementById('artworkList');
        artworkList.innerHTML = '';

        if (this.artworks.length === 0) {
            artworkList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">Art</div>
                    <h3>No artworks yet</h3>
                    <p>Start building your portfolio by adding your first artwork!</p>
                    <button class="empty-state-action" onclick="document.getElementById('add-artwork').click()">
                        Add Your First Artwork
                    </button>
                </div>
            `;
            this.renderStudioDashboard();
            return;
        }

        this.artworks.forEach((artwork, index) => {
            const artworkElement = this.createArtworkElement(artwork, index);
            artworkList.appendChild(artworkElement);
        });
        this.renderStudioDashboard();
    }

    createArtworkElement(artwork, index) {
        const div = document.createElement('div');
        div.className = 'artwork-item';
        div.innerHTML = `
            <img src="${artwork.imageUrl}" alt="${artwork.title}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=='">
            <h3>${artwork.title}</h3>
            <p>${artwork.year} • ${artwork.medium}</p>
            <p>${artwork.size}</p>
            <div class="artwork-buttons">
                <button class="btn-edit" onclick="artAdmin.editArtwork(${index})">Edit</button>
                <button class="btn-delete" onclick="artAdmin.deleteArtwork(${index})">Delete</button>
            </div>
        `;
        return div;
    }

    previewImage(file) {
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('imagePreview');
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            };
            reader.readAsDataURL(file);
        }
    }

    async handleArtworkSubmit() {
        const formData = new FormData(document.getElementById('artworkForm'));
        const imageFile = document.getElementById('artworkImage').files[0];
        const imageUrlInput = document.getElementById('artworkImageUrl');
        const imageUrl = imageUrlInput ? String(imageUrlInput.value || '').trim() : '';

        if (!imageFile && !imageUrl) {
            alert('Please select an image file or provide an image URL.');
            return;
        }

        const buildAndSave = async (finalImageUrl) => {
            const artwork = {
                id: Date.now(),
                title: formData.get('title'),
                year: parseInt(formData.get('year')),
                medium: formData.get('medium'),
                size: formData.get('size'),
                description: formData.get('description'),
                imageUrl: finalImageUrl,
                createdAt: new Date().toISOString()
            };

            this.artworks.push(artwork);
            const saved = await this.saveArtworks();
            if (!saved) {
                this.artworks.pop();
                alert('Add the Worker ADMIN_TOKEN in Order Requests before publishing changes.');
                return;
            }
            this.loadArtworks();
            this.showSection('artwork-management');
            this.updateActiveNav('view-artworks');
            document.getElementById('artworkForm').reset();
            document.getElementById('imagePreview').innerHTML = '';
            if (imageUrlInput) imageUrlInput.value = '';
            
            alert('Artwork added successfully!');
        };

        if (imageFile) {
            // Convert image to base64 for storage
            const reader = new FileReader();
            reader.onload = async (e) => {
                await buildAndSave(e.target.result);
            };
            reader.readAsDataURL(imageFile);
            return;
        }

        await buildAndSave(imageUrl);
    }

    editArtwork(index) {
        const artwork = this.artworks[index];
        // For now, we'll just show an alert. In a full implementation, you'd open an edit form
        alert(`Edit functionality for "${artwork.title}" would open here. This would include pre-filling the form with existing data.`);
    }

    async deleteArtwork(index) {
        const artwork = this.artworks[index];
        if (confirm(`Are you sure you want to delete "${artwork.title}"?`)) {
            const previousArtworks = [...this.artworks];
            this.artworks.splice(index, 1);
            const saved = await this.saveArtworks();
            if (!saved) {
                this.artworks = previousArtworks;
                alert('Add the Worker ADMIN_TOKEN in Order Requests before publishing changes.');
                return;
            }
            this.loadArtworks();
            alert('Artwork deleted successfully!');
        }
    }

    async saveArtworks() {
        // Save to API (with localStorage fallback)
        const saved = await this.dataAPI.saveArtworks(this.artworks);
        if (saved) {
            console.log('Artworks saved to API');
        }
        return saved;
    }

    updatePublicGallery() {
        // Data is now stored in Cloudflare KV, accessible globally
        console.log('Artworks updated:', this.artworks);
    }

    // Camera functionality
    openCamera() {
        // Check if camera is available
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment' // Use back camera on mobile
                } 
            })
            .then(stream => {
                this.showCameraModal(stream);
            })
            .catch(err => {
                console.error('Camera access denied:', err);
                alert('Camera access is required to take photos. Please allow camera access and try again.');
            });
        } else {
            alert('Camera not supported on this device. Please use the gallery option instead.');
        }
    }

    showCameraModal(stream) {
        // Create camera modal
        const modal = document.createElement('div');
        modal.className = 'camera-modal';
        modal.innerHTML = `
            <div class="camera-container">
                <div class="camera-header">
                    <h3>Take Photo</h3>
                    <button class="close-camera">✕</button>
                </div>
                <div class="camera-preview">
                    <video id="cameraVideo" autoplay playsinline></video>
                </div>
                <div class="camera-controls">
                    <button id="captureBtn" class="capture-btn">📷 Capture</button>
                    <button id="cancelCamera" class="cancel-btn">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const video = modal.querySelector('#cameraVideo');
        video.srcObject = stream;
        
        // Capture photo
        modal.querySelector('#captureBtn').addEventListener('click', () => {
            this.capturePhoto(video, stream);
        });
        
        // Close modal
        modal.querySelector('.close-camera').addEventListener('click', () => {
            this.closeCameraModal(modal, stream);
        });
        
        modal.querySelector('#cancelCamera').addEventListener('click', () => {
            this.closeCameraModal(modal, stream);
        });
    }

    capturePhoto(video, stream) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        context.drawImage(video, 0, 0);
        
        canvas.toBlob(blob => {
            const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
            this.handleImageFile(file);
            this.closeCameraModal(document.querySelector('.camera-modal'), stream);
        }, 'image/jpeg', 0.8);
    }

    closeCameraModal(modal, stream) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        modal.remove();
    }

    handleImageFile(file) {
        const input = document.getElementById('artworkImage');
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        
        // Trigger file change event
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Poetry Management Functions
    loadPoetry() {
        const poetryList = document.getElementById('poetryList');
        poetryList.innerHTML = '';

        if (this.poetry.length === 0) {
            poetryList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">Poetry</div>
                    <h3>No poetry yet</h3>
                    <p>Start sharing your words by adding your first poem!</p>
                    <button class="empty-state-action" onclick="document.getElementById('add-poetry').click()">
                        Add Your First Poem
                    </button>
                </div>
            `;
            return;
        }

        this.poetry.forEach((poem, index) => {
            const poemElement = this.createPoemElement(poem, index);
            poetryList.appendChild(poemElement);
        });
    }

    createPoemElement(poem, index) {
        const div = document.createElement('div');
        div.className = 'poem-item';
        div.innerHTML = `
            <h3>${poem.title}</h3>
            <div class="poem-content">${poem.content}</div>
            <div class="poem-meta">
                <span class="poem-date">${poem.date}</span>
                <span class="poem-theme">${poem.theme}</span>
            </div>
            <div class="poem-actions">
                <button class="btn-edit" onclick="artAdmin.editPoem(${index})">Edit</button>
                <button class="btn-delete" onclick="artAdmin.deletePoem(${index})">Delete</button>
            </div>
        `;
        return div;
    }

    async handlePoetrySubmit() {
        const formData = new FormData(document.getElementById('poetryForm'));
        
        const poem = {
            id: Date.now(),
            title: formData.get('title'),
            content: formData.get('content'),
            date: formData.get('date'),
            theme: formData.get('theme'),
            createdAt: new Date().toISOString()
        };

        this.poetry.push(poem);
        const saved = await this.savePoetry();
        if (!saved) {
            this.poetry.pop();
            alert('Add the Worker ADMIN_TOKEN in Order Requests before publishing changes.');
            return;
        }
        this.loadPoetry();
        this.showSection('poetry-management');
        this.updateActiveNav('view-poetry');
        document.getElementById('poetryForm').reset();
        
        alert('Poetry added successfully!');
    }

    editPoem(index) {
        const poem = this.poetry[index];
        // For now, we'll just show an alert. In a full implementation, you'd open an edit form
        alert(`Edit functionality for "${poem.title}" would open here. This would include pre-filling the form with existing data.`);
    }

    async deletePoem(index) {
        const poem = this.poetry[index];
        if (confirm(`Are you sure you want to delete "${poem.title}"?`)) {
            const previousPoetry = [...this.poetry];
            this.poetry.splice(index, 1);
            const saved = await this.savePoetry();
            if (!saved) {
                this.poetry = previousPoetry;
                alert('Add the Worker ADMIN_TOKEN in Order Requests before publishing changes.');
                return;
            }
            this.loadPoetry();
            alert('Poetry deleted successfully!');
        }
    }

    async savePoetry() {
        // Save to API (with localStorage fallback)
        const saved = await this.dataAPI.savePoetry(this.poetry);
        if (saved) {
            console.log('Poetry saved to API');
        }
        return saved;
    }

    updatePublicPoetry() {
        // Data is now stored in Cloudflare KV, accessible globally
        console.log('Poetry updated:', this.poetry);
    }

    async loadSiteContent(options = {}) {
        this.setSiteEditorStatus('Loading site settings...');
        const result = await this.loadSiteSettings(options);
        this.siteSettings = result.settings;
        this.populateSiteSettingsForm(result.settings);
        this.updateSiteSettingsSource(result.source, result.warning || '');
        this.setSiteEditorLanguage(this.activeSiteEditorLang);
        if (result.warning) {
            this.setSiteEditorStatus(`Using ${result.source}. Worker /site-settings is not available yet.`, 'warning');
        } else {
            this.setSiteEditorStatus(`${result.source} loaded.`, 'success');
        }
    }

    async handleContentSubmit() {
        const content = this.readSiteSettingsForm();
        this.setSiteEditorStatus('Saving site settings...');
        localStorage.setItem('maryiluSiteSettingsDraft', JSON.stringify(content));
        localStorage.setItem('siteSettings', JSON.stringify(content));

        const remote = await this.saveSiteSettingsToWorker(content);
        if (remote.ok) {
            this.siteSettings = this.normalizeSiteSettings(remote.settings || content);
            localStorage.setItem('maryiluSiteSettingsDraft', JSON.stringify(this.siteSettings));
            localStorage.setItem('siteSettings', JSON.stringify(this.siteSettings));
            this.updateSiteSettingsSource('Worker /site-settings');
            this.setSiteEditorStatus('Saved to Worker /site-settings and this browser.', 'success');
            this.populateSiteSettingsForm(this.siteSettings);
            return;
        }

        this.siteSettings = content;
        localStorage.setItem('siteSettings', JSON.stringify(this.siteSettings));
        this.updateSiteSettingsSource('Local draft', remote.error || 'Remote save unavailable');
        this.setSiteEditorStatus('Saved locally. Worker /site-settings is not available or rejected the save.', 'warning');
        this.populateSiteSettingsForm(this.siteSettings);
    }
}

// Initialize the admin portal when the page loads
let artAdmin;
document.addEventListener('DOMContentLoaded', () => {
    artAdmin = new ArtAdmin();
});
